/**
 * ② 넣을 부분 고르기. 목차를 체크박스 나무로 보여주고, 끈 부분은 PDF와 책갈피에서 뺀다.
 * 항목마다 PDF 몇 쪽에서 시작하는지 함께 보여준다.
 */

import { useEffect, useRef } from 'react'
import { flattenParts, partKeys, type BookPart } from '@shared/parts'

interface Props {
  parts: BookPart[]
  excluded: ReadonlySet<string>
  onChange(next: ReadonlySet<string>): void
  /** 부분 키 → 시작 쪽 (책 전체에서 몇 번째 쪽인지). 아직 모르면 undefined. */
  pages?: Record<string, number>
  /** 쪽마다 찍히는 번호. 쪽 번호를 찍지 않으면 undefined. */
  labels?: (string | null)[]
  /** 항목 제목을 누르면 미리보기를 그 문서로 옮긴다. */
  onJump(spineIndex: number): void
}

/** 쪽 번호 글자에서 숫자 부분만 (`- 12 -` → `12`, `12 / 120` → `12`). */
const bareLabel = (label: string): string => label.replace(/^- (.*) -$/, '$1').replace(/ \/ \d+$/, '')

function PartCheckbox({ part, excluded, onToggle }: { part: BookPart; excluded: ReadonlySet<string>; onToggle(part: BookPart, include: boolean): void }): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const keys = partKeys(part)
  const included = keys.filter((k) => !excluded.has(k)).length
  const mixed = included > 0 && included < keys.length
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed
  }, [mixed])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={included === keys.length}
      disabled={part.spineIndex < 0}
      aria-label={`${part.title} 넣기`}
      onChange={() => onToggle(part, included < keys.length)}
    />
  )
}

export function PartsPanel({ parts, excluded, onChange, pages, labels, onJump }: Props): React.JSX.Element {
  const all = flattenParts(parts).filter((p) => p.spineIndex >= 0)
  const excludedCount = all.filter((p) => excluded.has(p.key)).length

  const toggle = (part: BookPart, include: boolean): void => {
    const next = new Set(excluded)
    for (const key of partKeys(part)) {
      if (include) next.delete(key)
      else next.add(key)
    }
    onChange(next)
  }

  const pageText = (part: BookPart): { text: string; muted: boolean } | null => {
    if (part.spineIndex < 0) return { text: '찾을 수 없음', muted: true }
    if (excluded.has(part.key)) return { text: '뺌', muted: true }
    const page = pages?.[part.key]
    if (page === undefined) return null
    const label = labels?.[page - 1]
    return label ? { text: `${bareLabel(label)}쪽`, muted: false } : { text: `${page}번째 쪽`, muted: true }
  }

  const render = (list: BookPart[]): React.JSX.Element[] =>
    list.map((part) => {
      const page = pageText(part)
      const off = part.spineIndex < 0 || partKeys(part).every((k) => excluded.has(k))
      return (
        <li key={part.key}>
          <div className={`parts__row${off ? ' parts__row--off' : ''}`} style={{ paddingLeft: 8 + part.depth * 16 }}>
            <PartCheckbox part={part} excluded={excluded} onToggle={toggle} />
            <button
              type="button"
              className={`parts__title${part.extra ? ' parts__title--extra' : ''}`}
              disabled={part.spineIndex < 0}
              onClick={() => onJump(part.spineIndex)}
              title={part.extra ? '목차에 없는 문서' : '미리보기에서 보기'}
            >
              {part.title}
            </button>
            {page && <span className={`parts__page${page.muted ? ' parts__page--muted' : ''}`}>{page.text}</span>}
          </div>
          {part.children.length > 0 && <ul>{render(part.children)}</ul>}
        </li>
      )
    })

  return (
    <div className="parts">
      <div className="step-panel__head">
        <h2>PDF에 넣을 부분</h2>
        <span className="step-panel__actions">
          <button type="button" className="link" disabled={excludedCount === 0} onClick={() => onChange(new Set())}>
            모두 넣기
          </button>
          <button type="button" className="link" disabled={excludedCount === all.length} onClick={() => onChange(new Set(all.map((p) => p.key)))}>
            모두 빼기
          </button>
        </span>
      </div>
      <p className="panel-note">
        끈 부분은 PDF와 책갈피에서 빠집니다. 목차 항목이 가리키는 곳부터 다음 항목 직전까지가 한 부분입니다.
        {excludedCount > 0 && <strong> {excludedCount}개 뺌.</strong>}
      </p>
      <ul className="parts__tree">{render(parts)}</ul>
    </div>
  )
}
