/** 메인 프로세스와 렌더러가 주고받는 IPC 채널 이름과 타입. */

import type { BookSummary } from './book'
import type { BookEdits } from './edits'
import type { ImageInfo } from './render'
import type { Settings } from './settings'

export const IpcChannels = {
  getAppInfo: 'app:get-info',
  openBookDialog: 'book:open-dialog',
  openBookPath: 'book:open-path',
  closeBook: 'book:close',
  listImages: 'book:list-images',
  convert: 'convert:run',
  convertProgress: 'convert:progress',
  openOutput: 'output:open',
  showOutput: 'output:show'
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

export interface ConvertProgress {
  bookId: string
  stage: 'assembling' | 'printing' | 'finishing'
}

export interface ConvertResult {
  path: string
  pageCount: number
  warnings: string[]
  seconds: number
}

/** preload가 `window.api`로 노출하는 API. */
export interface RendererApi {
  getAppInfo(): Promise<AppInfo>
  /** 파일 선택 창을 띄워 EPUB을 연다. 취소하면 null. */
  openBookDialog(): Promise<Result<BookSummary> | null>
  openBookPath(path: string): Promise<Result<BookSummary>>
  closeBook(bookId: string): Promise<void>
  /** 책에 든 그림 목록. */
  listImages(bookId: string): Promise<Result<ImageInfo[]>>
  /** 저장 위치를 물은 뒤 PDF로 변환한다. 저장을 취소하면 null. */
  convert(bookId: string, settings: Settings, edits: BookEdits): Promise<Result<ConvertResult> | null>
  /** 변환 진행 상황을 받는다. 돌려받은 함수를 부르면 구독을 끊는다. */
  onConvertProgress(listener: (progress: ConvertProgress) => void): () => void
  openOutput(path: string): Promise<void>
  showOutput(path: string): Promise<void>
}
