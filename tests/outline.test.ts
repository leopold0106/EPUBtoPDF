import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import type { SpineEntry, TocEntry } from '@shared/book'
import { chapterTitles, flattenOutline, outlineFromToc } from '@shared/outline'
import { tocMarkerIndex, tocMarkerUrl } from '@shared/render'
import { addOutline, collectTocMarkers } from '../src/main/render/postprocess'

const toc: TocEntry[] = [
  { title: '1장', href: 'a.xhtml', spineIndex: 1, children: [{ title: '1절', href: 'a.xhtml#s1', spineIndex: 1, children: [] }] },
  { title: '  ', href: 'x.xhtml', spineIndex: 2, children: [] },
  { title: '2장', href: 'b.xhtml', spineIndex: 3, children: [] }
]
const spine: SpineEntry[] = [
  { index: 0, path: 'cover.xhtml', linear: true },
  { index: 1, path: 'a.xhtml', title: '1장', linear: true },
  { index: 2, path: 'a2.xhtml', linear: true },
  { index: 3, path: 'b.xhtml', title: '2장', linear: true }
]

describe('outlineFromToc', () => {
  it('목차를 책갈피 나무로 바꾸고 펼친 순서대로 번호를 매긴다 (빈 제목은 뺀다)', () => {
    const outline = outlineFromToc(toc, spine)
    expect(flattenOutline(outline).map((n) => [n.n, n.title, n.href])).toEqual([
      [0, '1장', 'a.xhtml'],
      [1, '1절', 'a.xhtml#s1'],
      [2, '2장', 'b.xhtml']
    ])
    expect(outline[0]!.children).toHaveLength(1)
  })

  it('목차가 없으면 제목이 있는 문서로 만든다', () => {
    expect(outlineFromToc([], spine).map((n) => n.title)).toEqual(['1장', '2장'])
  })
})

describe('chapterTitles', () => {
  it('제목 없는 문서는 앞 제목을 이어 쓰고, 첫 제목 앞(표지)은 비운다', () => {
    expect(chapterTitles(spine)).toEqual({ 1: '1장', 2: '1장', 3: '2장' })
  })
})

describe('책갈피 후처리', () => {
  async function pdfWithMarkers(): Promise<PDFDocument> {
    const doc = await PDFDocument.create()
    const pages = [doc.addPage([400, 600]), doc.addPage([400, 600])]
    const link = (uri: string, top: number) =>
      doc.context.register(
        doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, top - 1, 11, top], A: { S: 'URI', URI: PDFString.of(uri) } })
      )
    pages[0]!.node.set(PDFName.of('Annots'), doc.context.obj([link(tocMarkerUrl(0), 500), link('https://example.com/', 300)]))
    // 1번 표시는 두 쪽에 걸쳐 있다: 처음 쪽을 써야 한다.
    pages[1]!.node.set(PDFName.of('Annots'), doc.context.obj([link(tocMarkerUrl(1), 400)]))
    return doc
  }

  it('표시 링크의 위치를 읽고 링크는 지운다 (다른 링크는 남긴다)', async () => {
    const doc = await pdfWithMarkers()
    const markers = collectTocMarkers(doc)
    expect([...markers.keys()]).toEqual([0, 1])
    expect(markers.get(1)!.page).toBe(doc.getPages()[1]!.ref)
    expect(doc.getPages()[0]!.node.Annots()!.size()).toBe(1)
    expect(doc.getPages()[1]!.node.Annots()).toBeUndefined()
  })

  it('책갈피를 만들고, 표시가 없는 항목은 하위 항목 위치를 쓰거나 뺀다', async () => {
    const doc = await pdfWithMarkers()
    const markers = collectTocMarkers(doc)
    const count = addOutline(
      doc,
      [
        { title: '1장', n: 0, href: '', children: [] },
        { title: '빈 묶음', n: 9, href: '', children: [{ title: '2장', n: 1, href: '', children: [] }] },
        { title: '없는 장', n: 8, href: '', children: [] }
      ],
      markers
    )
    expect(count).toBe(3)
    const saved = await PDFDocument.load(await doc.save())
    const root = saved.context.lookup(saved.catalog.get(PDFName.of('Outlines'))) as PDFDict
    const first = saved.context.lookup(root.get(PDFName.of('First'))) as PDFDict
    expect((first.get(PDFName.of('Title')) as PDFHexString).decodeText()).toBe('1장')
    const second = saved.context.lookup(first.get(PDFName.of('Next'))) as PDFDict
    expect((second.get(PDFName.of('Title')) as PDFHexString).decodeText()).toBe('빈 묶음')
    const dest = second.get(PDFName.of('Dest')) as PDFArray
    expect(dest.get(0)).toEqual(saved.getPages()[1]!.ref)
    expect(saved.catalog.get(PDFName.of('PageMode'))).toEqual(PDFName.of('UseOutlines'))
  })

  it('표시 링크 주소', () => {
    expect(tocMarkerIndex(tocMarkerUrl(12))).toBe(12)
    expect(tocMarkerIndex('https://example.com/')).toBeUndefined()
  })
})
