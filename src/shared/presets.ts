/** 프리셋: 이름 붙은 설정 묶음. 기본 프리셋은 기본 설정에서 바뀐 부분만 적는다. */

import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from './settings'

type Patch = { [K in keyof Settings]?: Partial<Settings[K]> }

export interface BuiltinPreset {
  id: string
  name: string
  description: string
  patch: Patch
}

export interface UserPreset {
  id: string
  name: string
  settings: Settings
}

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  {
    id: 'novel-a5',
    name: '소설 · 국판(A5)',
    description: '명조 10.5pt, 줄 간격 1.7배, 양면, 쪽 번호 바깥쪽',
    patch: {
      page: { paper: 'A5' },
      margins: { topMm: 20, bottomMm: 22, insideMm: 20, outsideMm: 15, mirrored: true },
      font: { family: 'Batang', generic: 'serif' },
      text: { sizing: 'fontSize', fontSizePt: 10.5, lineHeight: 1.7 },
      decor: { pageNumbers: 'bottom-outside', header: 'none' }
    }
  },
  {
    id: 'novel-shinguk',
    name: '소설 · 신국판',
    description: '152×225mm, 명조 10.5pt, 줄 간격 1.75배, 장 제목 머리글',
    patch: {
      page: { paper: 'shinguk' },
      margins: { topMm: 22, bottomMm: 24, insideMm: 22, outsideMm: 17, mirrored: true },
      font: { family: 'Batang', generic: 'serif' },
      text: { sizing: 'fontSize', fontSizePt: 10.5, lineHeight: 1.75 },
      decor: { pageNumbers: 'bottom-outside', header: 'chapterTitle' }
    }
  },
  {
    id: 'pocket-a6',
    name: '문고판(A6)',
    description: '작은 판형, 9pt, 좁은 여백',
    patch: {
      page: { paper: 'A6' },
      margins: { topMm: 12, bottomMm: 14, insideMm: 12, outsideMm: 9, mirrored: true },
      font: { family: 'Batang', generic: 'serif' },
      text: { sizing: 'fontSize', fontSizePt: 9, lineHeight: 1.6 },
      decor: { pageNumbers: 'bottom-center', header: 'none' }
    }
  },
  {
    id: 'lines-20',
    name: '쪽당 20줄 · A5',
    description: '줄 수를 고정하고 글자 크기를 맞춤',
    patch: {
      page: { paper: 'A5' },
      text: { sizing: 'linesPerPage', linesPerPage: 20, lineHeight: 1.7 }
    }
  },
  {
    id: 'textbook-b5',
    name: '교재 · B5',
    description: '고딕 10pt, 원본 스타일 유지, 장 제목 머리글',
    patch: {
      page: { paper: 'B5' },
      margins: { topMm: 22, bottomMm: 22, insideMm: 22, outsideMm: 18, mirrored: true },
      font: { family: 'Malgun Gothic', generic: 'sans-serif' },
      text: { sizing: 'fontSize', fontSizePt: 10, lineHeight: 1.65, align: 'justify' },
      decor: { pageNumbers: 'bottom-outside', header: 'chapterTitle' }
    }
  },
  {
    id: 'large-a4',
    name: '큰 글씨 · A4',
    description: '14pt, 넓은 줄 간격, 어절 단위 줄 바꿈',
    patch: {
      page: { paper: 'A4' },
      margins: { topMm: 25, bottomMm: 25, insideMm: 25, outsideMm: 25, mirrored: false },
      font: { family: 'Malgun Gothic', generic: 'sans-serif' },
      text: { sizing: 'fontSize', fontSizePt: 14, lineHeight: 1.7, wordBreak: 'keep-all' },
      decor: { pageNumbers: 'bottom-center', header: 'none' }
    }
  },
  {
    id: 'screen',
    name: '화면으로 읽기',
    description: '단면, 좌우 같은 여백, 원본 스타일 무시, 책 제목 머리글',
    patch: {
      page: { paper: 'A5' },
      margins: { topMm: 15, bottomMm: 15, insideMm: 14, outsideMm: 14, mirrored: false },
      font: { family: 'Malgun Gothic', generic: 'sans-serif' },
      text: { sizing: 'fontSize', fontSizePt: 11, lineHeight: 1.7 },
      layout: { epubStyles: 'ignore' },
      decor: { pageNumbers: 'bottom-center', header: 'bookTitle' }
    }
  }
]

/** 기본 프리셋의 전체 설정 (기본 설정 위에 바뀐 부분을 덮는다). */
export function builtinSettings(preset: BuiltinPreset): Settings {
  const d = DEFAULT_SETTINGS
  const p = preset.patch
  return normalizeSettings({
    page: { ...d.page, ...p.page },
    margins: { ...d.margins, ...p.margins },
    font: { ...d.font, ...p.font },
    text: { ...d.text, ...p.text },
    layout: { ...d.layout, ...p.layout },
    decor: { ...d.decor, ...p.decor },
    output: { ...d.output, ...p.output }
  })
}

/** 프리셋 파일 형식. 다른 사람과 주고받을 수 있다. */
export interface PresetFile {
  format: 'epubtopdf-preset'
  version: 1
  name: string
  settings: Settings
}

export function toPresetFile(name: string, settings: Settings): PresetFile {
  return { format: 'epubtopdf-preset', version: 1, name, settings }
}

/** 프리셋 파일을 읽는다. 설정 JSON만 있는 파일도 받아들인다. 형식이 아니면 undefined. */
export function parsePresetFile(raw: unknown, fallbackName: string): { name: string; settings: Settings } | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const obj = raw as Record<string, unknown>
  if (obj['format'] === 'epubtopdf-preset' && obj['settings'] && typeof obj['settings'] === 'object') {
    const name = typeof obj['name'] === 'string' && obj['name'].trim() ? obj['name'].trim() : fallbackName
    return { name, settings: normalizeSettings(obj['settings']) }
  }
  const groups = ['page', 'margins', 'font', 'text', 'layout', 'decor', 'output']
  if (groups.some((g) => g in obj)) return { name: fallbackName, settings: normalizeSettings(obj) }
  return undefined
}

/** 두 설정이 같은가 (프리셋에서 바뀌었는지 보여줄 때). */
export const sameSettings = (a: Settings, b: Settings): boolean => JSON.stringify(a) === JSON.stringify(b)
