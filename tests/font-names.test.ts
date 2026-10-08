import { describe, expect, it } from 'vitest'
import { fontDisplayName, fontMatches, KOREAN_FONT_NAMES, resolveFontName } from '@shared/font-names'

describe('글꼴 한국어 이름', () => {
  it('알려진 글꼴은 한국어 이름으로 보여준다', () => {
    expect(fontDisplayName('Malgun Gothic')).toBe('맑은 고딕')
    expect(fontDisplayName('Batang')).toBe('바탕')
    expect(fontDisplayName('Some Font')).toBe('Some Font')
    expect(fontDisplayName('My Font', '내 글꼴')).toBe('내 글꼴')
  })

  it('한국어로 적어도 저장할 영어 이름을 찾는다 (띄어쓰기 무시)', () => {
    expect(resolveFontName('맑은 고딕')).toBe('Malgun Gothic')
    expect(resolveFontName('맑은고딕')).toBe('Malgun Gothic')
    expect(resolveFontName(' 바탕 ')).toBe('Batang')
    expect(resolveFontName('본명조 (Noto Serif KR)')).toBe('Noto Serif KR')
    expect(resolveFontName('내 글꼴', [{ family: 'My Font', localizedFamily: '내 글꼴' }])).toBe('My Font')
    expect(resolveFontName('Unknown Font')).toBe('Unknown Font')
  })

  it('한국어·영어 어느 쪽으로든 찾을 수 있다', () => {
    expect(fontMatches('맑은', 'Malgun Gothic')).toBe(true)
    expect(fontMatches('malgun', 'Malgun Gothic')).toBe(true)
    expect(fontMatches('나눔 명조', 'NanumMyeongjo')).toBe(true)
    expect(fontMatches('바탕', 'Malgun Gothic')).toBe(false)
    expect(fontMatches('', 'Anything')).toBe(true)
  })

  it('한국어 이름은 서로 겹치지 않는다', () => {
    const names = Object.values(KOREAN_FONT_NAMES).map((n) => n.replace(/\s+/g, ''))
    expect(new Set(names).size).toBe(names.length)
  })
})
