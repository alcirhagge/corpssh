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

export function appendSessionData(sessionId: string, data: string): void {
  const file = path.join(SESSIONS_DIR, `${sessionId}.log`)
  if (!fs.existsSync(file)) return
  fs.appendFileSync(file, stripAnsi(data), 'utf-8')
}

export function appendSessionCommand(sessionId: string, command: string): void {
  const file = path.join(SESSIONS_DIR, `${sessionId}.log`)
  if (!fs.existsSync(file)) return
  const ts = new Date().toISOString().substring(11, 19)
  fs.appendFileSync(file, `\n[${ts}] CMD> ${command}\n`, 'utf-8')
}

export function closeSessionLog(sessionId: string, endedAt: number): void {
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
