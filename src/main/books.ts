/** 책 열기·닫기 IPC. */

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { BookSummary } from '@shared/book'
import { IpcChannels, type Result } from '@shared/ipc'
import { EpubError } from './epub/errors'
import { library } from './epub/library'
import { openEpub } from './epub/parse'

export async function openBookFile(path: string): Promise<Result<BookSummary>> {
  try {
    const book = await openEpub(await readFile(path), basename(path))
    library.add(book)
    return { ok: true, value: book.toSummary() }
  } catch (err) {
    if (err instanceof EpubError) return { ok: false, error: err.message }
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { ok: false, error: `파일을 찾을 수 없습니다: ${path}` }
    if (code === 'EACCES' || code === 'EPERM') return { ok: false, error: `파일을 읽을 권한이 없습니다: ${path}` }
    console.error(err)
    return { ok: false, error: `EPUB을 여는 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export function registerBookIpc(): void {
  ipcMain.handle(IpcChannels.openBookDialog, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'EPUB 파일 열기',
      properties: ['openFile'],
      filters: [{ name: 'EPUB 전자책', extensions: ['epub'] }]
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) return null
    return openBookFile(picked.filePaths[0]!)
  })

  ipcMain.handle(IpcChannels.openBookPath, (_event, path: unknown) => {
    if (typeof path !== 'string') return { ok: false, error: '잘못된 파일 경로입니다.' }
    return openBookFile(path)
  })

  ipcMain.handle(IpcChannels.closeBook, (_event, bookId: unknown) => {
    if (typeof bookId === 'string') library.remove(bookId)
  })
}
