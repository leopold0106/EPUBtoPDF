/**
 * 책 → PDF.
 *   1. 숨겨진 렌더링 창에 빈 문서를 연다.
 *   2. preload가 장 문서를 하나의 HTML로 조립하고 설정 CSS를 넣는다.
 *   3. Chromium의 printToPDF로 인쇄한다 (용지 크기와 여백은 CSS @page를 따른다).
 *   4. 같은 창을 쪽 번호만 찍힌 빈 쪽들로 바꿔 한 번 더 인쇄한다.
 *   5. pdf-lib로 쪽 번호를 겹치고, 책갈피와 메타데이터를 넣는다.
 */

import type { BookEdits } from '@shared/edits'
import { DEFAULT_PAGE_NUMBERING, pageLabel } from '@shared/page-numbers'
import { buildParts, flattenParts } from '@shared/parts'
import type { AssemblePayload, AssembleResult, ImageInfo, ListImagesPayload, NumberPagesPayload, PartTarget } from '@shared/render'
import { RENDER_API_NAME, RENDER_PAGE_PATH } from '@shared/render'
import type { Settings } from '@shared/settings'
import { chapterTitles, outlineFromToc, pruneOutline } from '@shared/outline'
import { buildStylesheet, pageNumberSheet } from '@shared/stylesheet'
import { computeTypography, type Typography } from '@shared/typography'
import type { EpubBook } from '../epub/parse'
import { resourceUrl } from '../epub/protocol'
import { fontRegistry } from '../fonts'
import { finalizePdf } from './postprocess'
import { createRenderWindow } from './window'

export type RenderStage = 'assembling' | 'printing' | 'finishing'

export interface RenderOptions {
  /** 렌더링할 장(spine 위치). 생략하면 전체. */
  chapters?: number[]
  edits?: BookEdits
  /** 미리보기: 그림 위치를 알 수 있게 링크를 겹친다. */
  markImages?: boolean
  /**
   * 장 하나만 렌더링할 때 쪽 번호를 책 전체 기준으로 매기기 위한 값 (책 전체를 센 결과에서 온다).
   * pageOffset: 이 장 앞에 있는 쪽 수. numberStartPage: 본문 번호가 시작하는 쪽. bookPageCount: 책 전체 쪽수.
   */
  pageOffset?: number
  numberStartPage?: number
  bookPageCount?: number
  onStage?: (stage: RenderStage) => void
}

export interface RenderOutput {
  pdf: Uint8Array
  pageCount: number
  /** 뺄 부분을 빼고 나니 남은 내용이 없다 (pdf는 비어 있다). */
  empty: boolean
  bookmarkCount: number
  typography: Typography
  warnings: string[]
  /** 부분 키 → 시작 쪽 (책 전체에서 몇 번째 쪽인지). 남은 부분만. */
  partPages: Record<string, number>
  /** 장(spine 위치) → 시작 쪽. */
  chapterPages: Record<number, number>
  /** 본문 번호가 시작하는 쪽. */
  numberStartPage: number
  /** 쪽마다 찍은 번호. 쪽 번호를 찍지 않으면 undefined. */
  pageLabels?: (string | null)[]
}

/** 렌더링 창 작업은 하나씩 순서대로 실행한다. */
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task)
  queue = run.catch(() => undefined)
  return run
}

export function renderPdf(book: EpubBook, settings: Settings, options: RenderOptions = {}): Promise<RenderOutput> {
  return enqueue(() => renderNow(book, settings, options))
}

/** 책에 든 그림 목록 (그림 빼기 화면용). */
export function listBookImages(book: EpubBook, chapterOverrides?: Record<number, string>): Promise<ImageInfo[]> {
  return enqueue(async () => {
    const payload: ListImagesPayload = {
      chapters: book.spine.map((s) => ({ index: s.index, url: resourceUrl(book.id, s.path) })),
      chapterOverrides
    }
    const win = createRenderWindow(400)
    try {
      await win.loadURL(resourceUrl(book.id, RENDER_PAGE_PATH))
      return (await win.webContents.executeJavaScript(
        `window.${RENDER_API_NAME}.listImages(${JSON.stringify(payload)})`
      )) as ImageInfo[]
    } finally {
      win.destroy()
    }
  })
}

/** 압축 파일 안의 경로#조각 → `epub://` 주소. */
function hrefUrl(book: EpubBook, href: string): string {
  const hash = href.indexOf('#')
  if (hash < 0) return resourceUrl(book.id, href)
  return `${resourceUrl(book.id, href.slice(0, hash))}#${encodeURIComponent(href.slice(hash + 1))}`
}

async function renderNow(book: EpubBook, settings: Settings, options: RenderOptions): Promise<RenderOutput> {
  const typography = computeTypography(settings)
  const indexes = options.chapters ?? book.spine.map((s) => s.index)
  const excluded = new Set(options.edits?.excludedParts ?? [])
  const parts: PartTarget[] = flattenParts(buildParts(book.toc, book.spine, book.coverPath))
    .filter((p) => p.spineIndex >= 0)
    .map((p) => ({ key: p.key, title: p.title, url: hrefUrl(book, p.href), ...(excluded.has(p.key) && { exclude: true }) }))
  // 책갈피는 책 전체를 변환할 때만 만든다.
  const outline =
    settings.output.bookmarks && !options.chapters && !options.markImages
      ? pruneOutline(outlineFromToc(book.toc, book.spine), excluded)
      : undefined
  const fontFaces = await fontRegistry().faces()
  const payload: AssemblePayload = {
    chapters: indexes.map((index) => ({ index, url: resourceUrl(book.id, book.spine[index]!.path) })),
    spineUrls: book.spine.map((s) => resourceUrl(book.id, s.path)),
    keepEpubStyles: settings.layout.epubStyles === 'keep',
    userCss: buildStylesheet(settings, typography, {
      bookTitle: book.metadata.title,
      chapterTitles: chapterTitles(book.spine),
      fontFaces
    }),
    parts,
    lang: book.metadata.language,
    dir: book.direction === 'default' ? undefined : book.direction,
    hiddenImages: options.edits?.hiddenImages,
    chapterOverrides: options.edits?.chapters,
    markImages: options.markImages,
    typeset: {
      bodyFontPx: settings.layout.epubStyles === 'keep' ? (typography.fontSizePt * 96) / 72 : undefined,
      gridPx: settings.text.snapToGrid ? typography.lineHeightPx : undefined,
      gridPerChapter: settings.layout.chapterBreak
    }
  }

  const win = createRenderWindow(typography.bodyWidthPx)
  try {
    options.onStage?.('assembling')
    await win.loadURL(resourceUrl(book.id, RENDER_PAGE_PATH))
    const assembled = (await win.webContents.executeJavaScript(
      `window.${RENDER_API_NAME}.assemble(${JSON.stringify(payload)})`
    )) as AssembleResult
    const offset = options.pageOffset ?? 0
    if (assembled.empty) {
      return {
        pdf: new Uint8Array(),
        pageCount: 0,
        empty: true,
        bookmarkCount: 0,
        typography,
        warnings: assembled.warnings,
        partPages: {},
        chapterPages: {},
        numberStartPage: options.numberStartPage ?? 1
      }
    }

    options.onStage?.('printing')
    const raw = await win.webContents.printToPDF({
      preferCSSPageSize: true,
      printBackground: true,
      generateTaggedPDF: false,
      generateDocumentOutline: false
    })

    options.onStage?.('finishing')
    const numbering = options.edits?.pageNumbering ?? DEFAULT_PAGE_NUMBERING
    let numberStartPage = 1
    let pageLabels: (string | null)[] | undefined
    const finalized = await finalizePdf(new Uint8Array(raw), book.metadata, {
      outline,
      pageNumbers: async (markers, count) => {
        // 번호를 시작할 부분이 이번에 렌더링한 쪽에 없으면 (장 하나만 볼 때) 책 전체 기준 값을 쓴다.
        const start = numbering.startAt === undefined ? undefined : markers.get(numbering.startAt)
        numberStartPage = start ? start.pageIndex + 1 + offset : numbering.startAt === undefined ? 1 : (options.numberStartPage ?? 1)
        const hiddenPages = new Set<number>()
        if (settings.decor.hideNumberOnChapterStart) {
          for (const [key, pos] of markers) {
            const index = key.startsWith('@') ? Number(key.slice(1)) : NaN
            if (book.spine[index]?.title) hiddenPages.add(pos.pageIndex + 1 + offset)
          }
        }
        if (settings.decor.pageNumbers === 'none') return undefined
        const opts = {
          numbering,
          style: settings.decor.pageNumberStyle,
          startPage: numberStartPage,
          bookPageCount: options.bookPageCount ?? count + offset,
          hiddenPages
        }
        const labels = Array.from({ length: count }, (_, i) => pageLabel(i + 1 + offset, opts))
        pageLabels = labels
        if (labels.every((l) => l === null)) return undefined
        const numbersPayload: NumberPagesPayload = {
          css: pageNumberSheet(settings, typography, labels, { fontFaces }),
          pageCount: count,
          dir: payload.dir
        }
        await win.webContents.executeJavaScript(`window.${RENDER_API_NAME}.numberPages(${JSON.stringify(numbersPayload)})`)
        return new Uint8Array(
          await win.webContents.printToPDF({ preferCSSPageSize: true, printBackground: false, generateTaggedPDF: false, generateDocumentOutline: false })
        )
      }
    })
    const partPages: Record<string, number> = {}
    const chapterPages: Record<number, number> = {}
    for (const [key, page] of Object.entries(finalized.markerPages)) {
      if (key.startsWith('@')) chapterPages[Number(key.slice(1))] = page + offset
      else partPages[key] = page + offset
    }
    return {
      pdf: finalized.pdf,
      pageCount: finalized.pageCount,
      empty: false,
      bookmarkCount: finalized.bookmarkCount,
      typography,
      warnings: assembled.warnings,
      partPages,
      chapterPages,
      numberStartPage,
      pageLabels
    }
  } finally {
    win.destroy()
  }
}
