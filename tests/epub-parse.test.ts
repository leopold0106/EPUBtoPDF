import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { decodeText } from '@shared/text'
import { EpubError } from '../src/main/epub/errors'
import { openEpub } from '../src/main/epub/parse'
import { isExternalHref, normalizePath, resolveHref } from '../src/main/epub/paths'
import { buildEpub, gradientPng, type FixtureChapter } from './fixtures/epub-builder'
import { buildSampleBook } from './fixtures/sample-book'

const chapter = (n: number, extra: Partial<FixtureChapter> = {}): FixtureChapter => ({
  id: `c${n}`,
  href: `Text/c${n}.xhtml`,
  title: `${n}장`,
  body: `<h1>${n}장</h1><p>본문 ${n}</p>`,
  ...extra
})

async function expectEpubError(promise: Promise<unknown>, code: EpubError['code']): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(EpubError)
  await expect(promise).rejects.toMatchObject({ code })
}

describe('경로', () => {
  it('상대 경로를 압축 파일 안의 경로로 바꾼다', () => {
    expect(resolveHref('OEBPS/Text/c1.xhtml', '../Images/a.png')).toEqual({ path: 'OEBPS/Images/a.png', fragment: '' })
    expect(resolveHref('OEBPS/content.opf', 'Text/c1.xhtml#s2')).toEqual({ path: 'OEBPS/Text/c1.xhtml', fragment: 's2' })
    expect(resolveHref('content.opf', 'c1.xhtml')).toEqual({ path: 'c1.xhtml', fragment: '' })
  })

  it('URL 인코딩을 풀고, 같은 문서 링크와 루트 기준 경로를 처리한다', () => {
    expect(resolveHref('OEBPS/content.opf', 'Text/chapter%2001.xhtml')?.path).toBe('OEBPS/Text/chapter 01.xhtml')
    expect(resolveHref('OEBPS/Text/c1.xhtml', '#note')).toEqual({ path: 'OEBPS/Text/c1.xhtml', fragment: 'note' })
    expect(resolveHref('OEBPS/Text/c1.xhtml', '/OEBPS/x.css')?.path).toBe('OEBPS/x.css')
    expect(resolveHref('a.xhtml', '%E0%A4%A')?.path).toBe('%E0%A4%A')
  })

  it('외부 링크는 무시한다', () => {
    expect(resolveHref('a.xhtml', 'https://example.com')).toBeUndefined()
    expect(isExternalHref('mailto:a@b.c')).toBe(true)
    expect(isExternalHref('Text/a.xhtml')).toBe(false)
  })

  it('루트 밖으로 나가는 ..은 버린다', () => {
    expect(normalizePath('../../a/./b/../c.png')).toBe('a/c.png')
  })
})

describe('decodeText', () => {
  const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

  it('UTF-8 BOM을 떼어 낸다', () => {
    expect(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, ...enc('가나')]))).toBe('가나')
  })

  it('UTF-16 BOM을 인식한다', () => {
    const le = Uint8Array.from([0xff, 0xfe, 0x00, 0xac, 0x98, 0xb0]) // "가나"
    expect(decodeText(le)).toBe('가나')
    const be = Uint8Array.from([0xfe, 0xff, 0xac, 0x00, 0xb0, 0x98])
    expect(decodeText(be)).toBe('가나')
  })

  it('XML 선언의 encoding을 따른다', () => {
    const head = enc('<?xml version="1.0" encoding="EUC-KR"?><p>')
    const euckr = Uint8Array.from([...head, 0xb0, 0xa1]) // "가"
    expect(decodeText(euckr)).toContain('<p>가')
  })
})

describe('openEpub: EPUB 3', () => {
  it('메타데이터와 읽기 순서, 표지를 읽는다', async () => {
    const book = await openEpub(await buildSampleBook(), '강가의 기록.epub')
    expect(book.metadata).toMatchObject({
      title: '강가의 기록',
      creators: ['김여행', '이기록'],
      language: 'ko',
      publisher: '테스트 출판사',
      identifier: 'urn:uuid:12345678-1234-5678-1234-567812345678'
    })
    expect(book.spine.map((s) => s.path)).toEqual([
      'OEBPS/Text/cover.xhtml',
      'OEBPS/Text/chapter 01.xhtml',
      'OEBPS/Text/chapter 02.xhtml',
      'OEBPS/Text/chapter 03.xhtml',
      'OEBPS/Text/notes.xhtml'
    ])
    expect(book.spine.map((s) => s.linear)).toEqual([true, true, true, true, false])
    expect(book.coverPath).toBe('OEBPS/Images/cover.png')
    expect(book.warnings).toEqual([])
  })

  it('nav 목차를 하위 항목과 조각 식별자까지 읽는다', async () => {
    // NCX를 빼서 nav만으로 읽었는지 확인한다.
    const book = await openEpub(await buildSampleBook({ ncx: false }), 'a.epub')
    expect(book.toc.map((e) => e.title)).toEqual(['제1장 강가의 아침', '제2장 시장 골목', '제3장 등대', '주석'])
    expect(book.toc[1]).toMatchObject({ href: 'OEBPS/Text/chapter 02.xhtml', spineIndex: 2 })
    expect(book.toc[1]!.children).toEqual([
      { title: '등불', href: 'OEBPS/Text/chapter 02.xhtml#s2-1', spineIndex: 2, children: [] },
      { title: '장부', href: 'OEBPS/Text/chapter 02.xhtml#s2-2', spineIndex: 2, children: [] }
    ])
  })

  it('읽기 순서의 각 문서에 목차 제목을 붙인다', async () => {
    const book = await openEpub(await buildSampleBook(), 'a.epub')
    expect(book.spine.map((s) => s.title)).toEqual([undefined, '제1장 강가의 아침', '제2장 시장 골목', '제3장 등대', '주석'])
  })

  it('nav가 없으면 NCX 목차를 쓴다', async () => {
    const book = await openEpub(await buildSampleBook({ nav: false }), 'a.epub')
    expect(book.toc.map((e) => e.title)).toEqual(['제1장 강가의 아침', '제2장 시장 골목', '제3장 등대', '주석'])
    expect(book.toc[0]!.children[0]).toMatchObject({ title: '다리 위에서', href: 'OEBPS/Text/chapter 01.xhtml#s1-2' })
  })

  it('목차가 전혀 없으면 경고를 남긴다', async () => {
    const book = await openEpub(await buildEpub({ chapters: [chapter(1)], nav: false, ncx: false }), 'a.epub')
    expect(book.toc).toEqual([])
    expect(book.warnings.some((w) => w.includes('목차가 없어'))).toBe(true)
  })

  it('쪽 넘김 방향을 읽는다', async () => {
    const book = await openEpub(await buildEpub({ chapters: [chapter(1)], direction: 'rtl' }), 'a.epub')
    expect(book.direction).toBe('rtl')
  })

  it('제목이 없으면 파일 이름을 쓴다', async () => {
    const book = await openEpub(await buildEpub({ chapters: [chapter(1)], title: '' }), '내 책.epub')
    expect(book.metadata.title).toBe('내 책')
  })
})

describe('openEpub: EPUB 2', () => {
  it('NCX 목차와 meta cover를 읽는다', async () => {
    const data = await buildEpub({
      version: 2,
      chapters: [chapter(1, { sections: [{ fragment: 'a', title: '1절' }] }), chapter(2)],
      resources: [{ href: 'Images/cover.jpg', mediaType: 'image/jpeg', data: 'x' }],
      coverHref: 'Images/cover.jpg'
    })
    const book = await openEpub(data, 'a.epub')
    expect(book.toc).toEqual([
      {
        title: '1장',
        href: 'OEBPS/Text/c1.xhtml',
        spineIndex: 0,
        children: [{ title: '1절', href: 'OEBPS/Text/c1.xhtml#a', spineIndex: 0, children: [] }]
      },
      { title: '2장', href: 'OEBPS/Text/c2.xhtml', spineIndex: 1, children: [] }
    ])
    expect(book.coverPath).toBe('OEBPS/Images/cover.jpg')
  })
})

describe('openEpub: 규격을 어긴 EPUB', () => {
  it('container.xml이 없으면 .opf를 직접 찾는다', async () => {
    const book = await openEpub(await buildEpub({ chapters: [chapter(1)], container: false }), 'a.epub')
    expect(book.packagePath).toBe('OEBPS/content.opf')
    expect(book.warnings.some((w) => w.includes('container.xml'))).toBe(true)
  })

  it('OPF가 루트에 있어도 읽는다', async () => {
    const book = await openEpub(await buildEpub({ chapters: [chapter(1)], opfDir: '' }), 'a.epub')
    expect(book.spine[0]!.path).toBe('Text/c1.xhtml')
  })

  it('manifest에 없는 spine 항목은 경고하고 건너뛴다', async () => {
    const book = await openEpub(
      await buildEpub({ chapters: [chapter(1), chapter(2)], danglingSpineRef: 'ghost' }),
      'a.epub'
    )
    expect(book.spine.map((s) => s.path)).toEqual(['OEBPS/Text/c1.xhtml', 'OEBPS/Text/c2.xhtml'])
    expect(book.warnings.some((w) => w.includes('ghost'))).toBe(true)
  })

  it('경로의 대소문자가 실제 파일과 달라도 찾는다', async () => {
    const data = await buildEpub({ chapters: [chapter(1)] })
    const zip = await JSZip.loadAsync(data)
    const opf = (await zip.file('OEBPS/content.opf')!.async('string')).replace('Text/c1.xhtml', 'text/C1.XHTML')
    zip.file('OEBPS/content.opf', opf)
    const book = await openEpub(await zip.generateAsync({ type: 'uint8array' }), 'a.epub')
    expect(book.spine[0]!.path).toBe('OEBPS/Text/c1.xhtml')
    expect(await book.readText('OEBPS/text/C1.XHTML')).toContain('본문 1')
  })

  it('zip이 아니면 오류', async () => {
    await expectEpubError(openEpub(new TextEncoder().encode('hello'), 'a.epub'), 'not-zip')
  })

  it('패키지 문서가 없으면 오류', async () => {
    const zip = new JSZip()
    zip.file('mimetype', 'application/epub+zip')
    await expectEpubError(openEpub(await zip.generateAsync({ type: 'uint8array' }), 'a.epub'), 'no-package')
  })

  it('본문 문서가 하나도 없으면 오류', async () => {
    const data = await buildEpub({ chapters: [chapter(1)] })
    const zip = await JSZip.loadAsync(data)
    zip.remove('OEBPS/Text/c1.xhtml')
    await expectEpubError(openEpub(await zip.generateAsync({ type: 'uint8array' }), 'a.epub'), 'empty-spine')
  })
})

describe('글꼴 난독화와 DRM', () => {
  const font = Uint8Array.from({ length: 3000 }, (_, i) => (i * 7) % 256)

  it.each(['idpf', 'adobe'] as const)('%s 방식으로 난독화된 글꼴을 풀어서 돌려준다', async (kind) => {
    const data = await buildEpub({
      chapters: [chapter(1)],
      resources: [{ href: 'Fonts/a.ttf', mediaType: 'font/ttf', data: font, obfuscation: kind }]
    })
    const book = await openEpub(data, 'a.epub')
    const res = await book.readResource('OEBPS/Fonts/a.ttf')
    expect(res.mediaType).toBe('font/ttf')
    expect(res.data).toEqual(font)
  })

  it('본문이 암호화되어 있으면 DRM 오류', async () => {
    const data = await buildEpub({
      chapters: [chapter(1)],
      resources: [{ href: 'Text/c1.xhtml', mediaType: 'application/xhtml+xml', data: 'x', obfuscation: 'drm' }]
    })
    await expectEpubError(openEpub(data, 'a.epub'), 'drm')
  })

  it('글꼴만 암호화되어 있으면 열되, 경고를 남기고 그 글꼴은 읽지 않는다', async () => {
    const data = await buildEpub({
      chapters: [chapter(1)],
      resources: [{ href: 'Fonts/a.ttf', mediaType: 'font/ttf', data: font, obfuscation: 'drm' }]
    })
    const book = await openEpub(data, 'a.epub')
    expect(book.warnings.some((w) => w.includes('암호화된 리소스 1개'))).toBe(true)
    await expect(book.readResource('OEBPS/Fonts/a.ttf')).rejects.toMatchObject({ code: 'drm' })
  })
})

describe('리소스 읽기', () => {
  it('manifest의 미디어 형식을 쓰고, 없으면 확장자로 정한다', async () => {
    const png = gradientPng(4, 4, [0, 0, 0], [255, 255, 255])
    const data = await buildEpub({
      chapters: [chapter(1)],
      resources: [{ href: 'Images/a.png', mediaType: 'image/png', data: png }],
      extraFiles: { 'OEBPS/Images/unlisted.webp': 'x' }
    })
    const book = await openEpub(data, 'a.epub')
    expect(await book.readResource('OEBPS/Images/a.png')).toEqual({ data: png, mediaType: 'image/png' })
    expect((await book.readResource('OEBPS/Images/unlisted.webp')).mediaType).toBe('image/webp')
  })

  it('요약 정보는 직렬화할 수 있다', async () => {
    const book = await openEpub(await buildSampleBook(), 'a.epub')
    const summary = book.toSummary()
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary)
    expect(summary.id).toMatch(/^[0-9a-f]{32}$/)
  })
})
