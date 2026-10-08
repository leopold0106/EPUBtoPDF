import { describe, expect, it } from 'vitest'
import { matchesBodyStyle, pickBodyStyle, type TextBlockSample } from '../../src/render/typeset'

const sample = (fontPx: number, indentPx: number, align: string, chars: number): TextBlockSample => ({ fontPx, indentPx, align, chars })

describe('pickBodyStyle', () => {
  it('글자 수로 가중해 가장 많이 쓰인 문단 모양을 고른다', () => {
    const body = pickBodyStyle([
      sample(16, 16, 'justify', 300),
      sample(16, 16, 'justify', 400),
      sample(16, 0, 'justify', 200), // 첫 문단 들여쓰기 없음
      sample(14, 0, 'center', 20), // 가운데 정렬 캡션
      sample(16, 0, 'left', 500) // 시: 문단 수는 하나지만 글자는 많다
    ])
    expect(body).toEqual({ fontPx: 16, indentPx: 16, align: 'justify' })
  })

  it('left와 start는 같은 정렬로 본다', () => {
    expect(pickBodyStyle([sample(16, 16, 'left', 10), sample(16, 16, 'start', 10), sample(16, 16, 'justify', 15)])).toEqual({
      fontPx: 16,
      indentPx: 16,
      align: 'start'
    })
  })

  it('문단이 없으면 undefined', () => {
    expect(pickBodyStyle([])).toBeUndefined()
    expect(pickBodyStyle([sample(16, 0, 'left', 0)])).toBeUndefined()
  })
})

describe('matchesBodyStyle', () => {
  const body = { fontPx: 16, indentPx: 16, align: 'justify' }

  it('조금의 반올림 차이는 같은 모양으로 본다', () => {
    expect(matchesBodyStyle(sample(16.3, 15.5, 'justify', 1), body)).toBe(true)
  })

  it('크기, 들여쓰기, 정렬 중 하나라도 다르면 특수 문단', () => {
    expect(matchesBodyStyle(sample(14, 16, 'justify', 1), body)).toBe(false)
    expect(matchesBodyStyle(sample(16, 0, 'justify', 1), body)).toBe(false)
    expect(matchesBodyStyle(sample(16, 16, 'center', 1), body)).toBe(false)
  })
})
