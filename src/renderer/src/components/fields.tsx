/** 설정 화면의 입력 요소. */

import { useEffect, useId, useState, type ReactNode } from 'react'

const format = (n: number, decimals: number): string => {
  const fixed = n.toFixed(decimals)
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

interface NumberFieldProps {
  label: ReactNode
  value: number
  onChange(value: number): void
  min: number
  max: number
  step?: number
  decimals?: number
  unit?: string
  disabled?: boolean
  invalid?: boolean
  /** 입력이 막혀 있을 때 대신 보여줄 계산값 설명. */
  hint?: ReactNode
  name?: string
}

/**
 * 숫자 입력. 입력 중에는 글자를 그대로 두고, 범위 안의 숫자가 되면 바로 반영한다.
 * 위/아래 화살표로 step만큼 바꾼다. 포커스를 잃으면 마지막 유효값으로 되돌린다.
 */
export function NumberField(props: NumberFieldProps): React.JSX.Element {
  const { label, value, onChange, min, max, step = 1, decimals = 2, unit, disabled, invalid, hint, name } = props
  const id = useId()
  const [text, setText] = useState(format(value, decimals))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(format(value, decimals))
  }, [value, decimals, focused])

  const commit = (raw: string): void => {
    const n = Number(raw.replace(',', '.'))
    if (raw.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n)
  }

  const nudge = (dir: 1 | -1): void => {
    const next = Math.min(max, Math.max(min, Math.round((value + dir * step) * 1e6) / 1e6))
    onChange(next)
    setText(format(next, decimals))
  }

  return (
    <div className={`field${invalid ? ' field--invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="field__input">
        <input
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          aria-invalid={invalid}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            setText(format(value, decimals))
          }}
          onChange={(e) => {
            setText(e.target.value)
            commit(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              nudge(e.key === 'ArrowUp' ? 1 : -1)
            } else if (e.key === 'Enter') {
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        {unit && <span className="field__unit">{unit}</span>}
      </div>
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  )
}

interface SelectFieldProps<T extends string> {
  label: ReactNode
  value: T
  options: readonly { value: T; label: string }[]
  onChange(value: T): void
  disabled?: boolean
}

export function SelectField<T extends string>({ label, value, options, onChange, disabled }: SelectFieldProps<T>): React.JSX.Element {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

interface ChoiceProps<T extends string> {
  label: ReactNode
  value: T
  options: readonly { value: T; label: string; description?: string }[]
  onChange(value: T): void
}

/** 몇 개 안 되는 선택지를 나란히 보여주는 단추 묶음. */
export function Choice<T extends string>({ label, value, options, onChange }: ChoiceProps<T>): React.JSX.Element {
  const name = useId()
  const selected = options.find((o) => o.value === value)
  return (
    <fieldset className="field choice">
      <legend>{label}</legend>
      <div className="choice__options" role="radiogroup">
        {options.map((o) => (
          <label key={o.value} className={`choice__option${o.value === value ? ' choice__option--on' : ''}`}>
            <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
      {selected?.description && <div className="field__hint">{selected.description}</div>}
    </fieldset>
  )
}

interface CheckboxProps {
  label: ReactNode
  checked: boolean
  onChange(checked: boolean): void
  hint?: ReactNode
  disabled?: boolean
}

export function Checkbox({ label, checked, onChange, hint, disabled }: CheckboxProps): React.JSX.Element {
  return (
    <div className="field field--check">
      <label>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  )
}

interface SectionProps {
  title: string
  summary?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}

/** 접었다 펼 수 있는 설정 묶음. 접혀 있을 때는 요약을 보여준다. */
export function Section({ title, summary, children, defaultOpen = true }: SectionProps): React.JSX.Element {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        <span className="section__title">{title}</span>
        {summary && <span className="section__summary">{summary}</span>}
      </summary>
      <div className="section__body">{children}</div>
    </details>
  )
}
