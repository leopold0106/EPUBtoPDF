/**
 * 책마다의 편집 내용. 원본 EPUB은 바꾸지 않고 변환할 때만 반영한다.
 *
 * 그림은 `<장 위치>:<그 장 안에서 몇 번째 그림인지>`로 가리킨다. 같은 그림 파일이 여러 곳에
 * 쓰였더라도 하나씩 따로 뺄 수 있다.
 */

export interface BookEdits {
  hiddenImages: string[]
}

export const EMPTY_EDITS: BookEdits = { hiddenImages: [] }

export const imageKey = (spineIndex: number, n: number): string => `${spineIndex}:${n}`

export function normalizeEdits(input: unknown): BookEdits {
  const raw = input !== null && typeof input === 'object' ? (input as Record<string, unknown>).hiddenImages : undefined
  const keys = Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string' && /^\d+:\d+$/.test(k)) : []
  return { hiddenImages: [...new Set(keys)] }
}
