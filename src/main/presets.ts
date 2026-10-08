/** 사용자 프리셋 저장·삭제·내보내기·가져오기. */

import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { safeFileName } from '@shared/filename'
import { IpcChannels, type Result } from '@shared/ipc'
import { parsePresetFile, toPresetFile, type UserPreset } from '@shared/presets'
import { normalizeSettings } from '@shared/settings'
import { JsonStore } from './store'

export class PresetStore {
  private readonly store: JsonStore
  constructor(file: string) {
    this.store = new JsonStore(file)
  }

  async list(): Promise<UserPreset[]> {
    const raw = await this.store.read()
    if (!Array.isArray(raw)) return []
    return raw
      .filter((p): p is UserPreset => typeof p?.id === 'string' && typeof p?.name === 'string')
      .map((p) => ({ id: p.id, name: p.name, settings: normalizeSettings(p.settings) }))
  }

  /** 같은 이름이 있으면 덮어쓴다. */
  async save(name: string, settings: unknown): Promise<UserPreset> {
    const list = await this.list()
    const trimmed = name.trim() || '내 프리셋'
    const existing = list.find((p) => p.name === trimmed)
    const preset: UserPreset = { id: existing?.id ?? randomUUID().replace(/-/g, ''), name: trimmed, settings: normalizeSettings(settings) }
    await this.store.write(existing ? list.map((p) => (p.id === preset.id ? preset : p)) : [...list, preset])
    return preset
  }

  async remove(id: string): Promise<void> {
    await this.store.write((await this.list()).filter((p) => p.id !== id))
  }
}

let presets: PresetStore | undefined
const presetStore = (): PresetStore => (presets ??= new PresetStore(join(app.getPath('userData'), 'presets.json')))

export function registerPresetIpc(): void {
  ipcMain.handle(IpcChannels.listPresets, () => presetStore().list())
  ipcMain.handle(IpcChannels.savePreset, (_e, name: unknown, settings: unknown) => presetStore().save(String(name ?? ''), settings))
  ipcMain.handle(IpcChannels.removePreset, (_e, id: unknown) => typeof id === 'string' && presetStore().remove(id))

  ipcMain.handle(IpcChannels.exportPreset, async (event, name: unknown, settings: unknown): Promise<Result<string> | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const presetName = String(name ?? '프리셋')
    const options: Electron.SaveDialogOptions = {
      title: '프리셋 내보내기',
      defaultPath: join(app.getPath('documents'), `${safeFileName(presetName)}.epubtopdf.json`),
      filters: [{ name: 'EPUBtoPDF 프리셋', extensions: ['json'] }]
    }
    const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (picked.canceled || !picked.filePath) return null
    try {
      await writeFile(picked.filePath, JSON.stringify(toPresetFile(presetName, normalizeSettings(settings)), null, 2), 'utf8')
      return { ok: true, value: picked.filePath }
    } catch (err) {
      return { ok: false, error: `프리셋을 저장하지 못했습니다: ${err instanceof Error ? err.message : String(err)}` }
    }
  })

  ipcMain.handle(IpcChannels.importPreset, async (event): Promise<Result<UserPreset> | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: '프리셋 가져오기',
      properties: ['openFile'],
      filters: [{ name: 'EPUBtoPDF 프리셋', extensions: ['json'] }]
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) return null
    const path = picked.filePaths[0]!
    try {
      const parsed = parsePresetFile(JSON.parse(await readFile(path, 'utf8')), basename(path, extname(path)).replace(/\.epubtopdf$/, ''))
      if (!parsed) return { ok: false, error: 'EPUBtoPDF 프리셋 파일이 아닙니다.' }
      return { ok: true, value: await presetStore().save(parsed.name, parsed.settings) }
    } catch {
      return { ok: false, error: '프리셋 파일을 읽을 수 없습니다. JSON 형식인지 확인해 주세요.' }
    }
  })
}
