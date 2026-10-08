/** PDF 변환 IPC와 결과 파일 열기. */

import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IpcChannels, type ConvertProgress, type ConvertResult, type Result } from '@shared/ipc'
import { safeFileName } from '@shared/filename'
import { normalizeSettings, type Settings } from '@shared/settings'
import { validateSettings } from '@shared/typography'
import type { EpubBook } from './epub/parse'
import { library } from './epub/library'
import { renderPdf, type RenderStage } from './render/pdf'

export function settingsErrors(settings: Settings): string[] {
  return validateSettings(settings)
    .filter((i) => i.level === 'error')
    .map((i) => i.message)
}

export async function convertBook(
  book: EpubBook,
  settings: Settings,
  outputPath: string,
  onStage?: (stage: RenderStage) => void
): Promise<ConvertResult> {
  const started = Date.now()
  const output = await renderPdf(book, settings, { onStage })
  await writeFile(outputPath, output.pdf)
  return {
    path: outputPath,
    pageCount: output.pageCount,
    warnings: output.warnings,
    seconds: (Date.now() - started) / 1000
  }
}

/** 이 실행 중에 만든 PDF만 열 수 있게 한다. */
const outputs = new Set<string>()

export function registerConvertIpc(): void {
  ipcMain.handle(IpcChannels.convert, async (event, bookId: unknown, rawSettings: unknown): Promise<Result<ConvertResult> | null> => {
    const book = typeof bookId === 'string' ? library.get(bookId) : undefined
    if (!book) return { ok: false, error: '열린 책이 없습니다. EPUB을 다시 열어 주세요.' }
    const settings = normalizeSettings(rawSettings)
    const errors = settingsErrors(settings)
    if (errors.length > 0) return { ok: false, error: errors.join('\n') }

    const win = BrowserWindow.fromWebContents(event.sender)
    const defaultDir = book.sourcePath ? dirname(book.sourcePath) : app.getPath('documents')
    const options: Electron.SaveDialogOptions = {
      title: 'PDF로 저장',
      defaultPath: join(defaultDir, `${safeFileName(book.metadata.title)}.pdf`),
      filters: [{ name: 'PDF 문서', extensions: ['pdf'] }]
    }
    const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (picked.canceled || !picked.filePath) return null

    const report = (stage: RenderStage): void => {
      const progress: ConvertProgress = { bookId: book.id, stage }
      if (!event.sender.isDestroyed()) event.sender.send(IpcChannels.convertProgress, progress)
    }
    try {
      const result = await convertBook(book, settings, picked.filePath, report)
      outputs.add(result.path)
      return { ok: true, value: result }
    } catch (err) {
      console.error(err)
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
        return { ok: false, error: `PDF 파일을 저장할 수 없습니다. 다른 프로그램에서 열려 있지 않은지 확인해 주세요.\n${picked.filePath}` }
      }
      return { ok: false, error: `변환 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}` }
    }
  })

  ipcMain.handle(IpcChannels.openOutput, async (_event, path: unknown) => {
    if (typeof path === 'string' && outputs.has(path)) await shell.openPath(path)
  })
  ipcMain.handle(IpcChannels.showOutput, (_event, path: unknown) => {
    if (typeof path === 'string' && outputs.has(path)) shell.showItemInFolder(path)
  })
}
