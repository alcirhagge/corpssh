import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { randomUUID } from 'crypto'

const LOG_FILE = path.join(os.homedir(), '.corpssh', 'events.json')
const MAX_ENTRIES = 2000

export interface LogEntry {
  id: string
  timestamp: number
  type: 'connect' | 'disconnect' | 'error' | 'auth_fail'
  serverId: string
  serverName: string
  host: string
  username: string
  duration?: number
  message?: string
}

function loadLogs(): LogEntry[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return []
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8')) as LogEntry[]
  } catch { return [] }
}

function saveLogs(entries: LogEntry[]): void {
  try {
    const dir = path.dirname(LOG_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(LOG_FILE, JSON.stringify(entries.slice(0, MAX_ENTRIES), null, 2))
  } catch (e) { console.error('log write error:', e) }
}

export function addLogEntry(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
  const full: LogEntry = { id: randomUUID(), timestamp: Date.now(), ...entry }
  const logs = [full, ...loadLogs()].slice(0, MAX_ENTRIES)
  saveLogs(logs)
  return full
}

export function getLogs(): LogEntry[] {
  return loadLogs()
}

export function clearLogs(): void {
  saveLogs([])
}
