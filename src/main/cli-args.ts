import { basename, dirname, extname, join, resolve } from 'node:path'

export interface CliArgs {
  input: string
  output: string
  settingsPath?: string
  editsPath?: string
}

export const CLI_USAGE =
  '사용법: EPUBtoPDF --convert <책.epub> [--out <책.pdf>] [--settings <설정.json>] [--edits <편집.json>]'

/** `--convert`가 없으면 undefined (일반 GUI 실행). 형식이 틀리면 오류 메시지. */
export function parseCliArgs(argv: string[], cwd = process.cwd()): CliArgs | { error: string } | undefined {
  const at = argv.indexOf('--convert')
  if (at < 0) return undefined
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    const v = i >= 0 ? argv[i + 1] : undefined
    return v && !v.startsWith('--') ? v : undefined
  }
  const input = argv[at + 1]
  if (!input || input.startsWith('--')) return { error: CLI_USAGE }
  if (['--out', '--settings', '--edits'].some((flag) => argv.includes(flag) && !value(flag))) {
    return { error: CLI_USAGE }
  }
  const absInput = resolve(cwd, input)
  const out = value('--out')
  const settings = value('--settings')
  const edits = value('--edits')
  return {
    input: absInput,
    output: out ? resolve(cwd, out) : join(dirname(absInput), `${basename(absInput, extname(absInput))}.pdf`),
    settingsPath: settings ? resolve(cwd, settings) : undefined,
    editsPath: edits ? resolve(cwd, edits) : undefined
  }
}
