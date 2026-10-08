/** BOM이나 XML 선언의 encoding을 보고 문자열로 바꾼다. 기본은 UTF-8. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3))
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))

  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 256))
  const declared = /^<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i.exec(head)?.[1]
  if (declared && !/^utf-?8$/i.test(declared)) {
    try {
      return new TextDecoder(declared).decode(bytes)
    } catch {
      // 모르는 인코딩이면 UTF-8로 읽는다.
    }
  }
  return new TextDecoder('utf-8').decode(bytes)
}
