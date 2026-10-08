import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BookSummary } from '@shared/book'
import type { BookEdits } from '@shared/edits'
import type { AppInfo, ConvertProgress, ConvertResult, Result } from '@shared/ipc'
import type { ImageInfo } from '@shared/render'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { computeTypography, validateSettings } from '@shared/typography'
import { ImagePanel } from './components/ImagePanel'
import { PreviewPane } from './components/PreviewPane'
import { FontExtras } from './components/FontExtras'
import { SettingsPanel } from './components/SettingsPanel'
import { useFonts } from './hooks/useFonts'
import { usePreview } from './hooks/usePreview'
import { useSettings } from './hooks/useSettings'
import { useUndoable } from './hooks/useUndoable'

const STAGE_LABELS: Record<ConvertProgress['stage'], string> = {
  assembling: '문서 조립 중…',
  printing: 'PDF 만드는 중…',
  finishing: '마무리 중…'
}

/** 시스템 글꼴 목록을 못 읽었을 때 보여줄 Windows 기본 한글 글꼴. */
const COMMON_FONTS = ['Malgun Gothic', 'Batang', 'BatangChe', 'Dotum', 'Gulim', 'Gungsuh']

type SidebarTab = 'settings' | 'images'

/** 미리보기 범위: 장 하나(spine 위치) 또는 책 전체. */
type PreviewScope = number | 'all'

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]

/** 처음 미리 볼 장: 목차에 있는 첫 본문 문서. */
function firstChapter(book: BookSummary): number {
  return book.spine.find((s) => s.title !== undefined && s.linear)?.index ?? 0
}

function spineLabel(book: BookSummary, index: number): string {
  const s = book.spine[index]
  if (s?.title) return s.title
  return index === 0 && book.coverPath ? '표지' : `문서 ${index + 1}`
}

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export default function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [book, setBook] = useState<BookSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [converting, setConverting] = useState<ConvertProgress['stage'] | 'waiting' | null>(null)
  const [converted, setConverted] = useState<ConvertResult | null>(null)
  const [images, setImages] = useState<ImageInfo[] | null>(null)
  const [imagesError, setImagesError] = useState<string | null>(null)
  const hidden = useUndoable<ReadonlySet<string>>(new Set())
  const hiddenImages = hidden.value
  const setHiddenImages = hidden.set
  const [tab, setTab] = useState<SidebarTab>('settings')
  const [dragging, setDragging] = useState(false)
  const [scope, setScope] = useState<PreviewScope>(0)
  const [spread, setSpread] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [lineCounts, setLineCounts] = useState<Map<number, number>>(new Map())
  const { settings, update, replace } = useSettings()
  const fonts = useFonts()
  const fontNames = useMemo(
    () => [...new Set([...fonts.user.map((f) => f.family), ...(fonts.system?.length ? fonts.system : COMMON_FONTS)])],
    [fonts.user, fonts.system]
  )

  const typography = useMemo(() => computeTypography(settings), [settings])
  const issues = useMemo(() => validateSettings(settings, typography), [settings, typography])
  const hasErrors = issues.some((i) => i.level === 'error')

  const edits = useMemo<BookEdits>(() => ({ hiddenImages: [...hiddenImages].sort() }), [hiddenImages])
  const previewRequest = useMemo(() => (scope === 'all' ? {} : { chapters: [scope] }), [scope])
  const preview = usePreview({ bookId: book?.id ?? null, settings, edits, request: previewRequest, enabled: !hasErrors, delayMs: 300 })
  // 장 하나만 보고 있을 때는 책 전체 쪽수를 뒤에서 따로 센다.
  const total = usePreview({
    bookId: scope === 'all' ? null : (book?.id ?? null),
    settings,
    edits,
    request: { countOnly: true },
    enabled: !hasErrors,
    delayMs: 1200
  })
  const totalPages = scope === 'all' ? preview.result?.pageCount : total.result?.pageCount
  const maxLines = Math.max(0, ...lineCounts.values())

  const hideImage = useCallback(
    (key: string) => {
      setHiddenImages((prev) => new Set([...prev, key]))
      setSelectedImage(null)
    },
    [setHiddenImages]
  )

  // 단축키: Ctrl+Z 되돌리기, Ctrl+Y/Ctrl+Shift+Z 다시 하기, Delete 고른 그림 빼기, Esc 선택 해제
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTyping(e.target)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        hidden.undo()
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        hidden.redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedImage) {
        e.preventDefault()
        hideImage(selectedImage)
      } else if (e.key === 'Escape') {
        setSelectedImage(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hidden, selectedImage, hideImage])

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
      hidden.reset(new Set())
      setSelectedImage(null)
      setScope(firstChapter(result.value))
    },
    [book, hidden]
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
                fontNames={fontNames}
                fontExtras={
                  <FontExtras
                    family={settings.font.family}
                    system={fonts.system}
                    user={fonts.user}
                    onPick={(family) => update({ font: { family } })}
                    onAdd={fonts.add}
                    onRemove={fonts.remove}
                  />
                }
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
                <button type="button" className="link" onClick={() => setConverted(null)}>
                  닫기
                </button>
              </div>
            </div>
          )}
          {book ? (
            <>
              <div className="preview-bar">
                <button type="button" title="이전 문서" disabled={scope === 'all' || scope <= 0} onClick={() => typeof scope === 'number' && setScope(scope - 1)}>
                  ◀
                </button>
                <select value={String(scope)} onChange={(e) => setScope(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="미리 볼 범위">
                  {book.spine.map((s) => (
                    <option key={s.index} value={s.index}>
                      {spineLabel(book, s.index)}
                    </option>
                  ))}
                  <option value="all">책 전체</option>
                </select>
                <button type="button" title="다음 문서" disabled={scope === 'all' || scope >= book.spine.length - 1} onClick={() => typeof scope === 'number' && setScope(scope + 1)}>
                  ▶
                </button>
                <span className="preview-bar__sep" />
                <button type="button" className={spread ? 'toggle toggle--on' : 'toggle'} onClick={() => setSpread(!spread)} title="펼침면으로 보기">
                  펼침면
                </button>
                <button type="button" onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)]!)} disabled={zoom === ZOOMS[0]} title="축소">
                  −
                </button>
                <span className="preview-bar__zoom">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)]!)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} title="확대">
                  +
                </button>
                <span className="preview-bar__status">
                  {preview.loading && <span className="spinner" aria-label="미리보기 만드는 중" />}
                  {[
                    preview.result && scope !== 'all' ? `이 문서 ${preview.result.pageCount}쪽` : null,
                    totalPages !== undefined ? `책 전체 ${totalPages}쪽` : null,
                    maxLines > 0 ? `쪽당 최대 ${maxLines}줄` : null
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="preview-bar__undo">
                  <button type="button" onClick={hidden.undo} disabled={!hidden.canUndo} title="되돌리기 (Ctrl+Z)">
                    ↶
                  </button>
                  <button type="button" onClick={hidden.redo} disabled={!hidden.canRedo} title="다시 하기 (Ctrl+Y)">
                    ↷
                  </button>
                </span>
              </div>
              {book.warnings.length > 0 && (
                <details className="message message--warning">
                  <summary>EPUB 경고 {book.warnings.length}개</summary>
                  <ul>
                    {book.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
              {preview.error && <p className="message message--error">{preview.error}</p>}
              {hasErrors && <p className="message message--error">설정 오류를 고치면 미리보기가 다시 나옵니다.</p>}
              <PreviewPane
                pdf={preview.result?.pdf ?? null}
                spread={spread}
                zoom={zoom}
                marginsMm={{ top: settings.margins.topMm, bottom: settings.margins.bottomMm }}
                selectedImage={selectedImage}
                onSelectImage={setSelectedImage}
                onHideImage={hideImage}
                onMeasure={setLineCounts}
              />
            </>
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
