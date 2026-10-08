/**
 * 본문 편집. 장 문서를 스크립트가 막힌 iframe에 띄우고 designMode로 직접 고치게 한다.
 * 고친 내용은 잠시 뒤 자동으로 저장되어 미리보기와 변환에 쓰인다. Ctrl+Z로 되돌릴 수 있다.
 */

import { useEffect, useRef, useState } from 'react'
import type { BookSummary } from '@shared/book'
import { buildEditorDocument, serializeEditorDocument } from '../editor-doc'

interface Props {
  book: BookSummary
  index: number
  /** 이미 고친 문서. 없으면 원본을 읽는다. */
  edited?: string
  onChange(index: number, html: string | null): void
}

/** 편집 화면의 epub:// 주소 (상대 경로의 그림·CSS가 보이도록). */
function chapterUrl(book: BookSummary, index: number): string {
  const path = book.spine[index]!.path
  return `epub://${book.id}/${path.split('/').map(encodeURIComponent).join('/')}`
}

export function EditorPane({ book, index, edited, onChange }: Props): React.JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null)
  const [srcDoc, setSrcDoc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const editedRef = useRef(edited)
  editedRef.current = edited

  // 장이 바뀌거나 '원래대로'를 누르면 문서를 다시 만든다. 편집 중에 저장된 내용으로는 다시 만들지 않는다.
  useEffect(() => {
    let cancelled = false
    setSrcDoc(null)
    setError(null)
    void (async () => {
      let text = editedRef.current
      if (text === undefined) {
        const res = await window.api.readChapter(book.id, index)
        if (!res.ok) {
          if (!cancelled) setError(res.error)
          return
        }
        text = res.value
      }
      if (!cancelled) setSrcDoc(buildEditorDocument(text, index, chapterUrl(book, index)))
    })()
    return () => {
      cancelled = true
    }
  }, [book, index, reload])

  // 다른 장으로 넘어가거나 화면을 떠날 때 저장하지 못한 편집을 마저 저장한다.
  const flush = useRef<() => void>(() => undefined)
  useEffect(() => () => flush.current(), [index])

  function onLoad(): void {
    const doc = frame.current?.contentDocument
    if (!doc) return
    doc.designMode = 'on'
    const save = (): void => {
      clearTimeout(saveTimer.current)
      flush.current = () => undefined
      onChange(index, serializeEditorDocument(doc))
    }
    doc.addEventListener('input', () => {
      clearTimeout(saveTimer.current)
      flush.current = save
      saveTimer.current = setTimeout(save, 600)
    })
  }

  const title = book.spine[index]?.title ?? `문서 ${index + 1}`

  return (
    <div className="editor">
      <div className="editor__bar">
        <span className="editor__title">{title}</span>
        <span className="editor__hint">글을 골라 Delete로 지우거나 그 자리에 바로 입력하세요. Ctrl+Z로 되돌립니다.</span>
        {edited !== undefined && <span className="editor__badge">편집됨</span>}
        <button
          type="button"
          disabled={edited === undefined}
          onClick={() => {
            clearTimeout(saveTimer.current)
            flush.current = () => undefined
            onChange(index, null)
            editedRef.current = undefined
            setReload((n) => n + 1)
          }}
          title="이 장의 편집을 모두 버리고 원본으로 돌아갑니다"
        >
          이 장 원래대로
        </button>
      </div>
      {error && <p className="message message--error">{error}</p>}
      {srcDoc && (
        <iframe
          ref={frame}
          className="editor__frame"
          title={`${title} 편집`}
          // 스크립트는 막고, 편집기가 문서를 다룰 수 있게 같은 출처로만 둔다.
          sandbox="allow-same-origin"
          srcDoc={srcDoc}
          onLoad={onLoad}
        />
      )}
    </div>
  )
}
