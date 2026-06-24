import { BrowserWindow } from 'electron'
import { WebSocketServer, WebSocket } from 'ws'
import * as net from 'net'
import * as path from 'path'
import { is } from '@electron-toolkit/utils'
import { getClient, disconnectSSH } from './sshManager'

// Each VNC session bridges noVNC (a browser RFB client) ↔ a real VNC server over
// a loopback WebSocket. The server side of that bridge is either a direct TCP
// socket (LAN-reachable VNC) or — when `viaSessionId` is set — a channel opened
// on a live SSH session via forwardOut. The tunnelled case is what lets a
// headless Wayland box (wayvnc on 127.0.0.1) be reached from afar: SSH to a
// bastion/VPS, then forward to the VNC port as the SSH server sees it.
interface VNCProxy {
  wss: WebSocketServer
  win: BrowserWindow
  /** SSH session carrying the tunnel; torn down with the VNC window. */
  jumpSessionId?: string
}

const activeProxies = new Map<string, VNCProxy>()

/** Open the upstream leg toward the VNC server, tunnelled through SSH or direct. */
function dialUpstream(
  host: string,
  port: number,
  viaSessionId: string | undefined,
  onData: (chunk: Buffer) => void,
  onClose: () => void
): { write: (b: Buffer) => void; close: () => void } {
  if (viaSessionId) {
    const client = getClient(viaSessionId)
    if (!client) { onClose(); return { write: () => {}, close: () => {} } }
    let stream: NodeJS.ReadWriteStream | null = null
    const pending: Buffer[] = []
    client.forwardOut('127.0.0.1', 0, host, port, (err, s) => {
      if (err || !s) { onClose(); return }
      stream = s as unknown as NodeJS.ReadWriteStream
      stream.on('data', (d: Buffer) => onData(d))
      stream.on('close', onClose)
      stream.on('error', onClose)
      for (const b of pending) stream.write(b)
      pending.length = 0
    })
    return {
      write: (b) => { if (stream) stream.write(b); else pending.push(b) },
      close: () => { try { stream?.end() } catch { /* gone */ } }
    }
  }

  const tcp = net.connect(port, host)
  tcp.on('data', (d) => onData(d))
  tcp.on('close', onClose)
  tcp.on('error', onClose)
  return {
    write: (b) => { if (tcp.writable) tcp.write(b) },
    close: () => tcp.destroy()
  }
}

export function createVNCProxy(
  sessionId: string,
  host: string,
  port: number,
  viaSessionId?: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })

    wss.on('listening', () => {
      const wsPort = (wss.address() as net.AddressInfo).port
      activeProxies.set(sessionId, { wss, win: null as any, jumpSessionId: viaSessionId })
      resolve(wsPort)
    })

    wss.on('connection', (ws) => {
      const up = dialUpstream(
        host, port, viaSessionId,
        (chunk) => { if (ws.readyState === WebSocket.OPEN) ws.send(chunk) },
        () => { if (ws.readyState !== WebSocket.CLOSED) ws.close() }
      )

      ws.on('message', (data) => {
        up.write(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer))
      })
      ws.on('close', () => up.close())
      ws.on('error', () => up.close())
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
  try { if (entry.win && !entry.win.isDestroyed()) entry.win.close() } catch {}
  if (entry.jumpSessionId) { try { disconnectSSH(entry.jumpSessionId) } catch { /* gone */ } }
  activeProxies.delete(sessionId)
}
