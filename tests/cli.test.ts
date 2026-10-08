import { describe, expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import { normalizeEdits } from '@shared/edits'
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
      settingsPath: undefined,
      editsPath: undefined
    })
  })

  it('출력 경로와 설정 파일을 받는다', () => {
    expect(parseCliArgs(['app.exe', '--settings', 's.json', '--convert', 'a.epub', '--out', 'o/b.pdf'], cwd)).toEqual({
      input: join(cwd, 'a.epub'),
      output: join(cwd, 'o/b.pdf'),
      settingsPath: join(cwd, 's.json'),
      editsPath: undefined
    })
  })

  it('값이 빠진 옵션은 사용법 오류', () => {
    expect(parseCliArgs(['app.exe', '--convert'], cwd)).toEqual({ error: CLI_USAGE })
    expect(parseCliArgs(['app.exe', '--convert', '--out', 'x.pdf'], cwd)).toEqual({ error: CLI_USAGE })
    expect(parseCliArgs(['app.exe', '--convert', 'a.epub', '--out'], cwd)).toEqual({ error: CLI_USAGE })
    expect(parseCliArgs(['app.exe', '--convert', 'a.epub', '--settings', '--out', 'x.pdf'], cwd)).toEqual({ error: CLI_USAGE })
    expect(parseCliArgs(['app.exe', '--convert', 'a.epub', '--edits'], cwd)).toEqual({ error: CLI_USAGE })
  })
})

describe('normalizeEdits', () => {
  it('형식이 맞는 그림 키만 남기고 중복을 없앤다', () => {
    expect(normalizeEdits({ hiddenImages: ['0:1', '0:1', 'x', 3, '2:10'] })).toEqual({ hiddenImages: ['0:1', '2:10'] })
    expect(normalizeEdits(null)).toEqual({ hiddenImages: [] })
    expect(normalizeEdits({ hiddenImages: 'all' })).toEqual({ hiddenImages: [] })
  })

  it('고친 장은 숫자 위치와 문자열 문서만 남긴다', () => {
    expect(normalizeEdits({ hiddenImages: [], chapters: { '2': '<p>a</p>', x: '<p>b</p>', '3': 5 } })).toEqual({
      hiddenImages: [],
      chapters: { 2: '<p>a</p>' }
    })
    expect(normalizeEdits({ hiddenImages: [], chapters: ['<p>a</p>'] })).toEqual({ hiddenImages: [] })
    expect(normalizeEdits({ hiddenImages: [], chapters: {} })).toEqual({ hiddenImages: [] })
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
