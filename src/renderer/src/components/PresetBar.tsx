import { useEffect, useMemo, useState } from 'react'
import { BUILTIN_PRESETS, builtinSettings, sameSettings, type UserPreset } from '@shared/presets'
import type { Settings } from '@shared/settings'

interface Props {
  settings: Settings
  onApply(settings: Settings): void
}

const BUILTIN = 'builtin:'
const USER = 'user:'

/** 프리셋 고르기·저장·내보내기·가져오기·삭제. */
export function PresetBar({ settings, onApply }: Props): React.JSX.Element {
  const [userPresets, setUserPresets] = useState<UserPreset[]>([])
  const [selected, setSelected] = useState('')
  const [naming, setNaming] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  useEffect(() => {
    void window.api.listPresets().then(setUserPresets)
  }, [])

  const presetSettings = useMemo((): Settings | undefined => {
    if (selected.startsWith(BUILTIN)) {
      const p = BUILTIN_PRESETS.find((b) => BUILTIN + b.id === selected)
      return p && builtinSettings(p)
    }
    return userPresets.find((u) => USER + u.id === selected)?.settings
  }, [selected, userPresets])

  const builtin = BUILTIN_PRESETS.find((b) => BUILTIN + b.id === selected)
  const user = userPresets.find((u) => USER + u.id === selected)
  const modified = presetSettings !== undefined && !sameSettings(presetSettings, settings)
  const selectedName = builtin?.name ?? user?.name ?? ''

  function choose(value: string): void {
    setSelected(value)
    setMessage(null)
    const next = value.startsWith(BUILTIN)
      ? (() => {
          const p = BUILTIN_PRESETS.find((b) => BUILTIN + b.id === value)
          return p && builtinSettings(p)
        })()
      : userPresets.find((u) => USER + u.id === value)?.settings
    if (next) onApply(next)
  }

  async function save(name: string): Promise<void> {
    const preset = await window.api.savePreset(name, settings)
    const list = await window.api.listPresets()
    setUserPresets(list)
    setSelected(USER + preset.id)
    setNaming(null)
    setMessage({ text: `"${preset.name}" 프리셋을 저장했습니다.` })
  }

  async function remove(): Promise<void> {
    if (!user) return
    await window.api.removePreset(user.id)
    setUserPresets(await window.api.listPresets())
    setSelected('')
    setMessage({ text: `"${user.name}" 프리셋을 지웠습니다.` })
  }

  async function exportPreset(): Promise<void> {
    const result = await window.api.exportPreset(selectedName || '내 설정', settings)
    if (result) setMessage(result.ok ? { text: `내보냈습니다: ${result.value}` } : { text: result.error, error: true })
  }

  async function importPreset(): Promise<void> {
    const result = await window.api.importPreset()
    if (!result) return
    if (!result.ok) {
      setMessage({ text: result.error, error: true })
      return
    }
    const list = await window.api.listPresets()
    setUserPresets(list)
    setSelected(USER + result.value.id)
    onApply(result.value.settings)
    setMessage({ text: `"${result.value.name}" 프리셋을 가져왔습니다.` })
  }

  return (
    <div className="preset-bar">
      <div className="preset-bar__row">
        <select value={selected} onChange={(e) => choose(e.target.value)} aria-label="프리셋">
          <option value="">프리셋 고르기…</option>
          <optgroup label="기본 프리셋">
            {BUILTIN_PRESETS.map((p) => (
              <option key={p.id} value={BUILTIN + p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {userPresets.length > 0 && (
            <optgroup label="내 프리셋">
              {userPresets.map((p) => (
                <option key={p.id} value={USER + p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {modified && (
          <button type="button" className="link" title="프리셋 값으로 되돌리기" onClick={() => presetSettings && onApply(presetSettings)}>
            바뀜 · 되돌리기
          </button>
        )}
      </div>
      {builtin && <p className="panel-note">{builtin.description}</p>}

      {naming === null ? (
        <div className="preset-bar__actions">
          <button type="button" className="link" onClick={() => setNaming(user?.name ?? '')}>
            현재 설정 저장…
          </button>
          <button type="button" className="link" onClick={() => void exportPreset()}>
            내보내기
          </button>
          <button type="button" className="link" onClick={() => void importPreset()}>
            가져오기
          </button>
          {user && (
            <button type="button" className="link link--danger" onClick={() => void remove()}>
              삭제
            </button>
          )}
        </div>
      ) : (
        <form
          className="preset-bar__save"
          onSubmit={(e) => {
            e.preventDefault()
            if (naming.trim()) void save(naming)
          }}
        >
          <input autoFocus type="text" placeholder="프리셋 이름" value={naming} onChange={(e) => setNaming(e.target.value)} aria-label="프리셋 이름" />
          <button type="submit" disabled={!naming.trim()}>
            저장
          </button>
          <button type="button" onClick={() => setNaming(null)}>
            취소
          </button>
        </form>
      )}
      {naming !== null && userPresets.some((p) => p.name === naming.trim()) && (
        <p className="panel-note">같은 이름의 프리셋을 덮어씁니다.</p>
      )}
      {message && <p className={message.error ? 'panel-note panel-note--error' : 'panel-note'}>{message.text}</p>}
    </div>
  )
}
