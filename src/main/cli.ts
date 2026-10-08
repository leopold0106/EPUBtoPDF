/**
 * 명령줄 변환 (창을 띄우지 않는다). 자동 테스트와 일괄 변환에 쓴다.
 *   EPUBtoPDF --convert 책.epub [--out 책.pdf] [--settings 설정.json]
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { normalizeSettings } from '@shared/settings'
import { openBookFile } from './books'
import type { CliArgs } from './cli-args'
import { convertBook, settingsErrors } from './convert'
import { library } from './epub/library'

/** 변환하고 종료 코드를 돌려준다. */
export async function runCli(args: CliArgs): Promise<number> {
  let rawSettings: unknown = {}
  if (args.settingsPath) {
    try {
      rawSettings = JSON.parse(await readFile(resolve(args.settingsPath), 'utf8'))
    } catch (err) {
      console.error(`설정 파일을 읽을 수 없습니다: ${args.settingsPath} (${err instanceof Error ? err.message : err})`)
      return 2
    }
  }
  const settings = normalizeSettings(rawSettings)
  const errors = settingsErrors(settings)
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    return 2
  }

  const opened = await openBookFile(args.input)
  if (!opened.ok) {
    console.error(opened.error)
    return 1
  }
  for (const w of opened.value.warnings) console.warn(`경고: ${w}`)
  const book = library.get(opened.value.id)!
  try {
    const result = await convertBook(book, settings, args.output)
    for (const w of result.warnings) console.warn(`경고: ${w}`)
    console.log(`${result.path} (${result.pageCount}쪽, ${result.seconds.toFixed(1)}초)`)
    return 0
  } catch (err) {
    console.error(`변환 실패: ${err instanceof Error ? err.message : err}`)
    return 1
  } finally {
    library.remove(book.id)
  }
}
