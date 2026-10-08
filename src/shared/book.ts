/** 렌더러에 넘기는 책 정보. 메인 프로세스의 EpubBook에서 직렬화 가능한 부분만 담는다. */

export interface TocEntry {
  title: string
  /** 압축 파일 안의 경로와 조각 식별자 (예: `OEBPS/ch01.xhtml#sec2`). */
  href: string
  /** 이 항목이 가리키는 읽기 순서(spine) 위치. 찾지 못하면 -1. */
  spineIndex: number
  children: TocEntry[]
}

export interface SpineEntry {
  index: number
  /** 압축 파일 안의 경로. */
  path: string
  /** 목차에서 찾은 제목. 목차에 없으면 undefined. */
  title?: string
  /** `linear="no"`인 보조 문서(각주 모음 등)면 false. */
  linear: boolean
}

export interface BookMetadata {
  title: string
  creators: string[]
  language?: string
  publisher?: string
  date?: string
  identifier?: string
}

export interface BookSummary {
  /** 열린 책을 구분하는 ID. 리소스 URL(`epub://<id>/...`)의 호스트로도 쓴다. */
  id: string
  fileName: string
  metadata: BookMetadata
  spine: SpineEntry[]
  toc: TocEntry[]
  /** 표지 이미지 경로. */
  coverPath?: string
  direction: 'ltr' | 'rtl' | 'default'
  /** 열 수는 있었지만 사용자에게 알릴 만한 문제들. */
  warnings: string[]
}
