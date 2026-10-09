import { describe, expect, it } from 'vitest'
import type { SpineEntry, TocEntry } from '@shared/book'
import { normalizeEdits } from '@shared/edits'
import { formatNumberList, normalizePageNumbering, pageLabel, parseNumberList, toRoman, DEFAULT_PAGE_NUMBERING } from '@shared/page-numbers'
import { buildParts, flattenParts, partKeys } from '@shared/parts'

const spine: SpineEntry[] = [
  { index: 0, path: 'cover.xhtml', linear: true },
  { index: 1, path: 'title.xhtml', linear: true },
  { index: 2, path: 'a.xhtml', title: '1장', linear: true },
  { index: 3, path: 'a2.xhtml', linear: true },
  { index: 4, path: 'notes.xhtml', linear: false },
  { index: 5, path: 'b.xhtml', title: '2장', linear: true }
]
const toc: TocEntry[] = [
  { title: '1장', href: 'a.xhtml', spineIndex: 2, children: [{ title: ' 1절 ', href: 'a.xhtml#s1', spineIndex: 2, children: [] }] },
  { title: '2장', href: 'b.xhtml', spineIndex: 5, children: [] },
  { title: '없는 장', href: 'gone.xhtml', spineIndex: -1, children: [] }
]

describe('buildParts', () => {
  it('목차 항목에 목차 위치를 키로 붙이고, 목차에 없는 앞 문서와 보조 문서를 읽기 순서대로 끼운다', () => {
    const parts = buildParts(toc, spine, 'cover.png')
    expect(parts.map((p) => [p.key, p.title, p.extra])).toEqual([
      ['s0', '표지', true],
      ['s1', '문서 2', true],
      ['0', '1장', false],
      ['s4', '문서 5', true],
      ['1', '2장', false],
      ['2', '없는 장', false]
    ])
    expect(parts[2]!.children.map((p) => [p.key, p.title, p.depth])).toEqual([['0.0', '1절', 1]])
    // 이어지는 문서(a2)는 앞 장에 속하므로 따로 두지 않는다.
    expect(flattenParts(parts).some((p) => p.href === 'a2.xhtml')).toBe(false)
    expect(partKeys(parts[2]!)).toEqual(['0', '0.0'])
  })

  it('목차가 없으면 문서 하나가 한 부분이다', () => {
    expect(buildParts([], spine).map((p) => p.key)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5'])
  })
})

describe('쪽 번호 규칙', () => {
  const base = { numbering: DEFAULT_PAGE_NUMBERING, style: 'plain' as const, startPage: 1, bookPageCount: 10 }

  it('기본: 첫 쪽부터 1, 2, 3', () => {
    expect([1, 2, 3].map((p) => pageLabel(p, base))).toEqual(['1', '2', '3'])
  })

  it('시작 쪽 앞은 비우거나 로마 숫자, 시작 번호와 지울 번호', () => {
    const numbering = { startNumber: 5, front: 'roman' as const, hiddenNumbers: [6], startAt: '0' }
    const o = { ...base, numbering, startPage: 3 }
    expect([1, 2, 3, 4, 5].map((p) => pageLabel(p, o))).toEqual(['i', 'ii', '5', null, '7'])
    expect(pageLabel(1, { ...o, numbering: { ...numbering, front: 'none' } })).toBeNull()
    expect(pageLabel(3, { ...o, hiddenPages: new Set([3]) })).toBeNull()
  })

  it('모양: - 1 -, 1 / 전체', () => {
    expect(pageLabel(2, { ...base, style: 'dashed' })).toBe('- 2 -')
    expect(pageLabel(4, { ...base, style: 'total', startPage: 3 })).toBe('2 / 8')
  })

  it('로마 숫자', () => {
    expect([1, 4, 9, 14, 40, 90, 400, 1994].map(toRoman)).toEqual(['i', 'iv', 'ix', 'xiv', 'xl', 'xc', 'cd', 'mcmxciv'])
  })

  it('번호 목록 읽기와 쓰기', () => {
    expect(parseNumberList('3, 7-9 12')).toEqual({ numbers: [3, 7, 8, 9, 12], errors: [] })
    expect(parseNumberList('3, 가, 9-7')).toEqual({ numbers: [3], errors: ['가', '9-7'] })
    expect(formatNumberList([3, 7, 8, 9, 12, 13])).toBe('3, 7-9, 12, 13')
  })

  it('저장된 규칙을 검사한다', () => {
    expect(normalizePageNumbering({ startAt: '1.2', startNumber: 3, front: 'roman', hiddenNumbers: [5, 2, 5, -1, 'x'] })).toEqual({
      startAt: '1.2',
      startNumber: 3,
      front: 'roman',
      hiddenNumbers: [2, 5]
    })
    expect(normalizePageNumbering({ startAt: '../x', startNumber: 1.5, front: 'x' })).toEqual(DEFAULT_PAGE_NUMBERING)
  })
})

describe('normalizeEdits: 뺄 부분과 쪽 번호', () => {
  it('부분 키만 남기고, 기본 쪽 번호 규칙은 저장하지 않는다', () => {
    expect(normalizeEdits({ hiddenImages: [], excludedParts: ['0.1', 's2', 'x', '0.1'], pageNumbering: { startNumber: 1 } })).toEqual({
      hiddenImages: [],
      excludedParts: ['0.1', 's2']
    })
    expect(normalizeEdits({ hiddenImages: [], pageNumbering: { startNumber: 3 } }).pageNumbering).toEqual({
      startNumber: 3,
      front: 'none',
      hiddenNumbers: []
    })
  })
})
