/** EPUB(zip) 압축 파일 읽기. 항목은 필요할 때만 압축을 푼다. */

import JSZip from 'jszip'
import { EpubError } from './errors'

export class EpubArchive {
  private readonly lowerCaseIndex = new Map<string, string>()

  private constructor(private readonly zip: JSZip) {
    for (const name of Object.keys(zip.files)) {
      if (!zip.files[name]!.dir) this.lowerCaseIndex.set(name.toLowerCase(), name)
    }
  }

  static async open(data: Uint8Array | ArrayBuffer): Promise<EpubArchive> {
    try {
      return new EpubArchive(await JSZip.loadAsync(data))
    } catch (err) {
      throw new EpubError('not-zip', 'EPUB 파일을 열 수 없습니다. 파일이 손상되었거나 EPUB 형식이 아닙니다.', err)
    }
  }

  /** 대소문자가 다른 경로도 찾아준다 (Windows에서 만든 EPUB에 흔하다). */
  resolve(path: string): string | undefined {
    if (this.zip.files[path] && !this.zip.files[path].dir) return path
    return this.lowerCaseIndex.get(path.toLowerCase())
  }

  has(path: string): boolean {
    return this.resolve(path) !== undefined
  }

  get paths(): string[] {
    return [...this.lowerCaseIndex.values()]
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const actual = this.resolve(path)
    if (!actual) throw new EpubError('missing-file', `EPUB 안에 ${path} 파일이 없습니다.`)
    return this.zip.files[actual]!.async('uint8array')
  }

  async readText(path: string): Promise<string> {
    return decodeText(await this.readBytes(path))
  }
}

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
