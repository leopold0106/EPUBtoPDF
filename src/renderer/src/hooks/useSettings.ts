import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from '@shared/settings'
import type { SettingsPatch } from '../components/SettingsPanel'

/** 한 단계 깊이의 설정 묶음을 합친다. */
export function applyPatch(settings: Settings, patch: SettingsPatch): Settings {
  const next = { ...settings } as Record<string, unknown>
  for (const [group, values] of Object.entries(patch)) {
    next[group] = { ...(settings[group as keyof Settings] as object), ...(values as object) }
  }
  return normalizeSettings(next)
}

/** 설정 상태. 처음에 저장된 설정을 불러오고, 바뀌면 잠시 뒤 저장한다. */
export function useSettings(): {
  settings: Settings
  loaded: boolean
  update(patch: SettingsPatch): void
  replace(settings: Settings): void
} {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    void window.api.loadSettings().then((s) => {
      setSettings(s)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!loaded) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void window.api.saveSettings(settings), 400)
    return () => clearTimeout(saveTimer.current)
  }, [settings, loaded])

  const update = useCallback((patch: SettingsPatch) => setSettings((prev) => applyPatch(prev, patch)), [])
  const replace = useCallback((next: Settings) => setSettings(normalizeSettings(next)), [])
  return { settings, loaded, update, replace }
}
