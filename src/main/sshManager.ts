import { Client, ConnectConfig, SFTPWrapper } from 'ssh2'
import { BrowserWindow } from 'electron'
import * as net from 'net'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { appendSessionData, appendSessionCommand, resizeSession } from './sessionLogger'
import { verifyHostKey } from './knownHosts'
import { recordCommand } from './commandHistory'

export interface SSHConnectionConfig {
  id: string
  host: string
  port: number
  username: string
  authMethod: 'password' | 'privateKey' | 'agent'
  password?: string
  privateKeyPath?: string
  privateKeyContent?: string
  passphrase?: string
  /** TOFU host-key check. Default true; false accepts any key (legacy behavior). */
  strictHostKey?: boolean
  /** Optional bastion to tunnel THROUGH before reaching this host (ProxyJump -J).
   *  May itself carry a jumpHost, giving multi-hop chains for free. */
  jumpHost?: SSHConnectionConfig
  /** Negotiate zlib compression on the SSH transport. Off by default (terminals
   *  don't benefit and it adds CPU); enabled for VNC tunnels, where the raw
   *  framebuffer compresses heavily and the link is the bottleneck. */
  compress?: boolean
}

// Thrown when a host presents a different key than the one we pinned (possible
// MITM). The renderer surfaces this distinctly so the user can re-trust on
// purpose instead of it looking like a generic connection failure.
export class HostKeyChangedError extends Error {
  constructor(public host: string, public port: number, public oldFp: string, public newFp: string) {
    super(`HOST KEY CHANGED for ${host}:${port}. Pinned ${oldFp} but server offered ${newFp}. Possible man-in-the-middle — or the server was legitimately rebuilt.`)
    this.name = 'HostKeyChangedError'
  }
}

export interface SFTPEntry {
  name: string
  type: 'file' | 'directory' | 'symlink'
  size: number
  modifyTime: number
  permissions: number
  owner: number
  group: number
}

interface ActiveConnection {
  client: Client
  sessionId: string
  config: SSHConnectionConfig
  remoteIdent?: string
}

const activeConnections = new Map<string, ActiveConnection>()

// Listeners notified when a session's underlying SSH client goes away (natural
// close OR intentional disconnect). Port forwarding subscribes here to tear down
// the session's tunnels — done via a listener list instead of a direct import so
// portForward.ts can depend on sshManager without a circular dependency.
const sessionClosedListeners: Array<(sessionId: string) => void> = []
export function onSessionClosed(cb: (sessionId: string) => void): void {
  sessionClosedListeners.push(cb)
}
function notifySessionClosed(sessionId: string): void {
  for (const cb of sessionClosedListeners) {
    try { cb(sessionId) } catch { /* a bad listener must not break teardown */ }
  }
}

// Expose the live ssh2 Client for a session so feature modules (port forwarding)
// can open their own channels on the same authenticated connection.
export function getClient(sessionId: string): Client | null {
  return activeConnections.get(sessionId)?.client ?? null
}

// Sessions the user is closing on purpose. The renderer auto-reconnects on any
// ssh:closed event, so for an intentional disconnect we suppress that event
// exactly once instead of bouncing the session back up.
const intentionalClose = new Set<string>()

// Emit ssh:closed unless this was a deliberate disconnect. A single teardown
// fires BOTH the stream 'close' and the client 'close', so we suppress on
// membership (no delete here) and let disconnectSSH GC the entry on a timer.
function emitClosed(sessionId: string): void {
  if (intentionalClose.has(sessionId)) return
  getWindow()?.webContents.send(`ssh:closed:${sessionId}`)
}

function getWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  return wins.length > 0 ? wins[0] : null
}

// ─── SSH protocol diagnostics ──────────────────────────────────────────────
// Set CORPSSH_SSH_DEBUG=1 to dump full ssh2 protocol traces to a log file.
// Useful to diagnose legacy-device handshake issues (ECONNRESET / signature
// verification / no matching kex) and compare against native `ssh -vv`.
const SSH_DEBUG = process.env.CORPSSH_SSH_DEBUG === '1'
const SSH_DEBUG_LOG = path.join(os.homedir(), 'corpssh-ssh-debug.log')

function dbg(line: string): void {
  if (!SSH_DEBUG) return
  try {
    fs.appendFileSync(SSH_DEBUG_LOG, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    /* ignore log write failures */
  }
}

// Build the TCP socket ourselves so we can disable Nagle's algorithm
// (TCP_NODELAY). ssh2 leaves Nagle ON by default, which — combined with the
// remote's delayed-ACK — coalesces single keystrokes and adds 40-200ms of
// per-character latency on any non-zero-RTT link. Native clients (OpenSSH,
// PuTTY) always set NODELAY for interactive sessions; this matches them so
// typing echoes instantly. `keepAlive` also trims dead-peer detection.
function makeNoDelaySocket(host: string, port: number): net.Socket {
  const sock = net.connect({ host, port })
  sock.setNoDelay(true)
  sock.setKeepAlive(true, 30000)
  return sock
}

// Algorithm list shared by every connect path (live session, OS probe, and jump
// hops). RSA-first host keys keep legacy switches happy; the wide kex/cipher sets
// keep old appliances reachable. Single source of truth so the lists never drift.
const SSH_ALGORITHMS: NonNullable<ConnectConfig['algorithms']> = {
  kex: [
    'curve25519-sha256', 'curve25519-sha256@libssh.org',
    'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521',
    'diffie-hellman-group-exchange-sha256',
    'diffie-hellman-group16-sha512', 'diffie-hellman-group15-sha512',
    'diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha1', 'diffie-hellman-group1-sha1'
  ],
  serverHostKey: [
    'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ssh-ed25519',
    'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-dss'
  ],
  cipher: [
    'aes128-gcm', 'aes128-gcm@openssh.com', 'aes256-gcm', 'aes256-gcm@openssh.com',
    'aes128-ctr', 'aes192-ctr', 'aes256-ctr',
    'aes256-cbc', 'aes192-cbc', 'aes128-cbc', '3des-cbc'
  ],
  hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1', 'hmac-md5']
}

// Resolve the ssh-agent endpoint. On Linux/macOS the agent (e.g. Bitwarden)
// exports SSH_AUTH_SOCK. On Windows there is no socket env var — agents listen
// on the OpenSSH named pipe instead, which ssh2 accepts as the `agent` value.
// Bitwarden's Windows SSH agent emulates exactly this pipe.
function resolveAgentSock(): string | undefined {
  if (process.env.SSH_AUTH_SOCK) return process.env.SSH_AUTH_SOCK
  if (process.platform === 'win32') return '\\\\.\\pipe\\openssh-ssh-agent'
  return undefined
}

// Fill in the auth fields of a ConnectConfig from a connection config. Shared so
// jump hops authenticate exactly like the final target. Throws on unreadable key.
function applyAuth(config: SSHConnectionConfig, cc: ConnectConfig): void {
  if (config.authMethod === 'password' && config.password) {
    cc.password = config.password
  } else if (config.authMethod === 'privateKey') {
    if (config.privateKeyContent) {
      cc.privateKey = config.privateKeyContent
    } else if (config.privateKeyPath) {
      cc.privateKey = fs.readFileSync(config.privateKeyPath.replace('~', os.homedir()))
    }
    if (config.passphrase) cc.passphrase = config.passphrase
  } else if (config.authMethod === 'agent') {
    cc.agent = resolveAgentSock()
  }
}

// Connect a single bastion over a socket we provide, resolving its ready Client.
// Host-key TOFU is honored per the jump's own strictHostKey flag.
function connectJumpClient(jump: SSHConnectionConfig, sock: net.Socket | NodeJS.ReadWriteStream): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client()
    let hostKeyError: HostKeyChangedError | null = null
    const hostVerifier = (keyBuf: Buffer): boolean => {
      const verdict = verifyHostKey(jump.host, jump.port, keyBuf)
      if (verdict.status === 'changed') {
        hostKeyError = new HostKeyChangedError(jump.host, jump.port, verdict.oldFp, verdict.newFp)
        return false
      }
      return true
    }
    const cc: ConnectConfig = {
      sock: sock as NodeJS.ReadableStream & NodeJS.WritableStream,
      username: jump.username,
      readyTimeout: 15000,
      tryKeyboard: true,
      algorithms: SSH_ALGORITHMS,
      ...(jump.strictHostKey === false ? {} : { hostVerifier })
    }
    try { applyAuth(jump, cc) } catch (e) { reject(e); return }
    client.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => finish(prompts.map(() => jump.password ?? '')))
    client.on('ready', () => resolve(client))
    client.on('error', (err) => reject(hostKeyError ?? err))
    client.connect(cc)
  })
}

// Open a transport stream to (targetHost:targetPort) THROUGH a jump chain. The
// jump may itself have a jumpHost, so we recurse to build multi-hop tunnels. The
// returned `clients` are the bastions to tear down when the target session ends.
async function openJumpTransport(
  jump: SSHConnectionConfig, targetHost: string, targetPort: number
): Promise<{ sock: NodeJS.ReadWriteStream; clients: Client[] }> {
  // Reach the bastion itself: directly, or through its own jump chain.
  let jumpSock: net.Socket | NodeJS.ReadWriteStream
  const clients: Client[] = []
  if (jump.jumpHost) {
    const inner = await openJumpTransport(jump.jumpHost, jump.host, jump.port)
    jumpSock = inner.sock
    clients.push(...inner.clients)
  } else {
    jumpSock = makeNoDelaySocket(jump.host, jump.port)
  }

  const jumpClient = await connectJumpClient(jump, jumpSock)
  clients.push(jumpClient)

  const stream = await new Promise<NodeJS.ReadWriteStream>((resolve, reject) => {
    jumpClient.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, s) => {
      if (err) reject(err)
      else resolve(s as unknown as NodeJS.ReadWriteStream)
    })
  })
  return { sock: stream, clients }
}

export async function createSSHConnection(
  sessionId: string,
  config: SSHConnectionConfig,
  onNaturalClose?: () => void
): Promise<void> {
  // Build the transport first. With a jumpHost we tunnel through one or more
  // bastions (ProxyJump); otherwise a plain NODELAY TCP socket. The bastion
  // Clients ride along so the target's teardown can close them too.
  let sock: net.Socket | NodeJS.ReadWriteStream
  let jumpClients: Client[] = []
  if (config.jumpHost) {
    const t = await openJumpTransport(config.jumpHost, config.host, config.port)
    sock = t.sock
    jumpClients = t.clients
  } else {
    sock = makeNoDelaySocket(config.host, config.port)
  }
  const endJumps = (): void => { for (const c of jumpClients) { try { c.end() } catch { /* gone */ } } }

  return new Promise((resolve, reject) => {
    const client = new Client()

    // A socket-level error before the SSH handshake completes (ECONNREFUSED /
    // unreachable, or a dropped jump tunnel) must still reject this promise, so
    // forward it until ssh2 takes over on 'ready'.
    let handshakeDone = false
    sock.once('error', (err) => {
      if (!handshakeDone) {
        activeConnections.delete(sessionId)
        endJumps()
        reject(err)
      }
    })

    // Host-key TOFU verification (skipped when strictHostKey === false).
    // ssh2 calls hostVerifier with the raw key during the handshake; returning
    // false aborts. On a key MISMATCH we stash a typed error so the catch path
    // surfaces it as HostKeyChangedError rather than a vague handshake failure.
    let hostKeyError: HostKeyChangedError | null = null
    const hostVerifier = (keyBuf: Buffer): boolean => {
      const verdict = verifyHostKey(config.host, config.port, keyBuf)
      if (verdict.status === 'changed') {
        hostKeyError = new HostKeyChangedError(config.host, config.port, verdict.oldFp, verdict.newFp)
        return false
      }
      return true
    }

    const connectConfig: ConnectConfig = {
      sock,
      username: config.username,
      readyTimeout: 15000,
      keepaliveInterval: 30000,
      // ~6 missed keepalives (3 min) before declaring the peer dead, instead of
      // the default 3 (~90s) — survives brief Wi-Fi/VPN blips without dropping.
      keepaliveCountMax: 6,
      ...(config.strictHostKey === false ? {} : { hostVerifier }),
      tryKeyboard: true,
      // RSA-first host keys keep legacy switches happy; see SSH_ALGORITHMS.
      // VNC carriers opt into zlib so the raw framebuffer rides compressed.
      algorithms: config.compress
        ? { ...SSH_ALGORITHMS, compress: ['zlib@openssh.com', 'zlib', 'none'] }
        : SSH_ALGORITHMS
    }

    let remoteIdent = ''
    dbg(`=== CONNECT START host=${config.host}:${config.port} user=${config.username} auth=${config.authMethod} ===`)
    // Always capture the remote SSH ident string (cheap) — used to classify the
    // device safely without opening probe channels. Full trace only when debugging.
    connectConfig.debug = (m: string) => {
      const im = /Remote ident:\s*'([^']*)'/i.exec(m)
      if (im) remoteIdent = im[1].trim()
      if (SSH_DEBUG) dbg(`[${config.host}] ${m}`)
    }

    client.on('handshake', (n) => {
      dbg(`[${config.host}] HANDSHAKE OK negotiated=${JSON.stringify(n)}`)
    })
    client.on('banner', (msg) => {
      dbg(`[${config.host}] BANNER: ${msg?.slice(0, 500)}`)
    })

    if (config.authMethod === 'password' && config.password) {
      connectConfig.password = config.password
    } else if (config.authMethod === 'privateKey') {
      if (config.privateKeyContent) {
        connectConfig.privateKey = config.privateKeyContent
      } else if (config.privateKeyPath) {
        try {
          connectConfig.privateKey = fs.readFileSync(
            config.privateKeyPath.replace('~', os.homedir())
          )
        } catch {
          return reject(new Error(`Cannot read private key: ${config.privateKeyPath}`))
        }
      }
      if (config.passphrase) connectConfig.passphrase = config.passphrase
    } else if (config.authMethod === 'agent') {
      connectConfig.agent = resolveAgentSock()
    }

    client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
      finish(prompts.map(() => config.password ?? ''))
    })

    client.on('ready', () => {
      handshakeDone = true
      activeConnections.set(sessionId, { client, sessionId, config, remoteIdent })
      resolve()
    })

    client.on('error', (err: any) => {
      dbg(`[${config.host}] ERROR code=${err?.code ?? '?'} level=${err?.level ?? '?'} msg=${err?.message ?? err}`)
      activeConnections.delete(sessionId)
      endJumps()
      // A rejected host key surfaces here as a generic handshake error — replace
      // it with the typed, actionable error so the UI can offer "re-trust".
      reject(hostKeyError ?? err)
    })

    client.on('close', () => {
      activeConnections.delete(sessionId)
      endJumps()  // tear down any bastions this session tunneled through
      notifySessionClosed(sessionId)
      emitClosed(sessionId)
      onNaturalClose?.()
    })

    client.connect(connectConfig)
  })
}

export function createShellSession(sessionId: string, cols: number, rows: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = activeConnections.get(sessionId)
    if (!conn) return reject(new Error('Connection not found'))

    conn.client.shell(
      { term: 'xterm-256color', cols, rows },
      (err, stream) => {
        if (err) return reject(err)

        // Match the log emulator's geometry to the real terminal so line
        // wrapping in the saved log mirrors what the user sees on screen.
        resizeSession(sessionId, cols, rows)

        // Coalesce output and flush to the renderer on a short timer. This keeps
        // the IPC message count low under heavy output (logs, full configs, cat)
        // instead of firing one IPC message per chunk, which freezes the UI.
        let outBuf = ''
        let outTimer: NodeJS.Timeout | null = null
        const flushOut = (): void => {
          outTimer = null
          if (!outBuf) return
          getWindow()?.webContents.send(`ssh:data:${sessionId}`, outBuf)
          outBuf = ''
        }
        const pushOut = (text: string): void => {
          appendSessionData(sessionId, text)  // session log lives in main now
          outBuf += text
          if (!outTimer) outTimer = setTimeout(flushOut, 8)
        }

        stream.on('data', (data: Buffer) => pushOut(data.toString()))
        stream.stderr.on('data', (data: Buffer) => pushOut(data.toString()))

        stream.on('close', () => {
          if (outTimer) { clearTimeout(outTimer); flushOut() }
          cmdBuffers.delete(sessionId)
          emitClosed(sessionId)
          activeConnections.delete(sessionId)
        })

        ;(conn as any).stream = stream
        resolve()
      }
    )
  })
}

// Per-session typed-command buffer, used to log "CMD>" lines to the session log.
// Tracking this in main (instead of round-tripping from the renderer) removes an
// IPC call per keystroke.
const cmdBuffers = new Map<string, string>()

export function sendInput(sessionId: string, data: string): void {
  const conn = activeConnections.get(sessionId) as any
  if (conn?.stream) conn.stream.write(data)

  let buf = cmdBuffers.get(sessionId) ?? ''
  for (const ch of data) {
    if (ch === '\r' || ch === '\n') {
      const cmd = buf.trim()
      if (cmd) { appendSessionCommand(sessionId, cmd); recordCommand(cmd) }
      buf = ''
    } else if (ch === '\x7f') {
      buf = buf.slice(0, -1)
    } else if (ch.charCodeAt(0) >= 32) {
      buf += ch
    }
  }
  cmdBuffers.set(sessionId, buf)
}

export function resizeTerminal(sessionId: string, cols: number, rows: number): void {
  const conn = activeConnections.get(sessionId) as any
  if (conn?.stream) conn.stream.setWindow(rows, cols, 0, 0)
  resizeSession(sessionId, cols, rows)  // keep log emulator geometry in sync
}

export function disconnectSSH(sessionId: string): void {
  // Mark intentional so the resulting close events don't trigger auto-reconnect.
  intentionalClose.add(sessionId)
  const conn = activeConnections.get(sessionId)
  if (conn) {
    const s = conn as any
    if (s.stream) s.stream.end()
    conn.client.end()
    activeConnections.delete(sessionId)
  }
  notifySessionClosed(sessionId)
  cmdBuffers.delete(sessionId)
  // GC the suppression flag after both close events have fired.
  setTimeout(() => intentionalClose.delete(sessionId), 3000)
}

// Gracefully end EVERY live SSH session. Called on app quit so we send a real
// SSH disconnect (client.end) to each host instead of relying on the OS to tear
// down the TCP sockets at process exit. Legacy gear (Huawei VRP, MikroTik, OLTs)
// with few VTY lines reaps a graceful disconnect immediately; an OS-level socket
// drop can leave the line occupied until the device's own idle-timeout fires.
export function disconnectAll(): void {
  for (const conn of activeConnections.values()) {
    try {
      const s = conn as any
      if (s.stream) s.stream.end()
      conn.client.end()
    } catch {
      /* already gone */
    }
  }
  activeConnections.clear()
}

// True while at least one SSH session is live. Lets the quit handler skip the
// graceful-shutdown delay when there's nothing to close.
export function hasActiveConnections(): boolean {
  return activeConnections.size > 0
}

export function listSFTPDirectory(sessionId: string, remotePath: string): Promise<SFTPEntry[]> {
  return new Promise((resolve, reject) => {
    const conn = activeConnections.get(sessionId)
    if (!conn) return reject(new Error('Connection not found'))

    conn.client.sftp((err, sftp) => {
      if (err) return reject(err)

      sftp.readdir(remotePath, (err2, list) => {
        if (err2) return reject(err2)

        const entries: SFTPEntry[] = list.map((item) => ({
          name: item.filename,
          type: item.attrs.isDirectory()
            ? 'directory'
            : item.attrs.isSymbolicLink()
              ? 'symlink'
              : 'file',
          size: item.attrs.size ?? 0,
          modifyTime: item.attrs.mtime ?? 0,
          permissions: item.attrs.mode ?? 0,
          owner: item.attrs.uid ?? 0,
          group: item.attrs.gid ?? 0
        }))

        entries.sort((a, b) => {
          if (a.type === 'directory' && b.type !== 'directory') return -1
          if (a.type !== 'directory' && b.type === 'directory') return 1
          return a.name.localeCompare(b.name)
        })

        sftp.end()
        resolve(entries)
      })
    })
  })
}

export function downloadFile(
  sessionId: string,
  remotePath: string,
  localPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = activeConnections.get(sessionId)
    if (!conn) return reject(new Error('Connection not found'))

    conn.client.sftp((err, sftp) => {
      if (err) return reject(err)
      sftp.fastGet(remotePath, localPath, (err2) => {
        sftp.end()
        if (err2) reject(err2)
        else resolve()
      })
    })
  })
}

export function uploadFile(
  sessionId: string,
  localPath: string,
  remotePath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = activeConnections.get(sessionId)
    if (!conn) return reject(new Error('Connection not found'))

    conn.client.sftp((err, sftp) => {
      if (err) return reject(err)
      sftp.fastPut(localPath, remotePath, (err2) => {
        sftp.end()
        if (err2) reject(err2)
        else resolve()
      })
    })
  })
}

// Resolve the SSH user's home directory (absolute path of '.') so the SFTP
// browser can open somewhere writable instead of '/', where uploads are denied.
export function getRemoteHome(sessionId: string): Promise<string> {
  return new Promise((resolve) => {
    const conn = activeConnections.get(sessionId)
    if (!conn) return resolve('/')
    conn.client.sftp((err, sftp) => {
      if (err) return resolve('/')
      sftp.realpath('.', (err2, absPath) => {
        sftp.end()
        resolve(err2 || !absPath ? '/' : absPath)
      })
    })
  })
}

// ─── Recursive (folder-capable) transfers ─────────────────────────────────────

function openSftp(sessionId: string): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    const conn = activeConnections.get(sessionId)
    if (!conn) return reject(new Error('Connection not found'))
    conn.client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)))
  })
}

function sftpMkdir(sftp: SFTPWrapper, dir: string): Promise<void> {
  // Ignore "already exists" so re-uploading into an existing tree is fine.
  return new Promise((resolve) => sftp.mkdir(dir, () => resolve()))
}

function sftpStat(sftp: SFTPWrapper, p: string): Promise<{ isDir: boolean }> {
  return new Promise((resolve, reject) => {
    sftp.stat(p, (err, attrs) => (err ? reject(err) : resolve({ isDir: attrs.isDirectory() })))
  })
}

function sftpReaddir(sftp: SFTPWrapper, dir: string): Promise<{ name: string; isDir: boolean }[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(dir, (err, list) =>
      err ? reject(err) : resolve(list.map((i) => ({ name: i.filename, isDir: i.attrs.isDirectory() })))
    )
  })
}

async function uploadRecursive(sftp: SFTPWrapper, localPath: string, remotePath: string): Promise<void> {
  if (fs.statSync(localPath).isDirectory()) {
    await sftpMkdir(sftp, remotePath)
    for (const name of fs.readdirSync(localPath)) {
      await uploadRecursive(sftp, path.join(localPath, name), `${remotePath}/${name}`)
    }
  } else {
    await new Promise<void>((res, rej) => sftp.fastPut(localPath, remotePath, (e) => (e ? rej(e) : res())))
  }
}

async function downloadRecursive(sftp: SFTPWrapper, remotePath: string, localPath: string): Promise<void> {
  if ((await sftpStat(sftp, remotePath)).isDir) {
    fs.mkdirSync(localPath, { recursive: true })
    for (const entry of await sftpReaddir(sftp, remotePath)) {
      await downloadRecursive(sftp, `${remotePath}/${entry.name}`, path.join(localPath, entry.name))
    }
  } else {
    await new Promise<void>((res, rej) => sftp.fastGet(remotePath, localPath, (e) => (e ? rej(e) : res())))
  }
}

// Public: upload a file OR a directory tree (used by the split-pane SFTP browser).
export async function uploadPath(sessionId: string, localPath: string, remotePath: string): Promise<void> {
  const sftp = await openSftp(sessionId)
  try {
    await uploadRecursive(sftp, localPath, remotePath)
  } finally {
    sftp.end()
  }
}

// Public: download a file OR a directory tree.
export async function downloadPath(sessionId: string, remotePath: string, localPath: string): Promise<void> {
  const sftp = await openSftp(sessionId)
  try {
    await downloadRecursive(sftp, remotePath, localPath)
  } finally {
    sftp.end()
  }
}

export function deleteSFTPItem(sessionId: string, remotePath: string, isDir: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = activeConnections.get(sessionId)
    if (!conn) return reject(new Error('Connection not found'))

    conn.client.sftp((err, sftp) => {
      if (err) return reject(err)
      const op = isDir
        ? (p: string, cb: (e: Error | undefined) => void) => sftp.rmdir(p, cb)
        : (p: string, cb: (e: Error | undefined) => void) => sftp.unlink(p, cb)

      op(remotePath, (err2) => {
        sftp.end()
        if (err2) reject(err2)
        else resolve()
      })
    })
  })
}

export function getActiveConnectionIds(): string[] {
  return Array.from(activeConnections.keys())
}

// ─── OS / Device Detection ────────────────────────────────────────────────────

// Phase-1: standard Linux/Unix probe with CPU and uname info
const OS_DETECT_CMD = [
  'cat /etc/os-release 2>/dev/null',
  'echo "###DEB###"',
  'cat /etc/debian_version 2>/dev/null',
  'echo "###RH###"',
  'cat /etc/redhat-release 2>/dev/null',
  'echo "###ALP###"',
  'cat /etc/alpine-release 2>/dev/null',
  'echo "###LSB###"',
  'cat /etc/lsb-release 2>/dev/null',
  'echo "###CPU###"',
  'cat /proc/cpuinfo 2>/dev/null | grep -m4 -iE "Hardware|Model|Raspberry|ESP32|Xtensa"',
  'echo "###UNAME###"',
  'uname -a 2>/dev/null',
].join('; ')

// Helper: exec a single command on an already-open client, capturing stdout + stderr
function execCapture(client: Client, cmd: string, ms = 5000): Promise<{ out: string; err: string }> {
  return new Promise((resolve) => {
    const tid = setTimeout(() => resolve({ out: '', err: '' }), ms)
    client.exec(cmd, (error, stream) => {
      if (error) { clearTimeout(tid); resolve({ out: '', err: error.message }); return }
      let out = '', err = ''
      stream.on('data', (d: Buffer) => { out += d.toString() })
      stream.stderr.on('data', (d: Buffer) => { err += d.toString() })
      stream.on('close', () => { clearTimeout(tid); resolve({ out, err }) })
    })
  })
}

// Classify a device purely from its SSH identification string — no channels
// opened, so it is safe for appliances that allow only one session.
function classifyByIdent(ident: string): string | null {
  const i = ident.toLowerCase()
  if (!i) return null
  if (i.includes('mikrotik') || i.includes('routeros')) return 'mikrotik'
  if (i.includes('huawei') || i.includes('vrp')) return 'huawei'
  if (i.includes('cisco')) return 'cisco'
  if (i.includes('comware') || i.includes('h3c') || i.includes('hpe')) return 'huawei'
  if (i.includes('juniper') || i.includes('junos')) return 'juniper'
  if (i.includes('fortinet') || i.includes('fortissh')) return 'fortinet'
  if (i.includes('routerboard')) return 'mikrotik'
  return null
}

// True only for real Unix/Linux SSH daemons, which tolerate multiple/exec
// channels. Network appliances (Huawei VRP, Cisco, OLTs) usually do NOT — they
// allow a single VTY session and drop/reset the connection if we open `exec`
// channels alongside the interactive shell.
function isUnixSshServer(ident: string): boolean {
  const i = ident.toLowerCase()
  return i.includes('openssh') || i.includes('dropbear') || i.includes('libssh')
    || i.includes('sun_ssh') || i.includes('mod_sftp') || i.includes('paramiko')
}

// Full 2-phase detection using any already-authenticated Client.
// `remoteIdent` is the server's SSH banner (e.g. "SSH-2.0-OpenSSH_9.6"); it gates
// whether we are allowed to open exec probe channels at all.
async function detectOsWithClient(client: Client, remoteIdent = ''): Promise<string> {
  // ── Safe path: classify network gear by its SSH ident, WITHOUT opening channels ──
  const byIdent = classifyByIdent(remoteIdent)
  if (byIdent) return byIdent

  // Only OpenSSH/Dropbear-class servers are safe to probe with exec channels.
  // Anything else (incl. opaque idents like Huawei VRP's "SSH-2.0--") is treated
  // as a single-session appliance: do NOT open exec channels — that is what was
  // resetting/dropping switch sessions. Bail without disturbing the shell.
  if (remoteIdent && !isUnixSshServer(remoteIdent)) return 'unknown'

  // ── Phase 1: Linux probe ──────────────────────────────────────────────────
  const { out, err } = await execCapture(client, OS_DETECT_CMD, 8000)

  // Instant network-device ID via stderr signatures (no second probe needed)
  const se = err.toLowerCase()
  if (se.includes('bad command name'))                               return 'mikrotik'  // RouterOS CLI
  if (se.includes('unrecognized command') && se.includes('^'))      return 'huawei'    // Huawei VRP
  if (se.includes('% invalid input') || se.includes('% unknown'))   return 'cisco'     // Cisco IOS
  if (se.includes('syntax error') && se.includes('line'))           return 'mikrotik'  // older RouterOS

  const p1 = parseOsId(out)

  // If ALL Phase 1 sections are empty the device doesn't have standard Linux files:
  // it's some kind of network device / appliance → always run Phase 2
  const isNetworkAppliance = out.trim().length < 20

  if (!isNetworkAppliance && p1 !== 'linux') return p1

  // ── Phase 2: parallel network-device probes ───────────────────────────────
  const [ros, vrp, ver, sys, inv] = await Promise.all([
    execCapture(client, '/system resource print', 4000),  // Mikrotik RouterOS
    execCapture(client, 'display version', 4000),          // Huawei VRP
    execCapture(client, 'show version', 4000),             // Cisco / Furukawa / generic
    execCapture(client, 'show system', 4000),              // Furukawa OLT / Nokia / generic
    execCapture(client, 'show inventory', 4000),           // Furukawa / Cisco fallback
  ])

  const r = (ros.out + ros.err).toLowerCase()
  const h = (vrp.out + vrp.err).toLowerCase()
  const c = (ver.out + ver.err).toLowerCase()
  const s = (sys.out + sys.err).toLowerCase()
  const v = (inv.out + inv.err).toLowerCase()
  const all = [r, h, c, s, v].join('\n')

  if (r.includes('mikrotik') || r.includes('routeros'))              return 'mikrotik'
  if ((h.includes('huawei') || h.includes('vrp'))
      && !h.includes('imagemagick'))                                 return 'huawei'
  if (c.includes('cisco ios') || c.includes('cisco adaptive')
      || c.includes('cisco nexus') || c.includes('cisco nx-os'))     return 'cisco'
  if (c.includes('junos') || c.includes('juniper networks'))         return 'juniper'
  if (c.includes('fortios') || c.includes('fortigate'))              return 'fortinet'
  if (c.includes('pfsense') || c.includes('opnsense'))               return 'pfsense'
  if (all.includes('furukawa') || all.includes('fiberlink')
      || all.includes('fiberhome') || all.includes('flos'))          return 'olt'
  if (all.includes('zte') || all.includes('c300') || all.includes('c600')
      || all.includes('zxan'))                                       return 'olt'
  if (all.includes('bdcom') || all.includes('dasan') || all.includes('zhone')
      || all.includes('calix') || all.includes('parks'))             return 'olt'
  if (h.includes('huawei') || r.includes('huawei'))                  return 'huawei'

  // Phase 1 was empty and Phase 2 gave no specific brand → generic network appliance
  if (isNetworkAppliance)                                            return 'olt'

  return 'linux'
}

function parseOsId(output: string): string {
  const ID_MAP: Record<string, string> = {
    // Ubuntu family
    ubuntu: 'ubuntu', linuxmint: 'ubuntu', neon: 'ubuntu',
    'pop-os': 'ubuntu', pop: 'ubuntu', elementary: 'ubuntu', zorin: 'ubuntu',
    // Raspberry Pi (before generic debian so it gets specific icon)
    raspios: 'raspberrypi', raspbian: 'raspberrypi',
    // Debian family
    debian: 'debian', kali: 'debian', 'debian-gnu/linux': 'debian',
    // RHEL/CentOS family
    centos: 'centos', 'centos-stream': 'centos',
    fedora: 'fedora',
    rhel: 'rhel', ol: 'rhel', oracle: 'rhel', rocky: 'rhel',
    almalinux: 'rhel', redhat: 'rhel',
    // Arch family
    arch: 'arch', manjaro: 'arch', endeavouros: 'arch', arcolinux: 'arch',
    // Alpine
    alpine: 'alpine',
    // SUSE family
    opensuse: 'suse', 'opensuse-leap': 'suse', 'opensuse-tumbleweed': 'suse',
    sles: 'suse', suse: 'suse',
    // BSD
    freebsd: 'freebsd', openbsd: 'freebsd', netbsd: 'freebsd',
  }

  // Layer 1: ID= from /etc/os-release
  const idMatch = output.match(/^ID=["']?([a-zA-Z0-9._/-]+)["']?/m)
  if (idMatch) {
    const id = idMatch[1].toLowerCase().trim()
    if (ID_MAP[id]) return ID_MAP[id]
  }

  // Layer 2: NAME= / PRETTY_NAME= keyword scan
  const nameMatch = output.match(/^(?:PRETTY_)?NAME=["']?([^"'\n\r]+)/mi)
  if (nameMatch) {
    const n = nameMatch[1].toLowerCase()
    const KW: Array<[string, string]> = [
      ['raspberry pi', 'raspberrypi'], ['raspbian', 'raspberrypi'],
      ['ubuntu', 'ubuntu'], ['debian', 'debian'], ['centos', 'centos'],
      ['fedora', 'fedora'], ['red hat', 'rhel'], ['rocky', 'rhel'],
      ['alma', 'rhel'], ['oracle linux', 'rhel'], ['arch linux', 'arch'],
      ['alpine', 'alpine'], ['opensuse', 'suse'], ['suse linux', 'suse'],
      ['kali', 'debian'], ['mint', 'ubuntu'], ['manjaro', 'arch'],
      ['freebsd', 'freebsd'], ['openbsd', 'freebsd'], ['netbsd', 'freebsd'],
    ]
    for (const [kw, val] of KW) { if (n.includes(kw)) return val }
  }

  // Layer 3: DISTRIB_ID from /etc/lsb-release
  const lsbMatch = output.match(/^DISTRIB_ID=["']?([a-zA-Z]+)["']?/mi)
  if (lsbMatch) {
    const d = lsbMatch[1].toLowerCase()
    if (ID_MAP[d]) return ID_MAP[d]
    if (d.includes('ubuntu')) return 'ubuntu'
    if (d.includes('debian')) return 'debian'
    if (d.includes('raspberry')) return 'raspberrypi'
  }

  // Layer 4: /etc/debian_version → Debian family
  const debSection = output.split('###DEB###')[1]?.split('###RH###')[0]?.trim()
  if (debSection && debSection.length > 0) return 'debian'

  // Layer 5: /etc/redhat-release → RHEL/CentOS/Fedora
  const rhSection = output.split('###RH###')[1]?.split('###ALP###')[0]?.trim()
  if (rhSection) {
    const r = rhSection.toLowerCase()
    if (r.includes('centos stream') || r.includes('centos')) return 'centos'
    if (r.includes('fedora')) return 'fedora'
    if (r.includes('red hat') || r.includes('rhel')) return 'rhel'
    if (r.includes('rocky') || r.includes('alma') || r.includes('oracle')) return 'rhel'
    return 'rhel'
  }

  // Layer 6: /etc/alpine-release → Alpine
  const alpSection = output.split('###ALP###')[1]?.split('###LSB###')[0]?.trim()
  if (alpSection && /^\d/.test(alpSection)) return 'alpine'

  // Layer 7: /proc/cpuinfo → Raspberry Pi / ESP32
  const cpuSection = output.split('###CPU###')[1]?.split('###UNAME###')[0]?.toLowerCase() || ''
  if (cpuSection.includes('raspberry pi') || /bcm2[5-9]\d\d|bcm271\d/.test(cpuSection)) return 'raspberrypi'
  if (cpuSection.includes('esp32') || cpuSection.includes('xtensa')) return 'espressif'

  // Layer 8: uname -a → BSD / architecture hints
  const unameSection = output.split('###UNAME###')[1]?.trim().toLowerCase() || ''
  if (unameSection.includes('freebsd') || unameSection.includes('openbsd') || unameSection.includes('netbsd')) return 'freebsd'
  if (unameSection.includes('xtensa')) return 'espressif'

  return 'linux'
}

// Public: detect using an existing open session
export function detectOsFromSession(sessionId: string): Promise<string> {
  const conn = activeConnections.get(sessionId)
  if (!conn) return Promise.resolve('unknown')
  return detectOsWithClient(conn.client, conn.remoteIdent ?? '').catch(() => 'unknown')
}

// Public: detect by opening a temporary SSH connection (used by HostForm)
export function detectRemoteOs(config: SSHConnectionConfig): Promise<string> {
  return new Promise((resolve) => {
    const client = new Client()
    let settled = false

    const done = (result: string) => {
      if (settled) return
      settled = true
      try { client.end() } catch {}
      resolve(result)
    }

    const masterTid = setTimeout(() => done('unknown'), 25000)

    // Same NODELAY socket as the live connection so the probe handshake isn't
    // throttled by Nagle either. The OS probe is host-key agnostic (read-only,
    // throwaway) so it deliberately does NOT pin — strict checks belong to the
    // real session via createSSHConnection.
    const probeSock = makeNoDelaySocket(config.host, config.port)
    probeSock.once('error', () => done('unknown'))

    const connectConfig: ConnectConfig = {
      sock: probeSock,
      username: config.username,
      readyTimeout: 8000,
      tryKeyboard: true,
      algorithms: {
        kex: [
          'curve25519-sha256', 'curve25519-sha256@libssh.org',
          'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group16-sha512', 'diffie-hellman-group15-sha512',
          'diffie-hellman-group14-sha256',
          'diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha1',
          'diffie-hellman-group1-sha1'
        ],
        serverHostKey: [
          'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ssh-ed25519',
          'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-dss'
        ],
        cipher: [
          'aes128-gcm', 'aes128-gcm@openssh.com', 'aes256-gcm', 'aes256-gcm@openssh.com',
          'aes128-ctr', 'aes192-ctr', 'aes256-ctr',
          'aes256-cbc', 'aes192-cbc', 'aes128-cbc', '3des-cbc'
        ],
        hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1', 'hmac-md5']
      }
    }

    if (config.authMethod === 'password' && config.password) {
      connectConfig.password = config.password
    } else if (config.authMethod === 'privateKey') {
      if (config.privateKeyContent) {
        connectConfig.privateKey = config.privateKeyContent
      } else if (config.privateKeyPath) {
        try {
          connectConfig.privateKey = fs.readFileSync(config.privateKeyPath.replace('~', os.homedir()))
        } catch { clearTimeout(masterTid); return done('unknown') }
      }
      if (config.passphrase) connectConfig.passphrase = config.passphrase
    }

    // Verify the host key BEFORE auth so the probe never sends credentials to a
    // host whose key has CHANGED (MITM). New hosts pin via TOFU exactly like the
    // real connection; only a mismatch aborts the handshake (→ 'unknown'), so no
    // credential ever reaches an impostor key. Skipped only when strict is off.
    if (config.strictHostKey !== false) {
      connectConfig.hostVerifier = (keyBuf: Buffer): boolean =>
        verifyHostKey(config.host, config.port, keyBuf).status !== 'changed'
    }

    let remoteIdent = ''
    connectConfig.debug = (m: string) => {
      const im = /Remote ident:\s*'([^']*)'/i.exec(m)
      if (im) remoteIdent = im[1].trim()
    }

    client.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => {
      finish(prompts.map(() => config.password ?? ''))
    })

    client.on('ready', () => {
      clearTimeout(masterTid)
      detectOsWithClient(client, remoteIdent).then(done).catch(() => done('unknown'))
    })

    client.on('error', () => { clearTimeout(masterTid); done('unknown') })
    client.connect(connectConfig)
  })
}
