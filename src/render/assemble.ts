/**
 * 렌더링 창 안에서 여러 장(XHTML 문서)을 하나의 HTML 문서로 조립한다.
 *
 *  - 각 장의 <body> 내용을 `<section class="epubtopdf-chapter">`로 감싸 이어 붙인다.
 *  - 상대 URL(그림, CSS, 글꼴)은 장 문서 기준의 절대 `epub://` URL로 바꾼다.
 *  - 다른 장을 가리키는 링크는 문서 안의 `#id` 링크로 바꿔 PDF 안에서 동작하게 한다.
 *  - 여러 장에 같은 id가 있으면 두 번째부터 이름을 바꾼다 (첫 번째는 원본 CSS의 #id 규칙이 그대로 맞도록 둔다).
 *  - 스크립트와 이벤트 처리기 속성은 지운다.
 *
 * DOM API만 쓰므로 jsdom에서도 테스트할 수 있다. 리소스 로딩을 기다리는 일은 `waitForResources`가 한다.
 */

import { imageKey } from '@shared/edits'
import type { AssemblePayload, AssembleResult, ImageInfo, ListImagesPayload } from '@shared/render'
import { CHAPTER_CLASS } from '@shared/stylesheet'

const XHTML_NS = 'http://www.w3.org/1999/xhtml'
const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

export const chapterAnchorId = (index: number): string => `epubtopdf-c${index}`
export const USER_STYLE_ID = 'epubtopdf-user-style'
/** 조립한 문서에서 그림 요소에 붙이는 속성. 값은 `imageKey`. */
export const IMAGE_KEY_ATTR = 'data-epubtopdf-image'

/** 그림으로 세는 요소: HTML의 img와 SVG의 image. 그림 번호는 이 요소들의 문서 순서로 매긴다. */
export function isImageElement(el: Element): boolean {
  const name = el.localName.toLowerCase()
  return (name === 'img' && el.namespaceURI !== SVG_NS) || (name === 'image' && el.namespaceURI === SVG_NS)
}

/** 장 문서에서 본문으로 옮길 부분. 본문이 SVG 하나뿐인 문서면 그 SVG. */
function contentRoot(source: Document): Element {
  const root = source.documentElement
  return source.body ?? root
}

function imageHref(el: Element): string | null {
  if (el.localName.toLowerCase() === 'img') return el.getAttribute('src')
  return el.getAttribute('href') ?? el.getAttributeNS(XLINK_NS, 'href')
}

/** XHTML로 읽고, 형식이 깨졌으면 HTML로 다시 읽는다. */
export function parseChapter(text: string, parser: DOMParser): Document {
  const xml = parser.parseFromString(text, 'application/xhtml+xml')
  const root = xml.documentElement
  const ok =
    !xml.getElementsByTagName('parsererror').length &&
    root &&
    (root.namespaceURI === XHTML_NS || (root.namespaceURI === SVG_NS && root.localName === 'svg'))
  return ok ? xml : parser.parseFromString(text, 'text/html')
}

/** URL 비교용: 조각 식별자와 조회 문자열을 뗀 주소. */
function documentKey(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname}`
}

function tryUrl(value: string, base: string): URL | undefined {
  try {
    return new URL(value, base)
  } catch {
    return undefined
  }
}

function decodeFragment(hash: string): string {
  const raw = hash.replace(/^#/, '')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

interface ChapterContext {
  index: number
  url: string
  ids: Map<string, string>
}

interface BookContext {
  /** 문서 주소 → 읽기 순서 위치 */
  spineIndex: Map<string, number>
  /** 이번에 렌더링하는 장의 id 대응표 */
  rendered: Map<number, ChapterContext>
}

/** CSS 텍스트 안의 url()과 @import 주소를 고친다. */
export function rewriteCssUrls(css: string, base: string, mapFragment: (id: string) => string): string {
  const fix = (value: string): string => {
    if (value.startsWith('#')) return `#${mapFragment(decodeFragment(value))}`
    if (/^(data|blob):/i.test(value)) return value
    return tryUrl(value, base)?.href ?? value
  }
  return css
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_m, q: string, v: string) => `url(${q}${fix(v)}${q})`)
    .replace(/@import\s+(['"])(.*?)\1/gi, (_m, q: string, v: string) => `@import ${q}${fix(v)}${q}`)
}

function rewriteSrcset(value: string, base: string): string {
  // data: URL에는 쉼표가 들어 있어 나눌 수 없다.
  if (value.includes('data:')) return value
  return value
    .split(',')
    .map((part) => {
      const [url, ...rest] = part.trim().split(/\s+/)
      if (!url) return part
      return [tryUrl(url, base)?.href ?? url, ...rest].join(' ')
    })
    .join(', ')
}

const RESOURCE_ATTRS: Record<string, string[]> = {
  img: ['src'],
  source: ['src'],
  video: ['src', 'poster'],
  audio: ['src'],
  track: ['src'],
  embed: ['src'],
  iframe: ['src'],
  input: ['src'],
  object: ['data'],
  table: ['background'],
  td: ['background'],
  th: ['background'],
  body: ['background']
}

function rewriteLink(el: Element, attr: string, value: string, chapter: ChapterContext, book: BookContext): void {
  const url = tryUrl(value, chapter.url)
  if (!url) {
    el.removeAttribute(attr)
    return
  }
  if (url.protocol !== 'epub:') {
    // 웹 주소는 PDF에서도 바깥 링크로 남긴다.
    if (!/^(https?|mailto):$/.test(url.protocol)) el.removeAttribute(attr)
    return
  }
  const target = book.spineIndex.get(documentKey(url))
  const targetChapter = target === undefined ? undefined : book.rendered.get(target)
  if (!targetChapter) {
    // 이번에 렌더링하지 않는 장이나 본문이 아닌 파일을 가리키는 링크
    el.removeAttribute(attr)
    return
  }
  const fragment = decodeFragment(url.hash)
  const id = fragment ? (targetChapter.ids.get(fragment) ?? fragment) : chapterAnchorId(targetChapter.index)
  el.setAttribute(attr, `#${id}`)
}

function processElement(el: Element, chapter: ChapterContext, book: BookContext, keepStyles: boolean): void {
  const name = el.localName.toLowerCase()
  const mapId = (id: string): string => chapter.ids.get(id) ?? id

  for (const attr of [...el.attributes]) {
    const attrName = attr.name.toLowerCase()
    if (attrName.startsWith('on')) {
      el.removeAttributeNode(attr)
    } else if (attrName === 'style') {
      if (keepStyles || el.namespaceURI === SVG_NS) {
        attr.value = rewriteCssUrls(attr.value, chapter.url, mapId)
      } else {
        el.removeAttributeNode(attr)
      }
    } else if (attr.value.includes('url(')) {
      // SVG의 fill="url(#grad)" 같은 속성
      attr.value = rewriteCssUrls(attr.value, chapter.url, mapId)
    }
  }

  if (name === 'a' || name === 'area') {
    const href = el.getAttribute('href') ?? el.getAttributeNS(XLINK_NS, 'href')
    if (href !== null) {
      const attr = el.hasAttribute('href') ? 'href' : 'xlink:href'
      if (href.startsWith('#')) el.setAttribute(attr, `#${mapId(decodeFragment(href))}`)
      else rewriteLink(el, attr, href, chapter, book)
    }
    return
  }

  if (el.namespaceURI === SVG_NS && (name === 'image' || name === 'use' || name === 'feimage')) {
    for (const [ns, attrName] of [
      [null, 'href'],
      [XLINK_NS, 'href']
    ] as const) {
      const value = ns ? el.getAttributeNS(ns, attrName) : el.getAttribute(attrName)
      if (value === null) continue
      const fixed = value.startsWith('#') ? `#${mapId(decodeFragment(value))}` : (tryUrl(value, chapter.url)?.href ?? value)
      if (ns) el.setAttributeNS(ns, 'xlink:href', fixed)
      else el.setAttribute(attrName, fixed)
    }
    return
  }

  for (const attrName of RESOURCE_ATTRS[name] ?? []) {
    const value = el.getAttribute(attrName)
    if (value !== null && value !== '') el.setAttribute(attrName, tryUrl(value, chapter.url)?.href ?? value)
  }
  if (name === 'img' || name === 'source') {
    const srcset = el.getAttribute('srcset')
    if (srcset) el.setAttribute('srcset', rewriteSrcset(srcset, chapter.url))
    // 인쇄할 때 화면 밖 그림도 불러오게 한다.
    el.removeAttribute('loading')
  }
}

const REMOVED_ELEMENTS = 'script, base, meta, title'

export function assembleBook(
  doc: Document,
  payload: AssemblePayload,
  chapterTexts: string[],
  parser: DOMParser
): AssembleResult {
  const warnings: string[] = []
  const keep = payload.keepEpubStyles
  const html = doc.documentElement
  if (payload.lang) html.setAttribute('lang', payload.lang)
  if (payload.dir === 'rtl' || payload.dir === 'ltr') html.setAttribute('dir', payload.dir)
  doc.body.replaceChildren()

  const book: BookContext = { spineIndex: new Map(), rendered: new Map() }
  payload.spineUrls.forEach((url, index) => {
    const parsed = tryUrl(url, 'epub://invalid/')
    if (parsed) book.spineIndex.set(documentKey(parsed), index)
  })

  const parsed = payload.chapters.map((chapter, i) => ({ chapter, source: parseChapter(chapterTexts[i] ?? '', parser) }))

  // 1단계: 모든 장의 id를 먼저 정해야 앞 장에서 뒤 장을 가리키는 링크도 고칠 수 있다.
  const usedIds = new Set<string>(payload.chapters.map((c) => chapterAnchorId(c.index)))
  for (const { chapter, source } of parsed) {
    const ids = new Map<string, string>()
    for (const el of source.querySelectorAll('[id], a[name]')) {
      const original = el.getAttribute('id') ?? el.getAttribute('name')!
      if (ids.has(original)) continue
      let unique = original
      for (let n = 1; usedIds.has(unique); n++) unique = `c${chapter.index}-${original}${n > 1 ? `-${n}` : ''}`
      usedIds.add(unique)
      ids.set(original, unique)
    }
    book.rendered.set(chapter.index, { index: chapter.index, url: chapter.url, ids })
  }

  // 2단계: 스타일을 모으고 본문을 옮긴다.
  const seenLinks = new Set<string>()
  const seenStyles = new Set<string>()
  const userStyle = doc.getElementById(USER_STYLE_ID)
  const insertStyle = (node: Element): void => {
    if (userStyle?.parentNode === doc.head) doc.head.insertBefore(node, userStyle)
    else doc.head.appendChild(node)
  }
  const bodyClasses = new Set<string>()
  const hidden = new Set(payload.hiddenImages ?? [])
  let imageCount = 0
  let hiddenImageCount = 0

  for (const { chapter, source } of parsed) {
    const ctx = book.rendered.get(chapter.index)!
    const mapId = (id: string): string => ctx.ids.get(id) ?? id

    if (keep) {
      for (const node of source.querySelectorAll('link, style')) {
        if (node.localName === 'link') {
          const rel = (node.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
          const href = node.getAttribute('href')
          const url = href && tryUrl(href, chapter.url)
          if (!rel.includes('stylesheet') || rel.includes('alternate') || !url || seenLinks.has(url.href)) continue
          seenLinks.add(url.href)
          const link = doc.createElement('link')
          link.rel = 'stylesheet'
          link.href = url.href
          const media = node.getAttribute('media')
          if (media) link.media = media
          insertStyle(link)
        } else {
          const css = rewriteCssUrls(node.textContent ?? '', chapter.url, mapId)
          if (seenStyles.has(css)) continue
          seenStyles.add(css)
          const style = doc.createElement('style')
          style.textContent = css
          insertStyle(style)
        }
      }
    }

    const section = doc.createElement('section')
    section.className = CHAPTER_CLASS
    section.id = chapterAnchorId(chapter.index)
    section.dataset['spineIndex'] = String(chapter.index)

    const root = source.documentElement
    const srcBody = contentRoot(source) === root && root.localName === 'svg' ? null : contentRoot(source)
    if (srcBody) {
      for (const cls of srcBody.classList) {
        section.classList.add(cls)
        bodyClasses.add(cls)
      }
      const lang =
        srcBody.getAttribute('lang') ?? srcBody.getAttribute('xml:lang') ?? root.getAttribute('lang') ?? root.getAttribute('xml:lang')
      if (lang) section.lang = lang
      const dir = srcBody.getAttribute('dir') ?? root.getAttribute('dir')
      if (dir) section.dir = dir
      const style = srcBody.getAttribute('style')
      if (keep && style) section.setAttribute('style', rewriteCssUrls(style, chapter.url, mapId))
      for (const child of [...srcBody.childNodes]) section.appendChild(doc.importNode(child, true))
    } else {
      // 본문이 SVG 하나인 장 (표지에 흔하다)
      section.appendChild(doc.importNode(root, true))
    }

    for (const el of section.querySelectorAll(REMOVED_ELEMENTS)) el.remove()
    if (!keep) for (const el of section.querySelectorAll('style, link')) el.remove()
    else for (const el of section.querySelectorAll('link')) el.remove()

    // 그림 번호는 원본 순서대로 매긴다 (아래에서 요소를 지우기 전에).
    const toHide: Element[] = []
    ;[...section.querySelectorAll('*')].filter(isImageElement).forEach((el, n) => {
      const key = imageKey(chapter.index, n)
      el.setAttribute(IMAGE_KEY_ATTR, key)
      if (hidden.has(key)) toHide.push(el)
    })
    for (const el of toHide) el.setAttribute('data-epubtopdf-removing', '')
    for (const el of toHide) removeImage(el, section)
    hiddenImageCount += toHide.length

    for (const el of section.querySelectorAll('*')) {
      const id = el.getAttribute('id')
      if (id !== null && ctx.ids.has(id)) el.setAttribute('id', ctx.ids.get(id)!)
      if (el.localName === 'a' && !el.hasAttribute('id') && el.hasAttribute('name')) {
        el.setAttribute('id', mapId(el.getAttribute('name')!))
      }
      processElement(el, ctx, book, keep)
      if (isImageElement(el)) imageCount++
    }
    if (keep) {
      for (const style of section.querySelectorAll('style')) {
        style.textContent = rewriteCssUrls(style.textContent ?? '', chapter.url, mapId)
      }
    }

    // 그림을 빼서 아무것도 남지 않은 장(표지 등)은 빈 쪽이 생기지 않게 통째로 뺀다.
    if (toHide.length > 0 && isEmptyChapter(section)) continue
    doc.body.appendChild(section)
  }

  // `body.chapter p` 같은 원본 규칙이 맞도록 장들의 body 클래스를 문서 body에도 붙인다.
  if (keep) for (const cls of bodyClasses) doc.body.classList.add(cls)

  let style = userStyle
  if (!style) {
    style = doc.createElement('style')
    style.id = USER_STYLE_ID
    doc.head.appendChild(style)
  }
  style.textContent = payload.userCss

  return { chapterCount: parsed.length, imageCount, hiddenImageCount, warnings }
}

function isEmptyChapter(section: Element): boolean {
  return (
    (section.textContent ?? '').trim() === '' &&
    !section.querySelector('img, svg, video, audio, object, embed, iframe, canvas, table, hr')
  )
}

/** 장 문서들에 든 그림 목록. 번호는 assembleBook이 매기는 것과 같다. */
export function listImages(payload: ListImagesPayload, chapterTexts: string[], parser: DOMParser): ImageInfo[] {
  const images: ImageInfo[] = []
  payload.chapters.forEach((chapter, i) => {
    const root = contentRoot(parseChapter(chapterTexts[i] ?? '', parser))
    const found = [root, ...root.querySelectorAll('*')].filter(isImageElement)
    found.forEach((el, n) => {
      const href = imageHref(el)
      images.push({
        key: imageKey(chapter.index, n),
        spineIndex: chapter.index,
        src: href ? (tryUrl(href, chapter.url)?.href ?? '') : '',
        alt: el.getAttribute('alt') ?? ''
      })
    })
  })
  return images
}

/**
 * 그림을 뺀다. 그림만 담고 있던 것(캡션이 딸린 figure, 그림 하나뿐인 SVG, 빈 문단·div)도 함께 지워
 * 빈 자리가 남지 않게 한다.
 */
export function removeImage(el: Element, stopAt: Element): void {
  const remaining = (container: Element): Element[] =>
    [...container.querySelectorAll('*')].filter((e) => e !== el && isImageElement(e) && !e.hasAttribute('data-epubtopdf-removing'))

  let target: Element = el
  const svg = el.namespaceURI === SVG_NS ? el.closest('svg') : null
  if (svg && stopAt.contains(svg) && remaining(svg).length === 0 && !svg.querySelector('text, path, rect, circle, ellipse, line, polyline, polygon')) {
    target = svg
  }
  const figure = target.closest('figure')
  if (figure && stopAt.contains(figure) && remaining(figure).length === 0) target = figure

  let parent: Element | null = target.parentElement
  target.remove()
  while (parent && parent !== stopAt && stopAt.contains(parent)) {
    const empty = (parent.textContent ?? '').trim() === '' && [...parent.children].every((c) => c.localName === 'br')
    if (!empty) break
    const next: Element | null = parent.parentElement
    parent.remove()
    parent = next
  }
}

/** 스타일시트, 그림, 글꼴이 모두 준비될 때까지 기다린다. 실패한 그림 수를 경고로 돌려준다. */
export async function waitForResources(doc: Document, timeoutMs = 30000): Promise<string[]> {
  const warnings: string[] = []
  const withTimeout = <T>(p: Promise<T>): Promise<T | undefined> =>
    Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs))])

  const links = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
  await withTimeout(
    Promise.all(
      links.map(
        (link) =>
          new Promise<void>((resolve) => {
            if (link.sheet) return resolve()
            link.addEventListener('load', () => resolve(), { once: true })
            link.addEventListener('error', () => resolve(), { once: true })
          })
      )
    )
  )

  const images = [...doc.images]
  await withTimeout(Promise.all(images.map((img) => img.decode().catch(() => undefined))))
  const broken = images.filter((img) => img.complete && img.naturalWidth === 0).length
  if (broken > 0) warnings.push(`그림 ${broken}개를 불러오지 못했습니다.`)

  await withTimeout(doc.fonts.ready)
  return warnings
}
