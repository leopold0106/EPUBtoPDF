/**
 * 책 → PDF.
 *   1. 숨겨진 렌더링 창에 빈 문서를 연다.
 *   2. preload가 장 문서를 하나의 HTML로 조립하고 설정 CSS를 넣는다.
 *   3. Chromium의 printToPDF로 인쇄한다 (용지 크기와 여백은 CSS @page를 따른다).
 *   4. pdf-lib로 메타데이터를 넣는다.
 */

import type { AssemblePayload, AssembleResult } from '@shared/render'
import { RENDER_API_NAME, RENDER_PAGE_PATH } from '@shared/render'
import type { Settings } from '@shared/settings'
import { buildStylesheet } from '@shared/stylesheet'
import { computeTypography, type Typography } from '@shared/typography'
import type { EpubBook } from '../epub/parse'
import { resourceUrl } from '../epub/protocol'
import { finalizePdf } from './postprocess'
import { createRenderWindow } from './window'

export type RenderStage = 'assembling' | 'printing' | 'finishing'

export interface RenderOptions {
  /** 렌더링할 장(spine 위치). 생략하면 전체. */
  chapters?: number[]
  onStage?: (stage: RenderStage) => void
}

export interface RenderOutput {
  pdf: Uint8Array
  pageCount: number
  typography: Typography
  warnings: string[]
}

/** 렌더링 창은 하나씩만 쓰도록 순서대로 실행한다. */
let queue: Promise<unknown> = Promise.resolve()

export function renderPdf(book: EpubBook, settings: Settings, options: RenderOptions = {}): Promise<RenderOutput> {
  const run = queue.then(() => renderNow(book, settings, options))
  queue = run.catch(() => undefined)
  return run
}

async function renderNow(book: EpubBook, settings: Settings, options: RenderOptions): Promise<RenderOutput> {
  const typography = computeTypography(settings)
  const indexes = options.chapters ?? book.spine.map((s) => s.index)
  const payload: AssemblePayload = {
    chapters: indexes.map((index) => ({ index, url: resourceUrl(book.id, book.spine[index]!.path) })),
    spineUrls: book.spine.map((s) => resourceUrl(book.id, s.path)),
    keepEpubStyles: settings.layout.epubStyles === 'keep',
    userCss: buildStylesheet(settings, typography, { bookTitle: book.metadata.title }),
    lang: book.metadata.language,
    dir: book.direction === 'default' ? undefined : book.direction
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
    const { pdf, pageCount } = await finalizePdf(new Uint8Array(raw), book.metadata)
    return { pdf, pageCount, typography, warnings: assembled.warnings }
  } finally {
    win.destroy()
  }
}
