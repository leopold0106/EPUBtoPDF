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
