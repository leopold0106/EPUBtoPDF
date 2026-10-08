/**
 * 앱에서 직접 열어 볼 수 있는 샘플 EPUB을 만든다.
 *   npm run sample            → samples/강가의-기록.epub
 *   npm run sample -- out.epub
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { buildSampleBook } from '../tests/fixtures/sample-book'

async function main(): Promise<void> {
  const target = resolve(process.argv[2] ?? 'samples/강가의-기록.epub')
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, await buildSampleBook())
  console.log(`샘플 EPUB을 만들었습니다: ${target}`)
}

void main()
