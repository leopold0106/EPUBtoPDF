/**
 * EPUB 2/3 파싱.
 *
 *   META-INF/container.xml → 패키지 문서(.opf) → 메타데이터·manifest·spine
 *   목차: EPUB 3 탐색 문서(nav) → 없으면 EPUB 2 NCX
 *
 * 실제 EPUB은 규격을 어긴 것이 많으므로, 치명적이지 않은 문제는 경고로 남기고 계속 진행한다.
 */

import { randomUUID } from 'node:crypto'
import type { BookMetadata, BookSummary, SpineEntry, TocEntry } from '@shared/book'
import { EpubArchive } from './archive'
import { EpubError } from './errors'
import {
  adobeKey,
  ADOBE_PREFIX_LENGTH,
  idpfKey,
  IDPF_PREFIX_LENGTH,
  parseEncryption,
  xorPrefix,
  type EncryptionKind
} from './obfuscation'
import { mediaTypeFromPath, resolveHref } from './paths'
import {
  attr,
  childElements,
  childrenNamed,
  descendantsNamed,
  firstChildNamed,
  firstDescendantNamed,
  parseMarkup,
  text,
  type Document,
  type Element
} from './xml'

export interface ManifestItem {
  id: string
  path: string
  mediaType: string
  properties: string[]
  fallback?: string
}

export interface Resource {
  data: Uint8Array
  mediaType: string
}

const CONTENT_TYPES = new Set(['application/xhtml+xml', 'text/html', 'image/svg+xml'])
const NCX_TYPE = 'application/x-dtbncx+xml'

export class EpubBook {
  readonly id = randomUUID().replace(/-/g, '')
  /** 디스크에서 연 경우 원본 파일 경로. 저장 위치 기본값에 쓴다. */
  sourcePath?: string
  /** 파일 내용의 해시. 같은 책을 다시 열었을 때 편집 내용을 찾는 데 쓴다. */
  contentHash?: string

  constructor(
    readonly fileName: string,
    private readonly archive: EpubArchive,
    readonly packagePath: string,
    readonly metadata: BookMetadata,
    readonly manifest: Map<string, ManifestItem>,
    readonly spine: SpineEntry[],
    readonly toc: TocEntry[],
    readonly coverPath: string | undefined,
    readonly direction: BookSummary['direction'],
    readonly warnings: string[],
    private readonly encryption: Map<string, EncryptionKind>,
    private readonly identifiers: { unique?: string; all: string[] }
  ) {}

  private manifestByPath?: Map<string, ManifestItem>

  itemByPath(path: string): ManifestItem | undefined {
    this.manifestByPath ??= new Map([...this.manifest.values()].map((item) => [item.path, item]))
    return this.manifestByPath.get(path) ?? this.manifestByPath.get(this.archive.resolve(path) ?? '')
  }

  hasResource(path: string): boolean {
    return this.archive.has(path)
  }

  /** 압축 파일 안의 리소스를 읽는다. 난독화된 글꼴은 풀어서 돌려준다. */
  async readResource(path: string): Promise<Resource> {
    const actual = this.archive.resolve(path) ?? path
    const mediaType = this.itemByPath(actual)?.mediaType ?? mediaTypeFromPath(actual)
    const raw = await this.archive.readBytes(actual)
    const kind = this.encryption.get(actual)
    if (!kind) return { data: raw, mediaType }

    if (kind === 'idpf' && this.identifiers.unique) {
      return { data: xorPrefix(raw, idpfKey(this.identifiers.unique), IDPF_PREFIX_LENGTH), mediaType }
    }
    const key = kind === 'adobe' ? adobeKey(this.identifiers.all) : undefined
    if (key) return { data: xorPrefix(raw, key, ADOBE_PREFIX_LENGTH), mediaType }
    throw new EpubError('drm', `${path} 파일이 암호화되어 있어 읽을 수 없습니다.`)
  }

  async readText(path: string): Promise<string> {
    return this.archive.readText(path)
  }

  toSummary(): BookSummary {
    return {
      id: this.id,
      fileName: this.fileName,
      metadata: this.metadata,
      spine: this.spine,
      toc: this.toc,
      coverPath: this.coverPath,
      direction: this.direction,
      warnings: this.warnings
    }
  }
}

export async function openEpub(data: Uint8Array | ArrayBuffer, fileName: string): Promise<EpubBook> {
  const archive = await EpubArchive.open(data)
  const warnings: string[] = []

  const packagePath = await findPackagePath(archive, warnings)
  let opf: Document
  try {
    opf = parseMarkup(await archive.readText(packagePath), true)
  } catch (err) {
    throw new EpubError('invalid-package', '패키지 문서(.opf)를 읽을 수 없습니다.', err)
  }
  const pkg = firstDescendantNamed(opf, 'package')
  const metadataEl = pkg && firstDescendantNamed(pkg, 'metadata')
  const manifestEl = pkg && firstDescendantNamed(pkg, 'manifest')
  const spineEl = pkg && firstDescendantNamed(pkg, 'spine')
  if (!pkg || !manifestEl || !spineEl) {
    throw new EpubError('invalid-package', '패키지 문서(.opf)에 manifest나 spine이 없습니다.')
  }

  const identifiers = readIdentifiers(pkg, metadataEl)
  const metadata = readMetadata(metadataEl, identifiers.unique, fileName)
  const manifest = readManifest(manifestEl, packagePath)

  const encryption = archive.has('META-INF/encryption.xml')
    ? parseEncryption(await archive.readText('META-INF/encryption.xml'))
    : new Map<string, EncryptionKind>()

  const spineItems = readSpine(spineEl, manifest, archive, warnings)
  if (spineItems.length === 0) {
    throw new EpubError('empty-spine', '이 EPUB에는 본문 문서가 없습니다.')
  }
  checkDrm(spineItems, manifest, encryption, warnings)

  const toc = await readToc(archive, manifest, spineEl, spineItems, warnings)
  const spine = spineItems.map(({ item, linear }, index) => ({
    index,
    path: item.path,
    title: findTitle(toc, item.path),
    linear
  }))

  const dir = attr(spineEl, 'page-progression-direction')
  return new EpubBook(
    fileName,
    archive,
    packagePath,
    metadata,
    manifest,
    spine,
    toc,
    findCover(manifest, metadataEl),
    dir === 'rtl' || dir === 'ltr' ? dir : 'default',
    warnings,
    encryption,
    identifiers
  )
}

// ---------------------------------------------------------------------------

async function findPackagePath(archive: EpubArchive, warnings: string[]): Promise<string> {
  if (archive.has('META-INF/container.xml')) {
    const container = parseMarkup(await archive.readText('META-INF/container.xml'), true)
    const rootfiles = descendantsNamed(container, 'rootfile')
    const preferred =
      rootfiles.find((r) => attr(r, 'media-type') === 'application/oebps-package+xml') ?? rootfiles[0]
    const fullPath = preferred && attr(preferred, 'full-path')
    const resolved = fullPath && resolveHref('', fullPath)?.path
    if (resolved && archive.has(resolved)) return archive.resolve(resolved)!
  }
  const fallback = archive.paths.find((p) => p.toLowerCase().endsWith('.opf'))
  if (!fallback) throw new EpubError('no-package', 'EPUB 안에서 패키지 문서(.opf)를 찾을 수 없습니다.')
  warnings.push('META-INF/container.xml이 없거나 잘못되어 있어 .opf 파일을 직접 찾아 열었습니다.')
  return fallback
}

function readIdentifiers(pkg: Element, metadataEl: Element | undefined): { unique?: string; all: string[] } {
  const ids = metadataEl ? descendantsNamed(metadataEl, 'identifier') : []
  const uniqueId = attr(pkg, 'unique-identifier')
  const unique = ids.find((el) => uniqueId && el.attribs['id'] === uniqueId) ?? ids[0]
  return { unique: unique && text(unique), all: ids.map(text).filter(Boolean) }
}

function readMetadata(metadataEl: Element | undefined, identifier: string | undefined, fileName: string): BookMetadata {
  const fallbackTitle = fileName.replace(/\.epub$/i, '')
  if (!metadataEl) return { title: fallbackTitle, creators: [], identifier }

  const metas = descendantsNamed(metadataEl, 'meta')
  const refinement = (id: string | undefined, property: string): string | undefined => {
    if (!id) return undefined
    const meta = metas.find((m) => attr(m, 'refines') === `#${id}` && attr(m, 'property') === property)
    return meta && text(meta)
  }

  const titles = descendantsNamed(metadataEl, 'title').filter((el) => text(el))
  const mainTitle = titles.find((el) => refinement(el.attribs['id'], 'title-type') === 'main') ?? titles[0]

  const first = (name: string): string | undefined => {
    const el = descendantsNamed(metadataEl, name).find((e) => text(e))
    return el && text(el)
  }

  return {
    title: mainTitle ? text(mainTitle) : fallbackTitle,
    creators: descendantsNamed(metadataEl, 'creator').map(text).filter(Boolean),
    language: first('language'),
    publisher: first('publisher'),
    date: first('date'),
    identifier
  }
}

function readManifest(manifestEl: Element, packagePath: string): Map<string, ManifestItem> {
  const manifest = new Map<string, ManifestItem>()
  for (const el of childrenNamed(manifestEl, 'item')) {
    const id = el.attribs['id']
    const href = el.attribs['href']
    if (!id || !href) continue
    const resolved = resolveHref(packagePath, href)
    if (!resolved) continue
    manifest.set(id, {
      id,
      path: resolved.path,
      mediaType: (el.attribs['media-type'] ?? mediaTypeFromPath(resolved.path)).toLowerCase(),
      properties: (el.attribs['properties'] ?? '').split(/\s+/).filter(Boolean),
      fallback: el.attribs['fallback']
    })
  }
  return manifest
}

interface SpineItem {
  item: ManifestItem
  linear: boolean
}

function readSpine(
  spineEl: Element,
  manifest: Map<string, ManifestItem>,
  archive: EpubArchive,
  warnings: string[]
): SpineItem[] {
  const items: SpineItem[] = []
  for (const ref of childrenNamed(spineEl, 'itemref')) {
    const idref = ref.attribs['idref'] ?? ''
    let item = manifest.get(idref)
    // 본문으로 쓸 수 없는 형식이면 fallback 사슬을 따라간다.
    const seen = new Set<string>()
    while (item && !CONTENT_TYPES.has(item.mediaType) && item.fallback && !seen.has(item.id)) {
      seen.add(item.id)
      item = manifest.get(item.fallback)
    }
    if (!item) {
      warnings.push(`읽기 순서에 있는 항목 "${idref}"이(가) manifest에 없어 건너뜁니다.`)
      continue
    }
    if (!CONTENT_TYPES.has(item.mediaType)) {
      warnings.push(`${item.path}은(는) 본문 문서가 아니어서(${item.mediaType}) 건너뜁니다.`)
      continue
    }
    if (!archive.has(item.path)) {
      warnings.push(`${item.path} 파일이 EPUB 안에 없어 건너뜁니다.`)
      continue
    }
    items.push({ item: { ...item, path: archive.resolve(item.path)! }, linear: ref.attribs['linear'] !== 'no' })
  }
  return items
}

function checkDrm(
  spine: SpineItem[],
  manifest: Map<string, ManifestItem>,
  encryption: Map<string, EncryptionKind>,
  warnings: string[]
): void {
  const drmPaths = [...encryption].filter(([, kind]) => kind === 'drm').map(([path]) => path)
  if (drmPaths.length === 0) return
  const contentPaths = new Set([
    ...spine.map((s) => s.item.path),
    ...[...manifest.values()].filter((m) => m.mediaType === 'text/css').map((m) => m.path)
  ])
  if (drmPaths.some((p) => contentPaths.has(p))) {
    throw new EpubError('drm', 'DRM으로 보호된 EPUB은 변환할 수 없습니다.')
  }
  warnings.push(`암호화된 리소스 ${drmPaths.length}개(글꼴·이미지 등)는 표시되지 않습니다.`)
}

function findCover(manifest: Map<string, ManifestItem>, metadataEl: Element | undefined): string | undefined {
  const items = [...manifest.values()]
  const byProperty = items.find((i) => i.properties.includes('cover-image'))
  if (byProperty) return byProperty.path
  const meta = metadataEl && descendantsNamed(metadataEl, 'meta').find((m) => m.attribs['name'] === 'cover')
  const byMeta = meta && manifest.get(meta.attribs['content'] ?? '')
  if (byMeta?.mediaType.startsWith('image/')) return byMeta.path
  return items.find((i) => i.mediaType.startsWith('image/') && /cover/i.test(i.id + i.path))?.path
}

// ---------------------------------------------------------------------------
// 목차

async function readToc(
  archive: EpubArchive,
  manifest: Map<string, ManifestItem>,
  spineEl: Element,
  spine: SpineItem[],
  warnings: string[]
): Promise<TocEntry[]> {
  const spineIndex = new Map(spine.map((s, i) => [s.item.path.toLowerCase(), i]))
  const indexOf = (path: string): number => spineIndex.get(path.toLowerCase()) ?? -1

  const nav = [...manifest.values()].find((i) => i.properties.includes('nav'))
  if (nav && archive.has(nav.path)) {
    try {
      const toc = parseNav(await archive.readText(nav.path), nav.path, indexOf)
      if (toc.length > 0) return toc
    } catch {
      warnings.push('EPUB 3 목차(nav)를 읽지 못해 다른 목차를 찾습니다.')
    }
  }

  const ncx =
    manifest.get(spineEl.attribs['toc'] ?? '') ?? [...manifest.values()].find((i) => i.mediaType === NCX_TYPE)
  if (ncx && archive.has(ncx.path)) {
    try {
      const toc = parseNcx(await archive.readText(ncx.path), ncx.path, indexOf)
      if (toc.length > 0) return toc
    } catch {
      warnings.push('EPUB 2 목차(NCX)를 읽지 못했습니다.')
    }
  }

  warnings.push('목차가 없어 PDF 책갈피는 문서 단위로 만듭니다.')
  return []
}

type IndexOf = (path: string) => number

function makeEntry(title: string, href: string | undefined, base: string, indexOf: IndexOf, children: TocEntry[]): TocEntry {
  const resolved = href ? resolveHref(base, href) : undefined
  const ownIndex = resolved ? indexOf(resolved.path) : -1
  return {
    title,
    href: resolved ? resolved.path + (resolved.fragment ? `#${resolved.fragment}` : '') : (children[0]?.href ?? ''),
    spineIndex: ownIndex >= 0 ? ownIndex : (children[0]?.spineIndex ?? -1),
    children
  }
}

export function parseNav(html: string, navPath: string, indexOf: IndexOf): TocEntry[] {
  // 탐색 문서는 XHTML이지만 규격을 어긴 것이 많아 HTML처럼 너그럽게 읽는다.
  const doc = parseMarkup(html, false)
  const navs = descendantsNamed(doc, 'nav')
  const tocNav =
    navs.find((n) => (attr(n, 'epub:type') ?? '').split(/\s+/).includes('toc')) ??
    navs.find((n) => n.attribs['role'] === 'doc-toc') ??
    navs[0]
  const list = tocNav && firstDescendantNamed(tocNav, 'ol')
  return list ? navList(list, navPath, indexOf) : []
}

function navList(ol: Element, base: string, indexOf: IndexOf): TocEntry[] {
  const entries: TocEntry[] = []
  for (const li of childrenNamed(ol, 'li')) {
    const label = childElements(li).find((el) => el.name === 'a' || el.name === 'span')
    const nested = firstChildNamed(li, 'ol')
    const children = nested ? navList(nested, base, indexOf) : []
    const title = label ? text(label) : ''
    if (!title && children.length === 0) continue
    entries.push(makeEntry(title, label?.attribs['href'], base, indexOf, children))
  }
  return entries
}

export function parseNcx(xml: string, ncxPath: string, indexOf: IndexOf): TocEntry[] {
  const doc = parseMarkup(xml, true)
  const navMap = firstDescendantNamed(doc, 'navmap')
  return navMap ? ncxPoints(navMap, ncxPath, indexOf) : []
}

function ncxPoints(parent: Element, base: string, indexOf: IndexOf): TocEntry[] {
  const entries: TocEntry[] = []
  for (const point of childrenNamed(parent, 'navpoint')) {
    const label = firstChildNamed(point, 'navlabel')
    const labelText = label && firstChildNamed(label, 'text')
    const content = firstChildNamed(point, 'content')
    const children = ncxPoints(point, base, indexOf)
    const title = labelText ? text(labelText) : ''
    if (!title && children.length === 0) continue
    entries.push(makeEntry(title, content && attr(content, 'src'), base, indexOf, children))
  }
  return entries
}

/** 목차에서 해당 문서를 가리키는 첫 항목의 제목. */
function findTitle(toc: TocEntry[], path: string): string | undefined {
  for (const entry of toc) {
    if (entry.href.split('#')[0]!.toLowerCase() === path.toLowerCase()) return entry.title
    const nested = findTitle(entry.children, path)
    if (nested) return nested
  }
  return undefined
}
