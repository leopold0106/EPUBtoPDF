import { describe, expect, it } from 'vitest'
import { PAPER_SIZES } from '@shared/paper'
import { DEFAULT_SETTINGS, effectiveParagraphSpacing, normalizeSettings, resolvePageSize, type Settings } from '@shared/settings'

describe('용지 규격', () => {
  it('id가 겹치지 않고 세로 방향(너비 ≤ 높이)으로 정의되어 있다', () => {
    expect(new Set(PAPER_SIZES.map((p) => p.id)).size).toBe(PAPER_SIZES.length)
    for (const p of PAPER_SIZES) expect(p.widthMm).toBeLessThanOrEqual(p.heightMm)
  })
})

describe('resolvePageSize', () => {
  const page = DEFAULT_SETTINGS.page

  it('규격 용지의 크기를 쓴다', () => {
    expect(resolvePageSize({ ...page, paper: 'A4' })).toEqual({ widthMm: 210, heightMm: 297 })
  })

  it('가로 방향이면 너비와 높이를 바꾼다', () => {
    expect(resolvePageSize({ ...page, paper: 'A4', orientation: 'landscape' })).toEqual({
      widthMm: 297,
      heightMm: 210
    })
  })

  it('사용자 지정 크기는 방향에 맞게 정렬한다', () => {
    const custom = { ...page, paper: 'custom' as const, customWidthMm: 300, customHeightMm: 200 }
    expect(resolvePageSize(custom)).toEqual({ widthMm: 200, heightMm: 300 })
    expect(resolvePageSize({ ...custom, orientation: 'landscape' })).toEqual({ widthMm: 300, heightMm: 200 })
  })
})

describe('normalizeSettings', () => {
  it('기본값은 그대로 통과한다', () => {
    expect(normalizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
  })

  it('잘못된 입력이면 기본값을 돌려준다', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('abc')).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({ page: null, text: 3 })).toEqual(DEFAULT_SETTINGS)
  })

  it('일부만 있는 설정은 나머지를 기본값으로 채운다', () => {
    const s = normalizeSettings({ text: { fontSizePt: 12 }, page: { paper: 'B5' } })
    expect(s.text.fontSizePt).toBe(12)
    expect(s.text.lineHeight).toBe(DEFAULT_SETTINGS.text.lineHeight)
    expect(s.page.paper).toBe('B5')
    expect(s.margins).toEqual(DEFAULT_SETTINGS.margins)
  })

  it('범위를 벗어난 숫자는 잘라내고, 줄 수는 정수로 만든다', () => {
    const s = normalizeSettings({
      text: { fontSizePt: 1000, lineHeight: -1, linesPerPage: 23.6 },
      margins: { topMm: -5 }
    })
    expect(s.text.fontSizePt).toBe(72)
    expect(s.text.lineHeight).toBe(0.8)
    expect(s.text.linesPerPage).toBe(24)
    expect(s.margins.topMm).toBe(0)
  })

  it('숫자 문자열은 숫자로 바꾸고, NaN은 버린다', () => {
    const s = normalizeSettings({ text: { fontSizePt: '11.5', lineHeight: NaN } })
    expect(s.text.fontSizePt).toBe(11.5)
    expect(s.text.lineHeight).toBe(DEFAULT_SETTINGS.text.lineHeight)
  })

  it('허용되지 않은 선택값은 기본값으로 되돌린다', () => {
    const s = normalizeSettings({
      page: { paper: 'Z9', orientation: 'diagonal' },
      layout: { epubStyles: 'remove' },
      decor: { pageNumbers: 'left' }
    })
    expect(s.page.paper).toBe(DEFAULT_SETTINGS.page.paper)
    expect(s.page.orientation).toBe('portrait')
    expect(s.layout.epubStyles).toBe('keep')
    expect(s.decor.pageNumbers).toBe(DEFAULT_SETTINGS.decor.pageNumbers)
  })

  it('빈 글꼴 이름은 기본 글꼴로 바꾼다', () => {
    expect(normalizeSettings({ font: { family: '  ' } }).font.family).toBe(DEFAULT_SETTINGS.font.family)
  })

  it('결과는 입력 객체와 독립적이다', () => {
    const input: Settings = structuredClone(DEFAULT_SETTINGS)
    const s = normalizeSettings(input)
    input.text.fontSizePt = 20
    expect(s.text.fontSizePt).toBe(DEFAULT_SETTINGS.text.fontSizePt)
  })
})

describe('문단 간격 자동', () => {
  it('auto는 원본 스타일 유지에서 0줄, 무시에서 1줄', () => {
    const keep = normalizeSettings({ layout: { epubStyles: 'keep' } })
    const ignore = normalizeSettings({ layout: { epubStyles: 'ignore' } })
    expect(keep.text.paragraphSpacing).toBe('auto')
    expect(effectiveParagraphSpacing(keep)).toBe(0)
    expect(effectiveParagraphSpacing(ignore)).toBe(1)
  })

  it('숫자를 정하면 모드와 상관없이 그 값을 쓴다', () => {
    expect(effectiveParagraphSpacing(normalizeSettings({ text: { paragraphSpacing: 2 }, layout: { epubStyles: 'ignore' } }))).toBe(2)
    expect(effectiveParagraphSpacing(normalizeSettings({ text: { paragraphSpacing: 0 }, layout: { epubStyles: 'ignore' } }))).toBe(0)
  })

  it('잘못된 값은 auto, 범위를 넘으면 잘라낸다', () => {
    expect(normalizeSettings({ text: { paragraphSpacing: 'abc' } }).text.paragraphSpacing).toBe('auto')
    expect(normalizeSettings({ text: { paragraphSpacing: 99, headingSpacing: -1 } }).text).toMatchObject({ paragraphSpacing: 5, headingSpacing: 0 })
  })
})
