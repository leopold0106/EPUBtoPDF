/** 실행 인자나 두 번째 실행(파일 탐색기에서 .epub 더블클릭)으로 넘어온 EPUB 파일. */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** 인자 중 마지막 .epub 파일 경로. 옵션(--로 시작)은 건너뛴다. */
export function findEpubArg(argv: string[], cwd = process.cwd()): string | undefined {
  for (let i = argv.length - 1; i >= 1; i--) {
    const arg = argv[i]!
    if (!arg.startsWith('-') && /\.epub$/i.test(arg)) {
      const path = resolve(cwd, arg)
      if (existsSync(path)) return path
    }
  }
  return undefined
}
