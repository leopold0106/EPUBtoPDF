/**
 * 쪽 번호 규칙 → 쪽마다 찍을 글자.
 *
 * 쪽 번호는 인쇄가 끝난 뒤 번호만 찍힌 PDF를 따로 만들어 본문 위에 겹친다(render/pdf.ts).
 * 그래서 쪽마다 번호를 비우거나 로마 숫자로 바꾸는 등 마음대로 정할 수 있다.
 */

import type { PageNumberStyle } from './settings'

/** 책마다 정하는 쪽 번호 규칙 (편집 내용과 함께 저장). */
export interface PageNumbering {
  /** 번호 1(또는 시작 번호)을 붙일 부분의 키. 없으면 첫 쪽부터. */
  startAt?: string
  /** 시작 번호. */
  startNumber: number
  /** 시작 부분 앞의 쪽: 번호 없음 또는 로마 숫자(i, ii, …). */
  front: 'none' | 'roman'
  /** 번호를 지울 쪽 번호 (본문 번호 기준). */
  hiddenNumbers: number[]
}

export const DEFAULT_PAGE_NUMBERING: PageNumbering = { startNumber: 1, front: 'none', hiddenNumbers: [] }

export const PAGE_NUMBER_LIMITS = { startNumber: { min: 0, max: 99999 } }

export function normalizePageNumbering(input: unknown): PageNumbering {
  const obj = input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const start = obj['startNumber']
  const hidden = obj['hiddenNumbers']
  const { min, max } = PAGE_NUMBER_LIMITS.startNumber
  return {
    ...(typeof obj['startAt'] === 'string' && /^(s\d+|\d+(\.\d+)*)$/.test(obj['startAt']) && { startAt: obj['startAt'] }),
    startNumber: typeof start === 'number' && Number.isInteger(start) && start >= min && start <= max ? start : 1,
    front: obj['front'] === 'roman' ? 'roman' : 'none',
    hiddenNumbers: Array.isArray(hidden)
      ? [...new Set(hidden.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 999999))].sort((a, b) => a - b)
      : []
  }
}

export function isDefaultPageNumbering(p: PageNumbering): boolean {
  return p.startAt === undefined && p.startNumber === 1 && p.front === 'none' && p.hiddenNumbers.length === 0
}

/** `3, 7-9` 같은 글을 번호 목록으로. 잘못된 조각은 errors에 담는다. */
export function parseNumberList(text: string): { numbers: number[]; errors: string[] } {
  const numbers = new Set<number>()
  const errors: string[] = []
  for (const raw of text.split(/[,，\s]+/)) {
    const part = raw.trim()
    if (!part) continue
    const range = /^(\d+)\s*[-~–]\s*(\d+)$/.exec(part)
    if (range) {
      const a = Number(range[1])
      const b = Number(range[2])
      if (a > b || b - a > 10000) errors.push(part)
      else for (let n = a; n <= b; n++) numbers.add(n)
    } else if (/^\d+$/.test(part)) numbers.add(Number(part))
    else errors.push(part)
  }
  return { numbers: [...numbers].sort((a, b) => a - b), errors }
}

/** 번호 목록을 `3, 7-9`처럼 줄여 쓴다. */
export function formatNumberList(numbers: number[]): string {
  const out: string[] = []
  let i = 0
  while (i < numbers.length) {
    let j = i
    while (j + 1 < numbers.length && numbers[j + 1] === numbers[j]! + 1) j++
    out.push(j > i + 1 ? `${numbers[i]}-${numbers[j]}` : j === i + 1 ? `${numbers[i]}, ${numbers[j]}` : `${numbers[i]}`)
    i = j + 1
  }
  return out.join(', ')
}

export function toRoman(n: number): string {
  if (n <= 0 || n >= 4000) return String(n)
  const table: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
  ]
  let out = ''
  for (const [value, letters] of table) {
    while (n >= value) {
      out += letters
      n -= value
    }
  }
  return out
}

export interface LabelOptions {
  numbering: PageNumbering
  style: PageNumberStyle
  /** 본문 번호가 시작하는 쪽 (책 전체에서 몇 번째 쪽인지, 1부터). */
  startPage: number
  /** 책 전체 쪽수 (`12 / 120` 모양에 쓴다). */
  bookPageCount: number
  /** 번호를 찍지 않을 쪽 (책 전체에서 몇 번째 쪽인지). */
  hiddenPages?: ReadonlySet<number>
}

/** 책 전체에서 `page`번째 쪽에 찍을 글자. 찍지 않으면 null. */
export function pageLabel(page: number, o: LabelOptions): string | null {
  if (o.hiddenPages?.has(page)) return null
  if (page < o.startPage) return o.numbering.front === 'roman' ? toRoman(page) : null
  const n = o.numbering.startNumber + (page - o.startPage)
  if (o.numbering.hiddenNumbers.includes(n)) return null
  if (o.style === 'dashed') return `- ${n} -`
  if (o.style === 'total') return `${n} / ${o.numbering.startNumber + (o.bookPageCount - o.startPage)}`
  return String(n)
}
