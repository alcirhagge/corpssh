import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { Terminal } from '@xterm/headless'
import { attachShellIntegration, type ShellIntegration } from '../shared/shellIntegration'
import { recordCommand } from './commandHistory'

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

// ─── Append-only transcript via a headless terminal emulator ────────────────
// We feed the raw SSH byte stream into a real (headless) xterm so the on-disk
// log shows what the user actually saw — clean of ANSI escapes and of the
// carriage-return / cursor-addressing redraws that progress bars and live
// monitors (mikrotik /interface monitor, watch, ping) spray. The emulator
// collapses those redraws to the final rendered state.
//
// Unlike the old "re-serialise the whole buffer and OVERWRITE the file every
// tick" approach, this commits finalised lines APPEND-ONLY:
//   • Lines that scroll into the emulator's scrollback are final — they can no
//     longer change — so we append them as they go (handles unbounded output
//     without ever overwriting earlier history).
//   • Before a destructive transition that would erase still-visible content
//     (a hard clear `ESC[3J`/RIS, or entering the alternate screen), we flush
//     the current viewport so it survives in the log.
//   • Full-screen apps (btop, htop, vim, less) run in the ALTERNATE screen.
//     Their frames are not transcribed (that would be unreadable churn); we
//     record a single marker that the app ran, and keep the history on either
//     side intact.
interface Session {
  term: Terminal
  // Number of MAIN-buffer scrollback lines already written to disk in the
  // current epoch. Reset to 0 after a hard clear (new epoch).
  committed: number
  inAlt: boolean       // currently inside the alternate screen?
  altSince: number     // timestamp the alt screen was entered (for the marker)
  si: ShellIntegration // OSC 133/7 tracker (real commands + exit codes)
  // Deadline until which the next hard clear is the one ending our own setup
  // injection: its viewport (the echoed script) is dropped instead of flushed.
  setupClearUntil: number
}

const SCROLLBACK = 10000
const DEFAULT_COLS = 120
const DEFAULT_ROWS = 40
const COMMIT_INTERVAL = 1500

// Enter / leave the alternate screen buffer (xterm: 1049 = save+alt, 1047/47 = legacy).
const ALT_ENTER = /\x1b\[\?(?:1049|1047|47)h/
const ALT_LEAVE = /\x1b\[\?(?:1049|1047|47)l/
// History-destroying clears in the MAIN buffer: ESC[3J wipes the scrollback,
// ESC c (RIS) is a full reset. Plain ESC[2J only blanks the visible screen
// (scrollback kept) and is left to the emulator — catching it would log one
// frame per refresh for apps that clear-and-redraw in place.
const HARD_CLEAR = /\x1b\[3J|\x1bc/

const sessions = new Map<string, Session>()
const dirty = new Set<string>()
let commitTimer: NodeJS.Timeout | null = null

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
  fs.writeFileSync(logPath(meta.sessionId), buildHeader(meta), 'utf-8')
  fs.writeFileSync(metaPath(meta.sessionId), JSON.stringify(meta, null, 2), 'utf-8')

  const term = new Terminal({
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    scrollback: SCROLLBACK,
    allowProposedApi: true // needed for buffer.active access
  })
  // Commands reported by the shell (when the integration script is running)
  // feed the Ctrl+R history with the exact command line and its exit status.
  const si = attachShellIntegration(term, {
    onCommand: (c) => recordCommand(c.command, c.exitCode)
  })
  sessions.set(meta.sessionId, { term, committed: 0, inAlt: false, altSince: 0, si, setupClearUntil: 0 })
}

// True once the remote shell has started emitting integration marks.
export function isShellIntegrated(sessionId: string): boolean {
  return sessions.get(sessionId)?.si.active ?? false
}

// Called right before setup text is injected: the `clear` that ends it must not
// flush the echoed script into the transcript.
export function expectSetupClear(sessionId: string): void {
  const s = sessions.get(sessionId)
  if (s) s.setupClearUntil = Date.now() + 15000
}

function renderLine(term: Terminal, i: number): string {
  const line = term.buffer.active.getLine(i)
  return line ? line.translateToString(true).replace(/\s+$/, '') : ''
}

// Append text to the on-disk log, never overwriting.
function appendToDisk(sessionId: string, text: string): void {
  if (!text) return
  try {
    fs.appendFileSync(logPath(sessionId), text, 'utf-8')
  } catch { /* ignore log write failures */ }
}

// Commit MAIN-buffer lines that have scrolled into the scrollback (and are thus
// final) since the last commit. No-op while in the alternate screen.
function commitScrollback(s: Session, sessionId: string): void {
  if (s.inAlt || s.term.buffer.active.type !== 'normal') return
  const baseY = s.term.buffer.active.baseY
  if (baseY <= s.committed) return
  const lines: string[] = []
  for (let i = s.committed; i < baseY; i++) lines.push(renderLine(s.term, i))
  s.committed = baseY
  appendToDisk(sessionId, lines.join('\n') + '\n')
}

// Flush the still-visible viewport (everything from the top of the screen down
// to the cursor row). Called before content that would otherwise be erased —
// a hard clear or entering the alternate screen — and at session end.
function flushViewport(s: Session, sessionId: string): void {
  if (s.term.buffer.active.type !== 'normal') return
  commitScrollback(s, sessionId)
  const buf = s.term.buffer.active
  const top = buf.baseY
  const last = top + buf.cursorY // inclusive: the cursor's own row
  const lines: string[] = []
  for (let i = top; i <= last; i++) lines.push(renderLine(s.term, i))
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  if (lines.length) appendToDisk(sessionId, lines.join('\n') + '\n')
}

function scheduleCommit(): void {
  if (commitTimer) return
  commitTimer = setTimeout(() => {
    commitTimer = null
    for (const id of dirty) {
      const s = sessions.get(id)
      if (s) commitScrollback(s, id)
    }
    dirty.clear()
  }, COMMIT_INTERVAL)
}

// Wait for the emulator's write queue to drain, then run fn.
function whenDrained(term: Terminal, fn: () => void): void {
  term.write('', fn)
}

export function appendSessionData(sessionId: string, data: string): void {
  const s = sessions.get(sessionId)
  if (!s) return

  const entersAlt = !s.inAlt && ALT_ENTER.test(data)
  const leavesAlt = s.inAlt && ALT_LEAVE.test(data)
  const hardClear = !s.inAlt && HARD_CLEAR.test(data)
  // The clear closing our own setup injection: drop the echoed script silently.
  const setupClear = hardClear && s.setupClearUntil > Date.now()
  if (setupClear) s.setupClearUntil = 0

  // Preserve content that's about to be destroyed: read the CURRENT (pre-write)
  // buffer and flush the live viewport before the emulator processes the data.
  if (entersAlt || (hardClear && !setupClear)) {
    whenDrained(s.term, () => flushViewport(s, sessionId))
  }
  if (entersAlt) {
    s.inAlt = true
    s.altSince = Date.now()
  }

  s.term.write(data, () => {
    if (hardClear) {
      // New epoch: the scrollback was wiped, so the line counter restarts.
      s.committed = s.term.buffer.active.baseY
    }
    if (leavesAlt) {
      s.inAlt = false
      const secs = s.altSince ? Math.round((Date.now() - s.altSince) / 1000) : 0
      const dur = secs >= 60 ? `${Math.floor(secs / 60)}m${secs % 60}s` : `${secs}s`
      appendToDisk(sessionId, `[full-screen app — ${dur}]\n`)
      // The main buffer is restored to its pre-alt state; resync the counter so
      // we don't re-commit lines that were already on screen before the app ran.
      s.committed = s.term.buffer.active.baseY
    }
  })

  dirty.add(sessionId)
  scheduleCommit()
}

// Commands are already echoed by the remote shell and captured by the emulator,
// so we don't inject synthetic "CMD>" markers — they would duplicate the echoed
// input. Kept as a no-op so the caller (sshManager) needs no change.
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
  const s = sessions.get(sessionId)
  if (!s) return
  dirty.delete(sessionId)
  whenDrained(s.term, () => commitScrollback(s, sessionId))
}

export function closeSessionLog(sessionId: string, endedAt: number): void {
  const s = sessions.get(sessionId)

  const finalize = (): void => {
    const footer = `\n${'='.repeat(40)}\nSession ended: ${new Date(endedAt).toISOString()}\n`
    appendToDisk(sessionId, footer)
    if (s) { s.si.dispose(); s.term.dispose(); sessions.delete(sessionId) }
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
    // Drain, commit scrolled-off lines, then flush whatever is still on screen.
    whenDrained(s.term, () => {
      if (s.inAlt) { s.inAlt = false } // never leaked the marker; just stop
      commitScrollback(s, sessionId)
      flushViewport(s, sessionId)
      finalize()
    })
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

// Build the not-yet-committed tail (scrolled-off lines past `committed` plus the
// live viewport) so a live read shows the full session without mutating disk.
function pendingTail(s: Session): string {
  if (s.inAlt || s.term.buffer.active.type !== 'normal') return ''
  const buf = s.term.buffer.active
  const last = buf.baseY + buf.cursorY
  const lines: string[] = []
  for (let i = s.committed; i <= last; i++) lines.push(renderLine(s.term, i))
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.length ? lines.join('\n') + '\n' : ''
}

// Async so we can drain the emulator's pending writes before reading a live session.
export function readSessionLog(sessionId: string): Promise<string> {
  return new Promise((resolve) => {
    const s = sessions.get(sessionId)
    if (s) {
      whenDrained(s.term, () => {
        commitScrollback(s, sessionId)
        dirty.delete(sessionId)
        let onDisk = ''
        try { onDisk = fs.existsSync(logPath(sessionId)) ? fs.readFileSync(logPath(sessionId), 'utf-8') : '' }
        catch { onDisk = '' }
        resolve(onDisk + pendingTail(s))
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
  if (s) { s.si.dispose(); s.term.dispose(); sessions.delete(sessionId) }
  dirty.delete(sessionId)
  if (fs.existsSync(logPath(sessionId))) fs.unlinkSync(logPath(sessionId))
  if (fs.existsSync(metaPath(sessionId))) fs.unlinkSync(metaPath(sessionId))
}

// Called on app startup: marks any session without endedAt as closed.
// Sessions left open happen when the app crashes or is force-closed; the
// append-only log already holds everything committed up to the crash.
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
