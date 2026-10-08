/** 사용자 글꼴 목록. `<앱 데이터>/fonts/`에 파일과 목록(fonts.json)을 둔다. */

import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { FontFaceSource } from '@shared/stylesheet'
import { userFontUrl, type UserFont } from '@shared/fonts'
import { JsonStore } from '../store'
import { fontMediaType, parseFontInfo } from './sfnt'

const EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.woff'])

interface StoredFont extends UserFont {
  /** 앱 데이터 폴더 안의 파일 이름. */
  file: string
}

export interface AddFontsResult {
  added: UserFont[]
  failed: { fileName: string; reason: string }[]
}

const publicFont = ({ file: _file, ...font }: StoredFont): UserFont => font

export class FontRegistry {
  private readonly store: JsonStore
  private cache?: StoredFont[]

  constructor(readonly dir: string) {
    this.store = new JsonStore(join(dir, 'fonts.json'))
  }

  private async load(): Promise<StoredFont[]> {
    if (this.cache) return this.cache
    const raw = await this.store.read()
    this.cache = Array.isArray(raw)
      ? raw.filter((f): f is StoredFont => typeof f?.id === 'string' && typeof f?.family === 'string' && typeof f?.file === 'string')
      : []
    return this.cache
  }

  async list(): Promise<UserFont[]> {
    return (await this.load()).map(publicFont)
  }

  async add(paths: string[]): Promise<AddFontsResult> {
    const fonts = await this.load()
    const result: AddFontsResult = { added: [], failed: [] }
    await mkdir(this.dir, { recursive: true })
    for (const path of paths) {
      const fileName = basename(path)
      const ext = extname(path).toLowerCase()
      if (!EXTENSIONS.has(ext)) {
        result.failed.push({ fileName, reason: 'TTF, OTF, TTC, WOFF 글꼴만 추가할 수 있습니다.' })
        continue
      }
      let info
      try {
        info = parseFontInfo(new Uint8Array(await readFile(path)))
      } catch {
        info = undefined
      }
      if (!info) {
        result.failed.push({ fileName, reason: '글꼴 파일을 읽을 수 없습니다.' })
        continue
      }
      const id = randomUUID().replace(/-/g, '')
      const file = `${id}${ext}`
      await copyFile(path, join(this.dir, file))
      const font: StoredFont = { id, ...info, fileName, file }
      fonts.push(font)
      result.added.push(publicFont(font))
    }
    await this.store.write(fonts)
    return result
  }

  async remove(id: string): Promise<void> {
    const fonts = await this.load()
    const font = fonts.find((f) => f.id === id)
    if (!font) return
    this.cache = fonts.filter((f) => f.id !== id)
    await this.store.write(this.cache)
    await rm(join(this.dir, font.file), { force: true })
  }

  async read(id: string): Promise<{ data: Uint8Array; mediaType: string } | undefined> {
    const font = (await this.load()).find((f) => f.id === id)
    if (!font) return undefined
    try {
      return { data: new Uint8Array(await readFile(join(this.dir, font.file))), mediaType: fontMediaType(font.file) }
    } catch {
      return undefined
    }
  }

  /** 문서에 넣을 @font-face 목록. */
  async faces(): Promise<FontFaceSource[]> {
    return (await this.load()).map((f) => ({
      family: f.family,
      url: userFontUrl(f.id),
      weight: String(f.weight),
      style: f.italic ? 'italic' : 'normal'
    }))
  }
}

/** `app-font://font/<id>` 요청에 글꼴 파일로 응답한다. */
export async function handleFontRequest(url: string, registry: FontRegistry): Promise<Response> {
  const id = /^app-font:\/\/font\/([0-9a-f]+)$/i.exec(url)?.[1]
  const font = id ? await registry.read(id) : undefined
  if (!font) return new Response('Not found', { status: 404 })
  return new Response(font.data as Uint8Array<ArrayBuffer>, {
    headers: { 'Content-Type': font.mediaType, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
  })
}
