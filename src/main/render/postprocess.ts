/**
 * 인쇄된 PDF 후처리
 *  - 문서 정보(제목, 저자, 언어 등)
 *  - 책갈피: 렌더링 창이 목차 항목 자리에 둔 표시 링크(tocMarkerUrl)가 놓인 쪽과 높이를 읽어
 *    책갈피를 만들고, 표시 링크는 지운다.
 */

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNull, PDFNumber, PDFRef, PDFString } from 'pdf-lib'
import type { BookMetadata } from '@shared/book'
import type { OutlineNode } from '@shared/outline'
import { tocMarkerIndex } from '@shared/render'

interface MarkerPosition {
  page: PDFRef
  /** 표시의 위쪽 끝 (PDF 좌표, 아래가 0). */
  top: number
}

function uriOf(doc: PDFDocument, annot: PDFDict): string | undefined {
  const action = doc.context.lookup(annot.get(PDFName.of('A')))
  if (!(action instanceof PDFDict)) return undefined
  const uri = doc.context.lookup(action.get(PDFName.of('URI')))
  return uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : undefined
}

/** 표시 링크를 모두 찾아 지우고, 표시 번호 → 위치를 돌려준다. */
export function collectTocMarkers(doc: PDFDocument): Map<number, MarkerPosition> {
  const found = new Map<number, MarkerPosition>()
  for (const page of doc.getPages()) {
    const annots = page.node.Annots()
    if (!annots) continue
    const keep: unknown[] = []
    for (let i = 0; i < annots.size(); i++) {
      const raw = annots.get(i)
      const annot = doc.context.lookup(raw)
      const n = annot instanceof PDFDict ? tocMarkerIndex(uriOf(doc, annot)) : undefined
      if (n === undefined || !(annot instanceof PDFDict)) {
        keep.push(raw)
        continue
      }
      const rect = doc.context.lookup(annot.get(PDFName.of('Rect')))
      const top = rect instanceof PDFArray ? (rect.asArray().map((v) => (v instanceof PDFNumber ? v.asNumber() : 0))[3] ?? 0) : 0
      // 같은 표시가 여러 쪽에 걸치면 처음 쪽을 쓴다.
      if (!found.has(n)) found.set(n, { page: page.ref, top: top + 1 })
    }
    if (keep.length === annots.size()) continue
    if (keep.length === 0) page.node.delete(PDFName.of('Annots'))
    else page.node.set(PDFName.of('Annots'), doc.context.obj(keep as never))
  }
  return found
}

/** 책갈피를 만든다. 표시를 찾지 못한 항목은 첫 하위 항목의 위치를 쓰고, 그것도 없으면 뺀다. 만든 개수를 돌려준다. */
export function addOutline(doc: PDFDocument, nodes: OutlineNode[], markers: Map<number, MarkerPosition>): number {
  interface Resolved {
    title: string
    pos: MarkerPosition
    children: Resolved[]
  }
  const resolve = (list: OutlineNode[]): Resolved[] =>
    list.flatMap((node) => {
      const children = resolve(node.children)
      const pos = markers.get(node.n) ?? children[0]?.pos
      return pos ? [{ title: node.title, pos, children }] : children
    })
  const items = resolve(nodes)
  if (items.length === 0) return 0

  const ctx = doc.context
  const rootRef = ctx.nextRef()
  let total = 0

  // 하위 항목은 접어 두고 맨 위 단계만 펼친다.
  const build = (list: Resolved[], parent: PDFRef): { first: PDFRef; last: PDFRef } => {
    const refs = list.map(() => ctx.nextRef())
    list.forEach((item, i) => {
      total++
      const dict = ctx.obj({
        Title: PDFHexString.fromText(item.title),
        Parent: parent,
        Dest: ctx.obj([item.pos.page, PDFName.of('XYZ'), PDFNull, PDFNumber.of(Math.round(item.pos.top)), PDFNull])
      })
      if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]!)
      if (i < list.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]!)
      if (item.children.length > 0) {
        const { first, last } = build(item.children, refs[i]!)
        dict.set(PDFName.of('First'), first)
        dict.set(PDFName.of('Last'), last)
        dict.set(PDFName.of('Count'), PDFNumber.of(-item.children.length))
      }
      ctx.assign(refs[i]!, dict)
    })
    return { first: refs[0]!, last: refs[refs.length - 1]! }
  }

  const { first, last } = build(items, rootRef)
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: first, Last: last, Count: PDFNumber.of(items.length) }))
  doc.catalog.set(PDFName.of('Outlines'), rootRef)
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))
  return total
}

export async function finalizePdf(
  raw: Uint8Array,
  metadata: BookMetadata,
  outline?: OutlineNode[]
): Promise<{ pdf: Uint8Array; pageCount: number; bookmarkCount: number }> {
  const doc = await PDFDocument.load(raw, { updateMetadata: false })
  doc.setTitle(metadata.title, { showInWindowTitleBar: true })
  if (metadata.creators.length > 0) doc.setAuthor(metadata.creators.join(', '))
  if (metadata.publisher) doc.setSubject(metadata.publisher)
  if (metadata.language) doc.setLanguage(metadata.language)
  doc.setCreator('EPUBtoPDF')
  doc.setProducer('EPUBtoPDF (Chromium)')
  const now = new Date()
  doc.setCreationDate(now)
  doc.setModificationDate(now)

  // 표시 링크는 책갈피를 넣지 않더라도 지운다.
  const markers = collectTocMarkers(doc)
  const bookmarkCount = outline ? addOutline(doc, outline, markers) : 0
  return { pdf: await doc.save(), pageCount: doc.getPageCount(), bookmarkCount }
}
