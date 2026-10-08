import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/** 빌드된 앱(out/)을 Electron으로 실행해 실제 PDF를 만들어 보는 테스트. `npm run test:e2e` */
export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  test: { include: ['tests/e2e/**/*.e2e.test.ts'], testTimeout: 120000, hookTimeout: 120000, fileParallelism: false }
})
