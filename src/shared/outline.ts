/** 목차 → PDF 책갈피, 장 제목 머리글에 쓸 장별 제목. */

import type { SpineEntry, TocEntry } from './book'

export interface OutlineNode {
  title: string
  /** 책갈피 표시 번호 (TocTarget.n). */
  n: number
  /** 압축 파일 안의 경로와 조각 식별자. */
  href: string
  children: OutlineNode[]
}

/**
 * 목차를 책갈피 나무로 바꾸고, 각 항목에 표시 번호를 매긴다.
 * 목차가 없으면 제목이 있는 문서를 차례로 쓴다.
 */
export function outlineFromToc(toc: TocEntry[], spine: SpineEntry[]): OutlineNode[] {
  let n = 0
  const walk = (entries: TocEntry[]): OutlineNode[] =>
    entries
      .filter((e) => e.title.trim() !== '')
      .map((e) => ({ title: e.title.trim(), n: n++, href: e.href, children: walk(e.children) }))
  if (toc.length > 0) return walk(toc)
  return spine.filter((s) => s.title).map((s) => ({ title: s.title!, n: n++, href: s.path, children: [] }))
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
