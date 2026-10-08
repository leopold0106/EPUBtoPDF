export type EpubErrorCode =
  | 'not-zip'
  | 'missing-file'
  | 'no-package'
  | 'invalid-package'
  | 'empty-spine'
  | 'drm'

/** 사용자에게 그대로 보여줄 수 있는 메시지를 담은 오류. */
export class EpubError extends Error {
  constructor(
    readonly code: EpubErrorCode,
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'EpubError'
  }
}
