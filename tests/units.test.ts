import { describe, expect, it } from 'vitest'
import { cssNumber, floorToLayoutUnit, mmToPt, mmToPx, ptToMm, ptToPx, pxToPt } from '@shared/units'

describe('단위 변환', () => {
  it('1인치 = 25.4mm = 72pt = 96px', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72)
    expect(mmToPx(25.4)).toBeCloseTo(96)
    expect(ptToPx(72)).toBeCloseTo(96)
    expect(pxToPt(96)).toBeCloseTo(72)
    expect(ptToMm(72)).toBeCloseTo(25.4)
  })

  it('1/64px 격자로 내림한다', () => {
    expect(floorToLayoutUnit(10)).toBe(10)
    expect(floorToLayoutUnit(10.01)).toBe(10)
    expect(floorToLayoutUnit(10 + 1 / 64)).toBe(10 + 1 / 64)
    expect(floorToLayoutUnit(10 + 1.9 / 64)).toBe(10 + 1 / 64)
  })

  it('CSS 숫자 표기에서 불필요한 0을 없앤다', () => {
    expect(cssNumber(10)).toBe('10')
    expect(cssNumber(10.5)).toBe('10.5')
    expect(cssNumber(10.123456)).toBe('10.1235')
    expect(cssNumber(0.1 + 0.2)).toBe('0.3')
  })
})
