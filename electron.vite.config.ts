import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        // 앱 창용과 렌더링 창용 preload. 샌드박스 preload는 다른 파일을 불러올 수 없으므로
        // 두 진입점이 런타임 코드를 공유하지 않게 한다 (공유 청크가 생기면 빌드 결과를 확인할 것).
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          render: resolve(__dirname, 'src/preload/render.ts')
        }
      }
    }
  },
  renderer: {
    resolve: { alias: shared },
    plugins: [react()]
  }
})
