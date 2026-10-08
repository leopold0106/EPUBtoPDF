/**
 * 명령줄 변환 (창을 띄우지 않는다). 자동 테스트와 일괄 변환에 쓴다.
 *   EPUBtoPDF --convert 책.epub [--out 책.pdf] [--settings 설정.json]
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { normalizeEdits } from '@shared/edits'
import { normalizeSettings } from '@shared/settings'
import { openBookFile } from './books'
import type { CliArgs } from './cli-args'
import { convertBook, settingsErrors } from './convert'
import { library } from './epub/library'

/** 변환하고 종료 코드를 돌려준다. */
async function readJson(path: string | undefined, label: string): Promise<{ value: unknown } | undefined> {
  if (!path) return { value: {} }
  try {
    return { value: JSON.parse(await readFile(resolve(path), 'utf8')) }
  } catch (err) {
    console.error(`${label} 파일을 읽을 수 없습니다: ${path} (${err instanceof Error ? err.message : err})`)
    return undefined
  }
}

export async function runCli(args: CliArgs): Promise<number> {
  const rawSettings = await readJson(args.settingsPath, '설정')
  const rawEdits = await readJson(args.editsPath, '편집')
  if (!rawSettings || !rawEdits) return 2
  const settings = normalizeSettings(rawSettings.value)
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
    const result = await convertBook(book, settings, args.output, { edits: normalizeEdits(rawEdits.value) })
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
