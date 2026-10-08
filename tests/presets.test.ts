import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_PRESETS, builtinSettings, parsePresetFile, sameSettings, toPresetFile } from '@shared/presets'
import { DEFAULT_SETTINGS, normalizeSettings } from '@shared/settings'
import { validateSettings } from '@shared/typography'
import { PresetStore } from '../src/main/presets'

describe('기본 프리셋', () => {
  it('id가 겹치지 않는다', () => {
    expect(new Set(BUILTIN_PRESETS.map((p) => p.id)).size).toBe(BUILTIN_PRESETS.length)
  })

  it.each(BUILTIN_PRESETS.map((p) => [p.name, p] as const))('%s: 오류·경고 없이 기본값과 다른 설정이 된다', (_name, preset) => {
    const settings = builtinSettings(preset)
    expect(validateSettings(settings)).toEqual([])
    expect(sameSettings(settings, DEFAULT_SETTINGS)).toBe(false)
    // 정규화해도 바뀌지 않는다 (잘못된 값이 섞여 있지 않다).
    expect(normalizeSettings(settings)).toEqual(settings)
  })
})

describe('프리셋 파일', () => {
  it('내보낸 파일을 그대로 가져올 수 있다', () => {
    const settings = builtinSettings(BUILTIN_PRESETS[0]!)
    const file = JSON.parse(JSON.stringify(toPresetFile('내 설정', settings)))
    expect(parsePresetFile(file, 'x')).toEqual({ name: '내 설정', settings })
  })

  it('설정 JSON만 있는 파일도 받아들이고 파일 이름을 이름으로 쓴다', () => {
    expect(parsePresetFile({ text: { fontSizePt: 12 } }, '파일이름')).toEqual({
      name: '파일이름',
      settings: normalizeSettings({ text: { fontSizePt: 12 } })
    })
  })

  it('프리셋이 아니면 undefined', () => {
    expect(parsePresetFile([1, 2], 'x')).toBeUndefined()
    expect(parsePresetFile({ hello: 1 }, 'x')).toBeUndefined()
    expect(parsePresetFile('text', 'x')).toBeUndefined()
  })
})

describe('PresetStore', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'epubtopdf-presets-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('저장·목록·삭제, 같은 이름은 덮어쓴다', async () => {
    const store = new PresetStore(join(dir, 'presets.json'))
    const a = await store.save(' 소설용 ', DEFAULT_SETTINGS)
    expect(a.name).toBe('소설용')
    const b = await store.save('소설용', { ...DEFAULT_SETTINGS, text: { ...DEFAULT_SETTINGS.text, fontSizePt: 12 } })
    expect(b.id).toBe(a.id)
    expect((await store.list()).map((p) => p.settings.text.fontSizePt)).toEqual([12])
    await store.save('다른 것', DEFAULT_SETTINGS)
    await store.remove(a.id)
    expect((await new PresetStore(join(dir, 'presets.json')).list()).map((p) => p.name)).toEqual(['다른 것'])
  })

  it('저장된 설정이 깨져 있어도 정규화해서 읽는다', async () => {
    const store = new PresetStore(join(dir, 'presets.json'))
    await store.save('x', { text: { fontSizePt: 'abc' } })
    expect((await store.list())[0]!.settings).toEqual(DEFAULT_SETTINGS)
  })
})
