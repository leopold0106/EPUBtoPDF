/** 메인 프로세스와 렌더러가 주고받는 IPC 채널 이름과 타입. */

export const IpcChannels = {
  getAppInfo: 'app:get-info'
} as const

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  platform: string
}

/** preload가 `window.api`로 노출하는 API. */
export interface RendererApi {
  getAppInfo(): Promise<AppInfo>
}
