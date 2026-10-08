/**
 * 앱 화면을 실제로 띄워 조작하는 테스트 (Playwright의 Electron 드라이버).
 * 화면 사진을 test-results/gui/에 남긴다 (CI에서 결과물로 올린다).
 */

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { _electron, type ElectronApplication, type Page } from 'playwright-core'
import { buildSampleBook } from '../fixtures/sample-book'

const root = resolve(__dirname, '../..')
const electronPath = createRequire(import.meta.url)('electron') as unknown as string
const shots = join(root, 'test-results/gui')

let dir: string
let app: ElectronApplication
let win: Page

const shot = (name: string): Promise<Buffer> => win.screenshot({ path: join(shots, `${name}.png`) })

beforeAll(async () => {
  if (!existsSync(join(root, 'out/main/index.js'))) throw new Error('먼저 npm run build를 실행하세요.')
  dir = await mkdtemp(join(tmpdir(), 'epubtopdf-gui-'))
  await mkdir(shots, { recursive: true })
  const epub = join(dir, '강가의 기록.epub')
  await writeFile(epub, await buildSampleBook())
  app = await _electron.launch({
    executablePath: electronPath,
    args: [root, '--no-sandbox', `--user-data-dir=${join(dir, 'userdata')}`, epub]
  })
  win = await app.firstWindow()
  await win.setViewportSize({ width: 1400, height: 900 })
})

afterAll(async () => {
  await app?.close()
  if (dir) await rm(dir, { recursive: true, force: true })
})

/** 그림 상자가 보일 때까지 쪽을 하나씩 화면에 띄운다. */
async function scrollToFirstImage(): Promise<void> {
  const pages = await win.locator('.page').count()
  for (let i = 1; i <= pages; i++) {
    await win.evaluate((n) => document.querySelector(`[data-page="${n}"]`)?.scrollIntoView(), i)
    try {
      await win.locator('.image-box').first().waitFor({ timeout: 1500 })
      return
    } catch {
      // 다음 쪽
    }
  }
  throw new Error('미리보기에서 그림을 찾지 못했습니다.')
}

describe('앱 화면', () => {
  it('실행할 때 넘긴 EPUB을 열고 미리보기를 보여준다', async () => {
    await win.locator('.toolbar__file strong').waitFor({ timeout: 20000 })
    expect(await win.textContent('.toolbar__file')).toContain('강가의 기록')
    await win.locator('.page canvas').first().waitFor({ timeout: 30000 })
    await win.getByText(/책 전체 \d+쪽/).waitFor({ timeout: 30000 })
    await shot('1-preview')
  })

  it('미리보기에서 그림을 눌러 Delete로 빼고 Ctrl+Z로 되돌린다', async () => {
    await scrollToFirstImage()
    await win.locator('.image-box').first().click()
    await win.keyboard.press('Delete')
    await expect.poll(() => win.textContent('.tab >> nth=1'), { timeout: 20000 }).toContain('1개 뺌')
    await expect.poll(() => win.locator('.image-box').count(), { timeout: 20000 }).toBe(0)
    await shot('2-image-removed')
    await win.keyboard.press('Control+z')
    await expect.poll(() => win.textContent('.tab >> nth=1'), { timeout: 20000 }).toBe('그림')
  })

  it('쪽당 줄 수를 정하면 미리보기의 실측 줄 수가 따라온다', async () => {
    await win.click('label.choice__option:has-text("쪽당 줄 수 지정")')
    const lines = win.locator('.field:has(label:text-is("쪽당 줄 수")) input')
    await lines.fill('22')
    await lines.press('Enter')
    await win.evaluate(() => document.querySelector('[data-page="2"]')?.scrollIntoView())
    await win.getByText('쪽당 최대 22줄').waitFor({ timeout: 30000 })
    await shot('3-lines-per-page')
  })

  it('프리셋을 고르면 설정이 바뀐다', async () => {
    await win.selectOption('.preset-bar select', 'builtin:large-a4')
    await expect.poll(() => win.inputValue('.field:has(label:text-is("글자 크기")) input')).toBe('14')
    await shot('4-preset')
  })

  it('글꼴 칸은 글자를 모두 지울 수 있고, 한국어 이름으로 고를 수 있다', async () => {
    const input = win.getByRole('combobox', { name: '글꼴', exact: true })
    await input.click()
    await input.press('Control+a')
    await input.press('Backspace')
    expect(await input.inputValue()).toBe('')
    await input.pressSequentially('바탕')
    await input.press('Enter')
    await expect.poll(() => input.inputValue()).toBe('바탕')
    // 칸을 비운 채로 나가면 원래 글꼴로 돌아간다.
    await input.click()
    await input.press('Control+a')
    await input.press('Backspace')
    await win.locator('.typo-summary').click()
    await expect.poll(() => input.inputValue()).toBe('바탕')
    await shot('5-font-picker')
  })

  it('PDF로 변환한다', async () => {
    const out = join(dir, 'out.pdf')
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
    }, out)
    await win.click('text=PDF로 변환')
    await win.locator('.message--success').waitFor({ timeout: 60000 })
    expect(await win.textContent('.message--success')).toMatch(/변환을 마쳤습니다\. \d+쪽 · 책갈피 7개/)
    expect(existsSync(out)).toBe(true)
    await shot('6-converted')
  })
})
