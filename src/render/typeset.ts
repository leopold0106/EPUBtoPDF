/**
 * 조립을 마친 문서를 브라우저가 계산한 스타일을 보고 다듬는다 (렌더링 창 안에서 인쇄 직전에 실행).
 *
 * 1. 본문 문단 찾기: 글자가 가장 많이 쓰인 문단 모양(글자 크기·들여쓰기·정렬)을 본문으로 보고
 *    `BODY_TEXT_CLASS`를 붙인다. 설정의 들여쓰기·정렬·글꼴은 이 문단에만 적용해, 원본의 특수 문단
 *    (시, 가운데 정렬, 첫 문단 들여쓰기 없음 등)은 그대로 둔다.
 * 2. 글자 크기 맞추기(원본 스타일 유지 모드): 모든 글자 크기에 (설정 크기 ÷ 원본 본문 크기)를 곱한다.
 *    본문은 정확히 설정 크기가 되고 제목·작은 글씨·각주의 비율은 원본대로 남는다.
 * 3. 줄 격자 맞춤: 글줄 안의 인라인 요소가 줄 높이를 늘리지 않게 하고, 줄이 격자에서 벗어나게 하는
 *    블록(그림, 표, em 단위 여백 등) 다음의 글이 다시 격자 위에서 시작하도록 위 안쪽 여백을 더한다.
 */

import { BODY_TEXT_CLASS, CHAPTER_CLASS } from '@shared/stylesheet'

const SVG_NS = 'http://www.w3.org/2000/svg'

// ---------------------------------------------------------------------------
// 본문 문단 고르기 (순수 함수: 테스트하기 쉽게 스타일 읽기와 나눈다)

export interface TextBlockSample {
  fontPx: number
  indentPx: number
  align: string
  /** 이 블록에 직접 들어 있는 글자 수. 많이 쓰인 모양을 고를 때 가중치로 쓴다. */
  chars: number
}

export interface BodyStyle {
  fontPx: number
  indentPx: number
  align: string
}

const normalizeAlign = (align: string): string => (align === 'left' || align === 'start' ? 'start' : align)

/** 글자 수로 가중한 가장 흔한 문단 모양. 문단이 없으면 undefined. */
export function pickBodyStyle(samples: TextBlockSample[]): BodyStyle | undefined {
  const totals = new Map<string, { style: BodyStyle; chars: number }>()
  for (const s of samples) {
    if (s.chars <= 0) continue
    const style = { fontPx: Math.round(s.fontPx * 4) / 4, indentPx: Math.round(s.indentPx), align: normalizeAlign(s.align) }
    const key = `${style.fontPx}|${style.indentPx}|${style.align}`
    const entry = totals.get(key) ?? { style, chars: 0 }
    entry.chars += s.chars
    totals.set(key, entry)
  }
  let best: { style: BodyStyle; chars: number } | undefined
  for (const entry of totals.values()) if (!best || entry.chars > best.chars) best = entry
  return best?.style
}

/** 본문 모양과 같은 문단인가. 들여쓰기는 1px, 글자 크기는 0.5px까지 차이를 허용한다. */
export function matchesBodyStyle(sample: TextBlockSample, body: BodyStyle): boolean {
  return (
    Math.abs(sample.fontPx - body.fontPx) <= 0.5 &&
    Math.abs(sample.indentPx - body.indentPx) <= 1 &&
    normalizeAlign(sample.align) === body.align
  )
}

// ---------------------------------------------------------------------------
// DOM

/** 직접 들어 있는 (공백이 아닌) 글자 수. */
function directChars(el: Element): number {
  let n = 0
  for (const node of el.childNodes) if (node.nodeType === 3) n += (node.textContent ?? '').trim().length
  for (const child of el.children) {
    // 문단 안의 강조·링크 등 인라인 요소의 글자도 문단 글자로 센다.
    if (getComputedStyle(child).display === 'inline') n += (child.textContent ?? '').trim().length
  }
  return n
}

const px = (v: string): number => parseFloat(v) || 0

function inSvg(el: Element): boolean {
  return el.namespaceURI === SVG_NS || el.closest('svg') !== null
}

/** 문단으로 볼 블록: 글자를 직접 담은 p와 div. */
function textBlocks(doc: Document): Element[] {
  return [...doc.body.querySelectorAll('p, div')].filter((el) => {
    if (inSvg(el)) return false
    const display = getComputedStyle(el).display
    return (display === 'block' || display === 'list-item') && directChars(el) > 0
  })
}

export interface TypesetOptions {
  /** 원본 스타일 유지 모드에서 본문 글자 크기(px). 지정하면 모든 글자 크기를 비율대로 바꾼다. */
  bodyFontPx?: number
  /** 줄 격자 맞춤: 줄 피치(px). */
  gridPx?: number
  /** 장마다 새 쪽에서 시작하면 장의 맨 위를 격자의 시작으로 본다. 아니면 문서 맨 위. */
  gridPerChapter?: boolean
}

export interface TypesetResult {
  bodyStyle?: BodyStyle
  scaledFonts: boolean
  gridAdjusted: number
}

export function typeset(doc: Document, options: TypesetOptions): TypesetResult {
  const blocks = textBlocks(doc)
  const samples = blocks.map((el) => {
    const cs = getComputedStyle(el)
    return { el, fontPx: px(cs.fontSize), indentPx: px(cs.textIndent), align: cs.textAlign, chars: directChars(el) }
  })
  const bodyStyle = pickBodyStyle(samples)

  let scaledFonts = false
  if (bodyStyle && options.bodyFontPx && Math.abs(bodyStyle.fontPx - options.bodyFontPx) > 0.01) {
    scaleFontSizes(doc, options.bodyFontPx / bodyStyle.fontPx)
    scaledFonts = true
  }
  if (bodyStyle) {
    for (const s of samples) if (matchesBodyStyle(s, bodyStyle)) s.el.classList.add(BODY_TEXT_CLASS)
  }

  let gridAdjusted = 0
  if (options.gridPx) {
    relaxInlineLineHeights(doc)
    gridAdjusted = alignToGrid(doc, options.gridPx, options.gridPerChapter ?? true)
  }
  return { bodyStyle, scaledFonts, gridAdjusted }
}

/** 모든 요소의 글자 크기에 같은 배율을 곱한다. 먼저 모두 읽고 나서 쓴다 (읽는 도중 값이 바뀌지 않게). */
function scaleFontSizes(doc: Document, ratio: number): void {
  const targets = [...doc.body.querySelectorAll<HTMLElement>('*')].filter((el) => !inSvg(el))
  const sizes = targets.map((el) => px(getComputedStyle(el).fontSize))
  targets.forEach((el, i) => el.style.setProperty('font-size', `${(sizes[i]! * ratio).toFixed(3)}px`, 'important'))
}

/**
 * 글줄 안의 인라인 요소는 줄 높이 0으로 둔다. 줄 높이가 같아도 글자 크기나 글꼴이 다르면
 * 인라인 상자가 기준선 위아래로 다르게 놓여 줄이 몇 px씩 커지기 때문이다.
 * 줄 상자의 높이는 블록의 줄 높이(strut)가 정한다.
 */
function relaxInlineLineHeights(doc: Document): void {
  const inline = [...doc.body.querySelectorAll<HTMLElement>('*')].filter(
    (el) => !inSvg(el) && !(el instanceof HTMLImageElement) && getComputedStyle(el).display === 'inline'
  )
  for (const el of inline) el.style.setProperty('line-height', '0', 'important')
}

const BLOCK_DISPLAYS = new Set(['block', 'list-item', 'flow-root', 'table', 'flex', 'grid'])

/**
 * 블록 흐름 안의 글 블록이 줄 격자 위에서 시작하게 한다. 그림·표 같은 덩어리 자체는 건드리지 않고,
 * 그 뒤에 오는 글 블록을 다음 격자 줄로 내린다.
 * 격자에서 벗어난 만큼 위 안쪽 여백을 더한다 (바깥 여백은 겹쳐 사라질 수 있어 쓰지 않는다).
 * 앞에서 고친 것이 뒤의 위치를 바꾸므로 문서 순서대로 하나씩 고치고 다시 잰다.
 */
export function alignToGrid(doc: Document, gridPx: number, perChapter: boolean): number {
  const win = doc.defaultView!
  const flowCache = new Map<Element, boolean>()

  // 조상이 모두 보통 블록 흐름인가 (표 칸, 띄운 요소, 절대 위치, 다단 안은 격자를 맞출 수 없다).
  const inBlockFlow = (el: Element): boolean => {
    const cached = flowCache.get(el)
    if (cached !== undefined) return cached
    let ok: boolean
    if (el === doc.body || el.classList.contains(CHAPTER_CLASS)) {
      ok = true
    } else {
      const cs = win.getComputedStyle(el)
      ok =
        (BLOCK_DISPLAYS.has(cs.display) || cs.display === 'contents') &&
        cs.display !== 'flex' &&
        cs.display !== 'grid' &&
        cs.display !== 'table' &&
        cs.float === 'none' &&
        (cs.position === 'static' || cs.position === 'relative') &&
        (cs.columnCount === 'auto' || cs.columnCount === '1') &&
        (el.parentElement ? inBlockFlow(el.parentElement) : true)
    }
    flowCache.set(el, ok)
    return ok
  }

  const candidates = [...doc.body.querySelectorAll('*')].filter((el) => {
    if (inSvg(el)) return false
    if (el.closest('.epubtopdf-image-links')) return false
    const cs = win.getComputedStyle(el)
    if (!BLOCK_DISPLAYS.has(cs.display) || cs.float !== 'none' || !(cs.position === 'static' || cs.position === 'relative')) return false
    if (!el.parentElement || !inBlockFlow(el.parentElement)) return false
    return directChars(el) > 0
  })

  const origin = (el: Element): number => {
    const ref = perChapter ? (el.closest(`.${CHAPTER_CLASS}`) ?? doc.body) : doc.body
    return ref.getBoundingClientRect().top
  }

  let adjusted = 0
  for (const el of candidates) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cs = win.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      if (rect.height === 0 && rect.width === 0) break
      const contentTop = rect.top + px(cs.borderTopWidth) + px(cs.paddingTop)
      const offset = (((contentTop - origin(el)) % gridPx) + gridPx) % gridPx
      if (offset < 0.05 || gridPx - offset < 0.05) break
      const delta = gridPx - offset
      ;(el as HTMLElement).style.setProperty('padding-top', `${(px(cs.paddingTop) + delta).toFixed(4)}px`, 'important')
      if (attempt === 0) adjusted++
    }
  }
  return adjusted
}
