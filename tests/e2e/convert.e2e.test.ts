/**
 * 명령줄 변환으로 샘플 책을 PDF로 만들고 pdf.js로 결과를 검사한다.
 * Linux에서는 화면이 필요하므로 `xvfb-run -a npm run test:e2e`로 실행한다.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { buildSampleBook, sampleChapters } from '../fixtures/sample-book'
import type { BookEdits } from '@shared/edits'
import { computeTypography } from '@shared/typography'
import { makeSettings, type SettingsPatch } from '../helpers'

const run = promisify(execFile)
const root = resolve(__dirname, '../..')
const electron = createRequire(import.meta.url)('electron') as unknown as string
const MM = 72 / 25.4

let dir: string
let epub: string

beforeAll(async () => {
  if (!existsSync(join(root, 'out/main/index.js'))) throw new Error('먼저 npm run build를 실행하세요.')
  dir = await mkdtemp(join(tmpdir(), 'epubtopdf-e2e-'))
  epub = join(dir, '강가의 기록.epub')
  await writeFile(epub, await buildSampleBook())
})

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

async function convert(name: string, settings: SettingsPatch, edits?: BookEdits): Promise<PDFDocumentProxy> {
  const out = join(dir, `${name}.pdf`)
  const settingsPath = join(dir, `${name}.json`)
  await writeFile(settingsPath, JSON.stringify(settings))
  const args = [root, '--no-sandbox', '--convert', epub, '--out', out, '--settings', settingsPath]
  if (edits) {
    const editsPath = join(dir, `${name}.edits.json`)
    await writeFile(editsPath, JSON.stringify(edits))
    args.push('--edits', editsPath)
  }
  const { stdout } = await run(electron, args, { timeout: 90000 })
  expect(stdout).toContain(out)
  return getDocument({ data: new Uint8Array(await readFile(out)) }).promise
}

async function pageText(pdf: PDFDocumentProxy, n: number): Promise<TextItem[]> {
  const content = await (await pdf.getPage(n)).getTextContent()
  return content.items.filter((i): i is TextItem => 'str' in i && i.str.trim() !== '')
}

/** 쪽마다의 글자. pdf.js는 공백을 따로 나누므로 비교하기 쉽게 공백을 모두 뺀다. */
async function allText(pdf: PDFDocumentProxy): Promise<string[]> {
  const pages: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) pages.push(squash((await pageText(pdf, n)).map((i) => i.str).join('')))
  return pages
}

const squash = (s: string): string => s.replace(/\s+/g, '')

/** 판면(위아래 여백 사이)에 있는 글줄 수. 기준선 높이가 2pt 안쪽이면 같은 줄로 본다. */
async function bodyLines(pdf: PDFDocumentProxy, n: number, topMm: number, bottomMm: number): Promise<number> {
  const page = await pdf.getPage(n)
  const height = page.view[3]!
  const ys = (await pageText(pdf, n))
    .map((i) => i.transform[5] as number)
    .filter((y) => y > bottomMm * MM && y < height - topMm * MM)
    .sort((a, b) => b - a)
  let lines = 0
  let last = Infinity
  for (const y of ys) {
    if (last - y > 2) lines++
    last = y
  }
  return lines
}

describe('명령줄 변환', () => {
  it('기본 설정: A5, 장 순서대로, 표지 그림, 메타데이터, 문서 안 링크', async () => {
    const pdf = await convert('default', {})
    expect(pdf.numPages).toBeGreaterThan(15)

    const first = await pdf.getPage(1)
    expect(first.view[2]).toBeCloseTo(148 * MM, 0)
    expect(first.view[3]).toBeCloseTo(210 * MM, 0)

    const texts = await allText(pdf)
    // 1쪽은 표지 그림만 있다 (쪽 번호 제외).
    expect(texts[0]).toMatch(/^\d*$/)
    const at = (s: string) => texts.findIndex((t) => t.includes(squash(s)))
    expect(at('제1장 강가의 아침')).toBe(1)
    expect(at('제2장 시장 골목')).toBeGreaterThan(at('제1장 강가의 아침'))
    expect(at('제3장 등대')).toBeGreaterThan(at('제2장 시장 골목'))
    expect(at('이 기록은 여행자의 수첩')).toBe(pdf.numPages - 1)

    const { info } = (await pdf.getMetadata()) as { info: Record<string, string> }
    expect(info['Title']).toBe('강가의 기록')
    expect(info['Author']).toBe('김여행, 이기록')

    // 각주 번호가 주석 쪽으로 가는 링크가 된다.
    let internalLinks = 0
    for (let n = 1; n <= pdf.numPages; n++) {
      for (const a of await (await pdf.getPage(n)).getAnnotations()) if (a.subtype === 'Link' && a.dest) internalLinks++
    }
    expect(internalLinks).toBeGreaterThanOrEqual(4)
  })

  it('쪽당 줄 수 지정: 본문만 있는 쪽은 정확히 그 줄 수가 된다', async () => {
    const pdf = await convert('lines24', { text: { sizing: 'linesPerPage', linesPerPage: 24 } })
    const texts = await allText(pdf)
    const start = texts.findIndex((t) => t.includes(squash('제3장 등대')))
    const end = texts.findIndex((t) => t.includes(squash('이 기록은 여행자의 수첩')))
    // 3장은 문단만 있다. 첫 쪽(제목)과 마지막 쪽(남는 쪽)을 뺀 나머지를 센다.
    const counts: number[] = []
    for (let n = start + 2; n <= end - 1; n++) counts.push(await bodyLines(pdf, n, 20, 20))
    expect(counts.length).toBeGreaterThanOrEqual(3)
    expect(counts).toEqual(counts.map(() => 24))
  })

  it('줄 격자 맞춤: 그림·제목·시·인용 뒤에도 본문 글줄이 모두 격자 위에 있다 (표 안 글자 제외)', async () => {
    const settings: SettingsPatch = { text: { sizing: 'linesPerPage', linesPerPage: 24 } }
    const pdf = await convert('grid', settings)
    const t = computeTypography(makeSettings(settings))
    const pitch = (t.lineHeightPx * 72) / 96
    const offGrid: string[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const items = await pageText(pdf, n)
      if (items.some((i) => i.str.includes('품목'))) continue // 표가 있는 쪽
      const top = (await pdf.getPage(n)).view[3]! - 20 * MM
      // 본문 크기 글자의 기준선 (위첨자·작은 글씨·제목 제외)
      const ds = [...new Set(items.filter((i) => Math.abs(i.height - t.fontSizePt) < 0.3).map((i) => top - (i.transform[5] as number)))]
      if (ds.length === 0) continue
      const first = Math.min(...ds)
      for (const d of ds) {
        const r = (d - first) % pitch
        // PDF의 글자 위치는 1px(0.75pt) 단위로 반올림된다.
        if (r > 0.8 && pitch - r > 0.8) offGrid.push(`${n}쪽 ${d.toFixed(1)}`)
      }
    }
    expect(offGrid).toEqual([])
  })

  it('목차가 PDF 책갈피가 되고, 장 제목이 머리글에 들어간다', async () => {
    const pdf = await convert('outline', { decor: { header: 'chapterTitle' } })
    const texts = await allText(pdf)
    const outline = await pdf.getOutline()
    const flat: { title: string; page: number }[] = []
    const walk = async (items: typeof outline): Promise<void> => {
      for (const item of items ?? []) {
        flat.push({ title: item.title, page: (await pdf.getPageIndex((item.dest as [never])[0])) + 1 })
        await walk(item.items)
      }
    }
    await walk(outline)
    expect(flat.map((f) => f.title)).toEqual(['제1장 강가의 아침', '다리 위에서', '제2장 시장 골목', '등불', '장부', '제3장 등대', '주석'])
    // 책갈피가 가리키는 쪽에 그 제목이 있다.
    for (const f of flat) expect(texts[f.page - 1]).toContain(squash(f.title))
    // 장 제목 머리글: 2장의 둘째 쪽 맨 위에 '제2장 시장 골목'
    const ch2 = flat.find((f) => f.title === '제2장 시장 골목')!.page
    const pageTop = (await pdf.getPage(ch2 + 1)).view[3]!
    const header = (await pageText(pdf, ch2 + 1)).filter((i) => (i.transform[5] as number) > pageTop - 20 * MM)
    expect(squash(header.map((i) => i.str).join(''))).toBe(squash('제2장 시장 골목'))
    // 표시용 링크는 남지 않는다.
    for (let n = 1; n <= pdf.numPages; n++) {
      for (const a of await (await pdf.getPage(n)).getAnnotations()) expect(String(a.url ?? '')).not.toContain('epubtopdf.invalid')
    }
  })

  it('원본 스타일 무시, B6 가로 방향', async () => {
    const pdf = await convert('ignore-b6', {
      page: { paper: 'B6', orientation: 'landscape' },
      margins: { topMm: 12, bottomMm: 12, insideMm: 15, outsideMm: 15 },
      layout: { epubStyles: 'ignore' }
    })
    const first = await pdf.getPage(1)
    expect(first.view[2]).toBeCloseTo(182 * MM, 0)
    expect(first.view[3]).toBeCloseTo(128 * MM, 0)
    expect((await allText(pdf)).join('')).toContain(squash('제2장 시장 골목'))
  })

  it('원본 스타일 무시 모드는 문단 사이와 제목 위아래를 한 줄씩 띄운다', async () => {
    const pdf = await convert('ignore-spacing', { layout: { epubStyles: 'ignore' } })
    const texts = await allText(pdf)
    const n = texts.findIndex((t) => t.includes(squash('제3장 등대'))) + 2
    // 글줄 기준선 사이 간격: 대부분 한 줄 피치이고, 문단이 바뀌는 곳은 두 줄 피치다.
    const page = await pdf.getPage(n)
    const ys = [...new Set((await pageText(pdf, n)).map((i) => Math.round(i.transform[5] as number)))]
      .filter((y) => y > 20 * MM && y < page.view[3]! - 20 * MM)
      .sort((a, b) => b - a)
    const gaps = ys.slice(1).map((y, i) => ys[i]! - y)
    const pitch = Math.min(...gaps)
    const ratios = gaps.map((g) => Math.round(g / pitch))
    expect(new Set(ratios)).toEqual(new Set([1, 2]))
  })

  it('뺀 그림은 PDF에 들어가지 않는다', async () => {
    // 0:0은 표지, 1:0은 1장의 강 그림(캡션 포함)
    const pdf = await convert('hidden-images', {}, { hiddenImages: ['0:0', '1:0'] })
    const texts = await allText(pdf)
    expect(texts[0]).toContain(squash('제1장 강가의 아침'))
    expect(texts.join('')).not.toContain(squash('그림 1. 새벽의 강'))
  })

  it('본문을 고친 장은 고친 문서로 변환한다', async () => {
    // 본문 편집기가 저장하는 모양(HTML 문서)으로 1장의 그림 설명을 지우고 문단을 하나 넣는다.
    const body = sampleChapters()[1]!.body.replace('<figcaption>그림 1. 새벽의 강</figcaption>', '') + '<p>편집기에서 새로 넣은 문단</p>'
    const html = `<!DOCTYPE html>\n<html lang="ko"><head><title>제1장</title><link rel="stylesheet" href="../Styles/style.css"></head><body>${body}</body></html>`
    const pdf = await convert('edited-chapter', {}, { hiddenImages: [], chapters: { 1: html } })
    const all = (await allText(pdf)).join('')
    expect(all).toContain(squash('편집기에서 새로 넣은 문단'))
    expect(all).not.toContain(squash('그림 1. 새벽의 강'))
    expect(all).toContain(squash('제3장 등대'))
  })

  it('뺀 부분은 본문과 책갈피에서 빠지고, 쪽 번호는 규칙대로 찍힌다', async () => {
    const pdf = await convert(
      'parts-numbers',
      { decor: { pageNumbers: 'bottom-outside', hideNumberOnChapterStart: true } },
      {
        hiddenImages: [],
        // 제2장과 그 하위 항목
        excludedParts: ['1', '1.0', '1.1'],
        pageNumbering: { startAt: '0', startNumber: 1, front: 'roman', hiddenNumbers: [3] }
      }
    )
    const all = (await allText(pdf)).join('')
    expect(all).not.toContain(squash('제2장 시장 골목'))
    expect(all).not.toContain(squash('상인이 보여 준 장부'))
    expect(all).toContain(squash('제3장 등대'))
    expect((await pdf.getOutline())?.map((o) => o.title)).toEqual(['제1장 강가의 아침', '제3장 등대', '주석'])

    // 아래 여백의 글자 (쪽 번호)와 그 가로 위치
    const footer = async (n: number): Promise<{ text: string; x?: number }> => {
      const items = (await pageText(pdf, n)).filter((i) => (i.transform[5] as number) < 15 * MM && i.str.trim())
      return { text: items.map((i) => i.str).join(''), x: items[0]?.transform[4] as number | undefined }
    }
    const width = (await pdf.getPage(1)).view[2]!
    const footers = await Promise.all([1, 2, 3, 4, 5, 6].map(footer))
    // 표지 i, 제1장 첫 쪽(장 첫 쪽이라 비움), 2, 3(지울 번호), 4, 5
    expect(footers.map((f) => f.text)).toEqual(['i', '', '2', '', '4', '5'])
    // 바깥쪽: 홀수 쪽은 오른쪽, 짝수 쪽은 왼쪽
    expect(footers[0]!.x!).toBeGreaterThan(width / 2)
    expect(footers[4]!.x!).toBeGreaterThan(width / 2)
    expect(footers[5]!.x!).toBeLessThan(width / 2)
  })

  it('잘못된 설정이면 변환하지 않고 종료 코드 2', async () => {
    const settingsPath = join(dir, 'bad.json')
    await writeFile(settingsPath, JSON.stringify({ margins: { topMm: 150, bottomMm: 150 } }))
    const err = await run(electron, [root, '--no-sandbox', '--convert', epub, '--out', join(dir, 'bad.pdf'), '--settings', settingsPath]).catch(
      (e: { code: number; stderr: string }) => e
    )
    expect(err).toMatchObject({ code: 2 })
    expect((err as { stderr: string }).stderr).toContain('여백')
    expect(existsSync(join(dir, 'bad.pdf'))).toBe(false)
  })

  it('EPUB이 아니면 종료 코드 1과 오류 메시지', async () => {
    const bogus = join(dir, 'bogus.epub')
    await writeFile(bogus, 'not a zip')
    const err = await run(electron, [root, '--no-sandbox', '--convert', bogus]).catch((e: { code: number; stderr: string }) => e)
    expect(err).toMatchObject({ code: 1 })
    expect((err as { stderr: string }).stderr).toContain('EPUB 파일을 열 수 없습니다')
  })
})
