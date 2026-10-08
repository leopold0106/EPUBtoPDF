/**
 * 테스트용 EPUB을 메모리에서 만든다. 규격을 어긴 EPUB도 만들 수 있도록 대부분을 옵션으로 연다.
 */

import { deflateSync, crc32 } from 'node:zlib'
import JSZip from 'jszip'
import { adobeKey, idpfKey, xorPrefix, ADOBE_ALGORITHM, IDPF_ALGORITHM } from '../../src/main/epub/obfuscation'

export interface FixtureChapter {
  id: string
  /** OPF 폴더 기준 경로 (예: `Text/ch01.xhtml`). */
  href: string
  title: string
  /** `<body>` 안의 XHTML. */
  body: string
  linear?: boolean
  /** 목차에 넣을 하위 항목 (조각 식별자와 제목). */
  sections?: { fragment: string; title: string }[]
  /** 목차에서 뺀다. */
  hideFromToc?: boolean
}

export interface FixtureResource {
  href: string
  mediaType: string
  data: string | Uint8Array
  properties?: string
  obfuscation?: 'idpf' | 'adobe' | 'drm'
}

export interface FixtureOptions {
  version?: 2 | 3
  title?: string
  creators?: string[]
  language?: string
  identifier?: string
  opfDir?: string
  chapters: FixtureChapter[]
  css?: string
  resources?: FixtureResource[]
  /** EPUB 3 nav 문서를 넣을지 (기본: 버전 3이면 넣음). */
  nav?: boolean
  /** NCX를 넣을지 (기본: 넣음). */
  ncx?: boolean
  container?: boolean
  coverHref?: string
  direction?: 'ltr' | 'rtl'
  /** spine에 manifest에 없는 idref를 끼워 넣는다. */
  danglingSpineRef?: string
  /** 압축 파일에 그대로 추가할 파일. */
  extraFiles?: Record<string, string | Uint8Array>
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function xhtml(title: string, body: string, cssHref?: string, lang = 'ko'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
<meta charset="UTF-8"/>
<title>${esc(title)}</title>
${cssHref ? `<link rel="stylesheet" type="text/css" href="${esc(cssHref)}"/>` : ''}
</head>
<body>
${body}
</body>
</html>
`
}

/** 같은 폴더 깊이를 가정하지 않고 `from` 문서에서 `to`로 가는 상대 경로. */
function relative(from: string, to: string): string {
  const a = from.split('/').slice(0, -1)
  const b = to.split('/')
  let i = 0
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/')
}

export async function buildEpub(opts: FixtureOptions): Promise<Uint8Array> {
  const version = opts.version ?? 3
  const title = opts.title ?? '테스트 책'
  const identifier = opts.identifier ?? 'urn:uuid:12345678-1234-5678-1234-567812345678'
  const opfDir = opts.opfDir ?? 'OEBPS'
  const withNav = opts.nav ?? version === 3
  const withNcx = opts.ncx ?? true
  const prefix = opfDir ? `${opfDir}/` : ''
  const zip = new JSZip()

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  if (opts.container ?? true) {
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="${prefix}content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
    )
  }

  const manifest: string[] = []
  const cssHref = opts.css !== undefined ? 'Styles/style.css' : undefined
  if (cssHref) {
    zip.file(prefix + cssHref, opts.css!)
    manifest.push(`<item id="css" href="${cssHref}" media-type="text/css"/>`)
  }

  for (const ch of opts.chapters) {
    const css = cssHref && relative(ch.href, cssHref)
    zip.file(prefix + ch.href, xhtml(ch.title, ch.body, css))
    manifest.push(`<item id="${ch.id}" href="${esc(encodeURI(ch.href))}" media-type="application/xhtml+xml"/>`)
  }

  const encrypted: string[] = []
  for (const [i, res] of (opts.resources ?? []).entries()) {
    let data = typeof res.data === 'string' ? new TextEncoder().encode(res.data) : res.data
    if (res.obfuscation === 'idpf') data = xorPrefix(data, idpfKey(identifier), 1040)
    if (res.obfuscation === 'adobe') data = xorPrefix(data, adobeKey([identifier])!, 1024)
    if (res.obfuscation) {
      const algorithm =
        res.obfuscation === 'idpf'
          ? IDPF_ALGORITHM
          : res.obfuscation === 'adobe'
            ? ADOBE_ALGORITHM
            : 'http://www.w3.org/2001/04/xmlenc#aes128-cbc'
      encrypted.push(
        `<enc:EncryptedData><enc:EncryptionMethod Algorithm="${algorithm}"/>` +
          `<enc:CipherData><enc:CipherReference URI="${prefix}${res.href}"/></enc:CipherData></enc:EncryptedData>`
      )
    }
    zip.file(prefix + res.href, data)
    const props = res.properties ? ` properties="${res.properties}"` : ''
    manifest.push(`<item id="res${i}" href="${esc(res.href)}" media-type="${res.mediaType}"${props}/>`)
  }
  if (encrypted.length > 0) {
    zip.file(
      'META-INF/encryption.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
${encrypted.join('\n')}
</encryption>`
    )
  }

  const tocChapters = opts.chapters.filter((c) => !c.hideFromToc)

  if (withNav) {
    const items = tocChapters
      .map((c) => {
        const sub = c.sections?.length
          ? `<ol>${c.sections.map((s) => `<li><a href="${esc(c.href)}#${s.fragment}">${esc(s.title)}</a></li>`).join('')}</ol>`
          : ''
        return `<li><a href="${esc(encodeURI(c.href))}">${esc(c.title)}</a>${sub}</li>`
      })
      .join('\n')
    zip.file(
      `${prefix}nav.xhtml`,
      xhtml('목차', `<nav epub:type="toc" id="toc"><h1>목차</h1><ol>\n${items}\n</ol></nav>\n<nav epub:type="landmarks"><ol><li><a epub:type="bodymatter" href="${esc(opts.chapters[0]?.href ?? '')}">본문</a></li></ol></nav>`)
    )
    manifest.push(`<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`)
  }

  if (withNcx) {
    let order = 0
    const points = tocChapters
      .map((c) => {
        const sub = (c.sections ?? [])
          .map(
            (s) =>
              `<navPoint id="np${++order}" playOrder="${order}"><navLabel><text>${esc(s.title)}</text></navLabel><content src="${esc(c.href)}#${s.fragment}"/></navPoint>`
          )
          .join('')
        return `<navPoint id="np${++order}" playOrder="${order}"><navLabel><text>${esc(c.title)}</text></navLabel><content src="${esc(encodeURI(c.href))}"/>${sub}</navPoint>`
      })
      .join('\n')
    zip.file(
      `${prefix}toc.ncx`,
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${esc(identifier)}"/></head>
<docTitle><text>${esc(title)}</text></docTitle>
<navMap>
${points}
</navMap>
</ncx>`
    )
    manifest.push(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`)
  }

  const spine = opts.chapters.map((c) => `<itemref idref="${c.id}"${c.linear === false ? ' linear="no"' : ''}/>`)
  if (opts.danglingSpineRef) spine.splice(1, 0, `<itemref idref="${opts.danglingSpineRef}"/>`)

  const coverIndex = opts.resources?.findIndex((r) => r.href === opts.coverHref) ?? -1
  const creators = (opts.creators ?? ['홍길동']).map((c) => `<dc:creator>${esc(c)}</dc:creator>`).join('\n    ')
  const coverMeta = version === 2 && coverIndex >= 0 ? `<meta name="cover" content="res${coverIndex}"/>` : ''
  const modified = version === 3 ? `<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>` : ''

  zip.file(
    `${prefix}content.opf`,
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="${version}.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="bookid">${esc(identifier)}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    ${creators}
    <dc:language>${opts.language ?? 'ko'}</dc:language>
    <dc:publisher>테스트 출판사</dc:publisher>
    ${coverMeta}
    ${modified}
  </metadata>
  <manifest>
    ${manifest.join('\n    ')}
  </manifest>
  <spine${withNcx ? ' toc="ncx"' : ''}${opts.direction ? ` page-progression-direction="${opts.direction}"` : ''}>
    ${spine.join('\n    ')}
  </spine>
</package>`
  )

  for (const [path, data] of Object.entries(opts.extraFiles ?? {})) zip.file(path, data)

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

// ---------------------------------------------------------------------------
// 작은 PNG 인코더 (테스트용 그림)

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** 가로 그라데이션 RGB PNG. */
export function gradientPng(width: number, height: number, from: [number, number, number], to: [number, number, number]): Uint8Array {
  const raw = new Uint8Array((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    for (let x = 0; x < width; x++) {
      const t = width > 1 ? x / (width - 1) : 0
      for (let c = 0; c < 3; c++) raw[row + 1 + x * 3 + c] = Math.round(from[c]! + (to[c]! - from[c]!) * t)
    }
  }
  const ihdr = new Uint8Array(13)
  const v = new DataView(ihdr.buffer)
  v.setUint32(0, width)
  v.setUint32(4, height)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(deflateSync(raw))),
    pngChunk('IEND', new Uint8Array())
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}
