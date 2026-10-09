/** 렌더링 창과 메인 프로세스가 주고받는 데이터. DOM에 의존하지 않는다. */

/** 렌더링 창이 여는 빈 문서의 경로 (`epub://<책 ID>/` 아래). */
export const RENDER_PAGE_PATH = '__epubtopdf__/render.html'

/** 렌더링 창의 preload가 문서(main world)에 노출하는 객체 이름. */
export const RENDER_API_NAME = '__epubtopdf'

export interface AssembleChapter {
  /** 읽기 순서(spine) 위치. */
  index: number
  /** `epub://<책 ID>/<경로>` */
  url: string
}

export interface AssemblePayload {
  /** 이번에 렌더링할 장. */
  chapters: AssembleChapter[]
  /** 읽기 순서 전체의 URL. 다른 장을 가리키는 링크를 PDF 안의 링크로 바꾸는 데 쓴다. */
  spineUrls: string[]
  keepEpubStyles: boolean
  /** 설정으로 만든 CSS. 원본 스타일보다 뒤에 넣는다. */
  userCss: string
  lang?: string
  dir?: 'ltr' | 'rtl'
  /** 뺄 그림 (`imageKey`). */
  hiddenImages?: string[]
  /**
   * 미리보기용: 그림마다 PDF 링크를 겹쳐 두어, 미리보기에서 누른 그림이 어느 그림인지 알 수 있게 한다.
   * 링크 주소는 `previewImageUrl(key)`. 최종 PDF에는 쓰지 않는다.
   */
  markImages?: boolean
  /**
   * 책의 부분(목차 항목 등). 뺄 부분은 그 자리부터 다음 부분 직전까지 지우고,
   * 남은 부분과 장마다 쪽 위치를 알기 위한 표시를 둔다.
   */
  parts?: PartTarget[]
  /** 본문을 고친 장: 장 위치 → 고친 문서. 있으면 원본 대신 쓴다. */
  chapterOverrides?: Record<number, string>
  /** 인쇄 직전 다듬기 (render/typeset.ts). */
  typeset?: {
    /** 원본 스타일 유지 모드: 본문 글자 크기(px). */
    bodyFontPx?: number
    /** 줄 격자 맞춤: 줄 피치(px). */
    gridPx?: number
    gridPerChapter?: boolean
  }
}

/** 책의 한 부분 (shared/parts.ts의 BookPart). 인쇄 후 표시가 놓인 쪽을 읽어 책갈피와 쪽 번호에 쓴다. */
export interface PartTarget {
  key: string
  title: string
  /** `epub://` 주소와 조각 식별자. */
  url: string
  /** PDF에서 뺀다. */
  exclude?: boolean
}

const MARKER_PREFIX = 'https://epubtopdf.invalid/toc/'

/** 위치 표시 링크의 주소. 부분은 부분 키, 장(문서) 시작은 `chapterMarkerKey`. */
export const tocMarkerUrl = (key: string): string => MARKER_PREFIX + encodeURIComponent(key)

export const chapterMarkerKey = (spineIndex: number): string => `@${spineIndex}`

export function tocMarkerKey(url: string | undefined): string | undefined {
  if (!url?.startsWith(MARKER_PREFIX)) return undefined
  try {
    return decodeURIComponent(url.slice(MARKER_PREFIX.length))
  } catch {
    return undefined
  }
}

const PREVIEW_IMAGE_PREFIX = 'https://epubtopdf.invalid/image/'

export const previewImageUrl = (key: string): string => PREVIEW_IMAGE_PREFIX + encodeURIComponent(key)

/** 미리보기 PDF의 링크 주소에서 그림 키를 꺼낸다. 그림 링크가 아니면 undefined. */
export function imageKeyFromUrl(url: string | undefined): string | undefined {
  if (!url?.startsWith(PREVIEW_IMAGE_PREFIX)) return undefined
  try {
    return decodeURIComponent(url.slice(PREVIEW_IMAGE_PREFIX.length))
  } catch {
    return undefined
  }
}

/** 그림 목록을 만들 때 넘기는 값. */
export interface ListImagesPayload {
  chapters: AssembleChapter[]
  chapterOverrides?: Record<number, string>
}

export interface ImageInfo {
  /** `imageKey(장 위치, 장 안의 순서)` */
  key: string
  spineIndex: number
  /** `epub://` 절대 주소. 주소가 없거나 잘못되었으면 빈 문자열. */
  src: string
  alt: string
}

/** 쪽 번호만 찍힌 문서를 만들 때 넘기는 값. */
export interface NumberPagesPayload {
  /** 쪽 크기·여백과 쪽마다의 번호를 담은 CSS (shared/stylesheet.ts의 pageNumberSheet). */
  css: string
  pageCount: number
  dir?: 'ltr' | 'rtl'
}

export interface AssembleResult {
  /** 뺄 부분을 지우고 나니 아무것도 남지 않았다. */
  empty: boolean
  excludedPartCount: number
  chapterCount: number
  imageCount: number
  hiddenImageCount: number
  warnings: string[]
}
