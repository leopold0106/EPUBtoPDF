import { useEffect, useState } from 'react'
import type { BookSummary, TocEntry } from '@shared/book'
import type { AppInfo, ConvertProgress, ConvertResult, Result } from '@shared/ipc'
import type { ImageInfo } from '@shared/render'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { ImagePanel } from './components/ImagePanel'

const STAGE_LABELS: Record<ConvertProgress['stage'], string> = {
  assembling: '문서 조립 중…',
  printing: 'PDF 만드는 중…',
  finishing: '마무리 중…'
}

export default function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [book, setBook] = useState<BookSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [converting, setConverting] = useState<ConvertProgress['stage'] | 'waiting' | null>(null)
  const [converted, setConverted] = useState<ConvertResult | null>(null)
  const [images, setImages] = useState<ImageInfo[] | null>(null)
  const [imagesError, setImagesError] = useState<string | null>(null)
  const [hiddenImages, setHiddenImages] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (!book) return
    let cancelled = false
    setImages(null)
    setImagesError(null)
    void window.api.listImages(book.id).then((result) => {
      if (cancelled) return
      if (result.ok) setImages(result.value)
      else setImagesError(result.error)
    })
    return () => {
      cancelled = true
    }
  }, [book])

  function toggleImage(key: string): void {
    setHiddenImages((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
    return window.api.onConvertProgress((p) => setConverting(p.stage))
  }, [])

  async function convert(): Promise<void> {
    if (!book) return
    setConverting('waiting')
    setError(null)
    try {
      // 설정 화면은 5단계에서 붙인다. 지금은 기본 설정으로 변환한다.
      const result = await window.api.convert(book.id, DEFAULT_SETTINGS, { hiddenImages: [...hiddenImages] })
      if (!result) return
      if (result.ok) setConverted(result.value)
      else setError(result.error)
    } finally {
      setConverting(null)
    }
  }

  async function handleOpened(result: Result<BookSummary> | null): Promise<void> {
    if (!result) return
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (book) await window.api.closeBook(book.id)
    setBook(result.value)
    setError(null)
    setConverted(null)
    setHiddenImages(new Set())
  }

  async function openDialog(): Promise<void> {
    setOpening(true)
    try {
      await handleOpened(await window.api.openBookDialog())
    } finally {
      setOpening(false)
    }
  }

  const meta = book?.metadata

  return (
    <div className="app">
      <header className="toolbar">
        <button type="button" onClick={() => void openDialog()} disabled={opening || converting !== null}>
          EPUB 열기
        </button>
        <span className="toolbar__file">
          {meta ? (
            <>
              <strong>{meta.title}</strong>
              {meta.creators.length > 0 && ` · ${meta.creators.join(', ')}`}
              {` · 문서 ${book.spine.length}개`}
            </>
          ) : (
            '열린 파일 없음'
          )}
        </span>
        {converting && converting !== 'waiting' && <span className="toolbar__progress">{STAGE_LABELS[converting]}</span>}
        <button type="button" className="primary" onClick={() => void convert()} disabled={!book || converting !== null}>
          PDF로 변환
        </button>
      </header>

      <main className="workspace">
        <aside className="settings">
          <h2>설정</h2>
          <p className="placeholder">용지, 여백, 글꼴, 본문 설정이 여기에 들어갑니다.</p>
          {book && (
            <>
              <h2>그림</h2>
              <ImagePanel
                book={book}
                images={images}
                error={imagesError}
                hidden={hiddenImages}
                onToggle={toggleImage}
                onSetAll={(hide) => setHiddenImages(hide && images ? new Set(images.map((i) => i.key)) : new Set())}
              />
            </>
          )}
        </aside>
        <section className="preview">
          {error && <p className="message message--error">{error}</p>}
          {converted && (
            <div className="message message--success">
              <p>
                변환을 마쳤습니다. {converted.pageCount}쪽 · {converted.seconds.toFixed(1)}초
                <br />
                <span className="path">{converted.path}</span>
              </p>
              {converted.warnings.length > 0 && (
                <ul>
                  {converted.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <div className="actions">
                <button type="button" onClick={() => void window.api.openOutput(converted.path)}>
                  PDF 열기
                </button>
                <button type="button" onClick={() => void window.api.showOutput(converted.path)}>
                  폴더에서 보기
                </button>
              </div>
            </div>
          )}
          {book ? (
            <div className="book-info">
              {book.warnings.length > 0 && (
                <ul className="message message--warning">
                  {book.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <h3>목차</h3>
              {book.toc.length > 0 ? (
                <TocList entries={book.toc} />
              ) : (
                <ol>
                  {book.spine.map((s) => (
                    <li key={s.path}>{s.title ?? s.path}</li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            !error && <p className="placeholder">EPUB 파일을 열면 변환 결과 미리보기가 표시됩니다.</p>
          )}
        </section>
      </main>

      <footer className="statusbar">
        {info ? `${info.name} ${info.version} · Electron ${info.electron}` : '불러오는 중…'}
      </footer>
    </div>
  )
}

function TocList({ entries }: { entries: TocEntry[] }): React.JSX.Element {
  return (
    <ol>
      {entries.map((e, i) => (
        <li key={`${e.href}-${i}`}>
          {e.title}
          {e.children.length > 0 && <TocList entries={e.children} />}
        </li>
      ))}
    </ol>
  )
}
