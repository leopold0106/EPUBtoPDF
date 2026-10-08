/**
 * 판면(본문 영역) 계산.
 *
 * 쪽당 줄 수 N, 글자 크기 F, 줄 간격 배수 L, 판면 높이 H 사이에는
 *   줄 높이 = F × L,  N = H / 줄 높이
 * 의 관계가 있다. 줄 간격 배수 L은 항상 사용자가 정한 값을 유지하고,
 *  - `linesPerPage` 방식: N을 고정하고 F = H / (N × L) 로 글자 크기를 구한다.
 *  - `fontSize` 방식: F를 고정하고 N = ⌊H / (F × L)⌋ 로 줄 수를 구한다.
 *    줄 격자 맞춤(snapToGrid)이 켜져 있으면 남는 높이를 줄 사이에 나눠
 *    판면이 정확히 N줄로 채워지게 한다.
 */

import { resolvePageSize, type Settings } from './settings'
import { floorToLayoutUnit, mmToPx, pxToMm, pxToPt } from './units'

export interface Typography {
  pageWidthMm: number
  pageHeightMm: number
  /** 판면 너비·높이. Chromium이 정수 px로 내림할 수 있으므로 내림한 값을 쓴다. */
  bodyWidthPx: number
  bodyHeightPx: number
  fontSizePt: number
  /** 한 줄이 차지하는 높이(줄 피치). CSS line-height로 그대로 쓴다. */
  lineHeightPx: number
  linesPerPage: number
  /** 전각 문자(한글·한자) 기준 한 줄에 들어가는 대략적인 글자 수. */
  charsPerLine: number
}

/** 글자 크기는 0.01pt 단위로 내림한다 (UI 표시와 CSS 출력이 일치하도록). */
const floorPt = (pt: number): number => Math.floor(pt * 100 + 1e-9) / 100

export function computeTypography(settings: Settings): Typography {
  const { widthMm, heightMm } = resolvePageSize(settings.page)
  const m = settings.margins
  const t = settings.text

  const bodyWidthPx = Math.max(0, Math.floor(mmToPx(widthMm - m.insideMm - m.outsideMm)))
  const bodyHeightPx = Math.max(0, Math.floor(mmToPx(heightMm - m.topMm - m.bottomMm)))

  let fontSizePt: number
  let linesPerPage: number
  let lineHeightPx: number

  if (t.sizing === 'linesPerPage') {
    linesPerPage = t.linesPerPage
    lineHeightPx = floorToLayoutUnit(bodyHeightPx / linesPerPage)
    fontSizePt = floorPt(pxToPt(lineHeightPx) / t.lineHeight)
  } else {
    fontSizePt = t.fontSizePt
    const naturalPx = (fontSizePt / 72) * 96 * t.lineHeight
    linesPerPage = Math.floor(bodyHeightPx / naturalPx + 1e-9)
    lineHeightPx =
      t.snapToGrid && linesPerPage > 0
        ? floorToLayoutUnit(bodyHeightPx / linesPerPage)
        : floorToLayoutUnit(naturalPx)
  }

  const fontSizePx = (fontSizePt / 72) * 96
  const charsPerLine = fontSizePx > 0 ? Math.floor(bodyWidthPx / fontSizePx + 1e-9) : 0

  return {
    pageWidthMm: widthMm,
    pageHeightMm: heightMm,
    bodyWidthPx,
    bodyHeightPx,
    fontSizePt,
    lineHeightPx,
    linesPerPage,
    charsPerLine
  }
}

// ---------------------------------------------------------------------------
// 설정 검사

export type IssueLevel = 'error' | 'warning'

export interface SettingsIssue {
  level: IssueLevel
  /** 문제가 된 설정 위치 (예: `margins.topMm`). UI에서 해당 입력란을 강조하는 데 쓴다. */
  field: string
  message: string
}

const MIN_BODY_MM = 20
const READABLE_FONT_PT = { min: 6, max: 24 }
const PAGE_NUMBER_MIN_MARGIN_MM = 8

export function validateSettings(settings: Settings, typo = computeTypography(settings)): SettingsIssue[] {
  const issues: SettingsIssue[] = []
  const m = settings.margins
  const bodyWidthMm = typo.pageWidthMm - m.insideMm - m.outsideMm
  const bodyHeightMm = typo.pageHeightMm - m.topMm - m.bottomMm

  if (bodyWidthMm < MIN_BODY_MM) {
    issues.push({
      level: 'error',
      field: 'margins.insideMm',
      message: `좌우 여백이 너무 커서 본문 너비가 ${bodyWidthMm.toFixed(1)}mm밖에 되지 않습니다.`
    })
  }
  if (bodyHeightMm < MIN_BODY_MM) {
    issues.push({
      level: 'error',
      field: 'margins.topMm',
      message: `위아래 여백이 너무 커서 본문 높이가 ${bodyHeightMm.toFixed(1)}mm밖에 되지 않습니다.`
    })
  }

  if (typo.linesPerPage < 1) {
    issues.push({
      level: 'error',
      field: 'text.fontSizePt',
      message: '글자 크기와 줄 간격에 비해 본문 높이가 작아 한 줄도 들어가지 않습니다.'
    })
  }

  if (settings.text.sizing === 'linesPerPage') {
    if (typo.fontSizePt < READABLE_FONT_PT.min) {
      issues.push({
        level: 'warning',
        field: 'text.linesPerPage',
        message: `쪽당 ${typo.linesPerPage}줄이면 글자 크기가 ${typo.fontSizePt}pt로 너무 작아집니다.`
      })
    } else if (typo.fontSizePt > READABLE_FONT_PT.max) {
      issues.push({
        level: 'warning',
        field: 'text.linesPerPage',
        message: `쪽당 ${typo.linesPerPage}줄이면 글자 크기가 ${typo.fontSizePt}pt로 매우 커집니다.`
      })
    }
  }

  const pn = settings.decor.pageNumbers
  if (pn.startsWith('bottom') && m.bottomMm < PAGE_NUMBER_MIN_MARGIN_MM) {
    issues.push({
      level: 'warning',
      field: 'margins.bottomMm',
      message: `아래 여백이 ${PAGE_NUMBER_MIN_MARGIN_MM}mm보다 작으면 쪽 번호가 잘릴 수 있습니다.`
    })
  }
  if ((pn === 'top-outside' || settings.decor.header !== 'none') && m.topMm < PAGE_NUMBER_MIN_MARGIN_MM) {
    issues.push({
      level: 'warning',
      field: 'margins.topMm',
      message: `위 여백이 ${PAGE_NUMBER_MIN_MARGIN_MM}mm보다 작으면 머리글이나 쪽 번호가 잘릴 수 있습니다.`
    })
  }

  return issues
}

/** 판면 크기를 mm로 (UI 표시용). */
export function bodySizeMm(typo: Typography): { widthMm: number; heightMm: number } {
  return { widthMm: pxToMm(typo.bodyWidthPx), heightMm: pxToMm(typo.bodyHeightPx) }
}
