/**
 * 책마다의 편집 내용. 원본 EPUB은 바꾸지 않고 변환할 때만 반영한다.
 *
 * 그림은 `<장 위치>:<그 장 안에서 몇 번째 그림인지>`로 가리킨다. 같은 그림 파일이 여러 곳에
 * 쓰였더라도 하나씩 따로 뺄 수 있다. 본문을 고친 장은 그 장 문서 전체(HTML)를 저장하며,
 * 그림 요소에는 처음 번호를 속성(data-epubtopdf-image)으로 남겨 두어 편집 뒤에도 번호가 바뀌지 않는다.
 */

export interface BookEdits {
  hiddenImages: string[]
  /** 본문을 고친 장: 장 위치 → 고친 문서(HTML). */
  chapters?: Record<number, string>
}

export const EMPTY_EDITS: BookEdits = { hiddenImages: [] }

export const imageKey = (spineIndex: number, n: number): string => `${spineIndex}:${n}`

/** 한 장 문서의 크기 한도 (잘못된 입력으로 메모리를 다 쓰지 않게). */
const MAX_CHAPTER_CHARS = 20_000_000

export function normalizeEdits(input: unknown): BookEdits {
  const obj = input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const raw = obj['hiddenImages']
  const keys = Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string' && /^\d+:\d+$/.test(k)) : []
  const chapters: Record<number, string> = {}
  const rawChapters = obj['chapters']
  if (rawChapters !== null && typeof rawChapters === 'object' && !Array.isArray(rawChapters)) {
    for (const [k, v] of Object.entries(rawChapters as Record<string, unknown>)) {
      if (/^\d+$/.test(k) && typeof v === 'string' && v.length <= MAX_CHAPTER_CHARS) chapters[Number(k)] = v
    }
  }
  const out: BookEdits = { hiddenImages: [...new Set(keys)] }
  if (Object.keys(chapters).length > 0) out.chapters = chapters
  return out
}

export function hasEdits(edits: BookEdits): boolean {
  return edits.hiddenImages.length > 0 || Object.keys(edits.chapters ?? {}).length > 0
}
