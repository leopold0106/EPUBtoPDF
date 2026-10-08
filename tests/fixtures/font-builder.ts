/** 테스트용 최소 글꼴 파일: name 표와 OS/2 표만 있는 sfnt (글자 모양은 없다). */

import { deflateSync } from 'node:zlib'

interface Options {
  family: string
  korean?: string
  subfamily?: string
  weight?: number
  italic?: boolean
  /** OS/2 표를 빼면 굵기·기울임을 하위 이름(subfamily)에서 짐작한다. */
  withOs2?: boolean
}

function nameTable(records: { platform: number; encoding: number; language: number; nameId: number; value: string }[]): Uint8Array {
  const strings: Uint8Array[] = records.map((r) => {
    if (r.platform === 1) return new TextEncoder().encode(r.value)
    const out = new Uint8Array(r.value.length * 2)
    for (let i = 0; i < r.value.length; i++) {
      out[i * 2] = r.value.charCodeAt(i) >> 8
      out[i * 2 + 1] = r.value.charCodeAt(i) & 0xff
    }
    return out
  })
  const headerLen = 6 + records.length * 12
  const total = headerLen + strings.reduce((n, s) => n + s.length, 0)
  const buf = new Uint8Array(total)
  const v = new DataView(buf.buffer)
  v.setUint16(0, 0)
  v.setUint16(2, records.length)
  v.setUint16(4, headerLen)
  let offset = 0
  records.forEach((r, i) => {
    const at = 6 + i * 12
    v.setUint16(at, r.platform)
    v.setUint16(at + 2, r.encoding)
    v.setUint16(at + 4, r.language)
    v.setUint16(at + 6, r.nameId)
    v.setUint16(at + 8, strings[i]!.length)
    v.setUint16(at + 10, offset)
    buf.set(strings[i]!, headerLen + offset)
    offset += strings[i]!.length
  })
  return buf
}

function os2Table(weight: number, italic: boolean): Uint8Array {
  const buf = new Uint8Array(96)
  const v = new DataView(buf.buffer)
  v.setUint16(0, 4)
  v.setUint16(4, weight)
  v.setUint16(62, italic ? 0x01 : 0x40)
  return buf
}

function tables(o: Options): [string, Uint8Array][] {
  const records = [
    { platform: 1, encoding: 0, language: 0, nameId: 1, value: o.family },
    { platform: 3, encoding: 1, language: 0x0409, nameId: 1, value: o.family },
    { platform: 3, encoding: 1, language: 0x0409, nameId: 2, value: o.subfamily ?? 'Regular' }
  ]
  if (o.korean) records.push({ platform: 3, encoding: 1, language: 0x0412, nameId: 1, value: o.korean })
  const list: [string, Uint8Array][] = [['name', nameTable(records)]]
  if (o.withOs2 !== false) list.push(['OS/2', os2Table(o.weight ?? 400, o.italic ?? false)])
  return list.sort(([a], [b]) => (a < b ? -1 : 1))
}

const pad4 = (n: number): number => (n + 3) & ~3

export function buildTtf(o: Options): Uint8Array {
  const list = tables(o)
  const headerLen = 12 + list.length * 16
  const total = headerLen + list.reduce((n, [, d]) => n + pad4(d.length), 0)
  const buf = new Uint8Array(total)
  const v = new DataView(buf.buffer)
  v.setUint32(0, 0x00010000)
  v.setUint16(4, list.length)
  let offset = headerLen
  list.forEach(([tag, data], i) => {
    const at = 12 + i * 16
    for (let c = 0; c < 4; c++) v.setUint8(at + c, tag.charCodeAt(c))
    v.setUint32(at + 8, offset)
    v.setUint32(at + 12, data.length)
    buf.set(data, offset)
    offset += pad4(data.length)
  })
  return buf
}

export function buildWoff(o: Options): Uint8Array {
  const list = tables(o).map(([tag, data]) => [tag, data, new Uint8Array(deflateSync(data))] as const)
  const headerLen = 44 + list.length * 20
  const total = headerLen + list.reduce((n, [, , c]) => n + pad4(c.length), 0)
  const buf = new Uint8Array(total)
  const v = new DataView(buf.buffer)
  v.setUint32(0, 0x774f4646) // 'wOFF'
  v.setUint16(12, list.length)
  let offset = headerLen
  list.forEach(([tag, data, comp], i) => {
    const at = 44 + i * 20
    for (let c = 0; c < 4; c++) v.setUint8(at + c, tag.charCodeAt(c))
    v.setUint32(at + 4, offset)
    v.setUint32(at + 8, comp.length)
    v.setUint32(at + 12, data.length)
    buf.set(comp, offset)
    offset += pad4(comp.length)
  })
  return buf
}

/** 글꼴 하나를 담은 TTC. */
export function buildTtc(o: Options): Uint8Array {
  const ttf = buildTtf(o)
  const header = 16
  const buf = new Uint8Array(header + ttf.length)
  const v = new DataView(buf.buffer)
  v.setUint32(0, 0x74746366) // 'ttcf'
  v.setUint32(4, 0x00010000)
  v.setUint32(8, 1)
  v.setUint32(12, header)
  // 표 위치는 파일 처음 기준이므로 header만큼 옮긴다.
  const shifted = new Uint8Array(ttf)
  const sv = new DataView(shifted.buffer)
  const n = sv.getUint16(4)
  for (let i = 0; i < n; i++) sv.setUint32(12 + i * 16 + 8, sv.getUint32(12 + i * 16 + 8) + header)
  buf.set(shifted, header)
  return buf
}
