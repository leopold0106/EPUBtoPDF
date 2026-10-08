/** 앱 데이터 폴더(Windows: %APPDATA%\EPUBtoPDF)에 JSON을 저장한다. */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export class JsonStore {
  private writing: Promise<void> = Promise.resolve()

  constructor(readonly file: string) {}

  /** 파일이 없거나 깨졌으면 undefined. */
  async read(): Promise<unknown> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8'))
    } catch {
      return undefined
    }
  }

  /** 쓰는 도중에 앱이 꺼져도 파일이 깨지지 않게 임시 파일에 쓴 뒤 이름을 바꾼다. 쓰기는 순서대로 한다. */
  write(value: unknown): Promise<void> {
    const run = this.writing.then(async () => {
      await mkdir(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
      await rename(tmp, this.file)
    })
    this.writing = run.catch(() => undefined)
    return run
  }
}
