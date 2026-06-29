import { app, shell, BrowserWindow, ipcMain, nativeImage, clipboard } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { setupIpcHandlers } from './ipcHandlers'
import { disconnectAll, hasActiveConnections } from './sshManager'

let mainWindow: BrowserWindow | null = null

// ─── Deep link (corpssh://) — used for password-recovery from the email link ──
// The recovery email opens corpssh://auth-recovery#access_token=...&refresh_token=...
// which lands here; we forward the tokens to the renderer to set a new password.
let pendingRecovery: { access_token: string; refresh_token: string; type: string | null } | null = null

function handleDeepLink(url: string): void {
  try {
    const frag = url.includes('#') ? url.split('#')[1] : url.split('?')[1] ?? ''
    const p = new URLSearchParams(frag)
    const access_token = p.get('access_token')
    const refresh_token = p.get('refresh_token')
    if (!access_token || !refresh_token) return
    const payload = { access_token, refresh_token, type: p.get('type') }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      mainWindow.webContents.send('cloud:recovery', payload)
    } else {
      pendingRecovery = payload
    }
  } catch { /* ignore malformed links */ }
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update:checking')
  })

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', {
      version: info.version,
      releaseNotes: info.releaseNotes
    })
  })

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update:not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:downloaded', { version: info.version })
    // Instala silenciosamente quando o app for fechado
    // isSilent=true: sem janela do instalador
    // isForceRunAfter=true: reabre o app automaticamente
    autoUpdater.autoInstallOnAppQuit = true
  })

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update:error', err.message)
  })
}

function createWindow(): void {
  // process.resourcesPath aponta para a pasta resources/ fora do asar
  const iconPath = join(process.resourcesPath, 'icon.png')
  const appIcon = nativeImage.createFromPath(iconPath)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Content-Security-Policy for the renderer. Only in production: the dev server
  // needs inline/eval + ws for HMR, which a strict CSP would break. The packaged
  // renderer is a static local bundle, so 'self' + inline styles is enough.
  if (!is.dev) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, cb) => {
      // The VNC viewer (vnc-viewer.html) is local trusted content with an inline
      // <script> for the RFB connect logic. A strict `script-src 'self'` would
      // block that inline script and kill the viewer in packaged builds. It loads
      // only a local bundle and a loopback ws, so exempt it from the app CSP.
      if (details.url.includes('vnc-viewer.html')) {
        cb({ responseHeaders: details.responseHeaders })
        return
      }
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; " +
            "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
          ]
        }
      })
    })
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    if (pendingRecovery) {
      mainWindow!.webContents.send('cloud:recovery', pendingRecovery)
      pendingRecovery = null
    }
    if (!is.dev) {
      setTimeout(() => autoUpdater.checkForUpdates(), 3000)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Never open in-app popups; only hand off safe external schemes to the OS.
    if (/^https?:\/\//i.test(details.url) || details.url.startsWith('mailto:')) {
      shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  // The app is a single local page. Block any attempt to navigate the main
  // window away from it (e.g. a malicious link or injected content).
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    const ok = is.dev && rendererUrl ? url.startsWith(rendererUrl) : url.startsWith('file://')
    if (!ok) event.preventDefault()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false))
}

// Register the corpssh:// protocol (dev needs the electron exe + script path).
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('corpssh', process.execPath, [resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('corpssh')
}

// Single-instance: a second launch (e.g. clicking the recovery link) forwards its
// URL to the already-running instance instead of opening a new window.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a) => a.startsWith('corpssh://'))
    if (url) handleDeepLink(url)
    else if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() }
  })
  // macOS delivers the URL via open-url
  app.on('open-url', (event, url) => { event.preventDefault(); handleDeepLink(url) })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.corporate.ssh-client')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Native clipboard via main process. The Electron `clipboard` module is NOT
  // available in a sandboxed preload (sandbox:true), so the renderer routes
  // through here. readText is synchronous (sendSync) to keep the paste-on-
  // right-click path a single uninterrupted gesture.
  ipcMain.on('clipboard:readText', (e) => {
    e.returnValue = clipboard.readText()
  })
  ipcMain.on('clipboard:writeText', (_e, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized())
  // isSilent=true: instalador roda sem janela visível
  // isForceRunAfter=true: reabre automaticamente após instalar
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall(true, true))
  ipcMain.handle('update:check', () => {
    if (!is.dev) autoUpdater.checkForUpdates()
  })

  setupAutoUpdater()
  setupIpcHandlers()
  createWindow()

  // Windows cold-start: the deep link arrives in argv on first launch.
  const initialUrl = process.argv.find((a) => a.startsWith('corpssh://'))
  if (initialUrl) handleDeepLink(initialUrl)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Gracefully close every live SSH session before exit. Without this, quit just
// lets the OS drop the TCP sockets — legacy gear (few VTY lines) may keep the
// line occupied until its own idle-timeout. We delay the real quit briefly so
// the SSH disconnect packets actually flush to the wire.
let isQuitting = false
app.on('before-quit', (e) => {
  if (isQuitting || !hasActiveConnections()) return
  e.preventDefault()
  isQuitting = true
  disconnectAll()
  setTimeout(() => app.quit(), 250)
})

export { mainWindow }
