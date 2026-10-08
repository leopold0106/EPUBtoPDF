/** 사용자가 추가한 글꼴 파일. 앱 데이터 폴더에 복사해 둔다. */
export interface UserFont {
  id: string
  family: string
  localizedFamily?: string
  weight: number
  italic: boolean
  /** 원래 파일 이름 (화면 표시용). */
  fileName: string
}

export const FONT_SCHEME = 'app-font'

export const userFontUrl = (id: string): string => `${FONT_SCHEME}://font/${id}`

/** 화면에 보일 이름: 한국어 이름이 있으면 함께. */
export const userFontLabel = (f: UserFont): string => (f.localizedFamily ? `${f.localizedFamily} (${f.family})` : f.family)
