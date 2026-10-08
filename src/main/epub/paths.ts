/**
 * EPUB 안의 경로 처리. 압축 파일 안의 경로는 항상 루트 기준 '/' 구분 경로이며
 * 앞에 '/'를 붙이지 않는다 (예: `OEBPS/Text/ch01.xhtml`).
 */

export function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

/** `.`과 `..`을 정리한다. 루트 밖으로 나가는 `..`은 버린다. */
export function normalizePath(path: string): string {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** 외부 링크(`https:`, `mailto:` 등)인지 확인한다. */
export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href)
}

export interface ResolvedHref {
  /** 압축 파일 안의 경로. 같은 문서 안의 링크(`#id`)면 기준 파일 경로. */
  path: string
  /** `#` 뒤의 조각 식별자 (없으면 빈 문자열). */
  fragment: string
}

/**
 * `baseFile`(문서 경로)을 기준으로 상대 href를 압축 파일 안의 경로로 바꾼다.
 * 외부 링크면 undefined.
 */
export function resolveHref(baseFile: string, href: string): ResolvedHref | undefined {
  const trimmed = href.trim()
  if (isExternalHref(trimmed)) return undefined
  const hashAt = trimmed.indexOf('#')
  const rawPath = hashAt < 0 ? trimmed : trimmed.slice(0, hashAt)
  const fragment = hashAt < 0 ? '' : safeDecode(trimmed.slice(hashAt + 1))
  const withoutQuery = rawPath.split('?')[0]!
  if (withoutQuery === '') return { path: baseFile, fragment }
  const decoded = safeDecode(withoutQuery)
  const joined = decoded.startsWith('/') ? decoded : `${dirname(baseFile)}/${decoded}`
  return { path: normalizePath(joined), fragment }
}

const EXTENSION_TYPES: Record<string, string> = {
  xhtml: 'application/xhtml+xml',
  xht: 'application/xhtml+xml',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  js: 'text/javascript',
  xml: 'application/xml',
  ncx: 'application/x-dtbncx+xml',
  opf: 'application/oebps-package+xml',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  smil: 'application/smil+xml'
}

export function mediaTypeFromPath(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return EXTENSION_TYPES[ext] ?? 'application/octet-stream'
}
