/** 메인 프로세스와 렌더러가 주고받는 IPC 채널 이름과 타입. */

import type { BookSummary } from './book'
import type { BookEdits } from './edits'
import type { UserFont } from './fonts'
import type { UserPreset } from './presets'
import type { ImageInfo } from './render'
import type { Settings } from './settings'

export const IpcChannels = {
  getAppInfo: 'app:get-info',
  openBookDialog: 'book:open-dialog',
  openBookPath: 'book:open-path',
  closeBook: 'book:close',
  listImages: 'book:list-images',
  readChapter: 'book:read-chapter',
  loadEdits: 'edits:load',
  saveEdits: 'edits:save',
  preview: 'preview:render',
  convert: 'convert:run',
  convertProgress: 'convert:progress',
  openOutput: 'output:open',
  showOutput: 'output:show',
  loadSettings: 'settings:load',
  saveSettings: 'settings:save',
  takeLaunchFile: 'app:take-launch-file',
  openRequest: 'book:open-request',
  listUserFonts: 'fonts:list',
  addUserFonts: 'fonts:add',
  removeUserFont: 'fonts:remove',
  listPresets: 'presets:list',
  savePreset: 'presets:save',
  removePreset: 'presets:remove',
  exportPreset: 'presets:export',
  importPreset: 'presets:import'
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

export interface PreviewRequest {
  /** 미리 볼 장(spine 위치). 생략하면 책 전체. */
  chapters?: number[]
  /** 쪽수만 필요할 때 (PDF는 돌려주지 않는다). */
  countOnly?: boolean
}

export interface PreviewResult {
  pdf?: Uint8Array
  pageCount: number
  warnings: string[]
  ms: number
}

export interface ConvertResult {
  path: string
  pageCount: number
  bookmarkCount: number
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
  /** 책에 든 그림 목록. 본문을 고친 장은 고친 내용 기준. */
  listImages(bookId: string, edits?: BookEdits): Promise<Result<ImageInfo[]>>
  /** 원본 장 문서 (본문 편집용). */
  readChapter(bookId: string, index: number): Promise<Result<string>>
  /** 이 책(같은 파일)에 저장해 둔 편집 내용. 없으면 null. */
  loadEdits(bookId: string): Promise<BookEdits | null>
  saveEdits(bookId: string, edits: BookEdits): Promise<void>
  /** 미리보기 PDF를 만든다. */
  preview(bookId: string, settings: Settings, edits: BookEdits, request: PreviewRequest): Promise<Result<PreviewResult>>
  /** 저장 위치를 물은 뒤 PDF로 변환한다. 저장을 취소하면 null. */
  convert(bookId: string, settings: Settings, edits: BookEdits): Promise<Result<ConvertResult> | null>
  /** 변환 진행 상황을 받는다. 돌려받은 함수를 부르면 구독을 끊는다. */
  onConvertProgress(listener: (progress: ConvertProgress) => void): () => void
  openOutput(path: string): Promise<void>
  showOutput(path: string): Promise<void>
  /** 저장해 둔 마지막 설정. 처음 실행이면 기본값. */
  loadSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
  /** 실행할 때 함께 넘어온 EPUB 경로 (한 번만 돌려준다). */
  takeLaunchFile(): Promise<string | null>
  /** 앱이 이미 켜져 있을 때 다른 EPUB을 더블클릭하면 불린다. */
  onOpenRequest(listener: (path: string) => void): () => void
  /** 끌어다 놓은 파일의 경로. */
  pathForFile(file: File): string
  listUserFonts(): Promise<UserFont[]>
  /** 파일 선택 창을 띄워 글꼴을 추가한다. 취소하면 null. */
  addUserFonts(): Promise<{ added: UserFont[]; failed: { fileName: string; reason: string }[] } | null>
  removeUserFont(id: string): Promise<void>
  listPresets(): Promise<UserPreset[]>
  /** 같은 이름의 프리셋이 있으면 덮어쓴다. */
  savePreset(name: string, settings: Settings): Promise<UserPreset>
  removePreset(id: string): Promise<void>
  /** 파일로 내보낸다. 저장한 경로를 돌려주고, 취소하면 null. */
  exportPreset(name: string, settings: Settings): Promise<Result<string> | null>
  /** 파일에서 가져와 내 프리셋에 더한다. 취소하면 null. */
  importPreset(): Promise<Result<UserPreset> | null>
}
