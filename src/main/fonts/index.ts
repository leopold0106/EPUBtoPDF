/** 사용자 글꼴 IPC. */

import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc'
import { FontRegistry, type AddFontsResult } from './registry'

let registry: FontRegistry | undefined
export const fontRegistry = (): FontRegistry => (registry ??= new FontRegistry(join(app.getPath('userData'), 'fonts')))

export function registerFontIpc(): void {
  ipcMain.handle(IpcChannels.listUserFonts, () => fontRegistry().list())
  ipcMain.handle(IpcChannels.addUserFonts, async (event): Promise<AddFontsResult | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: '글꼴 파일 추가',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '글꼴', extensions: ['ttf', 'otf', 'ttc', 'woff'] }]
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) return null
    return fontRegistry().add(picked.filePaths)
  })
  ipcMain.handle(IpcChannels.removeUserFont, (_event, id: unknown) => {
    if (typeof id === 'string') return fontRegistry().remove(id)
  })
}
