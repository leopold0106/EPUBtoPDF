import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { applyPatch } from '../../src/renderer/src/hooks/useSettings'

describe('applyPatch', () => {
  it('바꾼 항목만 바꾸고 나머지는 그대로 둔다', () => {
    const next = applyPatch(DEFAULT_SETTINGS, { text: { fontSizePt: 12 }, margins: { topMm: 25 } })
    expect(next.text).toEqual({ ...DEFAULT_SETTINGS.text, fontSizePt: 12 })
    expect(next.margins).toEqual({ ...DEFAULT_SETTINGS.margins, topMm: 25 })
    expect(next.page).toEqual(DEFAULT_SETTINGS.page)
  })

  it('범위를 벗어난 값은 정규화한다', () => {
    expect(applyPatch(DEFAULT_SETTINGS, { text: { linesPerPage: 7.6 } }).text.linesPerPage).toBe(8)
  })

  it('원래 객체는 바꾸지 않는다', () => {
    const before = structuredClone(DEFAULT_SETTINGS)
    applyPatch(DEFAULT_SETTINGS, { page: { paper: 'A4' } })
    expect(DEFAULT_SETTINGS).toEqual(before)
  })
})
