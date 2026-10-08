// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { AssemblePayload } from '@shared/render'
import { assembleBook, IMAGE_KEY_ATTR, listImages } from '../../src/render/assemble'
import { buildEditorDocument, serializeEditorDocument } from '../../src/renderer/src/editor-doc'

const URL1 = 'epub://book1/OEBPS/Text/c1.xhtml'

const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko">
<head><title>첫 장</title><link rel="stylesheet" href="../Styles/book.css"/><script>alert(1)</script></head>
<body class="chap" onload="x()">
<h1 id="h">첫 장</h1>
<p>첫째 문단</p>
<p><img src="../Images/a.png" alt="가"/></p>
<p class="caption">▲ 그림 가 설명</p>
<p><a href="javascript:evil()">둘째</a> 문단</p>
<p><img src="../Images/b.png" alt="나"/></p>
</body></html>`

function editorDoc(): Document {
  const html = buildEditorDocument(chapter, 4, URL1)
  return new DOMParser().parseFromString(html, 'text/html')
}

const payload: AssemblePayload = {
  chapters: [{ index: 4, url: URL1 }],
  spineUrls: [URL1],
  keepEpubStyles: true,
  userCss: '',
  lang: 'ko'
}

describe('본문 편집기 문서', () => {
  it('상대 주소용 base와 원본 CSS를 넣고, 스크립트와 이벤트 속성은 뺀다', () => {
    const doc = editorDoc()
    expect(doc.querySelector('base')!.getAttribute('href')).toBe(URL1)
    expect(doc.querySelector('link[rel="stylesheet"]')!.getAttribute('href')).toBe('../Styles/book.css')
    expect(doc.querySelector('script')).toBeNull()
    expect(doc.body.hasAttribute('onload')).toBe(false)
    expect(doc.body.className).toBe('chap')
    expect(doc.documentElement.lang).toBe('ko')
    expect(doc.querySelector('a')!.hasAttribute('href')).toBe(false)
  })

  it('그림마다 처음 번호를 붙인다', () => {
    const doc = editorDoc()
    expect([...doc.querySelectorAll('img')].map((i) => i.getAttribute(IMAGE_KEY_ATTR))).toEqual(['4:0', '4:1'])
  })

  it('저장할 때 편집기용으로 넣은 것만 걷어낸다', () => {
    const doc = editorDoc()
    doc.body.contentEditable = 'true'
    const saved = new DOMParser().parseFromString(serializeEditorDocument(doc), 'text/html')
    expect(saved.querySelector('base')).toBeNull()
    expect(saved.querySelectorAll('style')).toHaveLength(0)
    expect(saved.body.hasAttribute('contenteditable')).toBe(false)
    expect(saved.querySelector('link[rel="stylesheet"]')).not.toBeNull()
    expect(saved.querySelector('h1')!.id).toBe('h')
  })

  it('고친 문서로 변환하면 지운 글은 빠지고, 그림 번호는 편집 전과 같다', () => {
    const doc = editorDoc()
    // 첫 그림과 그 설명, 첫째 문단을 지우고 새 문단을 넣는다.
    doc.querySelectorAll('p')[0]!.remove()
    doc.querySelector('img[alt="가"]')!.closest('p')!.remove()
    doc.querySelector('.caption')!.remove()
    const added = doc.createElement('p')
    added.textContent = '새로 넣은 문단'
    doc.body.appendChild(added)
    const saved = serializeEditorDocument(doc)

    const list = listImages(payload, [saved], new DOMParser())
    expect(list.map((i) => [i.key, i.alt])).toEqual([['4:1', '나']])

    const out = document.implementation.createHTMLDocument('render')
    assembleBook(out, { ...payload, hiddenImages: ['4:1'] }, [saved], new DOMParser())
    const text = out.body.textContent ?? ''
    expect(text).not.toContain('첫째 문단')
    expect(text).not.toContain('그림 가 설명')
    expect(text).toContain('둘째 문단')
    expect(text).toContain('새로 넣은 문단')
    expect(out.querySelectorAll('img')).toHaveLength(0)
  })

  it('다시 편집기에 넣어도 그림 번호는 그대로다', () => {
    const doc = editorDoc()
    doc.querySelector('img[alt="가"]')!.remove()
    const again = new DOMParser().parseFromString(buildEditorDocument(serializeEditorDocument(doc), 4, URL1), 'text/html')
    expect([...again.querySelectorAll('img')].map((i) => i.getAttribute(IMAGE_KEY_ATTR))).toEqual(['4:1'])
  })
})
