import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

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

export function createSessionLog(meta: SessionMeta): void {
  ensureDir()
  const file = path.join(SESSIONS_DIR, `${meta.sessionId}.log`)
  const header = [
    `=== CorpSSH Session Log ===`,
    `Server  : ${meta.serverName}`,
    `Host    : ${meta.host}`,
    `User    : ${meta.username}`,
    `Started : ${new Date(meta.startedAt).toISOString()}`,
    `=`.repeat(40),
    ''
  ].join('\n')
  fs.writeFileSync(file, header, 'utf-8')

  // Save metadata
  const metaFile = path.join(SESSIONS_DIR, `${meta.sessionId}.json`)
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8')
}

function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[^[\]]/g, '')
    .replace(/\x9b[0-9;?]*[A-Za-z]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

// ─── Buffered writes ───────────────────────────────────────────────────────
// Writing to disk on every data chunk (fs.appendFileSync per chunk) blocks the
// main process and freezes the UI under heavy output. Instead we accumulate
// per-session text in memory and flush on a short timer. Both data and command
// entries go through the same buffer so their ordering is preserved on disk.
const writeBuffers = new Map<string, string>()
let flushTimer: NodeJS.Timeout | null = null
const FLUSH_INTERVAL = 500

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(flushAll, FLUSH_INTERVAL)
}

function flushAll(): void {
  flushTimer = null
  for (const [sessionId, buf] of writeBuffers) {
    if (buf) writeToDisk(sessionId, buf)
  }
  writeBuffers.clear()
}

function writeToDisk(sessionId: string, text: string): void {
  const file = path.join(SESSIONS_DIR, `${sessionId}.log`)
  try {
    if (fs.existsSync(file)) fs.appendFileSync(file, text, 'utf-8')
  } catch { /* ignore log write failures */ }
}

// Flush a single session synchronously — used before closing/reading its log.
export function flushSession(sessionId: string): void {
  const buf = writeBuffers.get(sessionId)
  if (buf) {
    writeBuffers.delete(sessionId)
    writeToDisk(sessionId, buf)
  }
}

export function appendSessionData(sessionId: string, data: string): void {
  writeBuffers.set(sessionId, (writeBuffers.get(sessionId) ?? '') + stripAnsi(data))
  scheduleFlush()
}

export function appendSessionCommand(sessionId: string, command: string): void {
  const ts = new Date().toISOString().substring(11, 19)
  writeBuffers.set(sessionId, (writeBuffers.get(sessionId) ?? '') + `\n[${ts}] CMD> ${command}\n`)
  scheduleFlush()
}

export function closeSessionLog(sessionId: string, endedAt: number): void {
  flushSession(sessionId)
  const metaFile = path.join(SESSIONS_DIR, `${sessionId}.json`)
  if (fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8')) as SessionMeta
    meta.endedAt = endedAt
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8')
  }
  const logFile = path.join(SESSIONS_DIR, `${sessionId}.log`)
  if (fs.existsSync(logFile)) {
    const footer = `\n${'='.repeat(40)}\nSession ended: ${new Date(endedAt).toISOString()}\n`
    fs.appendFileSync(logFile, footer, 'utf-8')
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

export function readSessionLog(sessionId: string): string {
  flushSession(sessionId)
  const file = path.join(SESSIONS_DIR, `${sessionId}.log`)
  if (!fs.existsSync(file)) return ''
  return fs.readFileSync(file, 'utf-8')
}

export function deleteSession(sessionId: string): void {
  const log = path.join(SESSIONS_DIR, `${sessionId}.log`)
  const meta = path.join(SESSIONS_DIR, `${sessionId}.json`)
  if (fs.existsSync(log)) fs.unlinkSync(log)
  if (fs.existsSync(meta)) fs.unlinkSync(meta)
}

// Called on app startup: marks any session without endedAt as closed.
// Sessions left open happen when the app crashes or is force-closed.
export function cleanupOrphanedSessions(): void {
  try {
    ensureDir()
    const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      try {
        const metaPath = path.join(SESSIONS_DIR, file)
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as SessionMeta
        if (meta.endedAt) continue

        // Use .log file mtime as approximate end time; fallback to now
        const logPath = path.join(SESSIONS_DIR, `${meta.sessionId}.log`)
        const endedAt = fs.existsSync(logPath)
          ? fs.statSync(logPath).mtimeMs
          : Date.now()

        meta.endedAt = endedAt
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')

        if (fs.existsSync(logPath)) {
          const footer = `\n${'='.repeat(40)}\nSession ended: ${new Date(endedAt).toISOString()} (recovered on restart)\n`
          fs.appendFileSync(logPath, footer, 'utf-8')
        }
      } catch { /* skip corrupt entries */ }
    }
  } catch { /* ignore if sessions dir doesn't exist yet */ }
}
