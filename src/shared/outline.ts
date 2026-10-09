/** 목차 → PDF 책갈피, 장 제목 머리글에 쓸 장별 제목. */

import type { SpineEntry, TocEntry } from './book'

export interface OutlineNode {
  title: string
  /** 부분 키 (shared/parts.ts). 쪽 위치 표시도 이 키로 찾는다. */
  key: string
  /** 압축 파일 안의 경로와 조각 식별자. */
  href: string
  children: OutlineNode[]
}

/**
 * 목차를 책갈피 나무로 바꾼다. 키는 buildParts와 같은 목차 위치다.
 * 목차가 없으면 제목이 있는 문서를 차례로 쓴다.
 */
export function outlineFromToc(toc: TocEntry[], spine: SpineEntry[]): OutlineNode[] {
  const walk = (entries: TocEntry[], prefix: string): OutlineNode[] =>
    entries.flatMap((e, i) => {
      const key = prefix ? `${prefix}.${i}` : String(i)
      return e.title.trim() === '' ? [] : [{ title: e.title.trim(), key, href: e.href, children: walk(e.children, key) }]
    })
  if (toc.length > 0) return walk(toc, '')
  return spine.filter((s) => s.title).map((s) => ({ title: s.title!, key: `s${s.index}`, href: s.path, children: [] }))
}

/** 뺀 부분의 책갈피를 지운다. 남긴 하위 항목은 한 단계 위로 올린다. */
export function pruneOutline(nodes: OutlineNode[], excluded: ReadonlySet<string>): OutlineNode[] {
  return nodes.flatMap((node) => {
    const children = pruneOutline(node.children, excluded)
    return excluded.has(node.key) ? children : [{ ...node, children }]
  })
}

export function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  return nodes.flatMap((node) => [node, ...flattenOutline(node.children)])
}

/**
 * 장마다 머리글에 쓸 제목. 목차 제목이 없는 문서(한 장을 여러 파일로 나눈 경우 등)는
 * 앞 문서의 제목을 이어 쓴다. 첫 제목 앞의 문서(표지, 판권 등)에는 머리글을 넣지 않는다.
 */
export function chapterTitles(spine: SpineEntry[]): Record<number, string> {
  const out: Record<number, string> = {}
  let current: string | undefined
  for (const s of spine) {
    if (s.title) current = s.title
    if (current) out[s.index] = current
  }
  return out
}
