/**
 * `epub://<책 ID>/<압축 파일 안의 경로>` 요청을 EPUB 안의 파일로 응답한다.
 * 장(章) 문서를 이 주소로 열면 문서 안의 상대 경로(그림, CSS, 글꼴)가 그대로 동작한다.
 */

import { RENDER_PAGE_PATH } from '@shared/render'
import { EpubError } from './errors'
import type { EpubBook } from './parse'

export const EPUB_SCHEME = 'epub'

export function resourceUrl(bookId: string, path: string): string {
  return `${EPUB_SCHEME}://${bookId}/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** URL을 책 ID와 경로로 나눈다. 형식이 맞지 않으면 undefined. */
export function parseResourceUrl(url: string): { bookId: string; path: string } | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== `${EPUB_SCHEME}:` || !parsed.hostname) return undefined
  let path: string
  try {
    path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  } catch {
    return undefined
  }
  return { bookId: parsed.hostname, path }
}

/**
 * 렌더링 창이 여는 빈 문서. 책 내용은 preload가 채운다.
 * 책에 들어 있을 수 있는 스크립트는 실행하지 않고, 외부 주소에서는 아무것도 불러오지 않는다.
 */
const RENDER_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>EPUBtoPDF</title>
<style>html { scrollbar-width: none; }</style>
</head><body></body></html>`

export const RENDER_PAGE_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src epub: 'unsafe-inline'",
  'img-src epub: data: blob:',
  'font-src epub: data:',
  'media-src epub: data:',
  'connect-src epub:'
].join('; ')

export async function handleResourceRequest(
  url: string,
  findBook: (id: string) => EpubBook | undefined
): Promise<Response> {
  const parsed = parseResourceUrl(url)
  const book = parsed && findBook(parsed.bookId)
  if (book && parsed.path === RENDER_PAGE_PATH) {
    return new Response(RENDER_PAGE, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': RENDER_PAGE_CSP,
        'Cache-Control': 'no-store'
      }
    })
  }
  if (!parsed || !book || !book.hasResource(parsed.path)) {
    return new Response('Not found', { status: 404 })
  }
  try {
    const { data, mediaType } = await book.readResource(parsed.path)
    // charset은 붙이지 않는다. 문서의 BOM이나 XML 선언, @charset을 브라우저가 따르게 한다.
    return new Response(data as Uint8Array<ArrayBuffer>, {
      status: 200,
      headers: { 'Content-Type': mediaType, 'Cache-Control': 'no-store' }
    })
  } catch (err) {
    const status = err instanceof EpubError && err.code === 'drm' ? 403 : 500
    return new Response(err instanceof Error ? err.message : 'Error', { status })
  }
}
