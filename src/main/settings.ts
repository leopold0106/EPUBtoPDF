/** 마지막으로 쓴 설정을 기억한다. */

import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc'
import { normalizeSettings, type Settings } from '@shared/settings'
import { JsonStore } from './store'

let store: JsonStore | undefined
const settingsStore = (): JsonStore => (store ??= new JsonStore(join(app.getPath('userData'), 'settings.json')))

export function registerSettingsIpc(): void {
  ipcMain.handle(IpcChannels.loadSettings, async (): Promise<Settings> => normalizeSettings(await settingsStore().read()))
  ipcMain.handle(IpcChannels.saveSettings, async (_event, raw: unknown) => {
    await settingsStore().write(normalizeSettings(raw))
  })
}
