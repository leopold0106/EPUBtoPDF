/**
 * 숨겨진 렌더링 창. 책 내용은 신뢰할 수 없으므로 별도 세션에서 열고,
 * 외부 네트워크 요청은 모두 막는다 (책 안의 파일과 data: URL만 허용).
 */

import { join } from 'node:path'
import { BrowserWindow, session, type Session } from 'electron'
import { FONT_SCHEME } from '@shared/fonts'
import { library } from '../epub/library'
import { EPUB_SCHEME, handleResourceRequest } from '../epub/protocol'
import { fontRegistry } from '../fonts'
import { handleFontRequest } from '../fonts/registry'

const PARTITION = 'epubtopdf-render'
let renderSession: Session | undefined

function getRenderSession(): Session {
  if (renderSession) return renderSession
  const ses = session.fromPartition(PARTITION, { cache: false })
  ses.protocol.handle(EPUB_SCHEME, (request) => handleResourceRequest(request.url, library.get))
  ses.protocol.handle(FONT_SCHEME, (request) => handleFontRequest(request.url, fontRegistry()))
  ses.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*', 'file://*/*'] },
    (_details, callback) => callback({ cancel: true })
  )
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  renderSession = ses
  return ses
}

/** 화면 레이아웃 너비를 판면 너비와 같게 맞춘 창을 만든다 (줄 격자 계산이 인쇄 결과와 일치하도록). */
export function createRenderWindow(contentWidthPx: number): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: Math.max(200, Math.ceil(contentWidthPx)),
    height: 800,
    useContentSize: true,
    webPreferences: {
      session: getRenderSession(),
      preload: join(__dirname, '../preload/render.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  return win
}
