/**
 * 길이 단위 변환. CSS 기준으로 1in = 25.4mm = 72pt = 96px.
 * 설정은 mm(용지·여백)와 pt(글자 크기)로 저장하고, 렌더링 직전에 px로 바꾼다.
 */

export const MM_PER_INCH = 25.4
export const PT_PER_INCH = 72
export const PX_PER_INCH = 96

export const mmToPt = (mm: number): number => (mm / MM_PER_INCH) * PT_PER_INCH
export const ptToMm = (pt: number): number => (pt / PT_PER_INCH) * MM_PER_INCH
export const mmToPx = (mm: number): number => (mm / MM_PER_INCH) * PX_PER_INCH
export const pxToMm = (px: number): number => (px / PX_PER_INCH) * MM_PER_INCH
export const ptToPx = (pt: number): number => (pt / PT_PER_INCH) * PX_PER_INCH
export const pxToPt = (px: number): number => (px / PX_PER_INCH) * PT_PER_INCH

/** Chromium 레이아웃은 1/64px 단위로 계산하므로 그 격자에 맞춰 내림한다. */
export const LAYOUT_UNIT_PX = 1 / 64
export const floorToLayoutUnit = (px: number): number => Math.floor(px / LAYOUT_UNIT_PX + 1e-9) * LAYOUT_UNIT_PX

/** CSS에 쓸 숫자 표기. 불필요한 소수점 0을 없앤다. */
export function cssNumber(value: number, maxDecimals = 4): string {
  const fixed = value.toFixed(maxDecimals)
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}
