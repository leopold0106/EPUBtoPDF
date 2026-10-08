/**
 * 책 → PDF.
 *   1. 숨겨진 렌더링 창에 빈 문서를 연다.
 *   2. preload가 장 문서를 하나의 HTML로 조립하고 설정 CSS를 넣는다.
 *   3. Chromium의 printToPDF로 인쇄한다 (용지 크기와 여백은 CSS @page를 따른다).
 *   4. pdf-lib로 메타데이터를 넣는다.
 */

import type { BookEdits } from '@shared/edits'
import type { AssemblePayload, AssembleResult, ImageInfo, ListImagesPayload } from '@shared/render'
import { RENDER_API_NAME, RENDER_PAGE_PATH } from '@shared/render'
import type { Settings } from '@shared/settings'
import { chapterTitles, flattenOutline, outlineFromToc } from '@shared/outline'
import { buildStylesheet } from '@shared/stylesheet'
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
  onStage?: (stage: RenderStage) => void
}

export interface RenderOutput {
  pdf: Uint8Array
  pageCount: number
  bookmarkCount: number
  typography: Typography
  warnings: string[]
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
export function listBookImages(book: EpubBook): Promise<ImageInfo[]> {
  return enqueue(async () => {
    const payload: ListImagesPayload = {
      chapters: book.spine.map((s) => ({ index: s.index, url: resourceUrl(book.id, s.path) }))
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

async function renderNow(book: EpubBook, settings: Settings, options: RenderOptions): Promise<RenderOutput> {
  const typography = computeTypography(settings)
  const indexes = options.chapters ?? book.spine.map((s) => s.index)
  // 책갈피는 책 전체를 변환할 때만 만든다.
  const outline = settings.output.bookmarks && !options.chapters && !options.markImages ? outlineFromToc(book.toc, book.spine) : undefined
  const payload: AssemblePayload = {
    chapters: indexes.map((index) => ({ index, url: resourceUrl(book.id, book.spine[index]!.path) })),
    spineUrls: book.spine.map((s) => resourceUrl(book.id, s.path)),
    keepEpubStyles: settings.layout.epubStyles === 'keep',
    userCss: buildStylesheet(settings, typography, {
      bookTitle: book.metadata.title,
      chapterTitles: chapterTitles(book.spine),
      fontFaces: await fontRegistry().faces()
    }),
    tocTargets: outline && flattenOutline(outline).map((node) => ({ n: node.n, url: resourceUrl(book.id, node.href.split('#')[0]!) + (node.href.includes('#') ? `#${encodeURIComponent(node.href.slice(node.href.indexOf('#') + 1))}` : '') })),
    lang: book.metadata.language,
    dir: book.direction === 'default' ? undefined : book.direction,
    hiddenImages: options.edits?.hiddenImages,
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

    options.onStage?.('printing')
    const raw = await win.webContents.printToPDF({
      preferCSSPageSize: true,
      printBackground: true,
      generateTaggedPDF: false,
      generateDocumentOutline: false
    })

    options.onStage?.('finishing')
    const { pdf, pageCount, bookmarkCount } = await finalizePdf(new Uint8Array(raw), book.metadata, outline)
    return { pdf, pageCount, bookmarkCount, typography, warnings: assembled.warnings }
  } finally {
    win.destroy()
  }
}
