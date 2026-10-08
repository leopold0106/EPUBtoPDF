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
  /** 책갈피 표시를 둘 목차 항목. */
  tocTargets?: TocTarget[]
  /** 인쇄 직전 다듬기 (render/typeset.ts). */
  typeset?: {
    /** 원본 스타일 유지 모드: 본문 글자 크기(px). */
    bodyFontPx?: number
    /** 줄 격자 맞춤: 줄 피치(px). */
    gridPx?: number
    gridPerChapter?: boolean
  }
}

/** 책갈피를 걸 목차 항목. 인쇄 후 이 표시가 놓인 쪽을 읽어 책갈피를 만든다. */
export interface TocTarget {
  /** 목차 항목 번호 (목차를 펼친 순서). */
  n: number
  /** `epub://` 주소와 조각 식별자. */
  url: string
}

const TOC_MARKER_PREFIX = 'https://epubtopdf.invalid/toc/'

export const tocMarkerUrl = (n: number): string => TOC_MARKER_PREFIX + n

export function tocMarkerIndex(url: string | undefined): number | undefined {
  if (!url?.startsWith(TOC_MARKER_PREFIX)) return undefined
  const n = Number(url.slice(TOC_MARKER_PREFIX.length))
  return Number.isInteger(n) ? n : undefined
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
}

export interface ImageInfo {
  /** `imageKey(장 위치, 장 안의 순서)` */
  key: string
  spineIndex: number
  /** `epub://` 절대 주소. 주소가 없거나 잘못되었으면 빈 문자열. */
  src: string
  alt: string
}

export interface AssembleResult {
  chapterCount: number
  imageCount: number
  hiddenImageCount: number
  warnings: string[]
}
