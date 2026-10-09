/**
 * 책의 "부분": PDF에 넣고 뺄 수 있는 단위. 목차 항목 하나가 한 부분이고,
 * 목차가 가리키는 곳부터 다음 부분이 시작하기 직전까지가 그 부분의 내용이다.
 * 목차에 없는 앞쪽 문서(표지, 판권 등)와 보조 문서(각주 모음 등)도 따로 한 부분으로 둔다.
 */

import type { SpineEntry, TocEntry } from './book'

export interface BookPart {
  /** 목차 항목은 목차 안의 위치(`0`, `0.2`, `1.0.3`…), 목차에 없는 문서는 `s<읽기 순서>`. */
  key: string
  title: string
  /** 압축 파일 안의 경로와 조각 식별자. */
  href: string
  /** 읽기 순서(spine) 위치. 목차가 가리키는 문서를 찾지 못했으면 -1. */
  spineIndex: number
  depth: number
  /** 목차에 없는 문서. */
  extra: boolean
  children: BookPart[]
}

/** 목차 제목이 없는 문서의 이름. */
export function spineLabel(spine: SpineEntry[], index: number, coverPath?: string): string {
  const s = spine[index]
  if (s?.title) return s.title
  return index === 0 && coverPath ? '표지' : `문서 ${index + 1}`
}

export function buildParts(toc: TocEntry[], spine: SpineEntry[], coverPath?: string): BookPart[] {
  const extra = (s: SpineEntry): BookPart => ({
    key: `s${s.index}`,
    title: spineLabel(spine, s.index, coverPath),
    href: s.path,
    spineIndex: s.index,
    depth: 0,
    extra: true,
    children: []
  })
  // 목차가 없으면 문서 하나가 한 부분이다.
  if (toc.length === 0) return spine.map(extra)

  const walk = (entries: TocEntry[], prefix: string, depth: number): BookPart[] =>
    entries.map((e, i) => {
      const key = prefix ? `${prefix}.${i}` : String(i)
      return {
        key,
        title: e.title.trim() || '(제목 없음)',
        href: e.href,
        spineIndex: e.spineIndex,
        depth,
        extra: false,
        children: walk(e.children, key, depth + 1)
      }
    })
  const top = walk(toc, '', 0)

  const targeted = new Set(flattenParts(top).map((p) => p.spineIndex))
  const first = Math.min(...flattenParts(top).map((p) => (p.spineIndex >= 0 ? p.spineIndex : Infinity)))
  const extras = spine.filter((s) => !targeted.has(s.index) && (s.index < first || !s.linear)).map(extra)

  // 목차 맨 위 단계 사이에 읽기 순서대로 끼워 넣는다.
  const out: BookPart[] = []
  let e = 0
  for (const part of top) {
    if (part.spineIndex >= 0) while (e < extras.length && extras[e]!.spineIndex < part.spineIndex) out.push(extras[e++]!)
    out.push(part)
  }
  out.push(...extras.slice(e))
  return out
}

export function flattenParts(parts: BookPart[]): BookPart[] {
  return parts.flatMap((p) => [p, ...flattenParts(p.children)])
}

/** 부분과 그 아래 부분들의 키. */
export function partKeys(part: BookPart): string[] {
  return flattenParts([part]).map((p) => p.key)
}
