import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IpcChannels, type ConvertProgress, type RendererApi } from '@shared/ipc'

const api: RendererApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.getAppInfo),
  openBookDialog: () => ipcRenderer.invoke(IpcChannels.openBookDialog),
  openBookPath: (path) => ipcRenderer.invoke(IpcChannels.openBookPath, path),
  closeBook: (bookId) => ipcRenderer.invoke(IpcChannels.closeBook, bookId),
  listImages: (bookId) => ipcRenderer.invoke(IpcChannels.listImages, bookId),
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
  pathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
