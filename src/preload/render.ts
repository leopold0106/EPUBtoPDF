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
  type ListImagesPayload
} from '@shared/render'
import { decodeText } from '@shared/text'
import { assembleBook, listImages as findImages, waitForResources } from '../render/assemble'

function readChapters(chapters: AssembleChapter[]): Promise<string[]> {
  return Promise.all(
    chapters.map(async (c) => {
      const res = await fetch(c.url)
      if (!res.ok) throw new Error(`${decodeURIComponent(new URL(c.url).pathname)}을(를) 읽지 못했습니다 (${res.status}).`)
      return decodeText(new Uint8Array(await res.arrayBuffer()))
    })
  )
}

async function assemble(payload: AssemblePayload): Promise<AssembleResult> {
  const result = assembleBook(document, payload, await readChapters(payload.chapters), new DOMParser())
  result.warnings.push(...(await waitForResources(document)))
  return result
}

async function listImages(payload: ListImagesPayload): Promise<ImageInfo[]> {
  return findImages(payload, await readChapters(payload.chapters), new DOMParser())
}

contextBridge.exposeInMainWorld(RENDER_API_NAME, { assemble, listImages })
