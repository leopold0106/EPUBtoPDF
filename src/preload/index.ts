import { contextBridge, ipcRenderer } from 'electron'
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
  showOutput: (path) => ipcRenderer.invoke(IpcChannels.showOutput, path)
}

contextBridge.exposeInMainWorld('api', api)
