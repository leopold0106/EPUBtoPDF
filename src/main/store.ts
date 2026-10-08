/** 앱 데이터 폴더(Windows: %APPDATA%\EPUBtoPDF)에 JSON을 저장한다. */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
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
    return this.queue(async () => {
      await mkdir(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
      await renameWithRetry(tmp, this.file)
    })
  }

  /** 파일을 지운다. 앞서 요청한 쓰기가 끝난 뒤에 지운다. */
  remove(): Promise<void> {
    return this.queue(() => rm(this.file, { force: true }))
  }

  private queue(task: () => Promise<void>): Promise<void> {
    const run = this.writing.then(task)
    this.writing = run.catch(() => undefined)
    return run
  }
}

/** Windows에서는 백신 검사 등으로 파일이 잠깐 잠겨 이름 바꾸기가 실패할 수 있어 몇 번 다시 해 본다. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) throw err
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
    }
  }
}
