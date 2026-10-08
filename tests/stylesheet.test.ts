import { describe, expect, it } from 'vitest'
import type { Settings } from '@shared/settings'
import { buildStylesheet, CHAPTER_CLASS, cssString, fontFamilyList, headingGap, paragraphGap } from '@shared/stylesheet'
import { computeTypography } from '@shared/typography'
import { makeSettings } from './helpers'


const css = (s: Settings, ctx = {}): string => buildStylesheet(s, computeTypography(s), ctx)

describe('cssString', () => {
  it('따옴표와 역슬래시, 줄바꿈을 이스케이프한다', () => {
    expect(cssString('a"b')).toBe('"a\\"b"')
    expect(cssString('a\\b')).toBe('"a\\\\b"')
    expect(cssString('a\nb')).toBe('"a\\a b"')
  })

  it('제어 문자를 지워 CSS 밖으로 빠져나갈 수 없게 한다', () => {
    expect(cssString('a\u0000b\u001f')).toBe('"ab"')
    expect(cssString('"; } body { display: none')).toBe('"\\"; } body { display: none"')
  })
})

describe('fontFamilyList', () => {
  it('선택한 글꼴 뒤에 한글 대체 글꼴과 기본 계열을 붙인다', () => {
    const list = fontFamilyList(makeSettings({ font: { family: 'Nanum Myeongjo', generic: 'serif' } }))
    expect(list.startsWith('"Nanum Myeongjo", "Batang"')).toBe(true)
    expect(list.endsWith(', serif')).toBe(true)
  })

  it('선택한 글꼴이 대체 목록에 있으면 중복하지 않는다', () => {
    const list = fontFamilyList(makeSettings({ font: { family: 'Malgun Gothic', generic: 'sans-serif' } }))
    expect(list.match(/Malgun Gothic/g)).toHaveLength(1)
  })
})

describe('buildStylesheet: 쪽', () => {
  it('용지 크기와 여백을 @page에 넣는다', () => {
    const out = css(makeSettings({ page: { paper: 'A4' }, margins: { topMm: 25, bottomMm: 30, insideMm: 22, outsideMm: 18 } }))
    expect(out).toContain('size: 210mm 297mm;')
    expect(out).toContain('margin: 25mm 18mm 30mm 22mm;')
  })

  it('양면이면 짝수 쪽과 홀수 쪽의 좌우 여백을 뒤집는다', () => {
    const out = css(makeSettings({ margins: { insideMm: 22, outsideMm: 18, mirrored: true } }))
    expect(out).toContain('@page :left { margin-left: 18mm; margin-right: 22mm; }')
    expect(out).toContain('@page :right { margin-left: 22mm; margin-right: 18mm; }')
  })

  it('양면이 아니면 :left/:right 여백 규칙이 없다', () => {
    expect(css(makeSettings({ margins: { mirrored: false } }))).not.toContain('@page :left { margin')
  })

  it('쪽 번호 위치', () => {
    expect(css(makeSettings({ decor: { pageNumbers: 'bottom-center' } }))).toMatch(/@bottom-center \{ content: counter\(page\)/)
    expect(css(makeSettings({ decor: { pageNumbers: 'none' } }))).not.toContain('counter(page)')

    const outside = css(makeSettings({ decor: { pageNumbers: 'bottom-outside' }, margins: { mirrored: true } }))
    expect(outside).toMatch(/@page :left \{ @bottom-left \{ content: counter\(page\)/)
    expect(outside).toMatch(/@page :right \{ @bottom-right \{ content: counter\(page\)/)

    const single = css(makeSettings({ decor: { pageNumbers: 'top-outside' }, margins: { mirrored: false } }))
    expect(single).toMatch(/@page \{ @top-right \{ content: counter\(page\)/)
  })

  it('머리글에 책 제목을 이스케이프해서 넣는다', () => {
    const out = css(makeSettings({ decor: { header: 'bookTitle' } }), { bookTitle: '어린 "왕자"' })
    expect(out).toContain('@top-center { content: "어린 \\"왕자\\"";')
  })

  it('책 제목이 없으면 머리글을 넣지 않는다', () => {
    expect(css(makeSettings({ decor: { header: 'bookTitle' } }))).not.toContain('@top-center')
  })
})

describe('buildStylesheet: 본문', () => {
  it('계산된 글자 크기와 줄 피치를 쓴다', () => {
    const s = makeSettings({ text: { sizing: 'linesPerPage', linesPerPage: 24 } })
    const t = computeTypography(s)
    const out = buildStylesheet(s, t)
    expect(out).toContain(`font-size: ${t.fontSizePt}pt !important;`)
    expect(out).toContain(`line-height: ${t.lineHeightPx}px !important;`)
  })

  it('들여쓰기·정렬·줄바꿈 방식을 반영한다', () => {
    const out = css(makeSettings({ text: { textIndentEm: 2, align: 'start', wordBreak: 'keep-all' } }))
    expect(out).toContain('text-indent: 2em !important;')
    expect(out).toContain('text-align: start !important;')
    expect(out).toContain('word-break: keep-all !important;')
  })

  it('줄 격자 맞춤이 켜져 있으면 제목 높이를 줄 피치 단위로 올림한다', () => {
    const s = makeSettings({ text: { snapToGrid: true } })
    const line = computeTypography(s).lineHeightPx
    expect(css(s)).toContain(`line-height: round(up, 1.3em, ${line}px) !important;`)
    expect(css(makeSettings({ text: { snapToGrid: false } }))).not.toContain('round(up')
  })

  it('원본 유지 모드에는 기본 스타일이 없고, 무시 모드에는 있다', () => {
    expect(css(makeSettings({ layout: { epubStyles: 'keep' } }))).not.toContain('h1 { font-size: 1.6em')
    expect(css(makeSettings({ layout: { epubStyles: 'ignore' } }))).toContain('h1 { font-size: 1.6em')
  })

  it('장마다 새 쪽 시작', () => {
    expect(css(makeSettings({ layout: { chapterBreak: true } }))).toContain(`.${CHAPTER_CLASS} + .${CHAPTER_CLASS} { break-before: page; }`)
    expect(css(makeSettings({ layout: { chapterBreak: false } }))).not.toContain('break-before: page')
  })

  it('사용자 글꼴 파일을 @font-face로 넣는다', () => {
    const out = css(makeSettings({}), { fontFaces: [{ family: '내 글꼴', url: 'app-font://a.ttf' }] })
    expect(out).toContain('@font-face { font-family: "내 글꼴"; src: url("app-font://a.ttf");')
  })

  it('중괄호 짝이 맞는다', () => {
    const out = css(makeSettings({ decor: { pageNumbers: 'bottom-outside', header: 'bookTitle' } }), { bookTitle: '{제목}' })
    const withoutStrings = out.replace(/"(?:\\.|[^"\\])*"/g, '""')
    expect(withoutStrings.split('{').length).toBe(withoutStrings.split('}').length)
  })
})

describe('paragraphGap', () => {
  it('줄 격자 맞춤이 켜져 있으면 줄 단위로 반올림한다', () => {
    expect(paragraphGap(makeSettings({ text: { paragraphSpacing: 0.6, snapToGrid: true } }), 20)).toBe(20)
    expect(paragraphGap(makeSettings({ text: { paragraphSpacing: 0.6, snapToGrid: false } }), 20)).toBe(12)
  })
})

describe('buildStylesheet: 위첨자·아래첨자', () => {
  it('vertical-align 대신 상대 위치로 올려 줄 높이를 늘리지 않는다', () => {
    const out = css(makeSettings({}))
    expect(out).toContain('body :is(sup, sub) { line-height: 0 !important; vertical-align: baseline !important;')
    // 본문 줄 높이 규칙(특이도 0,0,2)보다 뒤에 와야 이긴다.
    expect(out.indexOf('body :is(sup, sub)')).toBeGreaterThan(out.indexOf('body, body :not('))
  })
})

describe('buildStylesheet: 문단과 링크', () => {
  it('문단은 위아래 여백만 정하고 좌우 여백은 원본에 맡긴다', () => {
    const out = css(makeSettings({ text: { paragraphSpacing: 1 } }))
    expect(out).toMatch(/p \{ margin-top: 0 !important; margin-bottom: [\d.]+px !important;/)
    expect(out).not.toMatch(/p \{ margin: /)
  })

  it('링크 색은 본문 색을 따르되 원본 CSS보다 우선하지 않는다', () => {
    expect(css(makeSettings({}))).toContain(':where(a:link, a:visited) { color: inherit; text-decoration: none; }')
  })
})

describe('원본 스타일 무시 모드의 간격', () => {
  const ignore = (text: Partial<Settings['text']> = {}) => makeSettings({ layout: { epubStyles: 'ignore' }, text })

  it('기본값: 문단 사이와 제목 위아래에 한 줄씩 띄운다', () => {
    const s = ignore()
    const line = computeTypography(s).lineHeightPx
    const out = css(s)
    expect(out).toContain(`margin-bottom: ${line}px !important; text-indent:`)
    expect(out).toMatch(new RegExp(`h1, h2, h3, h4, h5, h6 \\{ margin-top: ${line}px !important; margin-bottom: ${line}px !important; \\}`))
    expect(out).toContain(`:is(blockquote, ul, ol, dl, table, figure, pre) { margin-top: ${line}px; margin-bottom: ${line}px; }`)
  })

  it('장 첫머리 제목은 위 간격을 두지 않는다', () => {
    expect(css(ignore())).toContain('h1, h2, h3, h4, h5, h6:first-child { margin-top: 0 !important; }')
  })

  it('줄 격자 맞춤이 꺼져 있어도 무시 모드에서는 간격을 둔다', () => {
    const s = ignore({ snapToGrid: false, headingSpacing: 1.5 })
    const line = computeTypography(s).lineHeightPx
    expect(headingGap(s, line)).toBeCloseTo(line * 1.5)
    expect(paragraphGap(s, line)).toBe(line)
  })

  it('원본 스타일 유지 + 줄 격자 맞춤 꺼짐이면 제목 간격은 원본을 따른다', () => {
    const s = makeSettings({ layout: { epubStyles: 'keep' }, text: { snapToGrid: false } })
    expect(headingGap(s, 20)).toBeUndefined()
    expect(css(s)).not.toMatch(/h6 \{ margin-top:/)
    expect(css(s)).not.toContain(':is(blockquote')
  })

  it('원본 스타일 유지 모드의 문단 간격 기본값은 0', () => {
    expect(paragraphGap(makeSettings({ layout: { epubStyles: 'keep' } }), 20)).toBe(0)
  })

  it('제목 간격 0줄도 쓸 수 있다', () => {
    expect(css(ignore({ headingSpacing: 0 }))).toContain('h1, h2, h3, h4, h5, h6 { margin-top: 0px !important; margin-bottom: 0px !important; }')
  })
})
