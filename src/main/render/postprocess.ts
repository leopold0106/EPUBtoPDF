/**
 * 인쇄된 PDF 후처리
 *  - 문서 정보(제목, 저자, 언어 등)
 *  - 책갈피: 렌더링 창이 목차 항목 자리에 둔 표시 링크(tocMarkerUrl)가 놓인 쪽과 높이를 읽어
 *    책갈피를 만들고, 표시 링크는 지운다.
 */

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNull, PDFNumber, PDFRef, PDFString } from 'pdf-lib'
import type { BookMetadata } from '@shared/book'
import type { OutlineNode } from '@shared/outline'
import { tocMarkerKey } from '@shared/render'

export interface MarkerPosition {
  page: PDFRef
  /** 몇 번째 쪽인지 (0부터). */
  pageIndex: number
  /** 표시의 위쪽 끝 (PDF 좌표, 아래가 0). */
  top: number
}

function uriOf(doc: PDFDocument, annot: PDFDict): string | undefined {
  const action = doc.context.lookup(annot.get(PDFName.of('A')))
  if (!(action instanceof PDFDict)) return undefined
  const uri = doc.context.lookup(action.get(PDFName.of('URI')))
  return uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : undefined
}

/** 표시 링크를 모두 찾아 지우고, 표시 키 → 위치를 돌려준다. */
export function collectTocMarkers(doc: PDFDocument): Map<string, MarkerPosition> {
  const found = new Map<string, MarkerPosition>()
  doc.getPages().forEach((page, pageIndex) => {
    const annots = page.node.Annots()
    if (!annots) return
    const keep: unknown[] = []
    for (let i = 0; i < annots.size(); i++) {
      const raw = annots.get(i)
      const annot = doc.context.lookup(raw)
      const n = annot instanceof PDFDict ? tocMarkerKey(uriOf(doc, annot)) : undefined
      if (n === undefined || !(annot instanceof PDFDict)) {
        keep.push(raw)
        continue
      }
      const rect = doc.context.lookup(annot.get(PDFName.of('Rect')))
      const top = rect instanceof PDFArray ? (rect.asArray().map((v) => (v instanceof PDFNumber ? v.asNumber() : 0))[3] ?? 0) : 0
      // 같은 표시가 여러 쪽에 걸치면 처음 쪽을 쓴다.
      if (!found.has(n)) found.set(n, { page: page.ref, pageIndex, top: top + 1 })
    }
    if (keep.length === annots.size()) return
    if (keep.length === 0) page.node.delete(PDFName.of('Annots'))
    else page.node.set(PDFName.of('Annots'), doc.context.obj(keep as never))
  })
  return found
}

/** 책갈피를 만든다. 표시를 찾지 못한 항목은 첫 하위 항목의 위치를 쓰고, 그것도 없으면 뺀다. 만든 개수를 돌려준다. */
export function addOutline(doc: PDFDocument, nodes: OutlineNode[], markers: Map<string, MarkerPosition>): number {
  interface Resolved {
    title: string
    pos: MarkerPosition
    children: Resolved[]
  }
  const resolve = (list: OutlineNode[]): Resolved[] =>
    list.flatMap((node) => {
      const children = resolve(node.children)
      const pos = markers.get(node.key) ?? children[0]?.pos
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

/** 쪽 번호 PDF의 쪽들을 본문 쪽 위에 그대로 겹친다. */
export async function overlayPages(doc: PDFDocument, overlay: Uint8Array): Promise<void> {
  const pages = doc.getPages()
  const source = await PDFDocument.load(overlay)
  const count = Math.min(pages.length, source.getPageCount())
  if (count === 0) return
  const embedded = await doc.embedPdf(source, [...Array(count).keys()])
  embedded.forEach((page, i) => {
    const target = pages[i]!
    target.drawPage(page, { x: 0, y: 0, width: target.getWidth(), height: target.getHeight() })
  })
}

export interface FinalizeOptions {
  outline?: OutlineNode[]
  /** 표시 위치를 보고 쪽 번호 PDF를 만든다. 없거나 undefined를 돌려주면 번호를 찍지 않는다. */
  pageNumbers?: (markers: Map<string, MarkerPosition>, pageCount: number) => Promise<Uint8Array | undefined>
}

export interface FinalizedPdf {
  pdf: Uint8Array
  pageCount: number
  bookmarkCount: number
  /** 표시 키(부분 키, 장 표시) → 몇 번째 쪽인지 (1부터). */
  markerPages: Record<string, number>
}

export async function finalizePdf(raw: Uint8Array, metadata: BookMetadata, options: FinalizeOptions = {}): Promise<FinalizedPdf> {
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
  const pageCount = doc.getPageCount()
  const numbers = await options.pageNumbers?.(markers, pageCount)
  if (numbers) await overlayPages(doc, numbers)
  const bookmarkCount = options.outline ? addOutline(doc, options.outline, markers) : 0
  const markerPages: Record<string, number> = {}
  for (const [key, pos] of markers) markerPages[key] = pos.pageIndex + 1
  return { pdf: await doc.save(), pageCount, bookmarkCount, markerPages }
}
