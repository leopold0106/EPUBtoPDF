import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BookSummary, TocEntry } from '@shared/book'
import type { AppInfo, ConvertProgress, ConvertResult, Result } from '@shared/ipc'
import type { ImageInfo } from '@shared/render'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { computeTypography, validateSettings } from '@shared/typography'
import { ImagePanel } from './components/ImagePanel'
import { SettingsPanel } from './components/SettingsPanel'
import { useSettings } from './hooks/useSettings'

const STAGE_LABELS: Record<ConvertProgress['stage'], string> = {
  assembling: '문서 조립 중…',
  printing: 'PDF 만드는 중…',
  finishing: '마무리 중…'
}

/** 한글 이름을 같이 보여주는 Windows 기본 글꼴. 8단계에서 시스템 글꼴 목록으로 바뀐다. */
const COMMON_FONTS = ['Malgun Gothic', 'Batang', 'Dotum', 'Gulim', 'Gungsuh', 'NanumGothic', 'NanumMyeongjo']

type SidebarTab = 'settings' | 'images'

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
  const [tab, setTab] = useState<SidebarTab>('settings')
  const [dragging, setDragging] = useState(false)
  const { settings, update, replace } = useSettings()

  const typography = useMemo(() => computeTypography(settings), [settings])
  const issues = useMemo(() => validateSettings(settings, typography), [settings, typography])
  const hasErrors = issues.some((i) => i.level === 'error')

  const handleOpened = useCallback(
    async (result: Result<BookSummary> | null): Promise<void> => {
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
    },
    [book]
  )

  const openPath = useCallback(
    async (path: string): Promise<void> => {
      setOpening(true)
      try {
        await handleOpened(await window.api.openBookPath(path))
      } finally {
        setOpening(false)
      }
    },
    [handleOpened]
  )

  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
    return window.api.onConvertProgress((p) => setConverting(p.stage))
  }, [])

  // 실행할 때 넘어온 파일과, 앱이 켜진 뒤 더블클릭한 파일을 연다.
  useEffect(() => {
    void window.api.takeLaunchFile().then((path) => path && void openPath(path))
    // 실행 파일은 한 번만 넘어오므로 처음 한 번만 가져온다.
  }, [])
  useEffect(() => window.api.onOpenRequest((path) => void openPath(path)), [openPath])

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

  async function openDialog(): Promise<void> {
    setOpening(true)
    try {
      await handleOpened(await window.api.openBookDialog())
    } finally {
      setOpening(false)
    }
  }

  async function convert(): Promise<void> {
    if (!book) return
    setConverting('waiting')
    setError(null)
    try {
      const result = await window.api.convert(book.id, settings, { hiddenImages: [...hiddenImages] })
      if (!result) return
      if (result.ok) setConverted(result.value)
      else setError(result.error)
    } finally {
      setConverting(null)
    }
  }

  function toggleImage(key: string): void {
    setHiddenImages((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function onDrop(event: React.DragEvent): void {
    event.preventDefault()
    setDragging(false)
    const file = [...event.dataTransfer.files].find((f) => /\.epub$/i.test(f.name))
    if (!file) {
      setError('EPUB 파일(.epub)만 열 수 있습니다.')
      return
    }
    void openPath(window.api.pathForFile(file))
  }

  const meta = book?.metadata
  const busy = opening || converting !== null

  return (
    <div
      className={`app${dragging ? ' app--dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <header className="toolbar">
        <button type="button" onClick={() => void openDialog()} disabled={busy}>
          EPUB 열기
        </button>
        <span className="toolbar__file">
          {meta ? (
            <>
              <strong>{meta.title}</strong>
              {meta.creators.length > 0 && ` · ${meta.creators.join(', ')}`}
            </>
          ) : (
            'EPUB 파일을 열거나 이 창에 끌어다 놓으세요'
          )}
        </span>
        {converting && converting !== 'waiting' && <span className="toolbar__progress">{STAGE_LABELS[converting]}</span>}
        <button
          type="button"
          className="primary"
          onClick={() => void convert()}
          disabled={!book || busy || hasErrors}
          title={hasErrors ? '설정 오류를 먼저 고쳐 주세요' : undefined}
        >
          PDF로 변환
        </button>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'tab tab--on' : 'tab'} onClick={() => setTab('settings')}>
              설정
            </button>
            <button type="button" role="tab" aria-selected={tab === 'images'} className={tab === 'images' ? 'tab tab--on' : 'tab'} onClick={() => setTab('images')}>
              그림{hiddenImages.size > 0 && ` (${hiddenImages.size}개 뺌)`}
            </button>
          </div>
          <div className="sidebar__body">
            {tab === 'settings' ? (
              <SettingsPanel
                settings={settings}
                typography={typography}
                issues={issues}
                onChange={update}
                onReset={() => replace(DEFAULT_SETTINGS)}
                fontNames={COMMON_FONTS}
              />
            ) : book ? (
              <ImagePanel
                book={book}
                images={images}
                error={imagesError}
                hidden={hiddenImages}
                onToggle={toggleImage}
                onSetAll={(hide) => setHiddenImages(hide && images ? new Set(images.map((i) => i.key)) : new Set())}
              />
            ) : (
              <p className="panel-note">EPUB을 열면 책에 든 그림이 여기에 나옵니다.</p>
            )}
          </div>
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
            !error && (
              <div className="empty">
                <p>EPUB 파일을 열면 변환 결과 미리보기가 표시됩니다.</p>
                <p className="placeholder">파일을 이 창에 끌어다 놓아도 됩니다.</p>
              </div>
            )
          )}
        </section>
      </main>

      {dragging && <div className="drop-overlay">여기에 놓으면 EPUB을 엽니다</div>}

      <footer className="statusbar">
        <span>{info ? `${info.name} ${info.version}` : '불러오는 중…'}</span>
        {book && <span>문서 {book.spine.length}개</span>}
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
