/**
 * 설정 → CSS.
 *
 * 생성한 CSS는 원본 EPUB 스타일시트보다 뒤에 넣는다.
 *  - `keep` 모드: 원본 CSS를 그대로 두고, 사용자가 정한 항목(글꼴, 크기, 줄 간격,
 *    문단 모양, 여백)만 `!important`로 덮어쓴다. 표, 강조, 그림 배치 등은 원본을 따른다.
 *  - `ignore` 모드: 원본 CSS는 HTML 조립 단계에서 제거되고, 여기서 만든 기본 스타일만 쓴다.
 */

import { effectiveParagraphSpacing, type Settings } from './settings'
import type { Typography } from './typography'
import { cssNumber } from './units'

/** 각 장을 감싸는 요소의 클래스. HTML 조립 단계와 공유한다. */
export const CHAPTER_CLASS = 'epubtopdf-chapter'

/** 장(section)의 id. 다른 장으로 가는 링크와 장별 머리글이 이 id를 쓴다. */
export const chapterAnchorId = (spineIndex: number): string => `epubtopdf-c${spineIndex}`

/**
 * 본문 문단에 붙는 클래스. 렌더링 창이 원본에서 가장 많이 쓰인 문단 모양을 찾아 붙인다.
 * 들여쓰기·정렬·글꼴 설정은 이 문단에만 적용해, 원본의 특수 문단은 원래 모양을 지킨다.
 */
export const BODY_TEXT_CLASS = 'epubtopdf-body-text'

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
  /** 장 제목 머리글: 장(spine 위치)마다 머리글에 쓸 제목. */
  chapterTitles?: Record<number, string>
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

const decorFontOf = (s: Settings, t: Typography): string =>
  `font-family: ${fontFamilyList(s)}; font-size: ${pt(Math.min(t.fontSizePt * 0.85, 10))}; color: #555;`

/** 쪽 크기와 여백 (양면이면 왼쪽·오른쪽 쪽의 여백을 뒤집는다). */
function pageBoxRules(s: Settings, t: Typography, extra = ''): string[] {
  const m = s.margins
  const rules = [
    `@page {`,
    `  size: ${mm(t.pageWidthMm)} ${mm(t.pageHeightMm)};`,
    `  margin: ${mm(m.topMm)} ${mm(m.outsideMm)} ${mm(m.bottomMm)} ${mm(m.insideMm)};`,
    extra && `  ${extra}`,
    `}`
  ]
  if (m.mirrored) {
    // 펼침면의 왼쪽(짝수) 쪽은 제본이 오른쪽에 온다.
    rules.push(`@page :left { margin-left: ${mm(m.outsideMm)}; margin-right: ${mm(m.insideMm)}; }`)
    rules.push(`@page :right { margin-left: ${mm(m.insideMm)}; margin-right: ${mm(m.outsideMm)}; }`)
  }
  return rules.filter(Boolean)
}

/** 쪽 번호는 본문과 따로 찍으므로(pageNumberSheet) 여기서는 쪽 크기·여백·머리글만 정한다. */
function pageRules(s: Settings, t: Typography, ctx: StylesheetContext): string[] {
  const decorFont = decorFontOf(s, t)
  const header =
    s.decor.header === 'bookTitle' && ctx.bookTitle
      ? `@top-center { content: ${cssString(ctx.bookTitle)}; ${decorFont} }`
      : ''
  const rules = pageBoxRules(s, t, header)

  // 장 제목 머리글: 장마다 이름 붙은 쪽(named page)을 쓰고 그 쪽의 머리글에 제목을 넣는다.
  // 이름이 바뀌는 곳에서는 항상 새 쪽이 시작된다.
  if (s.decor.header === 'chapterTitle') {
    for (const [index, title] of Object.entries(ctx.chapterTitles ?? {})) {
      const name = `epubtopdf-p${index}`
      rules.push(`#${chapterAnchorId(Number(index))} { page: ${name}; }`)
      rules.push(`@page ${name} { @top-center { content: ${cssString(title)}; ${decorFont} } }`)
    }
  }

  return rules.filter(Boolean)
}

/** 쪽 번호만 찍을 문서의 쪽 하나. */
export const NUMBER_PAGE_CLASS = 'epubtopdf-number-page'

/**
 * 쪽 번호만 찍힌 문서의 CSS. 본문과 같은 쪽 크기·여백으로 빈 쪽을 만들고, 쪽마다 이름 붙은 쪽에
 * 그 쪽의 번호를 넣는다. 인쇄한 뒤 본문 PDF 위에 겹친다.
 * `labels[i]`는 i번째 쪽(0부터)에 찍을 글자. null이면 찍지 않는다.
 */
export function pageNumberSheet(s: Settings, t: Typography, labels: (string | null)[], ctx: StylesheetContext = {}): string {
  const out: string[] = []
  for (const face of ctx.fontFaces ?? []) {
    out.push(
      `@font-face { font-family: ${cssString(face.family)}; src: url(${cssString(face.url)});` +
        ` font-weight: ${face.weight ?? 'normal'}; font-style: ${face.style ?? 'normal'}; }`
    )
  }
  out.push(...pageBoxRules(s, t))
  out.push(
    `html, body { margin: 0; padding: 0; background: transparent; }`,
    `.${NUMBER_PAGE_CLASS} { height: 1px; }`,
    `.${NUMBER_PAGE_CLASS}:not(:last-child) { break-after: page; }`
  )
  const pn = s.decor.pageNumbers
  if (pn === 'none') return out.join('\n')
  const font = decorFontOf(s, t)
  const v = pn === 'top-outside' ? 'top' : 'bottom'
  labels.forEach((label, i) => {
    if (label === null) return
    const name = `epubtopdf-n${i}`
    const box = (where: string): string => `@${where} { content: ${cssString(label)}; ${font} }`
    out.push(`.${NUMBER_PAGE_CLASS}:nth-child(${i + 1}) { page: ${name}; }`)
    if (pn === 'bottom-center') out.push(`@page ${name} { ${box('bottom-center')} }`)
    else if (s.margins.mirrored) {
      out.push(`@page ${name}:left { ${box(`${v}-left`)} }`, `@page ${name}:right { ${box(`${v}-right`)} }`)
    } else out.push(`@page ${name} { ${box(`${v}-right`)} }`)
  })
  return out.join('\n')
}

/** `ignore` 모드에서 원본 CSS 대신 쓰는 기본 스타일. 위아래 간격은 buildStylesheet가 정한다. */
function baseRules(): string[] {
  return [
    `h1 { font-size: 1.6em; font-weight: bold; }`,
    `h2 { font-size: 1.35em; font-weight: bold; }`,
    `h3 { font-size: 1.15em; font-weight: bold; }`,
    `h4, h5, h6 { font-size: 1em; font-weight: bold; }`,
    `${HEADINGS} { text-indent: 0; text-align: start; }`,
    `blockquote { margin-left: 2em; margin-right: 0; }`,
    `ul, ol { padding-left: 2em; }`,
    `table { border-collapse: collapse; margin-left: auto; margin-right: auto; }`,
    `td, th { border: 1px solid #999; padding: 0 0.4em; }`,
    `figure { margin-left: 0; margin-right: 0; text-align: center; }`,
    `figcaption { font-size: 0.9em; }`,
    `hr { border: none; border-top: 1px solid #999; }`,
    `a { color: inherit; text-decoration: none; }`
  ]
}

/** 원본 스타일 무시 모드에서 문단과 같은 간격을 두는 블록 요소. */
const SPACED_BLOCKS = 'blockquote, ul, ol, dl, table, figure, pre'

export function buildStylesheet(s: Settings, t: Typography, ctx: StylesheetContext = {}): string {
  const text = s.text
  const line = t.lineHeightPx
  const grid = text.snapToGrid
  const imp = ' !important'
  // 그리드 정렬은 렌더링 창(typeset.ts)이 하므로 여기서는 orphans/widows와 제목 높이만 맞춘다.
  const out: string[] = []

  for (const face of ctx.fontFaces ?? []) {
    out.push(
      `@font-face { font-family: ${cssString(face.family)}; src: url(${cssString(face.url)});` +
        ` font-weight: ${face.weight ?? 'normal'}; font-style: ${face.style ?? 'normal'}; }`
    )
  }

  out.push(...pageRules(s, t, ctx))

  if (s.layout.epubStyles === 'ignore') out.push(...baseRules())

  const body = `.${BODY_TEXT_CLASS}`
  const fonts = fontFamilyList(s)
  const gap = px(paragraphGap(s, line))
  const indent = `${cssNumber(text.textIndentEm)}em`
  const ignore = s.layout.epubStyles === 'ignore'

  out.push(
    `html { font-size: ${pt(t.fontSizePt)}${imp}; }`,
    `html, body { margin: 0${imp}; padding: 0${imp}; }`,
    `body { font-family: ${fonts}${imp}; font-size: ${pt(t.fontSizePt)}${imp}; text-align: ${text.align};` +
      ` word-break: ${text.wordBreak}${imp}; line-break: strict; overflow-wrap: anywhere;` +
      ` orphans: ${grid ? 1 : 2}; widows: ${grid ? 1 : 2}; }`,
    // 본문 문단: 설정한 글꼴·들여쓰기·정렬. 코드 글꼴은 그대로 둔다.
    `${body} { font-family: ${fonts}${imp}; text-indent: ${indent}${imp}; text-align: ${text.align}${imp}; }`,
    `${body} :not(code, kbd, samp, tt) { font-family: ${fonts}${imp}; }`
  )

  if (ignore) {
    // 원본 스타일이 없으므로 문단 단위 요소는 모두 같은 크기, 문단은 모두 본문 모양.
    out.push(
      `body, p, div, li, dd, dt, blockquote { font-size: ${pt(t.fontSizePt)}${imp}; }`,
      `p { text-indent: ${indent}${imp}; text-align: ${text.align}${imp}; }`
    )
  }
  // 원본 유지 모드의 글자 크기는 렌더링 창이 원본 비율대로 맞춘다 (typeset.ts).

  // 문단 간격. 원본 무시 모드에서는 모든 문단, 유지 모드에서는 본문 문단만 (특수 문단의 위아래 여백은
  // 원본을 따르고, 줄 격자 맞춤이면 렌더링 창이 줄 단위로 올린다). 좌우 여백은 늘 원본을 따른다.
  out.push(`${ignore ? `p, ${body}` : body} { margin-top: 0${imp}; margin-bottom: ${gap}${imp}; }`)
  // 링크는 본문 색으로. 특이도 0이라 원본 CSS가 링크 모양을 정했으면 그쪽이 이긴다.
  out.push(`:where(a:link, a:visited) { color: inherit; text-decoration: none; }`)

  // 줄 높이: 제목을 뺀 모든 요소를 같은 줄 피치로 맞춘다.
  out.push(
    `body, body :not(:is(${HEADINGS}), :is(${HEADINGS}) *) { line-height: ${px(line)}${imp}; }`,
    // 위첨자·아래첨자가 줄 높이를 늘리지 않게 한다. vertical-align으로 올리면 줄 상자가
    // 커지므로, 기준선에 둔 채 상대 위치로만 옮긴다.
    `body :is(sup, sub) { line-height: 0${imp}; vertical-align: baseline${imp}; position: relative; }`,
    `sup { top: -0.45em; }`,
    `sub { top: 0.25em; }`
  )

  // 제목 줄 높이: 줄 격자 맞춤이면 줄 피치의 정수 배로 올린다.
  out.push(`${HEADINGS} { line-height: ${grid ? `round(up, 1.3em, ${px(line)})` : '1.3'}${imp}; }`)

  // 제목 위아래 간격. 장 첫머리의 제목은 위 간격을 두지 않는다.
  const headGap = headingGap(s, line)
  if (headGap !== undefined) {
    out.push(
      `${HEADINGS} { margin-top: ${px(headGap)}${imp}; margin-bottom: ${px(headGap)}${imp}; }`,
      `${HEADINGS}:first-child { margin-top: 0${imp}; }`
    )
  }

  // 원본 스타일 무시 모드: 인용·목록·표·그림도 문단과 같은 간격으로 띄운다.
  if (s.layout.epubStyles === 'ignore') {
    const gap = px(paragraphGap(s, line))
    out.push(`:is(${SPACED_BLOCKS}) { margin-top: ${gap}; margin-bottom: ${gap}; }`)
  }

  // 그림: 판면을 넘지 않게 줄이고 쪽 사이에서 잘리지 않게 한다.
  out.push(
    `img, svg, video { max-width: 100%${imp}; max-height: ${px(t.bodyHeightPx)}${imp}; height: auto; object-fit: contain; }`,
    `img, svg, figure, table { break-inside: avoid; }`,
    `${HEADINGS} { break-after: avoid; }`,
    // 제목 바로 뒤 문단이 쪽 끝에 한 줄만 남지 않게 한다 (그러면 제목도 함께 다음 쪽으로 간다).
    `:is(${HEADINGS}) + * { orphans: 2; }`
  )

  if (s.layout.chapterBreak) {
    out.push(`.${CHAPTER_CLASS} + .${CHAPTER_CLASS} { break-before: page; }`)
  }

  return out.join('\n') + '\n'
}

/** 줄 단위 간격을 px로. 줄 격자 맞춤이 켜져 있으면 정수 줄로 반올림한다. */
function linesToPx(s: Settings, lines: number, linePx: number): number {
  return (s.text.snapToGrid ? Math.round(lines) : lines) * linePx
}

/** 문단 간격(px). */
export function paragraphGap(s: Settings, linePx: number): number {
  return linesToPx(s, effectiveParagraphSpacing(s), linePx)
}

/** 제목 위아래 간격(px). 원본 스타일 유지 + 줄 격자 맞춤 꺼짐이면 원본을 따르므로 undefined. */
export function headingGap(s: Settings, linePx: number): number | undefined {
  if (s.layout.epubStyles === 'keep' && !s.text.snapToGrid) return undefined
  return linesToPx(s, s.text.headingSpacing, linePx)
}
