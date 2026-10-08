/** 책 열기·닫기 IPC. */

import { createHash } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { hasEdits, normalizeEdits, type BookEdits } from '@shared/edits'
import type { BookSummary } from '@shared/book'
import { IpcChannels, type Result } from '@shared/ipc'
import { EpubError } from './epub/errors'
import { library } from './epub/library'
import { openEpub, type EpubBook } from './epub/parse'
import { JsonStore } from './store'

function editsStore(book: EpubBook | undefined): JsonStore | undefined {
  return book?.contentHash ? new JsonStore(join(app.getPath('userData'), 'edits', `${book.contentHash}.json`)) : undefined
}

export async function openBookFile(path: string): Promise<Result<BookSummary>> {
  try {
    const data = await readFile(path)
    const book = await openEpub(data, basename(path))
    book.sourcePath = path
    book.contentHash = createHash('sha256').update(data).digest('hex').slice(0, 32)
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

  // 본문 편집기가 원본 장 문서를 읽는다.
  ipcMain.handle(IpcChannels.readChapter, async (_event, bookId: unknown, index: unknown): Promise<Result<string>> => {
    const book = typeof bookId === 'string' ? library.get(bookId) : undefined
    const entry = typeof index === 'number' ? book?.spine[index] : undefined
    if (!book || !entry) return { ok: false, error: '장을 찾을 수 없습니다.' }
    try {
      return { ok: true, value: await book.readText(entry.path) }
    } catch (err) {
      return { ok: false, error: `장 문서를 읽지 못했습니다: ${err instanceof Error ? err.message : String(err)}` }
    }
  })

  // 책별 편집 내용(뺀 그림, 고친 본문)은 앱 데이터 폴더에 저장해 두고 같은 파일을 다시 열면 불러온다.
  ipcMain.handle(IpcChannels.loadEdits, async (_event, bookId: unknown): Promise<BookEdits | null> => {
    const store = editsStore(typeof bookId === 'string' ? library.get(bookId) : undefined)
    const raw = store && (await store.read())
    return raw ? normalizeEdits(raw) : null
  })
  ipcMain.handle(IpcChannels.saveEdits, async (_event, bookId: unknown, rawEdits: unknown) => {
    const store = editsStore(typeof bookId === 'string' ? library.get(bookId) : undefined)
    if (!store) return
    const edits = normalizeEdits(rawEdits)
    if (hasEdits(edits)) await store.write(edits)
    else await rm(store.file, { force: true })
  })
}
