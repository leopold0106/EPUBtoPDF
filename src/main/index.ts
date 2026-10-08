import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron'
import { FONT_SCHEME } from '@shared/fonts'
import { IpcChannels, type AppInfo } from '@shared/ipc'
import { registerBookIpc } from './books'
import { runCli } from './cli'
import { parseCliArgs } from './cli-args'
import { registerConvertIpc } from './convert'
import { library } from './epub/library'
import { EPUB_SCHEME, handleResourceRequest } from './epub/protocol'
import { fontRegistry, registerFontIpc } from './fonts'
import { handleFontRequest } from './fonts/registry'
import { findEpubArg } from './launch'
import { registerSettingsIpc } from './settings'

// 앱이 준비되기 전에 등록해야 한다. standard로 등록해야 문서 안의 상대 경로가 동작한다.
protocol.registerSchemesAsPrivileged([
  {
    scheme: EPUB_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  },
  {
    scheme: FONT_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
])

let mainWindow: BrowserWindow | undefined

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'EPUBtoPDF',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = undefined
  })
  mainWindow = win

  // 렌더러에서 연 외부 링크는 앱 안이 아니라 기본 브라우저로 연다.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

/** 실행할 때 넘어온 EPUB. 렌더러가 준비되면 한 번 가져간다. */
let launchFile: string | undefined

function registerIpc(): void {
  ipcMain.handle(IpcChannels.getAppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform
  }))
  ipcMain.handle(IpcChannels.takeLaunchFile, () => {
    const file = launchFile ?? null
    launchFile = undefined
    return file
  })
}

if (process.platform === 'win32') {
  // 작업 표시줄 그룹화와 알림에 쓰이는 ID. electron-builder.yml의 appId와 같아야 한다.
  app.setAppUserModelId('com.leopold0106.epubtopdf')
}

const cli = parseCliArgs(process.argv)

// 창은 하나만 띄운다. 이미 켜져 있으면 그 창에서 새 파일을 연다 (명령줄 변환은 예외).
const primary = cli !== undefined || app.requestSingleInstanceLock()
if (!primary) app.quit()

app.on('second-instance', (_event, argv, cwd) => {
  const win = mainWindow
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
  const file = findEpubArg(argv, cwd)
  if (file) win.webContents.send(IpcChannels.openRequest, file)
})

app.whenReady().then(async () => {
  if (!primary) return
  protocol.handle(EPUB_SCHEME, (request) => handleResourceRequest(request.url, library.get))
  protocol.handle(FONT_SCHEME, (request) => handleFontRequest(request.url, fontRegistry()))

  if (cli) {
    if ('error' in cli) {
      console.error(cli.error)
      app.exit(2)
      return
    }
    app.exit(await runCli(cli))
    return
  }

  launchFile = findEpubArg(process.argv)
  registerIpc()
  registerBookIpc()
  registerConvertIpc()
  registerSettingsIpc()
  registerFontIpc()
  createMainWindow()

  app.on('activate', () => {
    if (!mainWindow) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  // 명령줄 변환 중에는 렌더링 창을 닫아도 끝내지 않는다 (끝은 runCli가 정한다).
  if (!cli && process.platform !== 'darwin') app.quit()
})
