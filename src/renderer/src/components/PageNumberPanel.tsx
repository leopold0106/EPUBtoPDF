/**
 * ③ 쪽 번호. 번호의 위치·모양(설정)과, 이 책에서 번호를 어디서부터 몇으로 시작할지·어느 쪽에서 지울지(책마다 저장)를 정한다.
 */

import { useEffect, useState } from 'react'
import {
  DEFAULT_PAGE_NUMBERING,
  formatNumberList,
  isDefaultPageNumbering,
  PAGE_NUMBER_LIMITS,
  parseNumberList,
  type PageNumbering
} from '@shared/page-numbers'
import { flattenParts, type BookPart } from '@shared/parts'
import type { DecorSettings, PageNumberPosition, PageNumberStyle } from '@shared/settings'
import { Checkbox, Choice, NumberField, SelectField } from './fields'

interface Props {
  decor: DecorSettings
  onDecor(patch: Partial<DecorSettings>): void
  numbering: PageNumbering
  onNumbering(next: PageNumbering): void
  parts: BookPart[]
  excluded: ReadonlySet<string>
}

const POSITIONS: { value: PageNumberPosition; label: string }[] = [
  { value: 'none', label: '찍지 않음' },
  { value: 'bottom-center', label: '아래 가운데' },
  { value: 'bottom-outside', label: '아래 바깥쪽' },
  { value: 'top-outside', label: '위 바깥쪽' }
]

const STYLES: { value: PageNumberStyle; label: string }[] = [
  { value: 'plain', label: '12' },
  { value: 'dashed', label: '- 12 -' },
  { value: 'total', label: '12 / 전체' }
]

/** 번호를 지울 쪽 입력. 칸을 벗어나거나 Enter를 누르면 반영한다. */
function HiddenNumbersField({ value, onChange }: { value: number[]; onChange(next: number[]): void }): React.JSX.Element {
  const [text, setText] = useState(formatNumberList(value))
  const [errors, setErrors] = useState<string[]>([])
  useEffect(() => setText(formatNumberList(value)), [value])
  const commit = (): void => {
    const parsed = parseNumberList(text)
    setErrors(parsed.errors)
    onChange(parsed.numbers)
    if (parsed.errors.length === 0) setText(formatNumberList(parsed.numbers))
  }
  return (
    <div className={`field${errors.length > 0 ? ' field--invalid' : ''}`}>
      <label htmlFor="hidden-numbers">번호를 지울 쪽</label>
      <input
        id="hidden-numbers"
        type="text"
        value={text}
        placeholder="예: 3, 7-9"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      <div className="field__hint">
        {errors.length > 0 ? `알아볼 수 없는 값: ${errors.join(', ')}` : '찍힌 번호로 적습니다. 쪽은 그대로 두고 번호만 지웁니다.'}
      </div>
    </div>
  )
}

export function PageNumberPanel({ decor, onDecor, numbering, onNumbering, parts, excluded }: Props): React.JSX.Element {
  const off = decor.pageNumbers === 'none'
  const set = (patch: Partial<PageNumbering>): void => onNumbering({ ...numbering, ...patch })
  const startOptions = [
    { value: '', label: '첫 쪽부터' },
    ...flattenParts(parts)
      .filter((p) => p.spineIndex >= 0 && !excluded.has(p.key))
      .map((p) => ({ value: p.key, label: `${'　'.repeat(p.depth)}${p.title}` }))
  ]
  const startMissing = numbering.startAt !== undefined && !startOptions.some((o) => o.value === numbering.startAt)

  return (
    <div className="page-numbers">
      <div className="step-panel__head">
        <h2>쪽 번호</h2>
        <span className="step-panel__actions">
          <button type="button" className="link" disabled={isDefaultPageNumbering(numbering)} onClick={() => onNumbering(DEFAULT_PAGE_NUMBERING)}>
            처음대로
          </button>
        </span>
      </div>
      <SelectField label="위치" value={decor.pageNumbers} options={POSITIONS} onChange={(pageNumbers) => onDecor({ pageNumbers })} />
      {!off && (
        <>
          <Choice label="모양" value={decor.pageNumberStyle} options={STYLES} onChange={(pageNumberStyle) => onDecor({ pageNumberStyle })} />
          <SelectField
            label="1쪽(시작 번호)을 붙일 곳"
            value={startMissing ? '' : (numbering.startAt ?? '')}
            options={startOptions}
            onChange={(key) => set(key ? { startAt: key } : { startAt: undefined })}
          />
          {startMissing && <p className="field__hint field__hint--warn">고른 부분을 PDF에서 뺐기 때문에 첫 쪽부터 매깁니다.</p>}
          <div className="field-row">
            <NumberField
              label="시작 번호"
              value={numbering.startNumber}
              min={PAGE_NUMBER_LIMITS.startNumber.min}
              max={PAGE_NUMBER_LIMITS.startNumber.max}
              step={1}
              decimals={0}
              onChange={(v) => set({ startNumber: Math.round(v) })}
            />
          </div>
          {numbering.startAt !== undefined && !startMissing && (
            <Choice
              label="그 앞의 쪽"
              value={numbering.front}
              options={[
                { value: 'none', label: '번호 없음' },
                { value: 'roman', label: '로마 숫자 (i, ii…)' }
              ]}
              onChange={(front) => set({ front })}
            />
          )}
          <Checkbox
            label="장이 시작하는 쪽에는 번호를 찍지 않기"
            checked={decor.hideNumberOnChapterStart}
            onChange={(hideNumberOnChapterStart) => onDecor({ hideNumberOnChapterStart })}
          />
          <HiddenNumbersField value={numbering.hiddenNumbers} onChange={(hiddenNumbers) => set({ hiddenNumbers })} />
        </>
      )}
      <p className="panel-note">
        위치·모양·장 첫 쪽 설정은 다른 책에도 그대로 쓰이고(프리셋에 저장), 시작할 곳·시작 번호·지울 쪽은 이 책에만 저장됩니다.
      </p>
    </div>
  )
}
