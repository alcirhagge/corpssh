import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// ─── Persistent command history ──────────────────────────────────────────────
// A cross-session, cross-host record of the commands the user has typed, backing
// a Ctrl+R style reverse search in the terminal. Stored as plain JSON in
// ~/.corpssh — commands are not secrets per se, but see SENSITIVE below: lines
// that look like they carry a credential are skipped so passwords never land on
// disk.

const STORE_DIR = path.join(os.homedir(), '.corpssh')
const HISTORY_FILE = path.join(STORE_DIR, 'command_history.json')
const MAX_ENTRIES = 1000

export interface CommandEntry {
  cmd: string
  ts: number    // last-used epoch ms
  count: number // times run
  /** Exit status of the last run, when the shell integration reported it. */
  exit?: number
}

// Skip anything that smells like a secret so we never persist a password/token.
// Conservative substring match on common credential-bearing flags/words.
const SENSITIVE = /(\bpass(word)?\b|\bsecret\b|\btoken\b|\bapikey\b|api[_-]?key|--password|-p\s|\bsshpass\b)/i

let cache: CommandEntry[] | null = null

function load(): CommandEntry[] {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')) as CommandEntry[]
  } catch {
    cache = []
  }
  return cache
}

function persist(): void {
  try {
    if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true })
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(cache ?? [], null, 0), 'utf-8')
  } catch { /* best-effort — history is non-critical */ }
}

// Record one completed command. Dedupes (existing entry floats to the front and
// bumps its count) and caps the store at MAX_ENTRIES (oldest dropped).
export function recordCommand(raw: string, exitCode?: number | null): void {
  const cmd = raw.trim()
  if (cmd.length < 2 || cmd.length > 4000) return  // ignore noise and pathological pastes
  if (SENSITIVE.test(cmd)) return

  const list = load()
  const now = Date.now()
  const idx = list.findIndex((e) => e.cmd === cmd)
  if (idx >= 0) {
    const [entry] = list.splice(idx, 1)
    entry.ts = now
    entry.count += 1
    if (typeof exitCode === 'number') entry.exit = exitCode
    list.unshift(entry)
  } else {
    list.unshift({ cmd, ts: now, count: 1, ...(typeof exitCode === 'number' ? { exit: exitCode } : {}) })
    if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES
  }
  persist()
}

// Return history newest-first, optionally filtered by a case-insensitive
// substring. `limit` caps the result so the UI never renders thousands of rows.
export function listCommands(query = '', limit = 200): CommandEntry[] {
  const list = load()
  const q = query.trim().toLowerCase()
  const matched = q ? list.filter((e) => e.cmd.toLowerCase().includes(q)) : list
  return matched.slice(0, limit)
}

export function clearCommandHistory(): void {
  cache = []
  persist()
}
