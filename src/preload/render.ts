/**
 * 숨겨진 렌더링 창의 preload. 메인 프로세스가 `executeJavaScript`로 `assemble`을 부른다.
 * 장 문서는 같은 `epub://` 출처에서 fetch로 읽는다.
 */

import { contextBridge } from 'electron'
import { RENDER_API_NAME, type AssemblePayload, type AssembleResult } from '@shared/render'
import { decodeText } from '@shared/text'
import { assembleBook, waitForResources } from '../render/assemble'

async function assemble(payload: AssemblePayload): Promise<AssembleResult> {
  const texts = await Promise.all(
    payload.chapters.map(async (c) => {
      const res = await fetch(c.url)
      if (!res.ok) throw new Error(`${decodeURIComponent(new URL(c.url).pathname)}을(를) 읽지 못했습니다 (${res.status}).`)
      return decodeText(new Uint8Array(await res.arrayBuffer()))
    })
  )
  const result = assembleBook(document, payload, texts, new DOMParser())
  result.warnings.push(...(await waitForResources(document)))
  return result
}

contextBridge.exposeInMainWorld(RENDER_API_NAME, { assemble })
