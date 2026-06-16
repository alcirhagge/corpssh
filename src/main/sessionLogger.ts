import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { Terminal } from '@xterm/headless'

const SESSIONS_DIR = path.join(os.homedir(), '.corpssh', 'sessions')

export interface SessionMeta {
  sessionId: string
  serverId: string
  serverName: string
  host: string
  username: string
  startedAt: number
  endedAt?: number
}

function ensureDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

function logPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${sessionId}.log`)
}
function metaPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${sessionId}.json`)
}

// ─── Headless terminal emulator per session ─────────────────────────────────
// We feed the raw SSH byte stream into a real (headless) xterm. Instead of
// dumping the stream verbatim — which linearises cursor-addressed output
// (neofetch's two columns, progress bars redrawn with \r, top/htop frames) into
// garbage — we periodically serialise the EMULATOR's rendered buffer to disk.
// The on-disk log then matches exactly what the user saw on screen, already
// clean of ANSI escapes and carriage-return redraws.
interface Session {
  term: Terminal
  header: string
}

const SCROLLBACK = 10000
const DEFAULT_COLS = 120
const DEFAULT_ROWS = 40
const SNAPSHOT_INTERVAL = 1500

const sessions = new Map<string, Session>()
const dirty = new Set<string>()
let snapshotTimer: NodeJS.Timeout | null = null

function buildHeader(meta: SessionMeta): string {
  return [
    `=== CorpSSH Session Log ===`,
    `Server  : ${meta.serverName}`,
    `Host    : ${meta.host}`,
    `User    : ${meta.username}`,
    `Started : ${new Date(meta.startedAt).toISOString()}`,
    `=`.repeat(40),
    '',
    ''
  ].join('\n')
}

export function createSessionLog(meta: SessionMeta): void {
  ensureDir()
  const header = buildHeader(meta)
  fs.writeFileSync(logPath(meta.sessionId), header, 'utf-8')
  fs.writeFileSync(metaPath(meta.sessionId), JSON.stringify(meta, null, 2), 'utf-8')

  const term = new Terminal({
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    scrollback: SCROLLBACK,
    allowProposedApi: true  // needed for buffer.active access
  })
  sessions.set(meta.sessionId, { term, header })
}

// Render the emulator's full buffer (scrollback + viewport) to clean plain text.
function dumpBody(term: Terminal): string {
  const buf = term.buffer.active
  const lines: string[] = []
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i)
    lines.push(line ? line.translateToString(true).replace(/\s+$/, '') : '')
  }
  // Drop trailing blank lines so the log doesn't end with a wall of whitespace
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.join('\n')
}

function snapshotToDisk(sessionId: string): void {
  const s = sessions.get(sessionId)
  if (!s) return
  try {
    fs.writeFileSync(logPath(sessionId), s.header + dumpBody(s.term) + '\n', 'utf-8')
  } catch { /* ignore log write failures */ }
}

function scheduleSnapshot(): void {
  if (snapshotTimer) return
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null
    for (const id of dirty) snapshotToDisk(id)
    dirty.clear()
  }, SNAPSHOT_INTERVAL)
}

// Wait for the emulator's write queue to drain, then run fn with a current buffer.
function whenDrained(term: Terminal, fn: () => void): void {
  term.write('', fn)
}

export function appendSessionData(sessionId: string, data: string): void {
  const s = sessions.get(sessionId)
  if (!s) return
  s.term.write(data)
  dirty.add(sessionId)
  scheduleSnapshot()
}

// Commands are already echoed by the remote shell and captured by the emulator,
// so we no longer inject synthetic "CMD>" markers — they would duplicate the
// echoed input and break cursor-addressed redraws. Kept as a no-op so the
// caller (sshManager) needs no change.
export function appendSessionCommand(_sessionId: string, _command: string): void {
  /* intentionally empty — see comment above */
}

export function resizeSession(sessionId: string, cols: number, rows: number): void {
  const s = sessions.get(sessionId)
  if (s && cols > 0 && rows > 0) {
    try { s.term.resize(cols, rows) } catch { /* ignore */ }
  }
}

export function flushSession(sessionId: string): void {
  dirty.delete(sessionId)
  snapshotToDisk(sessionId)
}

export function closeSessionLog(sessionId: string, endedAt: number): void {
  const s = sessions.get(sessionId)

  const finalize = (): void => {
    const footer = `\n${'='.repeat(40)}\nSession ended: ${new Date(endedAt).toISOString()}\n`
    try {
      if (fs.existsSync(logPath(sessionId))) fs.appendFileSync(logPath(sessionId), footer, 'utf-8')
    } catch { /* ignore */ }
    if (s) { s.term.dispose(); sessions.delete(sessionId) }
    dirty.delete(sessionId)
  }

  // Update meta first (independent of the emulator)
  try {
    if (fs.existsSync(metaPath(sessionId))) {
      const meta = JSON.parse(fs.readFileSync(metaPath(sessionId), 'utf-8')) as SessionMeta
      meta.endedAt = endedAt
      fs.writeFileSync(metaPath(sessionId), JSON.stringify(meta, null, 2), 'utf-8')
    }
  } catch { /* ignore */ }

  if (s) {
    whenDrained(s.term, () => { snapshotToDisk(sessionId); finalize() })
  } else {
    finalize()
  }
}

export function listSessions(): SessionMeta[] {
  ensureDir()
  return fs.readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8')) as SessionMeta }
      catch { return null }
    })
    .filter(Boolean)
    .sort((a, b) => (b!.startedAt ?? 0) - (a!.startedAt ?? 0)) as SessionMeta[]
}

// Async so we can drain the emulator's pending writes before reading a live session.
export function readSessionLog(sessionId: string): Promise<string> {
  return new Promise((resolve) => {
    const s = sessions.get(sessionId)
    if (s) {
      whenDrained(s.term, () => {
        snapshotToDisk(sessionId)
        dirty.delete(sessionId)
        resolve(s.header + dumpBody(s.term) + '\n')
      })
      return
    }
    try {
      resolve(fs.existsSync(logPath(sessionId)) ? fs.readFileSync(logPath(sessionId), 'utf-8') : '')
    } catch {
      resolve('')
    }
  })
}

export function deleteSession(sessionId: string): void {
  const s = sessions.get(sessionId)
  if (s) { s.term.dispose(); sessions.delete(sessionId) }
  dirty.delete(sessionId)
  if (fs.existsSync(logPath(sessionId))) fs.unlinkSync(logPath(sessionId))
  if (fs.existsSync(metaPath(sessionId))) fs.unlinkSync(metaPath(sessionId))
}

// Called on app startup: marks any session without endedAt as closed.
// Sessions left open happen when the app crashes or is force-closed; the last
// periodic snapshot (≤ SNAPSHOT_INTERVAL old) is preserved on disk.
export function cleanupOrphanedSessions(): void {
  try {
    ensureDir()
    const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      try {
        const mp = path.join(SESSIONS_DIR, file)
        const meta = JSON.parse(fs.readFileSync(mp, 'utf-8')) as SessionMeta
        if (meta.endedAt) continue

        const lp = logPath(meta.sessionId)
        const endedAt = fs.existsSync(lp) ? fs.statSync(lp).mtimeMs : Date.now()

        meta.endedAt = endedAt
        fs.writeFileSync(mp, JSON.stringify(meta, null, 2), 'utf-8')

        if (fs.existsSync(lp)) {
          const footer = `\n${'='.repeat(40)}\nSession ended: ${new Date(endedAt).toISOString()} (recovered on restart)\n`
          fs.appendFileSync(lp, footer, 'utf-8')
        }
      } catch { /* skip corrupt entries */ }
    }
  } catch { /* ignore if sessions dir doesn't exist yet */ }
}
