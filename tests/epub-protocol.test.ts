import { describe, expect, it } from 'vitest'
import { openEpub } from '../src/main/epub/parse'
import { handleResourceRequest, parseResourceUrl, resourceUrl } from '../src/main/epub/protocol'
import { buildSampleBook } from './fixtures/sample-book'

describe('리소스 URL', () => {
  it('한글과 공백이 있는 경로도 그대로 되돌릴 수 있다', () => {
    const url = resourceUrl('abc123', 'OEBPS/Text/제 1장.xhtml')
    expect(url).toBe('epub://abc123/OEBPS/Text/%EC%A0%9C%201%EC%9E%A5.xhtml')
    expect(parseResourceUrl(url)).toEqual({ bookId: 'abc123', path: 'OEBPS/Text/제 1장.xhtml' })
  })

  it('형식이 맞지 않으면 undefined', () => {
    expect(parseResourceUrl('https://abc/a.xhtml')).toBeUndefined()
    expect(parseResourceUrl('not a url')).toBeUndefined()
    expect(parseResourceUrl('epub://abc/%E0%A4%A')).toBeUndefined()
  })

  it('경로의 조회 문자열과 조각 식별자는 무시한다', () => {
    expect(parseResourceUrl('epub://abc/a/b.css?v=1#x')).toEqual({ bookId: 'abc', path: 'a/b.css' })
  })
})

describe('handleResourceRequest', () => {
  it('EPUB 안의 파일을 미디어 형식과 함께 돌려준다', async () => {
    const book = await openEpub(await buildSampleBook(), 'a.epub')
    const find = (id: string) => (id === book.id ? book : undefined)

    const page = await handleResourceRequest(resourceUrl(book.id, 'OEBPS/Text/chapter 01.xhtml'), find)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toBe('application/xhtml+xml')
    expect(await page.text()).toContain('제1장 강가의 아침')

    const css = await handleResourceRequest(resourceUrl(book.id, 'OEBPS/Styles/style.css'), find)
    expect(css.headers.get('content-type')).toBe('text/css')

    const png = await handleResourceRequest(resourceUrl(book.id, 'OEBPS/Images/river.png'), find)
    expect(png.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await png.arrayBuffer()).subarray(1, 4)).toEqual(new TextEncoder().encode('PNG'))
  })

  it('없는 책이나 파일이면 404', async () => {
    const book = await openEpub(await buildSampleBook(), 'a.epub')
    const find = (id: string) => (id === book.id ? book : undefined)
    expect((await handleResourceRequest(resourceUrl('nope', 'OEBPS/content.opf'), find)).status).toBe(404)
    expect((await handleResourceRequest(resourceUrl(book.id, 'OEBPS/none.png'), find)).status).toBe(404)
    expect((await handleResourceRequest('epub://' + book.id + '/../../etc/passwd', find)).status).toBe(404)
  })
})
