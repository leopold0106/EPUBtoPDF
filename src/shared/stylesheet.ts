/**
 * 설정 → CSS.
 *
 * 생성한 CSS는 원본 EPUB 스타일시트보다 뒤에 넣는다.
 *  - `keep` 모드: 원본 CSS를 그대로 두고, 사용자가 정한 항목(글꼴, 크기, 줄 간격,
 *    문단 모양, 여백)만 `!important`로 덮어쓴다. 표, 강조, 그림 배치 등은 원본을 따른다.
 *  - `ignore` 모드: 원본 CSS는 HTML 조립 단계에서 제거되고, 여기서 만든 기본 스타일만 쓴다.
 */

import type { Settings } from './settings'
import type { Typography } from './typography'
import { cssNumber } from './units'

/** 각 장을 감싸는 요소의 클래스. HTML 조립 단계와 공유한다. */
export const CHAPTER_CLASS = 'epubtopdf-chapter'

export interface FontFaceSource {
  family: string
  /** 앱 내부 프로토콜 URL (예: `app-font://...`). */
  url: string
  weight?: string
  style?: 'normal' | 'italic'
}

export interface StylesheetContext {
  /** 머리글에 쓸 책 제목. */
  bookTitle?: string
  /** 사용자가 추가한 글꼴 파일. */
  fontFaces?: FontFaceSource[]
}

/** CSS 문자열 리터럴로 안전하게 감싼다. */
export function cssString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, '\\a ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  return `"${escaped}"`
}

/** 한글이 빠진 글꼴을 골라도 한글이 보이도록 하는 대체 글꼴 목록. */
const KOREAN_FALLBACKS = {
  'sans-serif': ['Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans CJK KR', 'Noto Sans KR'],
  serif: ['Batang', 'AppleMyungjo', 'Noto Serif CJK KR', 'Noto Serif KR']
} as const

export function fontFamilyList(settings: Settings): string {
  const { family, generic } = settings.font
  const names = [family, ...KOREAN_FALLBACKS[generic].filter((f) => f !== family)]
  return [...names.map(cssString), generic].join(', ')
}

const HEADINGS = 'h1, h2, h3, h4, h5, h6'
const px = (v: number): string => `${cssNumber(v)}px`
const pt = (v: number): string => `${cssNumber(v)}pt`
const mm = (v: number): string => `${cssNumber(v)}mm`

function pageRules(s: Settings, t: Typography, ctx: StylesheetContext): string[] {
  const m = s.margins
  const rules: string[] = []
  const decorFont = `font-family: ${fontFamilyList(s)}; font-size: ${pt(Math.min(t.fontSizePt * 0.85, 10))}; color: #555;`
  const header =
    s.decor.header === 'bookTitle' && ctx.bookTitle
      ? `@top-center { content: ${cssString(ctx.bookTitle)}; ${decorFont} }`
      : ''

  const pn = s.decor.pageNumbers
  const numberBox = (box: string): string => `@${box} { content: counter(page); ${decorFont} }`

  rules.push(
    `@page {`,
    `  size: ${mm(t.pageWidthMm)} ${mm(t.pageHeightMm)};`,
    `  margin: ${mm(m.topMm)} ${mm(m.outsideMm)} ${mm(m.bottomMm)} ${mm(m.insideMm)};`,
    header && `  ${header}`,
    pn === 'bottom-center' ? `  ${numberBox('bottom-center')}` : '',
    `}`
  )

  if (s.margins.mirrored) {
    // 펼침면의 왼쪽(짝수) 쪽은 제본이 오른쪽에 온다.
    rules.push(`@page :left { margin-left: ${mm(m.outsideMm)}; margin-right: ${mm(m.insideMm)}; }`)
    rules.push(`@page :right { margin-left: ${mm(m.insideMm)}; margin-right: ${mm(m.outsideMm)}; }`)
  }

  if (pn === 'bottom-outside' || pn === 'top-outside') {
    const v = pn === 'bottom-outside' ? 'bottom' : 'top'
    if (s.margins.mirrored) {
      rules.push(`@page :left { ${numberBox(`${v}-left`)} }`)
      rules.push(`@page :right { ${numberBox(`${v}-right`)} }`)
    } else {
      rules.push(`@page { ${numberBox(`${v}-right`)} }`)
    }
  }

  return rules.filter(Boolean)
}

/** `ignore` 모드에서 원본 CSS 대신 쓰는 기본 스타일. */
function baseRules(): string[] {
  return [
    `h1 { font-size: 1.6em; font-weight: bold; }`,
    `h2 { font-size: 1.35em; font-weight: bold; }`,
    `h3 { font-size: 1.15em; font-weight: bold; }`,
    `h4, h5, h6 { font-size: 1em; font-weight: bold; }`,
    `${HEADINGS} { margin: 1em 0; text-indent: 0; text-align: start; }`,
    `blockquote { margin: 0 0 0 2em; }`,
    `ul, ol { margin: 0; padding-left: 2em; }`,
    `table { border-collapse: collapse; margin: 0 auto; }`,
    `td, th { border: 1px solid #999; padding: 0 0.4em; }`,
    `figure { margin: 0; text-align: center; }`,
    `figcaption { font-size: 0.9em; }`,
    `hr { border: none; border-top: 1px solid #999; }`,
    `a { color: inherit; text-decoration: none; }`
  ]
}

export function buildStylesheet(s: Settings, t: Typography, ctx: StylesheetContext = {}): string {
  const text = s.text
  const line = t.lineHeightPx
  const grid = text.snapToGrid
  const imp = ' !important'
  const out: string[] = []

  for (const face of ctx.fontFaces ?? []) {
    out.push(
      `@font-face { font-family: ${cssString(face.family)}; src: url(${cssString(face.url)});` +
        ` font-weight: ${face.weight ?? 'normal'}; font-style: ${face.style ?? 'normal'}; }`
    )
  }

  out.push(...pageRules(s, t, ctx))

  if (s.layout.epubStyles === 'ignore') out.push(...baseRules())

  // 본문: 사용자가 정한 글꼴·크기는 문단 단위 요소까지 강제한다.
  // span, small, sup, td, 제목 등은 원본의 상대 크기(em, %)를 유지한다.
  out.push(
    `html { font-size: ${pt(t.fontSizePt)}${imp}; }`,
    `html, body { margin: 0${imp}; padding: 0${imp}; }`,
    `body { font-family: ${fontFamilyList(s)}${imp}; text-align: ${text.align}${imp};` +
      ` word-break: ${text.wordBreak}${imp}; line-break: strict; overflow-wrap: anywhere;` +
      ` orphans: ${grid ? 1 : 2}; widows: ${grid ? 1 : 2}; }`,
    `body, p, div, li, dd, dt, blockquote { font-size: ${pt(t.fontSizePt)}${imp}; }`,
    // 좌우 여백은 원본을 따른다 (시, 인용 등의 들여쓰기).
    `p { margin-top: 0${imp}; margin-bottom: ${px(paragraphGap(s, line))}${imp}; text-indent: ${cssNumber(text.textIndentEm)}em${imp}; }`,
    // 링크는 본문 색으로. 특이도 0이라 원본 CSS가 링크 모양을 정했으면 그쪽이 이긴다.
    `:where(a:link, a:visited) { color: inherit; text-decoration: none; }`
  )

  // 줄 높이: 제목을 뺀 모든 요소를 같은 줄 피치로 맞춘다.
  out.push(
    `body, body :not(:is(${HEADINGS}), :is(${HEADINGS}) *) { line-height: ${px(line)}${imp}; }`,
    // 위첨자·아래첨자가 줄 높이를 늘리지 않게 한다. vertical-align으로 올리면 줄 상자가
    // 커지므로, 기준선에 둔 채 상대 위치로만 옮긴다.
    `body :is(sup, sub) { line-height: 0${imp}; vertical-align: baseline${imp}; position: relative; }`,
    `sup { top: -0.45em; }`,
    `sub { top: 0.25em; }`
  )

  // 제목: 줄 높이와 위아래 간격을 줄 피치의 정수 배로 맞춘다.
  if (grid) {
    out.push(
      `${HEADINGS} { line-height: round(up, 1.3em, ${px(line)})${imp};` +
        ` margin-top: ${px(line)}${imp}; margin-bottom: ${px(line)}${imp}; }`,
      `${HEADINGS}:first-child { margin-top: 0${imp}; }`
    )
  } else {
    out.push(`${HEADINGS} { line-height: 1.3${imp}; }`)
  }

  // 그림: 판면을 넘지 않게 줄이고 쪽 사이에서 잘리지 않게 한다.
  out.push(
    `img, svg, video { max-width: 100%${imp}; max-height: ${px(t.bodyHeightPx)}${imp}; height: auto; object-fit: contain; }`,
    `img, svg, figure, table { break-inside: avoid; }`,
    `${HEADINGS} { break-after: avoid; }`
  )

  if (s.layout.chapterBreak) {
    out.push(`.${CHAPTER_CLASS} + .${CHAPTER_CLASS} { break-before: page; }`)
  }

  return out.join('\n') + '\n'
}

/** 문단 간격(px). 줄 격자 맞춤이 켜져 있으면 줄 피치의 정수 배로 반올림한다. */
export function paragraphGap(s: Settings, linePx: number): number {
  const lines = s.text.snapToGrid ? Math.round(s.text.paragraphSpacing) : s.text.paragraphSpacing
  return lines * linePx
}
