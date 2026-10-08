import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels, type RendererApi } from '@shared/ipc'

const api: RendererApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.getAppInfo),
  openBookDialog: () => ipcRenderer.invoke(IpcChannels.openBookDialog),
  openBookPath: (path) => ipcRenderer.invoke(IpcChannels.openBookPath, path),
  closeBook: (bookId) => ipcRenderer.invoke(IpcChannels.closeBook, bookId)
}

contextBridge.exposeInMainWorld('api', api)
