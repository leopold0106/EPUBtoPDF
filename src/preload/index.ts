import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IpcChannels, type ConvertProgress, type RendererApi } from '@shared/ipc'

const api: RendererApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.getAppInfo),
  openBookDialog: () => ipcRenderer.invoke(IpcChannels.openBookDialog),
  openBookPath: (path) => ipcRenderer.invoke(IpcChannels.openBookPath, path),
  closeBook: (bookId) => ipcRenderer.invoke(IpcChannels.closeBook, bookId),
  listImages: (bookId) => ipcRenderer.invoke(IpcChannels.listImages, bookId),
  preview: (bookId, settings, edits, request) => ipcRenderer.invoke(IpcChannels.preview, bookId, settings, edits, request),
  convert: (bookId, settings, edits) => ipcRenderer.invoke(IpcChannels.convert, bookId, settings, edits),
  onConvertProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ConvertProgress): void => listener(progress)
    ipcRenderer.on(IpcChannels.convertProgress, handler)
    return () => ipcRenderer.removeListener(IpcChannels.convertProgress, handler)
  },
  openOutput: (path) => ipcRenderer.invoke(IpcChannels.openOutput, path),
  showOutput: (path) => ipcRenderer.invoke(IpcChannels.showOutput, path),
  loadSettings: () => ipcRenderer.invoke(IpcChannels.loadSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IpcChannels.saveSettings, settings),
  takeLaunchFile: () => ipcRenderer.invoke(IpcChannels.takeLaunchFile),
  onOpenRequest: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, path: string): void => listener(path)
    ipcRenderer.on(IpcChannels.openRequest, handler)
    return () => ipcRenderer.removeListener(IpcChannels.openRequest, handler)
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
  listUserFonts: () => ipcRenderer.invoke(IpcChannels.listUserFonts),
  addUserFonts: () => ipcRenderer.invoke(IpcChannels.addUserFonts),
  removeUserFont: (id) => ipcRenderer.invoke(IpcChannels.removeUserFont, id),
  listPresets: () => ipcRenderer.invoke(IpcChannels.listPresets),
  savePreset: (name, settings) => ipcRenderer.invoke(IpcChannels.savePreset, name, settings),
  removePreset: (id) => ipcRenderer.invoke(IpcChannels.removePreset, id),
  exportPreset: (name, settings) => ipcRenderer.invoke(IpcChannels.exportPreset, name, settings),
  importPreset: () => ipcRenderer.invoke(IpcChannels.importPreset)
}

contextBridge.exposeInMainWorld('api', api)
