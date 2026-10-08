/**
 * 변환 설정. 길이는 mm, 글자 크기는 pt로 저장한다.
 * 프리셋 파일과 저장된 설정은 `normalizeSettings`를 거쳐 항상 완전한 형태로 만든다.
 */

import { findPaper, type PaperId } from './paper'

export type Orientation = 'portrait' | 'landscape'

export interface PageSettings {
  paper: PaperId | 'custom'
  customWidthMm: number
  customHeightMm: number
  orientation: Orientation
}

export interface MarginSettings {
  topMm: number
  bottomMm: number
  /** 제본 쪽 여백. 양면(mirrored)이 아니면 왼쪽 여백. */
  insideMm: number
  /** 제본 반대쪽 여백. 양면(mirrored)이 아니면 오른쪽 여백. */
  outsideMm: number
  /** 홀수·짝수 쪽의 좌우 여백을 뒤집는다 (양면 인쇄용). */
  mirrored: boolean
}

export interface FontSettings {
  family: string
  /** 지정한 글꼴에 없는 글자를 그릴 기본 계열. */
  generic: 'serif' | 'sans-serif'
}

/**
 * 글자 크기를 직접 정하거나(`fontSize`), 쪽당 줄 수를 정하고 글자 크기를 계산한다(`linesPerPage`).
 * 줄 간격 배수는 두 방식 모두에서 사용자가 정한 값을 유지한다.
 */
export type SizingMode = 'fontSize' | 'linesPerPage'

export interface TextSettings {
  sizing: SizingMode
  fontSizePt: number
  linesPerPage: number
  /** 줄 간격 배수 (글자 크기 대비 줄 높이). */
  lineHeight: number
  /**
   * 문단 사이 간격 (줄 단위). `auto`면 원본 스타일 유지 모드에서 0줄, 무시 모드에서 1줄.
   * 무시 모드에서는 인용·목록·표·그림 위아래에도 같은 간격을 둔다.
   */
  paragraphSpacing: number | 'auto'
  /** 제목 위아래 간격 (줄 단위). 원본 스타일 유지 모드에서는 줄 격자 맞춤이 켜져 있을 때만 적용한다. */
  headingSpacing: number
  /** 첫 줄 들여쓰기 (글자 단위, em). */
  textIndentEm: number
  align: 'justify' | 'start'
  /** `normal`은 글자 단위, `keep-all`은 어절 단위로 줄을 바꾼다. */
  wordBreak: 'normal' | 'keep-all'
  /** 제목·문단 간격 같은 세로 간격을 줄 높이의 정수 배로 맞춰 쪽당 줄 수를 일정하게 한다. */
  snapToGrid: boolean
}

export interface LayoutSettings {
  /** 원본 EPUB의 CSS를 유지할지(`keep`), 버리고 앱 기본 스타일만 쓸지(`ignore`). */
  epubStyles: 'keep' | 'ignore'
  /** 장마다 새 쪽에서 시작한다. */
  chapterBreak: boolean
}

export type PageNumberPosition = 'none' | 'bottom-center' | 'bottom-outside' | 'top-outside'

export interface DecorSettings {
  pageNumbers: PageNumberPosition
  /** 쪽 위 가운데에 표시할 머리글. */
  header: 'none' | 'bookTitle'
}

export interface OutputSettings {
  /** EPUB 목차를 PDF 책갈피로 넣는다. */
  bookmarks: boolean
}

export interface Settings {
  version: 1
  page: PageSettings
  margins: MarginSettings
  font: FontSettings
  text: TextSettings
  layout: LayoutSettings
  decor: DecorSettings
  output: OutputSettings
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  page: { paper: 'A5', customWidthMm: 148, customHeightMm: 210, orientation: 'portrait' },
  margins: { topMm: 20, bottomMm: 20, insideMm: 20, outsideMm: 15, mirrored: true },
  font: { family: 'Malgun Gothic', generic: 'sans-serif' },
  text: {
    sizing: 'fontSize',
    fontSizePt: 10.5,
    linesPerPage: 24,
    lineHeight: 1.7,
    paragraphSpacing: 'auto',
    headingSpacing: 1,
    textIndentEm: 1,
    align: 'justify',
    wordBreak: 'normal',
    snapToGrid: true
  },
  layout: { epubStyles: 'keep', chapterBreak: true },
  decor: { pageNumbers: 'bottom-center', header: 'none' },
  output: { bookmarks: true }
}

/** 각 숫자 설정이 가질 수 있는 범위. UI 입력 제한과 정규화에 함께 쓴다. */
export const LIMITS = {
  pageMm: { min: 50, max: 1000 },
  marginMm: { min: 0, max: 200 },
  fontSizePt: { min: 4, max: 72 },
  linesPerPage: { min: 1, max: 200 },
  lineHeight: { min: 0.8, max: 4 },
  paragraphSpacing: { min: 0, max: 5 },
  headingSpacing: { min: 0, max: 5 },
  textIndentEm: { min: 0, max: 10 }
} as const

export interface PageSize {
  widthMm: number
  heightMm: number
}

/** 실제로 쓸 문단 간격 (줄 단위). */
export function effectiveParagraphSpacing(settings: Settings): number {
  const value = settings.text.paragraphSpacing
  if (value !== 'auto') return value
  return settings.layout.epubStyles === 'ignore' ? 1 : 0
}

/** 용지 규격과 방향을 반영한 실제 쪽 크기. */
export function resolvePageSize(page: PageSettings): PageSize {
  const paper = page.paper === 'custom' ? undefined : findPaper(page.paper)
  const w = paper?.widthMm ?? page.customWidthMm
  const h = paper?.heightMm ?? page.customHeightMm
  const portrait = { widthMm: Math.min(w, h), heightMm: Math.max(w, h) }
  return page.orientation === 'portrait'
    ? portrait
    : { widthMm: portrait.heightMm, heightMm: portrait.widthMm }
}

// ---------------------------------------------------------------------------
// 정규화: 어떤 값이 들어와도 유효한 Settings를 만든다.

type Range = { min: number; max: number }

function num(value: unknown, fallback: number, range: Range): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(range.max, Math.max(range.min, n))
}

/** 숫자가 아니면(`'auto'` 포함) `'auto'`. */
function numOrAuto(value: unknown, range: Range): number | 'auto' {
  const n = num(value, NaN, range)
  return Number.isNaN(n) ? 'auto' : n
}

function int(value: unknown, fallback: number, range: Range): number {
  return Math.round(num(value, fallback, range))
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

function obj(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function normalizeSettings(input: unknown): Settings {
  const d = DEFAULT_SETTINGS
  const root = obj(input)
  const page = obj(root.page)
  const margins = obj(root.margins)
  const font = obj(root.font)
  const text = obj(root.text)
  const layout = obj(root.layout)
  const decor = obj(root.decor)
  const output = obj(root.output)

  const paper =
    page.paper === 'custom' || (typeof page.paper === 'string' && findPaper(page.paper))
      ? (page.paper as PaperId | 'custom')
      : d.page.paper

  return {
    version: 1,
    page: {
      paper,
      customWidthMm: num(page.customWidthMm, d.page.customWidthMm, LIMITS.pageMm),
      customHeightMm: num(page.customHeightMm, d.page.customHeightMm, LIMITS.pageMm),
      orientation: oneOf(page.orientation, ['portrait', 'landscape'], d.page.orientation)
    },
    margins: {
      topMm: num(margins.topMm, d.margins.topMm, LIMITS.marginMm),
      bottomMm: num(margins.bottomMm, d.margins.bottomMm, LIMITS.marginMm),
      insideMm: num(margins.insideMm, d.margins.insideMm, LIMITS.marginMm),
      outsideMm: num(margins.outsideMm, d.margins.outsideMm, LIMITS.marginMm),
      mirrored: bool(margins.mirrored, d.margins.mirrored)
    },
    font: {
      family: str(font.family, d.font.family),
      generic: oneOf(font.generic, ['serif', 'sans-serif'], d.font.generic)
    },
    text: {
      sizing: oneOf(text.sizing, ['fontSize', 'linesPerPage'], d.text.sizing),
      fontSizePt: num(text.fontSizePt, d.text.fontSizePt, LIMITS.fontSizePt),
      linesPerPage: int(text.linesPerPage, d.text.linesPerPage, LIMITS.linesPerPage),
      lineHeight: num(text.lineHeight, d.text.lineHeight, LIMITS.lineHeight),
      paragraphSpacing: numOrAuto(text.paragraphSpacing, LIMITS.paragraphSpacing),
      headingSpacing: num(text.headingSpacing, d.text.headingSpacing, LIMITS.headingSpacing),
      textIndentEm: num(text.textIndentEm, d.text.textIndentEm, LIMITS.textIndentEm),
      align: oneOf(text.align, ['justify', 'start'], d.text.align),
      wordBreak: oneOf(text.wordBreak, ['normal', 'keep-all'], d.text.wordBreak),
      snapToGrid: bool(text.snapToGrid, d.text.snapToGrid)
    },
    layout: {
      epubStyles: oneOf(layout.epubStyles, ['keep', 'ignore'], d.layout.epubStyles),
      chapterBreak: bool(layout.chapterBreak, d.layout.chapterBreak)
    },
    decor: {
      pageNumbers: oneOf(
        decor.pageNumbers,
        ['none', 'bottom-center', 'bottom-outside', 'top-outside'],
        d.decor.pageNumbers
      ),
      header: oneOf(decor.header, ['none', 'bookTitle'], d.decor.header)
    },
    output: {
      bookmarks: bool(output.bookmarks, d.output.bookmarks)
    }
  }
}
