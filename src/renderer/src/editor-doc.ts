/**
 * 본문 편집기용 문서 만들기와 되돌려 받기.
 *
 * 장 문서를 HTML 문서로 옮기고(스크립트·이벤트 속성 제거), 그림에 번호 속성을 붙이고,
 * 상대 주소가 그대로 동작하도록 <base>를 넣는다. 편집을 마치면 편집기용으로 넣은 것만 걷어내
 * 저장한다. 저장한 문서는 렌더링 창이 원본 장 대신 읽는다.
 */

import { contentRoot, parseChapter, stampImageKeys } from '../../render/assemble'

const EDITOR_BASE_ID = 'epubtopdf-editor-base'
const EDITOR_STYLE_ID = 'epubtopdf-editor-style'

const EDITOR_CSS = `
html { background: #fff; color: #18181b; }
body { max-width: 680px; margin: 24px auto !important; padding: 0 28px 120px !important; line-height: 1.7; }
img, svg { max-width: 100%; height: auto; }
:focus { outline: none; }
::selection { background: #bfdbfe; }
`

function stripUnsafe(root: Element): void {
  for (const el of root.querySelectorAll('script, base, meta, iframe, object, embed')) el.remove()
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      if (attr.name.toLowerCase().startsWith('on')) el.removeAttributeNode(attr)
      else if (/^\s*javascript:/i.test(attr.value)) el.removeAttributeNode(attr)
    }
  }
}

/** 장 문서(XHTML/HTML 글)를 편집기에 넣을 HTML로 만든다. */
export function buildEditorDocument(text: string, spineIndex: number, chapterUrl: string, parser = new DOMParser()): string {
  const source = parseChapter(text, parser)
  stampImageKeys(source, spineIndex)
  const doc = document.implementation.createHTMLDocument('')
  doc.head.replaceChildren()

  const base = doc.createElement('base')
  base.id = EDITOR_BASE_ID
  base.href = chapterUrl
  doc.head.appendChild(base)

  const meta = doc.createElement('meta')
  meta.setAttribute('charset', 'utf-8')
  doc.head.appendChild(meta)

  const title = source.querySelector('title')
  if (title) doc.head.appendChild(doc.importNode(title, true))
  for (const node of source.querySelectorAll('head link, head style')) {
    const isSheet = node.localName === 'style' || (node.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).includes('stylesheet')
    if (isSheet) doc.head.appendChild(doc.importNode(node, true))
  }

  const root = contentRoot(source)
  const html = source.documentElement
  for (const name of ['lang', 'xml:lang', 'dir']) {
    const value = html.getAttribute(name)
    if (value) doc.documentElement.setAttribute(name === 'xml:lang' ? 'lang' : name, value)
  }
  if (root === html && root.localName === 'svg') {
    doc.body.appendChild(doc.importNode(root, true))
  } else {
    for (const attr of [...root.attributes]) doc.body.setAttribute(attr.name, attr.value)
    for (const child of [...root.childNodes]) doc.body.appendChild(doc.importNode(child, true))
  }
  stripUnsafe(doc.body)

  const style = doc.createElement('style')
  style.id = EDITOR_STYLE_ID
  style.textContent = EDITOR_CSS
  doc.head.appendChild(style)
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
}

/** 편집기 문서에서 편집기용으로 넣은 것을 걷어내고 저장할 HTML을 만든다. */
export function serializeEditorDocument(doc: Document): string {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement
  clone.querySelector(`#${EDITOR_BASE_ID}`)?.remove()
  clone.querySelector(`#${EDITOR_STYLE_ID}`)?.remove()
  for (const el of clone.querySelectorAll('[contenteditable]')) el.removeAttribute('contenteditable')
  clone.removeAttribute('contenteditable')
  return `<!DOCTYPE html>\n${clone.outerHTML}`
}
