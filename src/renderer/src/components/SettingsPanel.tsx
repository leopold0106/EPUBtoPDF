import { PAPER_SIZES } from '@shared/paper'
import { LIMITS, resolvePageSize, type Settings } from '@shared/settings'
import { bodySizeMm, type SettingsIssue, type Typography } from '@shared/typography'
import { Checkbox, Choice, NumberField, Section, SelectField } from './fields'

export type SettingsPatch = { [K in keyof Settings]?: Partial<Settings[K]> }

interface Props {
  settings: Settings
  typography: Typography
  issues: SettingsIssue[]
  onChange(patch: SettingsPatch): void
  onReset(): void
  /** 글꼴 이름 입력의 자동 완성 목록. */
  fontNames: string[]
  /** 글꼴 설정 아래에 붙일 추가 요소 (글꼴 파일 추가 등). */
  fontExtras?: React.ReactNode
  /** 설정 맨 위에 붙일 요소 (프리셋 등). */
  header?: React.ReactNode
}

const fmt = (n: number, d = 1): string => n.toFixed(d).replace(/\.0+$/, '')

export function SettingsPanel({ settings: s, typography: t, issues, onChange, onReset, fontNames, fontExtras, header }: Props): React.JSX.Element {
  const invalid = (field: string): boolean => issues.some((i) => i.field === field)
  const page = resolvePageSize(s.page)
  const body = bodySizeMm(t)
  const mirrored = s.margins.mirrored
  const linesMode = s.text.sizing === 'linesPerPage'
  const paperLabel = s.page.paper === 'custom' ? '사용자 지정' : (PAPER_SIZES.find((p) => p.id === s.page.paper)?.label.split(' (')[0] ?? s.page.paper)

  return (
    <div className="settings-panel">
      {header}

      <div className="typo-summary" aria-live="polite">
        <div>
          <strong>{fmt(t.fontSizePt, 2)}pt</strong>
          <span>글자 크기</span>
        </div>
        <div>
          <strong>{t.linesPerPage}줄</strong>
          <span>쪽당 줄 수</span>
        </div>
        <div>
          <strong>약 {t.charsPerLine}자</strong>
          <span>한 줄 (한글 기준)</span>
        </div>
        <p>
          판면 {fmt(body.widthMm)} × {fmt(body.heightMm)}mm · 줄 높이 {fmt((t.lineHeightPx * 72) / 96, 2)}pt
        </p>
      </div>

      {issues.length > 0 && (
        <ul className="issues">
          {issues.map((i) => (
            <li key={i.field + i.message} className={`issue issue--${i.level}`}>
              {i.message}
            </li>
          ))}
        </ul>
      )}

      <Section title="용지" summary={`${paperLabel} · ${s.page.orientation === 'portrait' ? '세로' : '가로'}`}>
        <SelectField
          label="크기"
          value={s.page.paper}
          options={[...PAPER_SIZES.map((p) => ({ value: p.id, label: p.label })), { value: 'custom' as const, label: '사용자 지정' }]}
          onChange={(paper) => onChange({ page: paper === 'custom' ? { paper, customWidthMm: page.widthMm, customHeightMm: page.heightMm, orientation: 'portrait' } : { paper } })}
        />
        {s.page.paper === 'custom' && (
          <div className="field-row">
            <NumberField label="너비" unit="mm" value={s.page.customWidthMm} min={LIMITS.pageMm.min} max={LIMITS.pageMm.max} decimals={1} onChange={(v) => onChange({ page: { customWidthMm: v } })} />
            <NumberField label="높이" unit="mm" value={s.page.customHeightMm} min={LIMITS.pageMm.min} max={LIMITS.pageMm.max} decimals={1} onChange={(v) => onChange({ page: { customHeightMm: v } })} />
          </div>
        )}
        <Choice
          label="방향"
          value={s.page.orientation}
          options={[
            { value: 'portrait', label: '세로' },
            { value: 'landscape', label: '가로' }
          ]}
          onChange={(orientation) => onChange({ page: { orientation } })}
        />
      </Section>

      <Section title="여백" summary={`위 ${fmt(s.margins.topMm)} · 아래 ${fmt(s.margins.bottomMm)} · ${mirrored ? '안' : '왼'} ${fmt(s.margins.insideMm)} · ${mirrored ? '밖' : '오른'} ${fmt(s.margins.outsideMm)}mm`}>
        <div className="field-row">
          <NumberField label="위" unit="mm" value={s.margins.topMm} min={LIMITS.marginMm.min} max={LIMITS.marginMm.max} decimals={1} invalid={invalid('margins.topMm')} onChange={(v) => onChange({ margins: { topMm: v } })} />
          <NumberField label="아래" unit="mm" value={s.margins.bottomMm} min={LIMITS.marginMm.min} max={LIMITS.marginMm.max} decimals={1} invalid={invalid('margins.bottomMm')} onChange={(v) => onChange({ margins: { bottomMm: v } })} />
        </div>
        <div className="field-row">
          <NumberField label={mirrored ? '안쪽 (제본)' : '왼쪽'} unit="mm" value={s.margins.insideMm} min={LIMITS.marginMm.min} max={LIMITS.marginMm.max} decimals={1} invalid={invalid('margins.insideMm')} onChange={(v) => onChange({ margins: { insideMm: v } })} />
          <NumberField label={mirrored ? '바깥쪽' : '오른쪽'} unit="mm" value={s.margins.outsideMm} min={LIMITS.marginMm.min} max={LIMITS.marginMm.max} decimals={1} invalid={invalid('margins.insideMm')} onChange={(v) => onChange({ margins: { outsideMm: v } })} />
        </div>
        <Checkbox
          label="양면 인쇄 (짝수 쪽은 좌우 여백을 뒤집음)"
          checked={mirrored}
          onChange={(v) => onChange({ margins: { mirrored: v } })}
        />
      </Section>

      <Section title="글꼴" summary={s.font.family}>
        <div className="field">
          <label htmlFor="font-family">글꼴 이름</label>
          <input
            id="font-family"
            type="text"
            list="font-names"
            value={s.font.family}
            onChange={(e) => e.target.value.trim() && onChange({ font: { family: e.target.value } })}
          />
          <datalist id="font-names">
            {fontNames.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
        <Choice
          label="없는 글자를 채울 글꼴"
          value={s.font.generic}
          options={[
            { value: 'sans-serif', label: '고딕 계열' },
            { value: 'serif', label: '명조 계열' }
          ]}
          onChange={(generic) => onChange({ font: { generic } })}
        />
        {fontExtras}
      </Section>

      <Section title="본문" summary={`${fmt(t.fontSizePt, 2)}pt · ${t.linesPerPage}줄 · 줄 간격 ${fmt(s.text.lineHeight, 2)}배`}>
        <Choice
          label="크기를 정하는 방법"
          value={s.text.sizing}
          options={[
            { value: 'fontSize', label: '글자 크기 지정', description: '글자 크기를 정하면 쪽당 줄 수가 계산됩니다.' },
            { value: 'linesPerPage', label: '쪽당 줄 수 지정', description: '쪽당 줄 수를 정하면 글자 크기가 계산됩니다. 줄 간격 배수는 그대로입니다.' }
          ]}
          onChange={(sizing) => onChange({ text: sizing === 'linesPerPage' ? { sizing, linesPerPage: Math.max(1, t.linesPerPage) } : { sizing, fontSizePt: Math.round(t.fontSizePt * 2) / 2 } })}
        />
        <div className="field-row">
          {linesMode ? (
            <NumberField label="쪽당 줄 수" unit="줄" value={s.text.linesPerPage} min={LIMITS.linesPerPage.min} max={LIMITS.linesPerPage.max} step={1} decimals={0} invalid={invalid('text.linesPerPage')} onChange={(v) => onChange({ text: { linesPerPage: Math.round(v) } })} />
          ) : (
            <NumberField label="글자 크기" unit="pt" value={s.text.fontSizePt} min={LIMITS.fontSizePt.min} max={LIMITS.fontSizePt.max} step={0.5} invalid={invalid('text.fontSizePt')} onChange={(v) => onChange({ text: { fontSizePt: v } })} />
          )}
          <NumberField label="줄 간격" unit="배" value={s.text.lineHeight} min={LIMITS.lineHeight.min} max={LIMITS.lineHeight.max} step={0.05} onChange={(v) => onChange({ text: { lineHeight: v } })} />
        </div>
        <div className="field-row">
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={s.text.paragraphSpacing === 'auto'}
                onChange={(e) => onChange({ text: { paragraphSpacing: e.target.checked ? 'auto' : s.layout.epubStyles === 'ignore' ? 1 : 0 } })}
              />{' '}
              문단 간격 자동
            </label>
            {s.text.paragraphSpacing === 'auto' ? (
              <div className="field__hint">원본 유지: 0줄, 원본 무시: 1줄</div>
            ) : (
              <NumberField label="" unit="줄" value={s.text.paragraphSpacing} min={LIMITS.paragraphSpacing.min} max={LIMITS.paragraphSpacing.max} step={s.text.snapToGrid ? 1 : 0.25} onChange={(v) => onChange({ text: { paragraphSpacing: v } })} />
            )}
          </div>
          <NumberField
            label="제목 위아래"
            unit="줄"
            value={s.text.headingSpacing}
            min={LIMITS.headingSpacing.min}
            max={LIMITS.headingSpacing.max}
            step={s.text.snapToGrid ? 1 : 0.25}
            onChange={(v) => onChange({ text: { headingSpacing: v } })}
            hint={s.layout.epubStyles === 'keep' && !s.text.snapToGrid ? '원본 유지 + 격자 꺼짐: 원본을 따름' : undefined}
          />
        </div>
        <div className="field-row">
          <NumberField label="첫 줄 들여쓰기" unit="글자" value={s.text.textIndentEm} min={LIMITS.textIndentEm.min} max={LIMITS.textIndentEm.max} step={0.5} onChange={(v) => onChange({ text: { textIndentEm: v } })} />
          <SelectField
            label="정렬"
            value={s.text.align}
            options={[
              { value: 'justify', label: '양쪽 맞춤' },
              { value: 'start', label: '왼쪽 맞춤' }
            ]}
            onChange={(align) => onChange({ text: { align } })}
          />
        </div>
        <SelectField
          label="줄 바꿈"
          value={s.text.wordBreak}
          options={[
            { value: 'normal', label: '글자 단위 (줄 끝이 고름)' },
            { value: 'keep-all', label: '어절 단위 (단어가 잘리지 않음)' }
          ]}
          onChange={(wordBreak) => onChange({ text: { wordBreak } })}
        />
        <Checkbox
          label="줄 격자 맞춤"
          checked={s.text.snapToGrid}
          onChange={(v) => onChange({ text: { snapToGrid: v } })}
          hint="제목과 문단 간격을 줄 높이 단위로 맞춰, 모든 쪽의 줄 위치와 줄 수를 일정하게 합니다."
        />
      </Section>

      <Section title="원본 스타일" summary={s.layout.epubStyles === 'keep' ? '유지' : '무시'}>
        <Choice
          label="EPUB에 들어 있는 CSS"
          value={s.layout.epubStyles}
          options={[
            { value: 'keep', label: '유지', description: '표, 강조, 그림 배치 등은 원본을 따르고 글꼴·크기·줄 간격·여백만 바꿉니다.' },
            { value: 'ignore', label: '무시', description: '원본 스타일을 모두 버리고 이 설정만으로 깔끔하게 짭니다.' }
          ]}
          onChange={(epubStyles) => onChange({ layout: { epubStyles } })}
        />
        <Checkbox label="장마다 새 쪽에서 시작" checked={s.layout.chapterBreak} onChange={(v) => onChange({ layout: { chapterBreak: v } })} />
      </Section>

      <Section title="쪽 번호 · 머리글" summary={s.decor.pageNumbers === 'none' ? '쪽 번호 없음' : '쪽 번호 있음'} defaultOpen={false}>
        <SelectField
          label="쪽 번호"
          value={s.decor.pageNumbers}
          options={[
            { value: 'none', label: '없음' },
            { value: 'bottom-center', label: '아래 가운데' },
            { value: 'bottom-outside', label: '아래 바깥쪽' },
            { value: 'top-outside', label: '위 바깥쪽' }
          ]}
          onChange={(pageNumbers) => onChange({ decor: { pageNumbers } })}
        />
        <SelectField
          label="머리글"
          value={s.decor.header}
          options={[
            { value: 'none', label: '없음' },
            { value: 'bookTitle', label: '책 제목' },
            { value: 'chapterTitle', label: '장 제목' }
          ]}
          onChange={(header) => onChange({ decor: { header } })}
        />
      </Section>

      <Section title="PDF" summary={s.output.bookmarks ? '책갈피 있음' : '책갈피 없음'} defaultOpen={false}>
        <Checkbox label="목차를 PDF 책갈피로 넣기" checked={s.output.bookmarks} onChange={(v) => onChange({ output: { bookmarks: v } })} />
      </Section>

      <button type="button" className="reset" onClick={onReset}>
        기본값으로 되돌리기
      </button>
    </div>
  )
}
