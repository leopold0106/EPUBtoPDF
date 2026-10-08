/**
 * 한글 글꼴의 한국어 이름. 설치된 글꼴 목록(Local Font Access API)은 영어 계열 이름만 주므로
 * 화면에는 이 표의 한국어 이름을 보여주고, 설정에는 어느 환경에서나 통하는 영어 이름을 저장한다.
 */
export const KOREAN_FONT_NAMES: Record<string, string> = {
  // Windows 기본
  'Malgun Gothic': '맑은 고딕',
  Batang: '바탕',
  BatangChe: '바탕체',
  Gulim: '굴림',
  GulimChe: '굴림체',
  Dotum: '돋움',
  DotumChe: '돋움체',
  Gungsuh: '궁서',
  GungsuhChe: '궁서체',
  // 네이버 나눔
  NanumGothic: '나눔고딕',
  NanumGothicCoding: '나눔고딕코딩',
  NanumMyeongjo: '나눔명조',
  NanumBarunGothic: '나눔바른고딕',
  NanumBarunpen: '나눔바른펜',
  NanumSquare: '나눔스퀘어',
  NanumSquareRound: '나눔스퀘어라운드',
  'Nanum Pen Script': '나눔손글씨 펜',
  'Nanum Brush Script': '나눔손글씨 붓',
  // 본고딕·본명조
  'Noto Sans KR': '본고딕 (Noto Sans KR)',
  'Noto Serif KR': '본명조 (Noto Serif KR)',
  'Noto Sans CJK KR': '본고딕 (Noto Sans CJK KR)',
  'Noto Serif CJK KR': '본명조 (Noto Serif CJK KR)',
  'Source Han Sans K': '본고딕 (Source Han Sans)',
  'Source Han Serif K': '본명조 (Source Han Serif)',
  // 한컴·오피스
  'HCR Batang': '함초롬바탕',
  'HCR Dotum': '함초롬돋움',
  'Haansoft Batang': '한컴바탕',
  'Haansoft Dotum': '한컴돋움',
  'Hancom Gothic': '한컴 고딕',
  'HYGothic-Extra': 'HY견고딕',
  'HYGothic-Medium': 'HY중고딕',
  'HYMyeongJo-Extra': 'HY견명조',
  'HYSinMyeongJo-Medium': 'HY신명조',
  'HYHeadLine-Medium': 'HY헤드라인M',
  'HYGraphic-Medium': 'HY그래픽M',
  'HYGungSo-Bold': 'HY궁서B',
  'HYPost-Light': 'HY엽서L',
  'HYShortSamul-Medium': 'HY얕은샘물M',
  // macOS
  'Apple SD Gothic Neo': '애플 SD 산돌고딕 Neo',
  AppleMyungjo: '애플명조',
  AppleGothic: '애플고딕'
}

const compact = (s: string): string => s.replace(/\s+/g, '').toLowerCase()

const BY_KOREAN = new Map(Object.entries(KOREAN_FONT_NAMES).map(([en, ko]) => [compact(ko), en]))

/** 화면에 보일 이름. 한국어 이름이 있으면 그것, 없으면 그대로. */
export function fontDisplayName(family: string, localized?: string): string {
  return localized ?? KOREAN_FONT_NAMES[family] ?? family
}

/** 사용자가 적은 이름(한국어여도 됨)을 저장할 계열 이름으로 바꾼다. */
export function resolveFontName(input: string, extra: { family: string; localizedFamily?: string }[] = []): string {
  const text = input.trim()
  const key = compact(text)
  const user = extra.find((f) => f.localizedFamily && compact(f.localizedFamily) === key)
  if (user) return user.family
  return BY_KOREAN.get(key) ?? BY_KOREAN.get(compact(text.replace(/\s*\(.*\)$/, ''))) ?? text
}

/** 검색어가 글꼴의 한국어·영어 이름에 들어 있는가 (띄어쓰기·대소문자 무시). */
export function fontMatches(query: string, family: string, localized?: string): boolean {
  const q = compact(query)
  if (!q) return true
  return compact(family).includes(q) || compact(fontDisplayName(family, localized)).includes(q)
}
