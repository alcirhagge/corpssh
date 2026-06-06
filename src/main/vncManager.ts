import { BrowserWindow, app } from 'electron'
import { WebSocketServer, WebSocket } from 'ws'
import * as net from 'net'
import * as path from 'path'
import { is } from '@electron-toolkit/utils'

const activeProxies = new Map<string, { wss: WebSocketServer; win: BrowserWindow }>()

export function createVNCProxy(
  sessionId: string,
  host: string,
  port: number
): Promise<number> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })

    wss.on('listening', () => {
      const wsPort = (wss.address() as net.AddressInfo).port
      activeProxies.set(sessionId, { wss, win: null as any })
      resolve(wsPort)
    })

    wss.on('connection', (ws) => {
      const tcp = net.connect(port, host)

      ws.on('message', (data) => {
        if (tcp.writable) tcp.write(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer))
      })

      tcp.on('data', (data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data)
      })

      ws.on('close', () => tcp.destroy())
      tcp.on('close', () => { if (ws.readyState !== WebSocket.CLOSED) ws.close() })
      tcp.on('error', () => ws.close())
      ws.on('error', () => tcp.destroy())
    })

    wss.on('error', reject)
  })
}

function toFileUrl(p: string): string {
  return 'file:///' + p.replace(/\\/g, '/')
}

export function openVNCWindow(
  sessionId: string,
  wsPort: number,
  serverName: string,
  host: string,
  password?: string
): void {
  const htmlPath = is.dev
    ? path.join(process.cwd(), 'resources', 'vnc-viewer.html')
    : path.join(process.resourcesPath, 'vnc-viewer.html')

  const novncCorePath = is.dev
    ? path.join(process.cwd(), 'node_modules', '@novnc', 'novnc', 'core')
    : path.join(process.resourcesPath, 'novnc', 'core')

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: `VNC — ${serverName}`,
    frame: false,
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  win.loadFile(htmlPath, {
    query: {
      port: String(wsPort),
      host: `${serverName} (${host})`,
      password: password ?? '',
      rfbUrl: toFileUrl(path.join(novncCorePath, 'rfb.js'))
    }
  })

  const entry = activeProxies.get(sessionId)
  if (entry) activeProxies.set(sessionId, { ...entry, win })

  win.on('closed', () => closeVNCSession(sessionId))
}

export function closeVNCSession(sessionId: string): void {
  const entry = activeProxies.get(sessionId)
  if (!entry) return
  try { entry.wss.close() } catch {}
  try { if (!entry.win.isDestroyed()) entry.win.close() } catch {}
  activeProxies.delete(sessionId)
}
