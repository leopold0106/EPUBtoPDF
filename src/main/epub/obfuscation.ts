/**
 * 글꼴 난독화 해제와 DRM 감지 (META-INF/encryption.xml).
 *
 * EPUB은 글꼴 파일의 앞부분을 책 식별자로 만든 키와 XOR 해서 넣을 수 있다.
 * 이는 DRM이 아니라 글꼴을 그대로 뽑아 쓰지 못하게 하는 장치이므로 풀어서 쓴다.
 *  - IDPF: SHA-1(공백을 뺀 고유 식별자) 키로 앞 1040바이트
 *  - Adobe: 식별자 UUID의 16바이트 키로 앞 1024바이트
 * 그 밖의 알고리즘(AES 등)으로 암호화된 항목은 DRM으로 본다.
 */

import { createHash } from 'node:crypto'
import { resolveHref } from './paths'
import { attr, descendantsNamed, firstDescendantNamed, parseMarkup } from './xml'

export const IDPF_ALGORITHM = 'http://www.idpf.org/2008/embedding'
export const ADOBE_ALGORITHM = 'http://ns.adobe.com/pdf/enc#RC'

export type EncryptionKind = 'idpf' | 'adobe' | 'drm'

/** encryption.xml을 읽어 경로별 암호화 방식을 돌려준다. */
export function parseEncryption(xml: string): Map<string, EncryptionKind> {
  const result = new Map<string, EncryptionKind>()
  const doc = parseMarkup(xml, true)
  for (const data of descendantsNamed(doc, 'encrypteddata')) {
    const method = firstDescendantNamed(data, 'encryptionmethod')
    const ref = firstDescendantNamed(data, 'cipherreference')
    const uri = ref && attr(ref, 'uri')
    if (!uri) continue
    // URI는 컨테이너 루트 기준이다.
    const path = resolveHref('', uri)?.path
    if (!path) continue
    const algorithm = (method && attr(method, 'algorithm')) ?? ''
    result.set(path, algorithm === IDPF_ALGORITHM ? 'idpf' : algorithm === ADOBE_ALGORITHM ? 'adobe' : 'drm')
  }
  return result
}

export function idpfKey(uniqueIdentifier: string): Uint8Array {
  const cleaned = uniqueIdentifier.replace(/[ \u0009\u000d\u000a]/g, '')
  return new Uint8Array(createHash('sha1').update(cleaned, 'utf8').digest())
}

/** 식별자 중 UUID에서 16바이트 키를 만든다. UUID가 없으면 undefined. */
export function adobeKey(identifiers: string[]): Uint8Array | undefined {
  for (const id of identifiers) {
    const hex = id.replace(/^urn:uuid:/i, '').replace(/-/g, '')
    if (/^[0-9a-f]{32}$/i.test(hex)) return Uint8Array.from(hex.match(/../g)!, (b) => parseInt(b, 16))
  }
  return undefined
}

/** 앞 `length`바이트를 키와 XOR 한 복사본을 만든다. 같은 함수로 난독화와 해제를 모두 한다. */
export function xorPrefix(data: Uint8Array, key: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(data)
  const n = Math.min(length, out.length)
  for (let i = 0; i < n; i++) out[i] ^= key[i % key.length]
  return out
}

export const IDPF_PREFIX_LENGTH = 1040
export const ADOBE_PREFIX_LENGTH = 1024
