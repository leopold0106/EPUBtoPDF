/**
 * PDF 미리보기. pdf.js로 보이는 쪽만 그리고, 그림 위에 고를 수 있는 상자를 겹친다.
 * 그림 위치는 미리보기 PDF에 넣어 둔 그림 링크(`previewImageUrl`)에서 읽는다.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { imageKeyFromUrl } from '@shared/render'

GlobalWorkerOptions.workerSrc = workerUrl

const MM = 72 / 25.4
const GAP = 16

interface PageSize {
  width: number
  height: number
}

interface ImageBox {
  key: string
  left: number
  top: number
  width: number
  height: number
}

interface Props {
  pdf: Uint8Array | null
  spread: boolean
  zoom: number
  /** 판면 위아래 여백(mm). 실측 줄 수를 셀 때 머리글·쪽 번호를 빼는 데 쓴다. */
  marginsMm: { top: number; bottom: number }
  selectedImage: string | null
  onSelectImage(key: string | null): void
  onHideImage(key: string): void
  /** 그려진 쪽들의 글줄 수가 바뀔 때. */
  onMeasure(lineCounts: Map<number, number>): void
}

export function PreviewPane(props: Props): React.JSX.Element {
  const { pdf, spread, zoom, marginsMm, selectedImage, onSelectImage, onHideImage, onMeasure } = props
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [version, setVersion] = useState(0)
  const [sizes, setSizes] = useState<PageSize[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [width, setWidth] = useState(800)
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const lineCounts = useRef(new Map<number, number>())

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!pdf) {
      setDoc(null)
      setSizes([])
      return
    }
    let cancelled = false
    // pdf.js가 버퍼를 워커로 넘기면서 비우므로 복사본을 준다.
    const task = getDocument({ data: pdf.slice() })
    task.promise.then(
      async (d) => {
        const list: PageSize[] = []
        for (let i = 1; i <= d.numPages; i++) {
          const [x0, y0, x1, y1] = (await d.getPage(i)).view as [number, number, number, number]
          list.push({ width: x1 - x0, height: y1 - y0 })
        }
        if (cancelled) return
        lineCounts.current = new Map()
        onMeasure(lineCounts.current)
        setDoc(d)
        setVersion((v) => v + 1)
        setSizes(list)
        setLoadError(null)
      },
      (err: unknown) => !cancelled && setLoadError(String(err))
    )
    return () => {
      cancelled = true
      void task.destroy()
    }
    // onMeasure는 부모가 다시 만들어도 PDF를 다시 읽을 필요가 없다.
  }, [pdf])

  // 펼침면: 첫 쪽은 오른쪽에 혼자, 그다음부터 두 쪽씩 (책을 펼친 모양).
  const rows = useMemo(() => {
    const indexes = sizes.map((_, i) => i)
    if (!spread) return indexes.map((i) => [i])
    const out: number[][] = [[0]]
    for (let i = 1; i < indexes.length; i += 2) out.push(indexes.slice(i, i + 2))
    return out.filter((r) => r.length > 0)
  }, [sizes, spread])

  const maxPageWidth = Math.max(1, ...sizes.map((s) => s.width))
  const columns = spread ? 2 : 1
  const fit = (width - 48 - GAP * (columns - 1)) / (maxPageWidth * columns)
  const scale = Math.max(0.1, fit * zoom)

  const measured = (index: number, lines: number): void => {
    lineCounts.current.set(index, lines)
    onMeasure(new Map(lineCounts.current))
  }

  return (
    <div
      className="pages"
      ref={scroller}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelectImage(null)
        setMenu(null)
      }}
    >
      {loadError && <p className="message message--error">미리보기를 열 수 없습니다: {loadError}</p>}
      {doc &&
        rows.map((row, r) => (
          <div key={r} className={`page-row${spread && row[0] === 0 ? ' page-row--first' : ''}`} style={{ gap: GAP }}>
            {spread && row[0] === 0 && <div style={{ width: sizes[0]!.width * scale }} />}
            {row.map((i) => (
              <PageView
                key={`${version}-${i}`}
                doc={doc}
                index={i}
                size={sizes[i]!}
                scale={scale}
                marginsMm={marginsMm}
                selectedImage={selectedImage}
                onSelectImage={(key) => {
                  onSelectImage(key)
                  setMenu(null)
                }}
                onImageMenu={(key, x, y) => {
                  onSelectImage(key)
                  setMenu({ key, x, y })
                }}
                onMeasured={measured}
              />
            ))}
          </div>
        ))}
      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              onHideImage(menu.key)
              setMenu(null)
            }}
          >
            이 그림 빼기 <kbd>Delete</kbd>
          </button>
          <button type="button" onClick={() => setMenu(null)}>
            취소
          </button>
        </div>
      )}
    </div>
  )
}

interface PageViewProps {
  doc: PDFDocumentProxy
  index: number
  size: PageSize
  scale: number
  marginsMm: { top: number; bottom: number }
  selectedImage: string | null
  onSelectImage(key: string): void
  onImageMenu(key: string, x: number, y: number): void
  onMeasured(index: number, lines: number): void
}

function PageView({ doc, index, size, scale, marginsMm, selectedImage, onSelectImage, onImageMenu, onMeasured }: PageViewProps): React.JSX.Element {
  const holder = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [boxes, setBoxes] = useState<ImageBox[]>([])

  useEffect(() => {
    const el = holder.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setVisible(entry!.isIntersecting), { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // 처음 보일 때 쪽을 읽는다.
  useEffect(() => {
    if (!visible || page) return
    let cancelled = false
    void doc.getPage(index + 1).then((p) => !cancelled && setPage(p))
    return () => {
      cancelled = true
    }
  }, [visible, page, doc, index])

  // 쪽을 읽으면 그림 위치와 글줄 수를 구한다.
  useEffect(() => {
    if (!page) return
    let cancelled = false
    void (async () => {
      const annotations = await page.getAnnotations()
      const found: ImageBox[] = []
      for (const a of annotations as { subtype: string; url?: string; rect: number[] }[]) {
        const key = a.subtype === 'Link' ? imageKeyFromUrl(a.url) : undefined
        if (!key) continue
        const [x1, y1, x2, y2] = a.rect as [number, number, number, number]
        found.push({ key, left: x1, top: size.height - y2, width: x2 - x1, height: y2 - y1 })
      }
      if (!cancelled) setBoxes(found)
      const text = await page.getTextContent()
      const top = size.height - marginsMm.top * MM
      const bottom = marginsMm.bottom * MM
      const ys = text.items
        .filter((i): i is typeof i & { str: string; transform: number[] } => 'str' in i && i.str.trim() !== '')
        .map((i) => i.transform[5]!)
        .filter((y) => y > bottom && y < top)
        .sort((a, b) => b - a)
      let lines = 0
      let last = Infinity
      for (const y of ys) {
        if (last - y > 2) lines++
        last = y
      }
      if (!cancelled) onMeasured(index, lines)
    })()
    return () => {
      cancelled = true
    }
    // onMeasured는 부모가 다시 만들어도 다시 셀 필요가 없다.
  }, [page, index, size.height, marginsMm.top, marginsMm.bottom])

  // 보이는 동안 현재 배율로 그린다.
  useEffect(() => {
    const c = canvas.current
    if (!visible || !page || !c) return
    const ratio = window.devicePixelRatio || 1
    const viewport = page.getViewport({ scale: scale * ratio })
    c.width = Math.floor(viewport.width)
    c.height = Math.floor(viewport.height)
    const task = page.render({ canvas: c, viewport })
    task.promise.catch(() => undefined)
    return () => task.cancel()
  }, [visible, page, scale])

  return (
    <div ref={holder} className="page" style={{ width: size.width * scale, height: size.height * scale }} data-page={index + 1}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%' }} />
      {boxes.map((b) => (
        <button
          key={b.key}
          type="button"
          className={`image-box${selectedImage === b.key ? ' image-box--selected' : ''}`}
          style={{ left: b.left * scale, top: b.top * scale, width: b.width * scale, height: b.height * scale }}
          title="눌러서 고르고 Delete로 빼기 (오른쪽 단추: 메뉴)"
          onClick={(e) => {
            e.stopPropagation()
            onSelectImage(b.key)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const host = (e.currentTarget.closest('.pages') as HTMLElement).getBoundingClientRect()
            const scrollerEl = e.currentTarget.closest('.pages') as HTMLElement
            onImageMenu(b.key, e.clientX - host.left + scrollerEl.scrollLeft, e.clientY - host.top + scrollerEl.scrollTop)
          }}
        />
      ))}
    </div>
  )
}
