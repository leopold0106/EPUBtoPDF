/** EPUB(zip) 압축 파일 읽기. 항목은 필요할 때만 압축을 푼다. */

import JSZip from 'jszip'
import { decodeText } from '@shared/text'
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
