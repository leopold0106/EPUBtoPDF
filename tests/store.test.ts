import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findEpubArg } from '../src/main/launch'
import { JsonStore } from '../src/main/store'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'epubtopdf-store-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('JsonStore', () => {
  it('없는 파일이나 깨진 파일은 undefined', async () => {
    expect(await new JsonStore(join(dir, 'none.json')).read()).toBeUndefined()
    await writeFile(join(dir, 'bad.json'), '{ 깨짐')
    expect(await new JsonStore(join(dir, 'bad.json')).read()).toBeUndefined()
  })

  it('하위 폴더를 만들어 저장하고 다시 읽는다', async () => {
    const store = new JsonStore(join(dir, 'a/b/settings.json'))
    await store.write({ x: 1, 이름: '값' })
    expect(await store.read()).toEqual({ x: 1, 이름: '값' })
  })

  it('연달아 써도 마지막 값이 남는다', async () => {
    const store = new JsonStore(join(dir, 's.json'))
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.write({ i })))
    expect(JSON.parse(await readFile(store.file, 'utf8'))).toEqual({ i: 19 })
  })

  it('쓰기와 지우기는 요청한 순서대로 실행된다', async () => {
    const store = new JsonStore(join(dir, 'e.json'))
    void store.write({ a: 1 })
    void store.remove()
    await store.write({ a: 2 })
    expect(await store.read()).toEqual({ a: 2 })
    void store.write({ a: 3 })
    await store.remove()
    expect(await store.read()).toBeUndefined()
  })
})

describe('findEpubArg', () => {
  it('실행 인자 중 실제로 있는 마지막 .epub 파일', async () => {
    const book = join(dir, '책.EPUB')
    await writeFile(book, 'x')
    expect(findEpubArg(['app.exe', '--flag', book])).toBe(book)
    expect(findEpubArg(['app.exe', '책.EPUB'], dir)).toBe(book)
  })

  it('없는 파일, 옵션, 첫 인자(실행 파일)는 무시한다', () => {
    expect(findEpubArg(['x.epub', '--a.epub', join(dir, 'none.epub')])).toBeUndefined()
  })
})
