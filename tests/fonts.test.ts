import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { userFontLabel, userFontUrl } from '@shared/fonts'
import { FontRegistry, handleFontRequest } from '../src/main/fonts/registry'
import { fontMediaType, parseFontInfo } from '../src/main/fonts/sfnt'
import { buildTtc, buildTtf, buildWoff } from './fixtures/font-builder'

describe('parseFontInfo', () => {
  it('TTF에서 영어·한국어 계열 이름, 굵기, 기울임을 읽는다', () => {
    expect(parseFontInfo(buildTtf({ family: 'Nanum Myeongjo', korean: '나눔명조', weight: 700, italic: true }))).toEqual({
      family: 'Nanum Myeongjo',
      localizedFamily: '나눔명조',
      weight: 700,
      italic: true
    })
  })

  it('WOFF와 TTC도 읽는다', () => {
    expect(parseFontInfo(buildWoff({ family: 'Web Font', weight: 300 }))).toMatchObject({ family: 'Web Font', weight: 300 })
    expect(parseFontInfo(buildTtc({ family: 'Collection' }))).toMatchObject({ family: 'Collection', weight: 400 })
  })

  it('OS/2 표가 없으면 하위 이름에서 굵기와 기울임을 짐작한다', () => {
    expect(parseFontInfo(buildTtf({ family: 'Old', subfamily: 'Bold Italic', withOs2: false }))).toMatchObject({ weight: 700, italic: true })
  })

  it('글꼴이 아니면 undefined', () => {
    expect(parseFontInfo(new TextEncoder().encode('not a font at all'))).toBeUndefined()
    expect(parseFontInfo(new Uint8Array(3))).toBeUndefined()
  })

  it('확장자로 미디어 형식을 정한다', () => {
    expect(fontMediaType('a.TTF')).toBe('font/ttf')
    expect(fontMediaType('a.woff')).toBe('font/woff')
  })
})

describe('FontRegistry', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'epubtopdf-fonts-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('글꼴을 복사해 목록에 넣고, 다시 열어도 남아 있다', async () => {
    const src = join(dir, '내글꼴.ttf')
    await writeFile(src, buildTtf({ family: 'My Font', korean: '내 글꼴' }))
    const registry = new FontRegistry(join(dir, 'store'))
    const { added, failed } = await registry.add([src])
    expect(failed).toEqual([])
    expect(added).toEqual([expect.objectContaining({ family: 'My Font', localizedFamily: '내 글꼴', fileName: '내글꼴.ttf' })])
    expect(userFontLabel(added[0]!)).toBe('내 글꼴 (My Font)')

    const reopened = new FontRegistry(join(dir, 'store'))
    expect(await reopened.list()).toEqual(added)
    expect(await reopened.faces()).toEqual([{ family: 'My Font', url: userFontUrl(added[0]!.id), weight: '400', style: 'normal' }])
  })

  it('글꼴이 아닌 파일과 지원하지 않는 형식은 이유와 함께 거른다', async () => {
    await writeFile(join(dir, 'a.ttf'), 'garbage')
    await writeFile(join(dir, 'b.txt'), 'x')
    const { added, failed } = await new FontRegistry(join(dir, 'store')).add([join(dir, 'a.ttf'), join(dir, 'b.txt')])
    expect(added).toEqual([])
    expect(failed.map((f) => f.fileName)).toEqual(['a.ttf', 'b.txt'])
  })

  it('app-font:// 요청에 파일로 응답하고, 지우면 404', async () => {
    const src = join(dir, 'f.otf')
    const bytes = buildTtf({ family: 'F' })
    await writeFile(src, bytes)
    const registry = new FontRegistry(join(dir, 'store'))
    const [font] = (await registry.add([src])).added
    const res = await handleFontRequest(userFontUrl(font!.id), registry)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('font/otf')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)

    await registry.remove(font!.id)
    expect(await registry.list()).toEqual([])
    expect((await handleFontRequest(userFontUrl(font!.id), registry)).status).toBe(404)
    expect((await handleFontRequest('app-font://font/../../etc', registry)).status).toBe(404)
  })
})
