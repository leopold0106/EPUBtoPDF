import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels, type RendererApi } from '@shared/ipc'

const api: RendererApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.getAppInfo)
}

contextBridge.exposeInMainWorld('api', api)
