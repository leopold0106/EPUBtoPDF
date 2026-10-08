import { useEffect, useState } from 'react'
import type { BookSummary, TocEntry } from '@shared/book'
import type { AppInfo, Result } from '@shared/ipc'

export default function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [book, setBook] = useState<BookSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
  }, [])

  async function handleOpened(result: Result<BookSummary> | null): Promise<void> {
    if (!result) return
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (book) await window.api.closeBook(book.id)
    setBook(result.value)
    setError(null)
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
        <button type="button" onClick={() => void openDialog()} disabled={opening}>
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
        <button type="button" className="primary" disabled>
          PDF로 변환
        </button>
      </header>

      <main className="workspace">
        <aside className="settings">
          <h2>설정</h2>
          <p className="placeholder">용지, 여백, 글꼴, 본문 설정이 여기에 들어갑니다.</p>
        </aside>
        <section className="preview">
          {error && <p className="message message--error">{error}</p>}
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
