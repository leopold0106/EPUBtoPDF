/** htmlparser2 위에 얹은 작은 XML/HTML 탐색 도우미. 이름공간 접두사는 무시한다. */

import { parseDocument } from 'htmlparser2'
import { isTag, type Document, type Element } from 'domhandler'
import { getChildren, textContent } from 'domutils'

export type { Document, Element }

/** `xml: true`면 대소문자를 보존하고 XML 규칙대로, 아니면 HTML처럼 너그럽게 읽는다. */
export function parseMarkup(text: string, xml: boolean): Document {
  return parseDocument(text, { xmlMode: xml, decodeEntities: true })
}

/** `dc:title` → `title`. HTML 모드에서는 이미 소문자다. */
export function localName(el: Element): string {
  const name = el.name
  const i = name.indexOf(':')
  return (i < 0 ? name : name.slice(i + 1)).toLowerCase()
}

export function childElements(node: Document | Element): Element[] {
  return getChildren(node).filter(isTag)
}

export function childrenNamed(node: Document | Element, name: string): Element[] {
  return childElements(node).filter((el) => localName(el) === name)
}

export function firstChildNamed(node: Document | Element, name: string): Element | undefined {
  return childElements(node).find((el) => localName(el) === name)
}

/** 문서 순서대로 이름이 같은 모든 하위 요소. */
export function descendantsNamed(node: Document | Element, name: string): Element[] {
  const out: Element[] = []
  const walk = (n: Document | Element): void => {
    for (const el of childElements(n)) {
      if (localName(el) === name) out.push(el)
      walk(el)
    }
  }
  walk(node)
  return out
}

export function firstDescendantNamed(node: Document | Element, name: string): Element | undefined {
  return descendantsNamed(node, name)[0]
}

/** 속성 값. `opf:role`처럼 접두사가 붙은 이름도 지역 이름으로 찾는다. */
export function attr(el: Element, name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const [key, value] of Object.entries(el.attribs)) {
    const k = key.toLowerCase()
    if (k === lower || k.endsWith(`:${lower}`)) return value
  }
  return undefined
}

/** 공백을 하나로 줄인 텍스트. */
export function text(node: Element): string {
  return textContent(node).replace(/\s+/g, ' ').trim()
}
