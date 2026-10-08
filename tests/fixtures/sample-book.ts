/**
 * 실제 한국어 EPUB과 비슷한 구성의 샘플 책.
 * 제목 단계, 인용, 그림과 캡션, 각주, 표, 목록, 시(줄바꿈), 장면 전환 기호를 담는다.
 */

import { buildEpub, gradientPng, type FixtureChapter, type FixtureOptions } from './epub-builder'

const SENTENCES = [
  '아침 안개가 강을 따라 천천히 내려오고 있었다.',
  '그는 오래된 지도를 펼쳐 놓고 한참 동안 말이 없었다.',
  '마을 사람들은 그 다리가 언제 놓였는지 아무도 기억하지 못했다.',
  '바람이 바뀌면 배를 띄워야 한다고 노인은 말했다.',
  '창밖으로 보이는 산등성이에는 아직 눈이 남아 있었다.',
  '우리는 서로의 얼굴을 보지 않은 채 오랫동안 걸었다.',
  '책상 위에는 끝내 부치지 못한 편지 세 통이 놓여 있었다.',
  '시장 골목은 해가 지기 전에 이미 등불로 가득 찼다.',
  '그녀는 낡은 라디오의 주파수를 조심스럽게 돌렸다.',
  '그날 밤 우리는 처음으로 별자리의 이름을 하나씩 불러 보았다.',
  '기차는 예정보다 이십 분 늦게 작은 역에 멈춰 섰다.',
  '"내일은 비가 올 거야." 할머니는 무릎을 쓰다듬으며 말했다.',
  '돌담 너머로 감나무 가지가 길게 늘어져 있었다.',
  '아이들은 개울가에서 납작한 돌을 골라 물수제비를 떴다.',
  '그 편지에는 날짜도, 보낸 사람의 이름도 적혀 있지 않았다.',
  'Some travellers wrote their notes in English, and those pages smelled of old ink.',
  '등대지기는 매일 저녁 같은 시각에 계단을 올랐다.',
  '찻잔에서 피어오르는 김이 유리창에 희미한 무늬를 남겼다.'
]

/** 같은 입력이면 항상 같은 문단을 만든다. */
function paragraph(seed: number, sentences = 4 + (seed % 4)): string {
  const out: string[] = []
  let x = seed * 2654435761
  for (let i = 0; i < sentences; i++) {
    x = (x * 1103515245 + 12345) >>> 0
    out.push(SENTENCES[x % SENTENCES.length]!)
  }
  return out.join(' ')
}

function paragraphs(from: number, count: number): string {
  return Array.from({ length: count }, (_, i) => `<p>${paragraph(from + i)}</p>`).join('\n')
}

export const SAMPLE_CSS = `
body { margin: 0; padding: 0; }
p { margin: 0; text-indent: 1em; line-height: 1.6; text-align: justify; }
h1 { font-size: 1.6em; text-align: center; margin: 3em 0 2em; }
h2 { font-size: 1.25em; margin: 2em 0 1em; }
.epigraph { margin: 1em 2em 2em; font-size: 0.9em; color: #444; text-indent: 0; }
.epigraph .source { text-align: right; }
.scene-break { text-align: center; text-indent: 0; margin: 1em 0; }
figure { margin: 1.5em 0; text-align: center; }
figure img { width: 80%; }
figcaption { font-size: 0.85em; color: #555; }
.poem { margin: 1em 0 1em 3em; text-indent: 0; }
table { border-collapse: collapse; margin: 1em auto; }
th, td { border: 1px solid #888; padding: 0.2em 0.6em; }
.note { font-size: 0.85em; text-indent: 0; }
em { font-style: italic; }
.small { font-size: 0.8em; }
`

export function sampleChapters(): FixtureChapter[] {
  return [
    {
      id: 'cover',
      href: 'Text/cover.xhtml',
      title: '표지',
      body: `<div style="text-align:center"><img src="../Images/cover.png" alt="표지" style="width:100%"/></div>`,
      hideFromToc: true
    },
    {
      id: 'ch1',
      href: 'Text/chapter 01.xhtml',
      title: '제1장 강가의 아침',
      sections: [{ fragment: 's1-2', title: '다리 위에서' }],
      body: `<h1>제1장 강가의 아침</h1>
<blockquote class="epigraph"><p>길은 걷는 사람의 것이다.</p><p class="source">― 어느 여행자의 수첩</p></blockquote>
${paragraphs(1, 12)}
<p>그날의 기록은 짧았다<sup><a href="notes.xhtml#n1" id="r1" epub:type="noteref">1</a></sup>. ${paragraph(100)}</p>
<figure><img src="../Images/river.png" alt="강 그림"/><figcaption>그림 1. 새벽의 강</figcaption></figure>
${paragraphs(13, 8)}
<h2 id="s1-2">다리 위에서</h2>
${paragraphs(21, 10)}
<p class="scene-break">* * *</p>
<p>${paragraph(200)} <em>${paragraph(201, 1)}</em> <strong>${paragraph(202, 1)}</strong> <span class="small">${paragraph(203, 1)}</span></p>
${paragraphs(31, 10)}`
    },
    {
      id: 'ch2',
      href: 'Text/chapter 02.xhtml',
      title: '제2장 시장 골목',
      sections: [
        { fragment: 's2-1', title: '등불' },
        { fragment: 's2-2', title: '장부' }
      ],
      body: `<h1>제2장 시장 골목</h1>
<h2 id="s2-1">등불</h2>
${paragraphs(41, 10)}
<p class="poem">등불 하나 켜 두고<br/>오지 않는 배를 기다린다<br/>강물은 말없이<br/>어둠을 실어 나른다</p>
${paragraphs(51, 6)}
<h2 id="s2-2">장부</h2>
<p>상인이 보여 준 장부에는 다음과 같이 적혀 있었다<sup><a href="notes.xhtml#n2" id="r2" epub:type="noteref">2</a></sup>.</p>
<table>
<tr><th>품목</th><th>수량</th><th>값</th></tr>
<tr><td>소금</td><td>세 자루</td><td>열두 냥</td></tr>
<tr><td>등잔 기름</td><td>두 병</td><td>닷 냥</td></tr>
<tr><td>종이</td><td>한 묶음</td><td>석 냥</td></tr>
</table>
${paragraphs(57, 8)}
<ul><li>첫째, 해 뜨기 전에 문을 연다.</li><li>둘째, 저울은 매일 아침 확인한다.</li><li>셋째, 외상은 장부에 반드시 적는다.</li></ul>
${paragraphs(65, 12)}`
    },
    {
      id: 'ch3',
      href: 'Text/chapter 03.xhtml',
      title: '제3장 등대',
      body: `<h1>제3장 등대</h1>
${paragraphs(81, 30)}`
    },
    {
      id: 'notes',
      href: 'Text/notes.xhtml',
      title: '주석',
      linear: false,
      body: `<h1>주석</h1>
<aside epub:type="footnote" id="n1"><p class="note"><a href="chapter%2001.xhtml#r1">1</a>. 이 기록은 여행자의 수첩 세 번째 권에 실려 있다.</p></aside>
<aside epub:type="footnote" id="n2"><p class="note"><a href="chapter%2002.xhtml#r2">2</a>. 당시의 화폐 단위로, 지금과 직접 비교하기는 어렵다.</p></aside>`
    }
  ]
}

export function sampleBookOptions(overrides: Partial<FixtureOptions> = {}): FixtureOptions {
  return {
    version: 3,
    title: '강가의 기록',
    creators: ['김여행', '이기록'],
    language: 'ko',
    css: SAMPLE_CSS,
    chapters: sampleChapters(),
    coverHref: 'Images/cover.png',
    resources: [
      {
        href: 'Images/cover.png',
        mediaType: 'image/png',
        data: gradientPng(300, 450, [40, 70, 120], [200, 160, 90]),
        properties: 'cover-image'
      },
      { href: 'Images/river.png', mediaType: 'image/png', data: gradientPng(400, 200, [90, 140, 180], [230, 230, 210]) }
    ],
    ...overrides
  }
}

export function buildSampleBook(overrides: Partial<FixtureOptions> = {}): Promise<Uint8Array> {
  return buildEpub(sampleBookOptions(overrides))
}
