/** 메인 프로세스와 렌더러가 주고받는 IPC 채널 이름과 타입. */

import type { BookSummary } from './book'

export const IpcChannels = {
  getAppInfo: 'app:get-info',
  openBookDialog: 'book:open-dialog',
  openBookPath: 'book:open-path',
  closeBook: 'book:close'
} as const

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  platform: string
}

/** 실패할 수 있는 작업의 결과. 오류 메시지는 사용자에게 그대로 보여줄 수 있다. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/** preload가 `window.api`로 노출하는 API. */
export interface RendererApi {
  getAppInfo(): Promise<AppInfo>
  /** 파일 선택 창을 띄워 EPUB을 연다. 취소하면 null. */
  openBookDialog(): Promise<Result<BookSummary> | null>
  openBookPath(path: string): Promise<Result<BookSummary>>
  closeBook(bookId: string): Promise<void>
}
