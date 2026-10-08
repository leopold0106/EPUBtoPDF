/**
 * 글꼴 파일(TTF, OTF, TTC, WOFF)에서 글꼴 이름·굵기·기울임을 읽는다.
 * name 표의 글꼴 계열 이름(ID 16, 없으면 1)과 OS/2 표의 굵기·기울임 비트만 본다.
 */

import { inflateSync } from 'node:zlib'

export interface FontInfo {
  family: string
  /** 한국어 이름이 따로 있으면 (예: 나눔명조). */
  localizedFamily?: string
  weight: number
  italic: boolean
}

interface Table {
  data: Uint8Array
}

const tag = (view: DataView, at: number): string =>
  String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3))

/** 표 이름 → 표 내용 (WOFF는 압축을 푼다). */
function readTables(bytes: Uint8Array): Map<string, Table> | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 12) return undefined
  const signature = tag(view, 0)
  const tables = new Map<string, Table>()

  if (signature === 'wOFF') {
    const numTables = view.getUint16(12)
    for (let i = 0; i < numTables; i++) {
      const at = 44 + i * 20
      const name = tag(view, at)
      const offset = view.getUint32(at + 4)
      const compLength = view.getUint32(at + 8)
      const origLength = view.getUint32(at + 12)
      const raw = bytes.subarray(offset, offset + compLength)
      tables.set(name, { data: compLength < origLength ? new Uint8Array(inflateSync(raw)) : raw })
    }
    return tables
  }

  let base = 0
  if (signature === 'ttcf') base = view.getUint32(12) // 모음 글꼴은 첫 글꼴
  const version = view.getUint32(base)
  if (version !== 0x00010000 && tag(view, base) !== 'OTTO' && tag(view, base) !== 'true') return undefined
  const numTables = view.getUint16(base + 4)
  for (let i = 0; i < numTables; i++) {
    const at = base + 12 + i * 16
    const offset = view.getUint32(at + 8)
    const length = view.getUint32(at + 12)
    tables.set(tag(view, at), { data: bytes.subarray(offset, offset + length) })
  }
  return tables
}

interface NameRecord {
  platform: number
  language: number
  nameId: number
  value: string
}

function readNames(data: Uint8Array): NameRecord[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const count = view.getUint16(2)
  const stringsAt = view.getUint16(4)
  const out: NameRecord[] = []
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12
    const platform = view.getUint16(at)
    const encoding = view.getUint16(at + 2)
    const language = view.getUint16(at + 4)
    const nameId = view.getUint16(at + 6)
    const length = view.getUint16(at + 8)
    const offset = view.getUint16(at + 10)
    const raw = data.subarray(stringsAt + offset, stringsAt + offset + length)
    let value: string
    if (platform === 3 || platform === 0) {
      value = new TextDecoder('utf-16be').decode(raw)
    } else if (platform === 1 && encoding === 0) {
      value = new TextDecoder('latin1').decode(raw)
    } else {
      continue
    }
    out.push({ platform, language, nameId, value: value.replace(/\u0000/g, '').trim() })
  }
  return out
}

const ENGLISH_US = 0x0409
const KOREAN = 0x0412

export function parseFontInfo(bytes: Uint8Array): FontInfo | undefined {
  try {
    const tables = readTables(bytes)
    const name = tables?.get('name')
    if (!name) return undefined
    const names = readNames(name.data)
    const pick = (id: number, language?: number): string | undefined =>
      names.find((n) => n.nameId === id && n.value && (language === undefined || (n.platform === 3 && n.language === language)))?.value
    const familyOf = (language?: number): string | undefined => pick(16, language) ?? pick(1, language)
    const family = familyOf(ENGLISH_US) ?? familyOf()
    if (!family) return undefined
    const korean = familyOf(KOREAN)

    let weight = 400
    let italic = false
    const os2 = tables!.get('OS/2')
    if (os2 && os2.data.length >= 64) {
      const v = new DataView(os2.data.buffer, os2.data.byteOffset, os2.data.byteLength)
      weight = v.getUint16(4) || 400
      italic = (v.getUint16(62) & 0x01) !== 0
    } else {
      const sub = (pick(17) ?? pick(2) ?? '').toLowerCase()
      if (sub.includes('bold')) weight = 700
      italic = sub.includes('italic') || sub.includes('oblique')
    }
    return { family, localizedFamily: korean && korean !== family ? korean : undefined, weight, italic }
  } catch {
    return undefined
  }
}

export function fontMediaType(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
  return { ttf: 'font/ttf', ttc: 'font/collection', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }[ext] ?? 'application/octet-stream'
}
