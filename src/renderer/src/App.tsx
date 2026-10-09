import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BookSummary } from '@shared/book'
import { hasEdits, type BookEdits } from '@shared/edits'
import { DEFAULT_PAGE_NUMBERING, isDefaultPageNumbering, type PageNumbering } from '@shared/page-numbers'
import { buildParts, flattenParts, spineLabel } from '@shared/parts'
import { KOREAN_FONT_NAMES } from '@shared/font-names'
import type { UserFont } from '@shared/fonts'
import type { AppInfo, ConvertProgress, ConvertResult, Result } from '@shared/ipc'
import type { ImageInfo } from '@shared/render'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { computeTypography, validateSettings } from '@shared/typography'
import { EditorPane } from './components/EditorPane'
import { ImagePanel } from './components/ImagePanel'
import { PageNumberPanel } from './components/PageNumberPanel'
import { PartsPanel } from './components/PartsPanel'
import { PreviewPane } from './components/PreviewPane'
import { FontExtras } from './components/FontExtras'
import type { FontOption } from './components/FontPicker'
import { PresetBar } from './components/PresetBar'
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

/**
 * 글꼴 고르기 목록: 추가한 글꼴 → 한글 글꼴(한국어 이름 순) → 그 밖의 설치된 글꼴.
 * 설치된 글꼴 목록을 못 읽으면 Windows 기본 한글 글꼴만 보여준다.
 */
function buildFontOptions(user: UserFont[], system: string[] | null): FontOption[] {
  const installed = system?.length ? system : COMMON_FONTS
  const userFamilies = new Set(user.map((f) => f.family))
  const out: FontOption[] = []
  const seen = new Set<string>()
  for (const f of user) {
    if (seen.has(f.family)) continue
    seen.add(f.family)
    out.push({ family: f.family, localized: f.localizedFamily, group: 'user' })
  }
  const korean = installed
    .filter((f) => KOREAN_FONT_NAMES[f] && !userFamilies.has(f))
    .sort((a, b) => KOREAN_FONT_NAMES[a]!.localeCompare(KOREAN_FONT_NAMES[b]!, 'ko'))
  for (const f of korean) out.push({ family: f, group: 'korean' })
  for (const f of installed) if (!KOREAN_FONT_NAMES[f] && !userFamilies.has(f)) out.push({ family: f, group: 'other' })
  return out
}

type SidebarTab = 'settings' | 'images'

/** 작업 단계: ① 본문 편집 → ② 넣을 부분 → ③ 쪽 번호. 단계 사이는 자유롭게 오갈 수 있다. */
type Step = 1 | 2 | 3

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: '본문 편집' },
  { step: 2, label: '넣을 부분' },
  { step: 3, label: '쪽 번호' }
]

/** 미리보기 범위: 장 하나(spine 위치) 또는 책 전체. */
type PreviewScope = number | 'all'

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]

/** 처음 미리 볼 장: 목차에 있는 첫 본문 문서. */
function firstChapter(book: BookSummary): number {
  return book.spine.find((s) => s.title !== undefined && s.linear)?.index ?? 0
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
  const [step, setStep] = useState<Step>(1)
  const [excludedParts, setExcludedParts] = useState<ReadonlySet<string>>(new Set())
  const [pageNumbering, setPageNumbering] = useState<PageNumbering>(DEFAULT_PAGE_NUMBERING)
  const [chapterEdits, setChapterEdits] = useState<Record<number, string>>({})
  /** 저장된 편집을 다 불러온 책. 불러오기 전에는 저장하지 않는다 (빈 편집으로 덮어쓰지 않게). */
  const [editsBookId, setEditsBookId] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const { settings, update, replace } = useSettings()
  const fonts = useFonts()
  const fontOptions = useMemo(() => buildFontOptions(fonts.user, fonts.system), [fonts.user, fonts.system])

  const typography = useMemo(() => computeTypography(settings), [settings])
  const issues = useMemo(() => validateSettings(settings, typography), [settings, typography])
  const hasErrors = issues.some((i) => i.level === 'error')

  const edits = useMemo<BookEdits>(
    () => ({
      hiddenImages: [...hiddenImages].sort(),
      ...(Object.keys(chapterEdits).length > 0 && { chapters: chapterEdits }),
      ...(excludedParts.size > 0 && { excludedParts: [...excludedParts].sort() }),
      ...(!isDefaultPageNumbering(pageNumbering) && { pageNumbering })
    }),
    [hiddenImages, chapterEdits, excludedParts, pageNumbering]
  )
  const editedCount = Object.keys(chapterEdits).length
  const parts = useMemo(() => (book ? buildParts(book.toc, book.spine, book.coverPath) : []), [book])
  const allExcluded = parts.length > 0 && flattenParts(parts).every((p) => p.spineIndex < 0 || excludedParts.has(p.key))

  // 미리보기는 ②·③ 단계에서만 만든다. 장 하나만 볼 때는 책 전체를 뒤에서 따로 세어
  // 책 전체 쪽수와, 그 장의 쪽 번호를 책 전체 기준으로 매기는 데 쓴다.
  const previewing = step !== 1 && !hasErrors
  const total = usePreview({
    bookId: scope === 'all' ? null : (book?.id ?? null),
    settings,
    edits,
    request: { countOnly: true },
    enabled: previewing,
    delayMs: 1200
  })
  const totalResult = total.result
  const chapterStart = typeof scope === 'number' ? totalResult?.chapterPages[scope] : undefined
  const previewRequest = useMemo(
    () =>
      scope === 'all'
        ? {}
        : {
            chapters: [scope],
            ...(totalResult &&
              chapterStart !== undefined && {
                pageOffset: chapterStart - 1,
                numberStartPage: totalResult.numberStartPage,
                bookPageCount: totalResult.pageCount
              })
          },
    [scope, totalResult, chapterStart]
  )
  const preview = usePreview({ bookId: book?.id ?? null, settings, edits, request: previewRequest, enabled: previewing, delayMs: 300 })
  const whole = scope === 'all' ? preview.result : totalResult
  const totalPages = whole?.pageCount
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
      setChapterEdits({})
      setExcludedParts(new Set())
      setPageNumbering(DEFAULT_PAGE_NUMBERING)
      setEditsBookId(null)
      setRestored(false)
      setSelectedImage(null)
      setStep(1)
      setScope(firstChapter(result.value))
      // 이 책을 전에 고친 적이 있으면 그 편집을 이어서 쓴다.
      const opened = result.value
      const saved = await window.api.loadEdits(opened.id)
      if (saved && hasEdits(saved)) {
        hidden.reset(new Set(saved.hiddenImages))
        setChapterEdits(saved.chapters ?? {})
        setExcludedParts(new Set(saved.excludedParts ?? []))
        setPageNumbering(saved.pageNumbering ?? DEFAULT_PAGE_NUMBERING)
        setRestored(true)
      }
      setEditsBookId(opened.id)
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

  // 편집 내용은 바뀔 때마다 잠시 뒤 저장한다 (다음에 같은 책을 열면 이어서 쓴다).
  useEffect(() => {
    if (!book || editsBookId !== book.id) return
    const timer = setTimeout(() => void window.api.saveEdits(book.id, edits), 500)
    return () => clearTimeout(timer)
  }, [book, editsBookId, edits])

  // 그림 목록. 본문을 고치면 그림이 빠졌을 수 있으므로 잠시 뒤 다시 읽는다.
  useEffect(() => setImages(null), [book])
  const chapterOverrides = book && editsBookId === book.id ? chapterEdits : undefined
  useEffect(() => {
    if (!book || chapterOverrides === undefined) return
    let cancelled = false
    const timer = setTimeout(() => {
      void window.api.listImages(book.id, { hiddenImages: [], chapters: chapterOverrides }).then((result) => {
        if (cancelled) return
        setImagesError(result.ok ? null : result.error)
        if (result.ok) setImages(result.value)
      })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [book, chapterOverrides])

  const setChapter = useCallback((index: number, html: string | null) => {
    setChapterEdits((prev) => {
      const next = { ...prev }
      if (html === null) delete next[index]
      else next[index] = html
      return next
    })
  }, [])

  function clearAllEdits(): void {
    if (!window.confirm('빼 둔 그림, 고친 본문, 넣을 부분, 쪽 번호 규칙을 모두 처음대로 되돌릴까요?')) return
    hidden.reset(new Set())
    setChapterEdits({})
    setExcludedParts(new Set())
    setPageNumbering(DEFAULT_PAGE_NUMBERING)
    setRestored(false)
  }

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
      const result = await window.api.convert(book.id, settings, edits)
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
  const editIndex = book ? (scope === 'all' ? firstChapter(book) : scope) : 0
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
        {book && (
          <nav className="steps" aria-label="작업 단계">
            {STEPS.map(({ step: n, label }) => (
              <button key={n} type="button" className={`step${step === n ? ' step--on' : ''}`} aria-current={step === n ? 'step' : undefined} onClick={() => setStep(n)}>
                <span className="step__n">{n}</span>
                {label}
                {n === 1 && editedCount > 0 && <span className="step__badge">{editedCount}개 고침</span>}
                {n === 2 && excludedParts.size > 0 && <span className="step__badge">{excludedParts.size}개 뺌</span>}
              </button>
            ))}
          </nav>
        )}
        {converting && converting !== 'waiting' && <span className="toolbar__progress">{STAGE_LABELS[converting]}</span>}
        <button
          type="button"
          className="primary"
          onClick={() => void convert()}
          disabled={!book || busy || hasErrors || allExcluded}
          title={hasErrors ? '설정 오류를 먼저 고쳐 주세요' : allExcluded ? 'PDF에 넣을 부분이 없습니다' : undefined}
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
                fontOptions={fontOptions}
                header={<PresetBar settings={settings} onApply={replace} />}
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
                변환을 마쳤습니다. {converted.pageCount}쪽
                {converted.bookmarkCount > 0 && ` · 책갈피 ${converted.bookmarkCount}개`} · {converted.seconds.toFixed(1)}초
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
                      {spineLabel(book.spine, s.index, book.coverPath)}
                    </option>
                  ))}
                  <option value="all">책 전체</option>
                </select>
                <button type="button" title="다음 문서" disabled={scope === 'all' || scope >= book.spine.length - 1} onClick={() => typeof scope === 'number' && setScope(scope + 1)}>
                  ▶
                </button>
                {step !== 1 && (
                  <>
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
                  </>
                )}
                <span className="preview-bar__undo" hidden={step === 1}>
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
              {restored && (
                <div className="message message--info">
                  <span>
                    이 책을 전에 고친 내용(빼 둔 그림 {hiddenImages.size}개, 고친 문서 {editedCount}개, 뺀 부분 {excludedParts.size}개
                    {!isDefaultPageNumbering(pageNumbering) && ', 쪽 번호 규칙'})을 불러왔습니다.
                  </span>
                  <button type="button" className="link" onClick={clearAllEdits}>
                    편집 모두 지우기
                  </button>
                  <button type="button" className="link" onClick={() => setRestored(false)}>
                    닫기
                  </button>
                </div>
              )}
              {step === 1 ? (
                <EditorPane key={`${book.id}:${editIndex}`} book={book} index={editIndex} edited={chapterEdits[editIndex]} onChange={setChapter} />
              ) : (
                <div className="stage">
                  <aside className="stage__panel">
                    {step === 2 ? (
                      <PartsPanel
                        parts={parts}
                        excluded={excludedParts}
                        onChange={setExcludedParts}
                        pages={whole?.partPages}
                        labels={whole?.pageLabels}
                        onJump={(index) => setScope(index)}
                      />
                    ) : (
                      <PageNumberPanel
                        decor={settings.decor}
                        onDecor={(decor) => update({ decor })}
                        numbering={pageNumbering}
                        onNumbering={setPageNumbering}
                        parts={parts}
                        excluded={excludedParts}
                      />
                    )}
                  </aside>
                  <div className="stage__preview">
                    {preview.error && <p className="message message--error">{preview.error}</p>}
                    {hasErrors && <p className="message message--error">설정 오류를 고치면 미리보기가 다시 나옵니다.</p>}
                    {preview.result?.empty && (
                      <p className="message message--info">
                        <span>{scope === 'all' ? 'PDF에 넣을 부분이 없습니다.' : '이 문서는 모두 PDF에서 빠집니다.'}</span>
                      </p>
                    )}
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
                  </div>
                </div>
              )}
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
