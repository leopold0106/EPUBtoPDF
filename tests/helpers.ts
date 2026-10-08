import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from '@shared/settings'

export type SettingsPatch = { [K in keyof Settings]?: Partial<Settings[K]> }

/** 기본 설정에서 일부 항목만 바꾼 설정을 만든다. */
export function makeSettings(patch: SettingsPatch = {}): Settings {
  const d = DEFAULT_SETTINGS
  return normalizeSettings({
    page: { ...d.page, ...patch.page },
    margins: { ...d.margins, ...patch.margins },
    font: { ...d.font, ...patch.font },
    text: { ...d.text, ...patch.text },
    layout: { ...d.layout, ...patch.layout },
    decor: { ...d.decor, ...patch.decor },
    output: { ...d.output, ...patch.output }
  })
}
