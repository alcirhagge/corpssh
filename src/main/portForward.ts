import * as net from 'net'
import { BrowserWindow } from 'electron'
import { getClient, onSessionClosed } from './sshManager'

// ─── SSH port forwarding (tunnels) ───────────────────────────────────────────
// Three tunnel kinds, matching the OpenSSH flags:
//   local   (-L)  bindPort on this machine → dest reachable from the SSH server
//   remote  (-R)  bindPort on the SSH server → dest reachable from this machine
//   dynamic (-D)  bindPort on this machine = a SOCKS5 proxy; the server is the exit
// All ride the already-authenticated ssh2 Client of a live session, so a dropped
// session tears its tunnels down with it (see onSessionClosed below).

export type TunnelType = 'local' | 'remote' | 'dynamic'

export interface TunnelConfig {
  id: string
  type: TunnelType
  /** Address to bind the listener on. Defaults to 127.0.0.1 (loopback only). */
  bindAddr?: string
  bindPort: number
  /** Destination host:port — required for 'local' and 'remote', ignored for 'dynamic'. */
  destHost?: string
  destPort?: number
}

export interface TunnelStatus extends TunnelConfig {
  sessionId: string
  status: 'open' | 'error'
  error?: string
  /** Live connection count flowing through this tunnel. */
  connections: number
}

interface ActiveTunnel {
  sessionId: string
  config: TunnelConfig
  /** Local TCP listener for 'local' and 'dynamic'. Undefined for 'remote'. */
  server?: net.Server
  status: 'open' | 'error'
  error?: string
  conns: Set<net.Socket>
}

const DEFAULT_BIND = '127.0.0.1'
const tunnels = new Map<string, ActiveTunnel>()

function getWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  return wins.length > 0 ? wins[0] : null
}

function toStatus(t: ActiveTunnel): TunnelStatus {
  return { ...t.config, sessionId: t.sessionId, status: t.status, error: t.error, connections: t.conns.size }
}

// Push the full tunnel list to the renderer so its UI reflects opens, closes,
// errors, and connection counts without polling.
function broadcast(): void {
  const all = Array.from(tunnels.values()).map(toStatus)
  getWindow()?.webContents.send('forward:status', all)
}

// ─── local (-L) ──────────────────────────────────────────────────────────────
function startLocal(sessionId: string, cfg: TunnelConfig): ActiveTunnel {
  const client = getClient(sessionId)
  if (!client) throw new Error('Session not connected')
  if (!cfg.destHost || !cfg.destPort) throw new Error('Local forward needs a destination host and port')

  const t: ActiveTunnel = { sessionId, config: cfg, status: 'open', conns: new Set() }

  const server = net.createServer((sock) => {
    sock.setNoDelay(true)
    client.forwardOut(DEFAULT_BIND, sock.remotePort ?? 0, cfg.destHost!, cfg.destPort!, (err, stream) => {
      if (err) { sock.destroy(); return }
      t.conns.add(sock)
      broadcast()
      const cleanup = (): void => { t.conns.delete(sock); broadcast() }
      sock.once('close', cleanup)
      stream.once('close', () => sock.destroy())
      sock.pipe(stream).pipe(sock)
    })
  })
  server.on('error', (e) => { t.status = 'error'; t.error = e.message; broadcast() })
  server.listen(cfg.bindPort, cfg.bindAddr ?? DEFAULT_BIND)
  t.server = server
  return t
}

// ─── remote (-R) ──────────────────────────────────────────────────────────────
// ssh2 emits a single 'tcp connection' event per Client for ALL remote forwards;
// we dispatch by the bound port so multiple -R tunnels on one session coexist.
const remoteHandlers = new Map<string, Map<number, TunnelConfig>>() // sessionId → port → cfg

function ensureRemoteDispatcher(sessionId: string): void {
  if (remoteHandlers.has(sessionId)) return
  const client = getClient(sessionId)
  if (!client) throw new Error('Session not connected')
  const portMap = new Map<number, TunnelConfig>()
  remoteHandlers.set(sessionId, portMap)

  client.on('tcp connection', (info, accept, reject) => {
    const cfg = portMap.get(info.destPort)
    if (!cfg || !cfg.destHost || !cfg.destPort) { reject(); return }
    const t = tunnels.get(cfg.id)
    const stream = accept()
    const sock = net.connect(cfg.destPort, cfg.destHost)
    sock.setNoDelay(true)
    if (t) { (t.conns as Set<any>).add(stream); broadcast() }
    const cleanup = (): void => { if (t) { (t.conns as Set<any>).delete(stream); broadcast() } }
    stream.once('close', cleanup)
    sock.once('error', () => stream.end())
    stream.pipe(sock).pipe(stream as unknown as NodeJS.WritableStream)
  })
}

function startRemote(sessionId: string, cfg: TunnelConfig): Promise<ActiveTunnel> {
  const client = getClient(sessionId)
  if (!client) throw new Error('Session not connected')
  if (!cfg.destHost || !cfg.destPort) throw new Error('Remote forward needs a destination host and port')

  ensureRemoteDispatcher(sessionId)
  const t: ActiveTunnel = { sessionId, config: cfg, status: 'open', conns: new Set() }

  return new Promise((resolve, reject) => {
    client.forwardIn(cfg.bindAddr ?? DEFAULT_BIND, cfg.bindPort, (err) => {
      if (err) { t.status = 'error'; t.error = err.message; reject(err); return }
      remoteHandlers.get(sessionId)!.set(cfg.bindPort, cfg)
      resolve(t)
    })
  })
}

// ─── dynamic (-D), a minimal SOCKS5 CONNECT proxy ─────────────────────────────
// Enough of RFC 1928 to back `curl --socks5`, browser proxies, and ssh -D: no
// auth, CONNECT only, IPv4/IPv6/domain target. The greeting and request normally
// each arrive in one TCP segment from real clients; we buffer to tolerate splits.
function startDynamic(sessionId: string, cfg: TunnelConfig): ActiveTunnel {
  const client = getClient(sessionId)
  if (!client) throw new Error('Session not connected')

  const t: ActiveTunnel = { sessionId, config: cfg, status: 'open', conns: new Set() }

  const server = net.createServer((sock) => {
    sock.setNoDelay(true)
    let phase: 'greet' | 'request' | 'piping' = 'greet'
    let buf = Buffer.alloc(0)

    const fail = (rep: number): void => {
      // SOCKS5 reply with the given REP code, bound addr 0.0.0.0:0, then close.
      sock.end(Buffer.from([0x05, rep, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
    }

    sock.on('data', (chunk) => {
      if (phase === 'piping') return
      buf = Buffer.concat([buf, chunk])

      if (phase === 'greet') {
        if (buf.length < 2) return
        if (buf[0] !== 0x05) { sock.destroy(); return }
        const nMethods = buf[1]
        if (buf.length < 2 + nMethods) return
        buf = buf.subarray(2 + nMethods)
        sock.write(Buffer.from([0x05, 0x00])) // select "no authentication"
        phase = 'request'
        if (buf.length === 0) return
      }

      if (phase === 'request') {
        if (buf.length < 4) return
        if (buf[0] !== 0x05) { sock.destroy(); return }
        if (buf[1] !== 0x01) { fail(0x07); return } // only CONNECT
        const atyp = buf[3]
        let host = ''
        let off = 4
        if (atyp === 0x01) {            // IPv4
          if (buf.length < off + 4 + 2) return
          host = `${buf[off]}.${buf[off + 1]}.${buf[off + 2]}.${buf[off + 3]}`
          off += 4
        } else if (atyp === 0x03) {     // domain name
          const len = buf[off]
          if (buf.length < off + 1 + len + 2) return
          host = buf.subarray(off + 1, off + 1 + len).toString('utf8')
          off += 1 + len
        } else if (atyp === 0x04) {     // IPv6
          if (buf.length < off + 16 + 2) return
          const parts: string[] = []
          for (let i = 0; i < 16; i += 2) parts.push(buf.readUInt16BE(off + i).toString(16))
          host = parts.join(':')
          off += 16
        } else { fail(0x08); return }   // address type not supported
        const port = buf.readUInt16BE(off)

        client.forwardOut(DEFAULT_BIND, 0, host, port, (err, stream) => {
          if (err) { fail(0x05); return } // connection refused
          sock.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])) // succeeded
          phase = 'piping'
          t.conns.add(sock)
          broadcast()
          sock.once('close', () => { t.conns.delete(sock); broadcast() })
          stream.once('close', () => sock.destroy())
          sock.pipe(stream).pipe(sock)
        })
      }
    })
    sock.on('error', () => sock.destroy())
  })

  server.on('error', (e) => { t.status = 'error'; t.error = e.message; broadcast() })
  // The SOCKS5 proxy accepts "no authentication", so binding it to anything but
  // loopback would expose an open relay into the remote network to the whole LAN.
  // Always bind to 127.0.0.1, ignoring any requested bindAddr for dynamic tunnels.
  server.listen(cfg.bindPort, DEFAULT_BIND)
  t.server = server
  return t
}

// ─── public API ────────────────────────────────────────────────────────────────

export async function startTunnel(sessionId: string, cfg: TunnelConfig): Promise<TunnelStatus> {
  if (tunnels.has(cfg.id)) throw new Error('Tunnel already running')
  let t: ActiveTunnel
  if (cfg.type === 'local') t = startLocal(sessionId, cfg)
  else if (cfg.type === 'remote') t = await startRemote(sessionId, cfg)
  else t = startDynamic(sessionId, cfg)
  tunnels.set(cfg.id, t)
  broadcast()
  return toStatus(t)
}

export function stopTunnel(id: string): void {
  const t = tunnels.get(id)
  if (!t) return
  if (t.server) { try { t.server.close() } catch { /* already closed */ } }
  if (t.config.type === 'remote') {
    const client = getClient(t.sessionId)
    try { client?.unforwardIn(t.config.bindAddr ?? DEFAULT_BIND, t.config.bindPort) } catch { /* gone */ }
    remoteHandlers.get(t.sessionId)?.delete(t.config.bindPort)
  }
  for (const c of t.conns) { try { (c as any).destroy?.() ?? (c as any).end?.() } catch { /* ignore */ } }
  tunnels.delete(t.config.id)
  broadcast()
}

export function listTunnels(): TunnelStatus[] {
  return Array.from(tunnels.values()).map(toStatus)
}

// Tear down every tunnel belonging to a session that just closed.
function closeSessionTunnels(sessionId: string): void {
  const ids = Array.from(tunnels.values()).filter((t) => t.sessionId === sessionId).map((t) => t.config.id)
  for (const id of ids) stopTunnel(id)
  remoteHandlers.delete(sessionId)
}

onSessionClosed(closeSessionTunnels)
