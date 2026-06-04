import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const STORE_DIR = path.join(os.homedir(), '.corpssh')
const STORE_FILE = path.join(STORE_DIR, 'data.json')

interface StoreData {
  servers: ServerRecord[]
  groups: GroupRecord[]
  keys: KeyRecord[]
  settings: AppSettings
}

export interface ServerRecord {
  id: string
  name: string
  host: string
  port: number
  username: string
  authMethod: 'password' | 'privateKey' | 'agent'
  password?: string
  privateKeyPath?: string
  privateKeyContent?: string
  passphrase?: string
  groupId?: string
  color?: string
  tags?: string[]
  lastConnected?: number
  notes?: string
}

export interface GroupRecord {
  id: string
  name: string
  color?: string
  expanded?: boolean
}

export interface KeyRecord {
  id: string
  name: string
  path: string
  comment?: string
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system'
  fontSize: number
  fontFamily: string
  cursorStyle: 'block' | 'bar' | 'underline'
  cursorBlink: boolean
  scrollback: number
  bellStyle: 'none' | 'sound' | 'visual'
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  fontSize: 14,
  fontFamily: 'JetBrains Mono, Cascadia Code, monospace',
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 5000,
  bellStyle: 'none'
}

function ensureStore(): StoreData {
  try {
    if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true })
    if (!fs.existsSync(STORE_FILE)) {
      const initial: StoreData = { servers: [], groups: [], keys: [], settings: defaultSettings }
      fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2))
      return initial
    }
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as StoreData
  } catch {
    return { servers: [], groups: [], keys: [], settings: defaultSettings }
  }
}

function save(data: StoreData): void {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Store save error:', e)
  }
}

export function getServers(): ServerRecord[] {
  return ensureStore().servers
}

export function saveServer(server: ServerRecord): void {
  const data = ensureStore()
  const idx = data.servers.findIndex((s) => s.id === server.id)
  if (idx >= 0) data.servers[idx] = server
  else data.servers.push(server)
  save(data)
}

export function deleteServer(id: string): void {
  const data = ensureStore()
  data.servers = data.servers.filter((s) => s.id !== id)
  save(data)
}

export function getGroups(): GroupRecord[] {
  return ensureStore().groups
}

export function saveGroup(group: GroupRecord): void {
  const data = ensureStore()
  const idx = data.groups.findIndex((g) => g.id === group.id)
  if (idx >= 0) data.groups[idx] = group
  else data.groups.push(group)
  save(data)
}

export function deleteGroup(id: string): void {
  const data = ensureStore()
  data.groups = data.groups.filter((g) => g.id !== id)
  save(data)
}

export function getKeys(): KeyRecord[] {
  return ensureStore().keys
}

export function saveKey(key: KeyRecord): void {
  const data = ensureStore()
  const idx = data.keys.findIndex((k) => k.id === key.id)
  if (idx >= 0) data.keys[idx] = key
  else data.keys.push(key)
  save(data)
}

export function deleteKey(id: string): void {
  const data = ensureStore()
  data.keys = data.keys.filter((k) => k.id !== id)
  save(data)
}

export function getSettings(): AppSettings {
  return ensureStore().settings
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const data = ensureStore()
  data.settings = { ...data.settings, ...settings }
  save(data)
}

export function updateLastConnected(serverId: string): void {
  const data = ensureStore()
  const server = data.servers.find((s) => s.id === serverId)
  if (server) {
    server.lastConnected = Date.now()
    save(data)
  }
}
