import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { computeTypography, validateSettings } from '@shared/typography'
import { makeSettings } from './helpers'


describe('computeTypography: 판면', () => {
  it('판면 크기를 정수 px로 내림한다', () => {
    const t = computeTypography(makeSettings({}))
    // 높이 210 − 40 = 170mm = 642.5px, 너비 148 − 35 = 113mm = 427.1px
    expect(t.bodyHeightPx).toBe(642)
    expect(t.bodyWidthPx).toBe(427)
  })

  it('가로 방향이면 판면도 가로가 된다', () => {
    const t = computeTypography(makeSettings({ page: { orientation: 'landscape' } }))
    expect(t.pageWidthMm).toBe(210)
    expect(t.bodyWidthPx).toBeGreaterThan(t.bodyHeightPx)
  })
})

describe('computeTypography: 글자 크기 방식', () => {
  it('들어가는 줄 수를 계산한다', () => {
    // 10.5pt = 14px, × 1.7 = 23.8px → 642 / 23.8 = 26.97 → 26줄
    const t = computeTypography(makeSettings({ text: { sizing: 'fontSize', fontSizePt: 10.5, lineHeight: 1.7 } }))
    expect(t.fontSizePt).toBe(10.5)
    expect(t.linesPerPage).toBe(26)
  })

  it('줄 격자 맞춤이 켜져 있으면 남는 높이를 줄 사이에 나눈다', () => {
    const t = computeTypography(makeSettings({ text: { sizing: 'fontSize', snapToGrid: true } }))
    expect(t.lineHeightPx).toBeCloseTo(642 / 26, 1)
    expect(t.lineHeightPx * t.linesPerPage).toBeLessThanOrEqual(t.bodyHeightPx)
  })

  it('줄 격자 맞춤이 꺼져 있으면 글자 크기 × 줄 간격을 그대로 쓴다', () => {
    const t = computeTypography(makeSettings({ text: { sizing: 'fontSize', snapToGrid: false } }))
    expect(t.lineHeightPx).toBeCloseTo(23.8, 1)
  })

  it('한 줄 글자 수(전각 기준)를 계산한다', () => {
    // 427px / 14px = 30.5 → 30자
    expect(computeTypography(makeSettings({ text: { sizing: 'fontSize', fontSizePt: 10.5 } })).charsPerLine).toBe(30)
  })
})

describe('computeTypography: 쪽당 줄 수 방식', () => {
  it('줄 수를 고정하고 글자 크기를 계산한다', () => {
    // 642 / 24 = 26.75px = 20.0625pt → ÷ 1.7 = 11.80pt
    const t = computeTypography(makeSettings({ text: { sizing: 'linesPerPage', linesPerPage: 24, lineHeight: 1.7 } }))
    expect(t.linesPerPage).toBe(24)
    expect(t.lineHeightPx).toBe(26.75)
    expect(t.fontSizePt).toBe(11.8)
  })

  it('줄 간격 배수는 유지하고 글자 크기만 바뀐다', () => {
    const a = computeTypography(makeSettings({ text: { sizing: 'linesPerPage', linesPerPage: 20, lineHeight: 1.5 } }))
    const b = computeTypography(makeSettings({ text: { sizing: 'linesPerPage', linesPerPage: 30, lineHeight: 1.5 } }))
    expect(b.fontSizePt).toBeLessThan(a.fontSizePt)
    expect(a.lineHeightPx / ((a.fontSizePt * 96) / 72)).toBeCloseTo(1.5, 1)
    expect(b.lineHeightPx / ((b.fontSizePt * 96) / 72)).toBeCloseTo(1.5, 1)
  })

  it('입력에 사용한 글자 크기 설정은 무시한다', () => {
    const a = computeTypography(makeSettings({ text: { sizing: 'linesPerPage', fontSizePt: 8 } }))
    const b = computeTypography(makeSettings({ text: { sizing: 'linesPerPage', fontSizePt: 20 } }))
    expect(a.fontSizePt).toBe(b.fontSizePt)
  })

  it.each(['A4', 'A5', 'A6', 'B6', 'shinguk', '46'] as const)(
    '%s 용지에서 N줄이 판면에 정확히 들어가고 N+1줄은 넘친다',
    (paper) => {
      for (let n = 5; n <= 60; n++) {
        const t = computeTypography(makeSettings({ page: { paper }, text: { sizing: 'linesPerPage', linesPerPage: n } }))
        expect(t.lineHeightPx * n).toBeLessThanOrEqual(t.bodyHeightPx)
        expect(t.lineHeightPx * (n + 1)).toBeGreaterThan(t.bodyHeightPx)
      }
    }
  )
})

describe('validateSettings', () => {
  it('기본 설정에는 문제가 없다', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual([])
  })

  it('여백이 용지보다 크면 오류', () => {
    const issues = validateSettings(makeSettings({ margins: { topMm: 104, bottomMm: 104 } }))
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', field: 'margins.topMm' }))
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', field: 'text.fontSizePt' }))
  })

  it('좌우 여백이 너무 크면 오류', () => {
    const issues = validateSettings(makeSettings({ margins: { insideMm: 70, outsideMm: 70 } }))
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', field: 'margins.insideMm' }))
  })

  it('줄 수가 너무 많아 글자가 작아지면 경고', () => {
    const issues = validateSettings(makeSettings({ text: { sizing: 'linesPerPage', linesPerPage: 80 } }))
    expect(issues).toContainEqual(expect.objectContaining({ level: 'warning', field: 'text.linesPerPage' }))
  })

  it('줄 수가 너무 적어 글자가 커지면 경고', () => {
    const issues = validateSettings(makeSettings({ text: { sizing: 'linesPerPage', linesPerPage: 3 } }))
    expect(issues).toContainEqual(expect.objectContaining({ level: 'warning', field: 'text.linesPerPage' }))
  })

  it('쪽 번호 자리가 부족하면 경고', () => {
    const issues = validateSettings(makeSettings({ margins: { bottomMm: 5 }, decor: { pageNumbers: 'bottom-center' } }))
    expect(issues).toContainEqual(expect.objectContaining({ level: 'warning', field: 'margins.bottomMm' }))
    expect(validateSettings(makeSettings({ margins: { bottomMm: 5 }, decor: { pageNumbers: 'none' } }))).toEqual([])
  })
})
