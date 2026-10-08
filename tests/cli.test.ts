import { describe, expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import { safeFileName } from '@shared/filename'
import { CLI_USAGE, parseCliArgs } from '../src/main/cli-args'

describe('parseCliArgs', () => {
  const cwd = resolve('/work')

  it('--convert가 없으면 일반 실행', () => {
    expect(parseCliArgs(['electron', '.'], cwd)).toBeUndefined()
  })

  it('출력 경로를 생략하면 입력 파일 옆에 같은 이름의 PDF', () => {
    expect(parseCliArgs(['app.exe', '--convert', 'books/책.epub'], cwd)).toEqual({
      input: join(cwd, 'books/책.epub'),
      output: join(cwd, 'books/책.pdf'),
      settingsPath: undefined
    })
  })

  it('출력 경로와 설정 파일을 받는다', () => {
    expect(parseCliArgs(['app.exe', '--settings', 's.json', '--convert', 'a.epub', '--out', 'o/b.pdf'], cwd)).toEqual({
      input: join(cwd, 'a.epub'),
      output: join(cwd, 'o/b.pdf'),
      settingsPath: join(cwd, 's.json')
    })
  })

  it('값이 빠진 옵션은 사용법 오류', () => {
    expect(parseCliArgs(['app.exe', '--convert'], cwd)).toEqual({ error: CLI_USAGE })
    expect(parseCliArgs(['app.exe', '--convert', '--out', 'x.pdf'], cwd)).toEqual({ error: CLI_USAGE })
    expect(parseCliArgs(['app.exe', '--convert', 'a.epub', '--out'], cwd)).toEqual({ error: CLI_USAGE })
    expect(parseCliArgs(['app.exe', '--convert', 'a.epub', '--settings', '--out', 'x.pdf'], cwd)).toEqual({ error: CLI_USAGE })
  })
})

describe('safeFileName', () => {
  it('Windows에서 쓸 수 없는 문자를 공백으로 바꾼다', () => {
    expect(safeFileName('제목: 부제 / 2권?')).toBe('제목 부제 2권')
    expect(safeFileName('a<b>c|d*e"f')).toBe('a b c d e f')
  })

  it('끝의 마침표와 공백, 예약된 이름, 빈 이름을 피한다', () => {
    expect(safeFileName('책 이름...')).toBe('책 이름')
    expect(safeFileName('CON')).toBe('book')
    expect(safeFileName('???')).toBe('book')
  })

  it('너무 긴 이름은 자른다', () => {
    expect(safeFileName('가'.repeat(300))).toHaveLength(150)
  })
})
