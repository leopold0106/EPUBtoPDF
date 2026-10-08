/**
 * 글꼴 고르기. 한국어 이름(맑은 고딕, 바탕…)으로 보여주고, 한국어나 영어로 적어 찾을 수 있다.
 * 입력하는 동안에는 칸을 비워도 되고, 비운 채로 나가면 원래 글꼴로 돌아간다.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { fontDisplayName, fontMatches, resolveFontName } from '@shared/font-names'

export interface FontOption {
  family: string
  /** 사용자가 추가한 글꼴의 한국어 이름 (글꼴 파일에서 읽음). */
  localized?: string
  group: 'user' | 'korean' | 'other'
}

const GROUP_LABELS: Record<FontOption['group'], string> = {
  user: '추가한 글꼴',
  korean: '한글 글꼴',
  other: '그 밖의 글꼴'
}

interface Props {
  value: string
  options: FontOption[]
  onChange(family: string): void
}

export function FontPicker({ value, options, onChange }: Props): React.JSX.Element {
  const id = useId()
  const listId = `${id}-list`
  const current = options.find((o) => o.family === value)
  const display = fontDisplayName(value, current?.localized)
  const [text, setText] = useState(display)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  // 밖에서 글꼴이 바뀌면(프리셋 등) 칸도 바꾼다. 입력 중일 때는 건드리지 않는다.
  useEffect(() => {
    if (!open) setText(display)
  }, [display, open])

  // 입력한 글자로 거르되, 목록을 막 연 때(아직 입력 전)는 모두 보여준다.
  const filtered = useMemo(
    () => options.filter((o) => !typed || fontMatches(text, o.family, o.localized)),
    [options, text, typed]
  )

  useEffect(() => {
    setActive(0)
  }, [text])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = (family: string): void => {
    onChange(family)
    setText(fontDisplayName(family, options.find((o) => o.family === family)?.localized))
    setOpen(false)
    setTyped(false)
  }

  /** 적은 글자로 정한다. 비어 있으면 원래 글꼴로 되돌린다. */
  const commit = (): void => {
    const name = text.trim()
    if (!name) {
      setText(display)
    } else {
      const family = resolveFontName(
        name,
        options.map((o) => ({ family: o.family, localizedFamily: o.localized }))
      )
      if (family !== value) onChange(family)
      setText(fontDisplayName(family, options.find((o) => o.family === family)?.localized))
    }
    setOpen(false)
    setTyped(false)
  }

  let lastGroup: FontOption['group'] | undefined

  return (
    <div className="field font-picker">
      <label htmlFor={id}>글꼴</label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={text}
        placeholder="글꼴 이름 (예: 맑은 고딕)"
        onFocus={(e) => {
          setOpen(true)
          e.target.select()
        }}
        onBlur={(e) => {
          // 목록을 누르는 중이면 그 선택이 먼저 처리되게 둔다.
          if (listRef.current?.contains(e.relatedTarget as Node)) return
          commit()
        }}
        onChange={(e) => {
          setText(e.target.value)
          setTyped(true)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((a) => Math.min(filtered.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const chosen = open && typed ? filtered[active] : undefined
            if (chosen) pick(chosen.family)
            else commit()
            ;(e.target as HTMLInputElement).blur()
          } else if (e.key === 'Escape') {
            setText(display)
            setOpen(false)
            setTyped(false)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {open && (
        <ul className="font-picker__list" id={listId} role="listbox" ref={listRef} tabIndex={-1}>
          {filtered.length === 0 && <li className="font-picker__empty">맞는 글꼴이 없습니다. Enter를 누르면 적은 이름 그대로 씁니다.</li>}
          {filtered.map((o, i) => {
            const header = o.group !== lastGroup ? GROUP_LABELS[o.group] : null
            lastGroup = o.group
            const name = fontDisplayName(o.family, o.localized)
            return [
              header && (
                <li key={`h-${o.group}`} className="font-picker__group" role="presentation">
                  {header}
                </li>
              ),
              <li
                key={o.family}
                role="option"
                aria-selected={i === active}
                className={`font-picker__option${o.family === value ? ' font-picker__option--current' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(o.family)
                }}
              >
                <span style={{ fontFamily: JSON.stringify(o.family) }}>{name}</span>
                {name !== o.family && <small>{o.family}</small>}
              </li>
            ]
          })}
        </ul>
      )}
    </div>
  )
}
