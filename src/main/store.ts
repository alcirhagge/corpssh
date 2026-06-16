import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { safeStorage } from 'electron'

const STORE_DIR = path.join(os.homedir(), '.corpssh')
const STORE_FILE = path.join(STORE_DIR, 'data.json')

// ─── Encryption at rest ──────────────────────────────────────────────────────
// Secrets (passwords, passphrases, inline private keys) are encrypted with the
// OS keystore via Electron safeStorage (DPAPI on Windows, Keychain on macOS,
// libsecret on Linux). Encrypted values are stored as `enc:v1:<base64>` so we
// can tell them apart from legacy plaintext and migrate transparently.
const ENC_PREFIX = 'enc:v1:'

function encrypt(value?: string): string | undefined {
  if (value == null || value === '') return value
  if (value.startsWith(ENC_PREFIX)) return value  // already encrypted
  try {
    if (safeStorage.isEncryptionAvailable())
      return ENC_PREFIX + safeStorage.encryptString(value).toString('base64')
  } catch { /* fall through to plaintext */ }
  return value
}

function decrypt(value?: string): string | undefined {
  if (value == null || !value.startsWith(ENC_PREFIX)) return value
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'))
  } catch {
    return value
  }
}

const SERVER_SECRETS: (keyof ServerRecord)[] = ['password', 'passphrase', 'privateKeyContent']
const CRED_SECRETS: (keyof CredentialRecord)[] = ['password', 'passphrase', 'privateKeyContent']

function mapSecrets<T>(rec: T, keys: (keyof T)[], fn: (v?: string) => string | undefined): T {
  const out = { ...rec }
  for (const k of keys) (out as any)[k] = fn((rec as any)[k])
  return out
}

interface StoreData {
  servers: ServerRecord[]
  groups: GroupRecord[]
  keys: KeyRecord[]
  credentials: CredentialRecord[]
  snippets: SnippetRecord[]
  settings: AppSettings
}

export interface SnippetRecord {
  id: string
  name: string
  command: string
  description?: string
  updatedAt?: number
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
  detectedOs?: string
  iconOverride?: string
  credentialId?: string
  updatedAt?: number  // last local change (ms) — used for cloud LWW sync
}

// A reusable, named credential (the "vault"). A server may reference one via
// credentialId; at connect time the credential's auth fields override the
// server's own. Secrets are encrypted at rest just like server secrets.
export interface CredentialRecord {
  id: string
  name: string
  username: string
  authMethod: 'password' | 'privateKey' | 'agent'
  password?: string
  privateKeyPath?: string
  privateKeyContent?: string
  passphrase?: string
  updatedAt?: number
}

export interface GroupRecord {
  id: string
  name: string
  color?: string
  expanded?: boolean
  sortOrder?: number
  updatedAt?: number
}

export interface KeyRecord {
  id: string
  name: string
  path: string
  comment?: string
  updatedAt?: number
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
      const initial: StoreData = { servers: [], groups: [], keys: [], credentials: [], snippets: [], settings: defaultSettings }
      fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2))
      return initial
    }
    const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as StoreData
    if (!data.credentials) data.credentials = []  // back-compat with older stores
    if (!data.snippets) data.snippets = []        // back-compat with older stores
    return data
  } catch {
    return { servers: [], groups: [], keys: [], credentials: [], snippets: [], settings: defaultSettings }
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
  return ensureStore().servers.map((s) => mapSecrets(s, SERVER_SECRETS, decrypt))
}

function putServer(server: ServerRecord): void {
  const data = ensureStore()
  const enc = mapSecrets(server, SERVER_SECRETS, encrypt)
  const idx = data.servers.findIndex((s) => s.id === enc.id)
  if (idx >= 0) data.servers[idx] = enc
  else data.servers.push(enc)
  save(data)
}

// UI path: stamps updatedAt=now so the change propagates to the cloud.
export function saveServer(server: ServerRecord): void {
  putServer({ ...server, updatedAt: Date.now() })
}

// Sync path: writes a record pulled from the cloud, PRESERVING its updatedAt.
export function upsertServerFromCloud(server: ServerRecord): void {
  putServer(server)
}

export function deleteServer(id: string): void {
  const data = ensureStore()
  data.servers = data.servers.filter((s) => s.id !== id)
  save(data)
}

export function getGroups(): GroupRecord[] {
  return ensureStore().groups
}

function putGroup(group: GroupRecord): void {
  const data = ensureStore()
  const idx = data.groups.findIndex((g) => g.id === group.id)
  if (idx >= 0) data.groups[idx] = group
  else data.groups.push(group)
  save(data)
}

export function saveGroup(group: GroupRecord): void {
  putGroup({ ...group, updatedAt: Date.now() })
}

export function upsertGroupFromCloud(group: GroupRecord): void {
  putGroup(group)
}

export function deleteGroup(id: string): void {
  const data = ensureStore()
  data.groups = data.groups.filter((g) => g.id !== id)
  save(data)
}

export function getKeys(): KeyRecord[] {
  return ensureStore().keys
}

function putKey(key: KeyRecord): void {
  const data = ensureStore()
  const idx = data.keys.findIndex((k) => k.id === key.id)
  if (idx >= 0) data.keys[idx] = key
  else data.keys.push(key)
  save(data)
}

export function saveKey(key: KeyRecord): void {
  putKey({ ...key, updatedAt: Date.now() })
}

export function upsertKeyFromCloud(key: KeyRecord): void {
  putKey(key)
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

// ─── Credentials (vault) ─────────────────────────────────────────────────────
export function getCredentials(): CredentialRecord[] {
  return ensureStore().credentials.map((c) => mapSecrets(c, CRED_SECRETS, decrypt))
}

function putCredential(cred: CredentialRecord): void {
  const data = ensureStore()
  const enc = mapSecrets(cred, CRED_SECRETS, encrypt)
  const idx = data.credentials.findIndex((c) => c.id === enc.id)
  if (idx >= 0) data.credentials[idx] = enc
  else data.credentials.push(enc)
  save(data)
}

export function saveCredential(cred: CredentialRecord): void {
  putCredential({ ...cred, updatedAt: Date.now() })
}

export function upsertCredentialFromCloud(cred: CredentialRecord): void {
  putCredential(cred)
}

export function deleteCredential(id: string): void {
  const data = ensureStore()
  data.credentials = data.credentials.filter((c) => c.id !== id)
  // Detach any servers that referenced it so they fall back to their own auth
  data.servers.forEach((s) => { if (s.credentialId === id) delete s.credentialId })
  save(data)
}

// Resolve the effective auth for a server: a referenced credential overrides
// the server's own auth fields. Returned secrets are decrypted.
export function resolveServerAuth(serverId: string): Partial<ServerRecord> | null {
  const data = ensureStore()
  const server = data.servers.find((s) => s.id === serverId)
  if (!server) return null
  if (!server.credentialId) return null
  const cred = data.credentials.find((c) => c.id === server.credentialId)
  if (!cred) return null
  const c = mapSecrets(cred, CRED_SECRETS, decrypt)
  return {
    username: c.username,
    authMethod: c.authMethod,
    password: c.password,
    privateKeyPath: c.privateKeyPath,
    privateKeyContent: c.privateKeyContent,
    passphrase: c.passphrase
  }
}

// ─── Snippets ────────────────────────────────────────────────────────────────
export function getSnippets(): SnippetRecord[] {
  return ensureStore().snippets
}

function putSnippet(snippet: SnippetRecord): void {
  const data = ensureStore()
  const idx = data.snippets.findIndex((s) => s.id === snippet.id)
  if (idx >= 0) data.snippets[idx] = snippet
  else data.snippets.push(snippet)
  save(data)
}

export function saveSnippet(snippet: SnippetRecord): void {
  putSnippet({ ...snippet, updatedAt: Date.now() })
}

export function deleteSnippet(id: string): void {
  const data = ensureStore()
  data.snippets = data.snippets.filter((s) => s.id !== id)
  save(data)
}

// One-time migration: encrypt any plaintext secrets left over from older versions
// (servers + credentials). Safe to run on every startup — it no-ops once done.
export function migrateEncryptionAtRest(): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) return
    const data = ensureStore()
    const isPlain = (v?: string) => v != null && v !== '' && !v.startsWith(ENC_PREFIX)
    let changed = false

    data.servers.forEach((s, i) => {
      if (SERVER_SECRETS.some((k) => isPlain(s[k] as string | undefined))) {
        data.servers[i] = mapSecrets(s, SERVER_SECRETS, encrypt)
        changed = true
      }
    })
    data.credentials.forEach((c, i) => {
      if (CRED_SECRETS.some((k) => isPlain(c[k] as string | undefined))) {
        data.credentials[i] = mapSecrets(c, CRED_SECRETS, encrypt)
        changed = true
      }
    })

    if (changed) save(data)
  } catch { /* ignore migration failures */ }
}
