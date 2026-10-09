/**
 * 숨겨진 렌더링 창의 preload. 메인 프로세스가 `executeJavaScript`로 아래 함수들을 부른다.
 * 장 문서는 같은 `epub://` 출처에서 fetch로 읽는다.
 */

import { contextBridge } from 'electron'
import {
  RENDER_API_NAME,
  type AssembleChapter,
  type AssemblePayload,
  type AssembleResult,
  type ImageInfo,
  type ListImagesPayload,
  type NumberPagesPayload
} from '@shared/render'
import { NUMBER_PAGE_CLASS } from '@shared/stylesheet'
import { decodeText } from '@shared/text'
import { assembleBook, listImages as findImages, waitForResources } from '../render/assemble'
import { typeset } from '../render/typeset'

function readChapters(chapters: AssembleChapter[], overrides: Record<number, string> = {}): Promise<string[]> {
  return Promise.all(
    chapters.map(async (c) => {
      // 본문을 고친 장은 고친 문서를 쓴다.
      if (overrides[c.index] !== undefined) return overrides[c.index]!
      const res = await fetch(c.url)
      if (!res.ok) throw new Error(`${decodeURIComponent(new URL(c.url).pathname)}을(를) 읽지 못했습니다 (${res.status}).`)
      return decodeText(new Uint8Array(await res.arrayBuffer()))
    })
  )
}

async function assemble(payload: AssemblePayload): Promise<AssembleResult> {
  const result = assembleBook(document, payload, await readChapters(payload.chapters, payload.chapterOverrides), new DOMParser())
  result.warnings.push(...(await waitForResources(document)))
  if (payload.typeset) {
    typeset(document, payload.typeset)
    // 글자 크기가 바뀌면 새 글꼴 파일을 불러올 수 있다.
    await document.fonts.ready
  }
  return result
}

async function listImages(payload: ListImagesPayload): Promise<ImageInfo[]> {
  return findImages(payload, await readChapters(payload.chapters, payload.chapterOverrides), new DOMParser())
}

/** 본문을 인쇄한 뒤, 같은 창을 쪽 번호만 찍힌 빈 쪽들로 바꾼다. */
async function numberPages(payload: NumberPagesPayload): Promise<void> {
  for (const el of document.head.querySelectorAll('style, link')) el.remove()
  const body = document.createElement('body')
  for (let i = 0; i < payload.pageCount; i++) {
    const page = document.createElement('div')
    page.className = NUMBER_PAGE_CLASS
    body.appendChild(page)
  }
  document.body.replaceWith(body)
  if (payload.dir) document.documentElement.setAttribute('dir', payload.dir)
  const style = document.createElement('style')
  style.textContent = payload.css
  document.head.appendChild(style)
  await document.fonts.ready
}

contextBridge.exposeInMainWorld(RENDER_API_NAME, { assemble, listImages, numberPages })
