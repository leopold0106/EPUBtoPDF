// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { tocMarkerKey, type AssemblePayload, type PartTarget } from '@shared/render'
import { assembleBook } from '../../src/render/assemble'

const BASE = 'epub://book1/OEBPS/Text/'
const url = (name: string): string => BASE + name

const xhtml = (body: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body>${body}</body></html>`

const chapters: Record<string, string> = {
  'c1.xhtml': xhtml('<h1>1장</h1><p>일장 첫 문단</p><h2 id="s2">1장 2절</h2><p>이절 문단</p><div class="box"><h2 id="s3"><a id="s3a"/>1장 3절</h2><p>삼절 문단</p></div>'),
  'c2.xhtml': xhtml('<h1 id="top">2장</h1><p>이장 문단</p>'),
  'c3.xhtml': xhtml('<p>삼장 앞부분</p><h1 id="h">3장</h1><p>삼장 문단</p>')
}
const names = Object.keys(chapters)

const parts: PartTarget[] = [
  { key: '0', title: '1장', url: url('c1.xhtml') },
  { key: '0.0', title: '1장 2절', url: url('c1.xhtml#s2') },
  { key: '0.1', title: '1장 3절', url: url('c1.xhtml#s3a') },
  { key: '1', title: '2장', url: url('c2.xhtml#top') },
  { key: '2', title: '3장', url: url('c3.xhtml#h') }
]

/** 글자 덩어리를 빈칸으로 이어 붙인다. */
function textOf(root: Node): string {
  const out: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent?.trim()) out.push(n.textContent.trim())
  return out.join(' ')
}

let doc: Document
beforeEach(() => {
  doc = document.implementation.createHTMLDocument('render')
})

function assemble(excluded: string[], only = names): { text: string; warnings: string[]; empty: boolean; markers: string[] } {
  const payload: AssemblePayload = {
    chapters: only.map((name) => ({ index: names.indexOf(name), url: url(name) })),
    spineUrls: names.map(url),
    keepEpubStyles: true,
    userCss: '',
    parts: parts.map((p) => ({ ...p, ...(excluded.includes(p.key) && { exclude: true }) }))
  }
  const result = assembleBook(doc, payload, only.map((n) => chapters[n]!), new DOMParser())
  const markers = [...doc.querySelectorAll('.epubtopdf-toc-links a')].map((a) => tocMarkerKey(a.getAttribute('href')!)!)
  doc.querySelector('.epubtopdf-toc-links')?.remove()
  return { text: textOf(doc.body), warnings: result.warnings, empty: result.empty, markers }
}

describe('부분 빼기', () => {
  it('아무것도 빼지 않으면 그대로이고, 남은 부분과 장마다 위치 표시를 둔다', () => {
    const r = assemble([])
    expect(r.text).toBe('1장 일장 첫 문단 1장 2절 이절 문단 1장 3절 삼절 문단 2장 이장 문단 삼장 앞부분 3장 삼장 문단')
    expect(r.markers).toEqual(['0', '0.0', '0.1', '1', '2', '@0', '@1', '@2'])
  })

  it('장 안의 절 하나만 뺀다 (다음 부분 직전까지)', () => {
    const r = assemble(['0.0'])
    expect(r.text).toBe('1장 일장 첫 문단 1장 3절 삼절 문단 2장 이장 문단 삼장 앞부분 3장 삼장 문단')
    expect(r.markers).not.toContain('0.0')
  })

  it('블록 맨 앞의 앵커가 가리키면 그 블록부터 뺀다', () => {
    expect(assemble(['0.1']).text).toBe('1장 일장 첫 문단 1장 2절 이절 문단 2장 이장 문단 삼장 앞부분 3장 삼장 문단')
    expect(doc.querySelector('.box')).toBeNull()
  })

  it('장 전체를 빼면 장(section)이 통째로 빠진다. 문서 맨 앞을 가리키는 조각도 장 전체로 본다', () => {
    const r = assemble(['1'])
    // 3장 문서의 앞부분은 목차가 가리키지 않으므로 2장에 속해 함께 빠진다.
    expect(r.text).toBe('1장 일장 첫 문단 1장 2절 이절 문단 1장 3절 삼절 문단 3장 삼장 문단')
    expect(doc.querySelectorAll('section')).toHaveLength(2)
    expect(r.markers).toEqual(['0', '0.0', '0.1', '2', '@0', '@2'])
  })

  it('목차가 가리키지 않는 앞부분은 앞 부분에 속한다', () => {
    expect(assemble(['1']).text).not.toContain('삼장 앞부분')
    expect(assemble(['0', '0.0', '0.1']).text).toBe('2장 이장 문단 삼장 앞부분 3장 삼장 문단')
    expect(assemble(['2']).text).toBe('1장 일장 첫 문단 1장 2절 이절 문단 1장 3절 삼절 문단 2장 이장 문단 삼장 앞부분')
  })

  it('상위 항목만 빼면 그 항목의 내용(첫 하위 항목 전까지)만 빠진다', () => {
    expect(assemble(['0']).text).toBe('1장 2절 이절 문단 1장 3절 삼절 문단 2장 이장 문단 삼장 앞부분 3장 삼장 문단')
  })

  it('장 하나만 렌더링할 때도 그 장 안에서 뺀다', () => {
    expect(assemble(['0.0'], ['c1.xhtml']).text).toBe('1장 일장 첫 문단 1장 3절 삼절 문단')
    expect(assemble(['0.1'], ['c1.xhtml']).text).toBe('1장 일장 첫 문단 1장 2절 이절 문단')
  })

  it('모두 빼면 비었다고 알린다', () => {
    const all = assemble(['0', '0.0', '0.1', '1', '2'])
    expect(all.empty).toBe(true)
    expect(all.text).toBe('')
    const r = assemble(['1', '2'], ['c2.xhtml', 'c3.xhtml'])
    expect(r.empty).toBe(true)
  })

  it('가리키는 곳이 없어진 부분은 빼지 못했다고 알린다 (본문 편집으로 제목을 지운 경우 등)', () => {
    const payload: AssemblePayload = {
      chapters: [{ index: 0, url: url('c1.xhtml') }],
      spineUrls: names.map(url),
      keepEpubStyles: true,
      userCss: '',
      parts: [
        { key: '0', title: '1장', url: url('c1.xhtml') },
        { key: '0.0', title: '없는 절', url: url('c1.xhtml#nope'), exclude: true }
      ]
    }
    const result = assembleBook(doc, payload, [chapters['c1.xhtml']!], new DOMParser())
    expect(result.warnings.join()).toContain('없는 절')
    expect(doc.body.textContent).toContain('이절 문단')
  })
})
