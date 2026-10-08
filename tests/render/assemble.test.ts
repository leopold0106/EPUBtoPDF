// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { AssemblePayload } from '@shared/render'
import { CHAPTER_CLASS } from '@shared/stylesheet'
import { assembleBook, IMAGE_KEY_ATTR, listImages, parseChapter, rewriteCssUrls, USER_STYLE_ID } from '../../src/render/assemble'

const BASE = 'epub://book1/OEBPS/Text/'
const url = (name: string): string => BASE + name

function xhtml(body: string, head = '', bodyAttrs = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ko">
<head><title>t</title>${head}</head>
<body${bodyAttrs}>${body}</body></html>`
}

function payload(chapters: string[], extra: Partial<AssemblePayload> = {}): AssemblePayload {
  const spine = ['c1.xhtml', 'c2.xhtml', 'c3.xhtml'].map(url)
  return {
    chapters: chapters.map((name) => ({ index: spine.indexOf(url(name)), url: url(name) })),
    spineUrls: spine,
    keepEpubStyles: true,
    userCss: 'p { color: red }',
    lang: 'ko',
    ...extra
  }
}

let doc: Document
beforeEach(() => {
  doc = document.implementation.createHTMLDocument('render')
})

const assemble = (p: AssemblePayload, texts: string[]) => assembleBook(doc, p, texts, new DOMParser())

describe('parseChapter', () => {
  it('올바른 XHTML은 XML로 읽는다 (자기 닫는 태그가 다음 내용을 삼키지 않는다)', () => {
    const d = parseChapter(xhtml('<p><a id="x"/>앞</p><p>뒤</p>'), new DOMParser())
    expect(d.querySelectorAll('p')).toHaveLength(2)
    expect(d.querySelector('a')!.textContent).toBe('')
  })

  it('형식이 깨졌으면 HTML로 다시 읽는다', () => {
    const d = parseChapter('<html><body><p>열린 태그<br><p>&nbsp;둘째</body></html>', new DOMParser())
    expect(d.querySelectorAll('p')).toHaveLength(2)
  })

  it('이름공간이 없는 XHTML은 HTML로 읽는다', () => {
    const d = parseChapter('<html><body><p>a</p></body></html>', new DOMParser())
    expect(d.body.querySelector('p')!.namespaceURI).toBe('http://www.w3.org/1999/xhtml')
  })
})

describe('rewriteCssUrls', () => {
  it('상대 주소를 절대 주소로, #참조는 바뀐 id로 고친다', () => {
    const css = `a { background: url("../Images/a.png") } b { src: url(f.ttf) } c { fill: url(#g) } d { x: url(data:image/png;base64,AA) }\n@import 'x.css';`
    const out = rewriteCssUrls(css, url('c1.xhtml'), (id) => (id === 'g' ? 'c0-g' : id))
    expect(out).toContain('url("epub://book1/OEBPS/Images/a.png")')
    expect(out).toContain('url(epub://book1/OEBPS/Text/f.ttf)')
    expect(out).toContain('url(#c0-g)')
    expect(out).toContain('url(data:image/png;base64,AA)')
    expect(out).toContain(`@import 'epub://book1/OEBPS/Text/x.css'`)
  })
})

describe('assembleBook', () => {
  it('장마다 section으로 감싸 순서대로 이어 붙이고, 설정 CSS를 마지막에 넣는다', () => {
    const result = assemble(payload(['c1.xhtml', 'c2.xhtml']), [xhtml('<h1>하나</h1>'), xhtml('<h1>둘</h1>')])
    const sections = doc.querySelectorAll(`section.${CHAPTER_CLASS}`)
    expect([...sections].map((s) => s.id)).toEqual(['epubtopdf-c0', 'epubtopdf-c1'])
    expect([...sections].map((s) => s.textContent)).toEqual(['하나', '둘'])
    expect(doc.head.lastElementChild!.id).toBe(USER_STYLE_ID)
    expect(doc.head.lastElementChild!.textContent).toBe('p { color: red }')
    expect(doc.documentElement.lang).toBe('ko')
    expect(result.chapterCount).toBe(2)
  })

  it('그림과 CSS의 상대 주소를 장 문서 기준 절대 주소로 바꾼다', () => {
    assemble(payload(['c1.xhtml']), [
      xhtml(
        '<img src="../Images/a.png" srcset="../Images/a.png 1x, ../Images/b.png 2x"/><p style="background:url(../Images/bg.png)">x</p>',
        '<link rel="stylesheet" href="../Styles/s.css"/><style>p { background: url(../Images/c.png) }</style>'
      )
    ])
    const img = doc.querySelector('img')!
    expect(img.getAttribute('src')).toBe('epub://book1/OEBPS/Images/a.png')
    expect(img.getAttribute('srcset')).toBe('epub://book1/OEBPS/Images/a.png 1x, epub://book1/OEBPS/Images/b.png 2x')
    expect(doc.querySelector('p')!.getAttribute('style')).toContain('url(epub://book1/OEBPS/Images/bg.png)')
    expect(doc.head.querySelector('link')!.getAttribute('href')).toBe('epub://book1/OEBPS/Styles/s.css')
    expect(doc.head.querySelector('style')!.textContent).toContain('url(epub://book1/OEBPS/Images/c.png)')
  })

  it('같은 스타일시트는 한 번만 넣고, 원본 스타일은 설정 CSS보다 앞에 둔다', () => {
    const head = '<link rel="stylesheet" href="../Styles/s.css"/>'
    assemble(payload(['c1.xhtml', 'c2.xhtml']), [xhtml('a', head), xhtml('b', head)])
    expect(doc.head.querySelectorAll('link')).toHaveLength(1)
    const children = [...doc.head.children]
    expect(children.indexOf(doc.head.querySelector('link')!)).toBeLessThan(children.indexOf(doc.getElementById(USER_STYLE_ID)!))
  })

  it('원본 스타일 무시 모드에서는 스타일시트, style 요소, style 속성을 모두 버린다', () => {
    assemble(payload(['c1.xhtml'], { keepEpubStyles: false }), [
      xhtml(
        '<p style="color:blue">x</p><style>p{}</style><svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:red"/></svg>',
        '<link rel="stylesheet" href="s.css"/><style>p{}</style>',
        ' class="chapter" style="margin:3em"'
      )
    ])
    expect(doc.querySelectorAll('link, style:not(#' + USER_STYLE_ID + ')')).toHaveLength(0)
    expect(doc.querySelector('p')!.hasAttribute('style')).toBe(false)
    expect(doc.querySelector('section')!.hasAttribute('style')).toBe(false)
    // SVG의 style은 그림 자체의 일부이므로 남긴다.
    expect(doc.querySelector('rect')!.getAttribute('style')).toBe('fill:red')
    expect(doc.body.classList.contains('chapter')).toBe(false)
  })

  it('body의 class·lang·style을 section으로 옮기고, class는 문서 body에도 붙인다', () => {
    assemble(payload(['c1.xhtml']), [xhtml('x', '', ' class="chapter odd" lang="en" style="margin:0"')])
    const section = doc.querySelector('section')!
    expect(section.classList.contains('chapter')).toBe(true)
    expect(section.lang).toBe('en')
    expect(section.getAttribute('style')).toBe('margin:0')
    expect([...doc.body.classList]).toEqual(['chapter', 'odd'])
  })

  it('다른 장을 가리키는 링크를 문서 안 링크로 바꾼다', () => {
    assemble(payload(['c1.xhtml', 'c2.xhtml']), [
      xhtml('<a href="c2.xhtml#n1">각주</a> <a href="c2.xhtml">2장</a> <a href="#top">위</a><p id="top"/>'),
      xhtml('<p id="n1">각주 내용</p>')
    ])
    const hrefs = [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['#n1', '#epubtopdf-c1', '#top'])
  })

  it('여러 장에 같은 id가 있으면 뒤의 것만 이름을 바꾸고 링크도 따라 바꾼다', () => {
    assemble(payload(['c1.xhtml', 'c2.xhtml']), [
      xhtml('<p id="p1">1장</p><a href="c2.xhtml#p1">2장의 p1</a><span id="g1"/>'),
      xhtml('<p id="p1">2장</p><a href="#p1">같은 장의 p1</a><svg xmlns="http://www.w3.org/2000/svg"><linearGradient id="g1"/><rect fill="url(#g1)"/></svg>')
    ])
    const [first, second] = doc.querySelectorAll('section')
    expect(first!.querySelector('p')!.id).toBe('p1')
    expect(second!.querySelector('p')!.id).toBe('c1-p1')
    expect(first!.querySelector('a')!.getAttribute('href')).toBe('#c1-p1')
    expect(second!.querySelector('a')!.getAttribute('href')).toBe('#c1-p1')
    expect(second!.querySelector('rect')!.getAttribute('fill')).toBe('url(#c1-g1)')
    const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('a name 앵커도 링크 대상으로 쓸 수 있게 id를 붙인다', () => {
    assemble(payload(['c1.xhtml', 'c2.xhtml']), [xhtml('<a href="c2.xhtml#old">x</a>'), xhtml('<a name="old"></a>')])
    expect(doc.querySelectorAll('section')[1]!.querySelector('a')!.id).toBe('old')
  })

  it('렌더링하지 않는 장이나 본문이 아닌 파일로 가는 링크는 링크를 없애고 글자는 남긴다', () => {
    assemble(payload(['c1.xhtml']), [xhtml('<a href="c3.xhtml">3장</a><a href="../Images/a.png">그림</a>')])
    const links = [...doc.querySelectorAll('a')]
    expect(links.map((a) => a.hasAttribute('href'))).toEqual([false, false])
    expect(links.map((a) => a.textContent)).toEqual(['3장', '그림'])
  })

  it('웹 링크는 남기고 javascript: 링크는 없앤다', () => {
    assemble(payload(['c1.xhtml']), [xhtml('<a href="https://example.com/">웹</a><a href="javascript:alert(1)">x</a>')])
    expect([...doc.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['https://example.com/', null])
  })

  it('스크립트와 이벤트 처리기 속성을 지운다', () => {
    assemble(payload(['c1.xhtml']), [xhtml('<script>alert(1)</script><img src="a.png" onerror="alert(2)" loading="lazy"/>')])
    expect(doc.querySelector('script')).toBeNull()
    const img = doc.querySelector('img')!
    expect(img.hasAttribute('onerror')).toBe(false)
    expect(img.hasAttribute('loading')).toBe(false)
  })

  it('SVG 그림의 xlink:href를 절대 주소로 바꾼다', () => {
    assemble(payload(['c1.xhtml']), [
      xhtml(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="../Images/cover.jpg" width="10" height="10"/></svg>'
      )
    ])
    const image = doc.querySelector('image')!
    expect(image.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('epub://book1/OEBPS/Images/cover.jpg')
  })

  it('본문이 SVG 문서 하나인 장도 넣는다', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'
    assemble(payload(['c1.xhtml']), [svg])
    expect(doc.querySelector('section svg rect')).not.toBeNull()
  })

  it('다시 조립하면 이전 내용을 지운다', () => {
    assemble(payload(['c1.xhtml']), [xhtml('<p>처음</p>')])
    assemble(payload(['c2.xhtml']), [xhtml('<p>다음</p>')])
    expect(doc.body.textContent).toBe('다음')
    expect(doc.querySelectorAll(`#${USER_STYLE_ID}`)).toHaveLength(1)
  })
})

describe('그림 빼기', () => {
  const chapter1 = xhtml(
    '<p>앞</p><figure><img src="../Images/a.png" alt="가"/><figcaption>그림 1</figcaption></figure>' +
      '<p>글 <img src="../Images/icon.png" alt="아이콘"/> 글</p>' +
      '<div class="pic"><p><img src="../Images/b.png" alt="나"/></p></div><p>뒤</p>'
  )
  const cover = xhtml(
    '<div class="cover"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><image xlink:href="../Images/cover.jpg" width="10" height="10"/></svg></div>'
  )

  it('그림 목록과 assembleBook의 그림 번호가 같다', () => {
    const p = payload(['c1.xhtml', 'c2.xhtml'])
    const list = listImages(p, [chapter1, cover], new DOMParser())
    expect(list).toEqual([
      { key: '0:0', spineIndex: 0, src: 'epub://book1/OEBPS/Images/a.png', alt: '가' },
      { key: '0:1', spineIndex: 0, src: 'epub://book1/OEBPS/Images/icon.png', alt: '아이콘' },
      { key: '0:2', spineIndex: 0, src: 'epub://book1/OEBPS/Images/b.png', alt: '나' },
      { key: '1:0', spineIndex: 1, src: 'epub://book1/OEBPS/Images/cover.jpg', alt: '' }
    ])
    assemble(p, [chapter1, cover])
    expect([...doc.querySelectorAll(`[${IMAGE_KEY_ATTR}]`)].map((e) => e.getAttribute(IMAGE_KEY_ATTR))).toEqual(list.map((i) => i.key))
  })

  it('캡션이 딸린 figure는 통째로 뺀다', () => {
    const result = assemble(payload(['c1.xhtml'], { hiddenImages: ['0:0'] }), [chapter1])
    expect(doc.querySelector('figure')).toBeNull()
    expect(doc.body.textContent).not.toContain('그림 1')
    expect(result.hiddenImageCount).toBe(1)
  })

  it('글 속 그림은 그림만 빼고 글은 남긴다', () => {
    assemble(payload(['c1.xhtml'], { hiddenImages: ['0:1'] }), [chapter1])
    expect(doc.querySelector('img[alt="아이콘"]')).toBeNull()
    expect(doc.body.textContent).toContain('글  글')
  })

  it('그림만 있던 문단과 div도 함께 지워 빈 자리가 남지 않게 한다', () => {
    assemble(payload(['c1.xhtml'], { hiddenImages: ['0:2'] }), [chapter1])
    expect(doc.querySelector('.pic')).toBeNull()
    expect([...doc.querySelectorAll('section > p')].map((p) => p.textContent)).toEqual(['앞', '글  글', '뒤'])
  })

  it('그림 하나뿐인 SVG 표지는 SVG와 감싼 div까지 지우고, 비게 된 장은 통째로 뺀다', () => {
    assemble(payload(['c1.xhtml', 'c2.xhtml'], { hiddenImages: ['1:0'] }), [xhtml('<p>본문</p>'), cover])
    expect(doc.querySelector('svg')).toBeNull()
    expect(doc.querySelector('.cover')).toBeNull()
    expect([...doc.querySelectorAll('section')].map((s) => s.id)).toEqual(['epubtopdf-c0'])
  })

  it('그림을 빼지 않은 빈 장은 그대로 둔다', () => {
    assemble(payload(['c1.xhtml']), [xhtml('')])
    expect(doc.querySelectorAll('section')).toHaveLength(1)
  })

  it('같은 figure의 그림 두 개를 모두 빼도 오류가 없다', () => {
    const two = xhtml('<figure><img src="a.png"/><img src="b.png"/><figcaption>둘</figcaption></figure><p>글</p>')
    assemble(payload(['c1.xhtml'], { hiddenImages: ['0:0', '0:1'] }), [two])
    expect(doc.querySelector('figure')).toBeNull()
    expect(doc.body.textContent).toBe('글')
  })

  it('figure 안 그림 하나만 빼면 figure와 다른 그림은 남는다', () => {
    const two = xhtml('<figure><img src="a.png"/><img src="b.png"/><figcaption>둘</figcaption></figure>')
    assemble(payload(['c1.xhtml'], { hiddenImages: ['0:0'] }), [two])
    expect(doc.querySelectorAll('figure img')).toHaveLength(1)
    expect(doc.querySelector('figcaption')).not.toBeNull()
  })
})
