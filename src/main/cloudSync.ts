import { getClient, getMasterKey, ensureDek } from './cloudClient'
import { sealWithKey, openWithKey } from './crypto'
import {
  getServers, getGroups, getCredentials, getKeys,
  upsertServerFromCloud, upsertGroupFromCloud, upsertCredentialFromCloud, upsertKeyFromCloud,
  type ServerRecord, type GroupRecord, type CredentialRecord, type KeyRecord
} from './store'

// ─── Cloud sync engine (last-write-wins by updated_at) ────────────────────────
// Secrets are packed into a JSON blob and sealed with the in-memory master key
// before upload (secret_cipher/secret_nonce). The server only ever stores
// ciphertext. Metadata (name/host/port/…) is stored in the clear so it stays
// searchable. v1 does not propagate deletions (safe: never removes data).

const isoToMs = (s?: string | null): number => (s ? new Date(s).getTime() : 0)
const msToIso = (ms?: number): string => new Date(ms ?? Date.now()).toISOString()

// Seal a set of secret fields → { cipher, nonce }. Empty input → nulls.
function seal(obj: Record<string, unknown>): { cipher: string | null; nonce: string | null } {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') clean[k] = v
  }
  if (Object.keys(clean).length === 0) return { cipher: null, nonce: null }
  const s = sealWithKey(JSON.stringify(clean), getMasterKey())
  return { cipher: s.data, nonce: s.iv }
}

function open(cipher: string | null, nonce: string | null): Record<string, any> {
  if (!cipher || !nonce) return {}
  try { return JSON.parse(openWithKey({ iv: nonce, data: cipher }, getMasterKey())) }
  catch { return {} }
}

async function userId(): Promise<string> {
  const { data } = await getClient().auth.getSession()
  if (!data.session) throw new Error('Não autenticado.')
  return data.session.user.id
}

// Generic two-way reconcile. Returns rows to upsert remotely + counters.
function reconcile(
  local: Array<{ id: string; updatedAt?: number }>,
  remote: Array<{ id: string; updated_at?: string }>,
  toRow: (l: any) => any,
  toLocal: (r: any) => any,
  applyLocal: (l: any) => void
): { toUpsert: any[]; pulled: number; pushed: number } {
  const rById = new Map(remote.map((r) => [r.id, r]))
  const lById = new Map(local.map((l) => [l.id, l]))
  const toUpsert: any[] = []
  let pulled = 0
  let pushed = 0

  for (const r of remote) {
    const l = lById.get(r.id)
    if (!l || isoToMs(r.updated_at) > (l.updatedAt ?? 0)) { applyLocal(toLocal(r)); pulled++ }
  }
  for (const l of local) {
    const r = rById.get(l.id)
    if (!r || (l.updatedAt ?? 0) > isoToMs(r.updated_at)) { toUpsert.push(toRow(l)); pushed++ }
  }
  return { toUpsert, pulled, pushed }
}

// ─── Field mappings ───────────────────────────────────────────────────────────
function groupToRow(g: GroupRecord, uid: string): any {
  return { id: g.id, user_id: uid, name: g.name, color: g.color ?? null,
    sort_order: g.sortOrder ?? 0, updated_at: msToIso(g.updatedAt), deleted: false }
}
function groupFromRow(r: any): GroupRecord {
  return { id: r.id, name: r.name, color: r.color ?? undefined,
    sortOrder: r.sort_order ?? undefined, updatedAt: isoToMs(r.updated_at) }
}

function credToRow(c: CredentialRecord, uid: string): any {
  const s = seal({ password: c.password, passphrase: c.passphrase,
    privateKeyContent: c.privateKeyContent, privateKeyPath: c.privateKeyPath })
  return { id: c.id, user_id: uid, name: c.name, username: c.username ?? null,
    auth_method: c.authMethod ?? null, secret_cipher: s.cipher, secret_nonce: s.nonce,
    updated_at: msToIso(c.updatedAt), deleted: false }
}
function credFromRow(r: any): CredentialRecord {
  const sec = open(r.secret_cipher, r.secret_nonce)
  return { id: r.id, name: r.name, username: r.username ?? '', authMethod: r.auth_method ?? 'password',
    password: sec.password, passphrase: sec.passphrase, privateKeyContent: sec.privateKeyContent,
    privateKeyPath: sec.privateKeyPath, updatedAt: isoToMs(r.updated_at) }
}

function keyToRow(k: KeyRecord, uid: string): any {
  const s = seal({ path: k.path })
  return { id: k.id, user_id: uid, name: k.name, comment: k.comment ?? null,
    key_cipher: s.cipher, key_nonce: s.nonce, updated_at: msToIso(k.updatedAt) }
}
function keyFromRow(r: any): KeyRecord {
  const sec = open(r.key_cipher, r.key_nonce)
  return { id: r.id, name: r.name, comment: r.comment ?? undefined,
    path: sec.path ?? '', updatedAt: isoToMs(r.updated_at) }
}

function hostToRow(s: any, uid: string): any {
  const sec = seal({
    password: s.password, passphrase: s.passphrase, privateKeyContent: s.privateKeyContent,
    privateKeyPath: s.privateKeyPath, vncPassword: s.vncPassword,
    rdpDomain: s.rdpDomain, rdpFullscreen: s.rdpFullscreen
  })
  return {
    id: s.id, user_id: uid, group_id: s.groupId ?? null, name: s.name, host: s.host,
    port: s.port ?? 22, username: s.username ?? null, protocol: s.protocol ?? 'ssh',
    auth_method: s.authMethod ?? null, color: s.color ?? null, tags: s.tags ?? null,
    notes: s.notes ?? null, detected_os: s.detectedOs ?? null, icon_override: s.iconOverride ?? null,
    credential_id: s.credentialId ?? null, secret_cipher: sec.cipher, secret_nonce: sec.nonce,
    updated_at: msToIso(s.updatedAt), deleted: false
  }
}
function hostFromRow(r: any): ServerRecord {
  const sec = open(r.secret_cipher, r.secret_nonce)
  const rec: any = {
    id: r.id, name: r.name, host: r.host, port: r.port ?? 22, username: r.username ?? '',
    authMethod: r.auth_method ?? 'password', groupId: r.group_id ?? undefined,
    color: r.color ?? undefined, tags: r.tags ?? [], notes: r.notes ?? undefined,
    detectedOs: r.detected_os ?? undefined, iconOverride: r.icon_override ?? undefined,
    credentialId: r.credential_id ?? undefined, protocol: r.protocol ?? 'ssh',
    password: sec.password, passphrase: sec.passphrase, privateKeyContent: sec.privateKeyContent,
    privateKeyPath: sec.privateKeyPath, updatedAt: isoToMs(r.updated_at)
  }
  if (sec.vncPassword !== undefined) rec.vncPassword = sec.vncPassword
  if (sec.rdpDomain !== undefined) rec.rdpDomain = sec.rdpDomain
  if (sec.rdpFullscreen !== undefined) rec.rdpFullscreen = sec.rdpFullscreen
  return rec as ServerRecord
}

async function fetchRemote(table: string, uid: string): Promise<any[]> {
  const { data, error } = await getClient().from(table).select('*').eq('user_id', uid)
  if (error) throw new Error(`${table}: ${error.message}`)
  return data ?? []
}

async function pushRows(table: string, rows: any[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await getClient().from(table).upsert(rows)
  if (error) throw new Error(`${table}: ${error.message}`)
}

export interface SyncResult { pulled: number; pushed: number }

// Pull-then-push reconcile across all personal tables. FK-safe push order:
// host_groups + credentials before hosts (hosts reference both).
export async function syncNow(): Promise<SyncResult> {
  await ensureDek() // load (or lazily create) the encryption key
  const uid = await userId()
  let pulled = 0
  let pushed = 0

  // groups
  {
    const remote = await fetchRemote('host_groups', uid)
    const res = reconcile(getGroups(), remote, (g) => groupToRow(g, uid), groupFromRow, upsertGroupFromCloud)
    await pushRows('host_groups', res.toUpsert)
    pulled += res.pulled; pushed += res.pushed
  }
  // credentials
  {
    const remote = await fetchRemote('credentials', uid)
    const res = reconcile(getCredentials(), remote, (c) => credToRow(c, uid), credFromRow, upsertCredentialFromCloud)
    await pushRows('credentials', res.toUpsert)
    pulled += res.pulled; pushed += res.pushed
  }
  // ssh keys
  {
    const remote = await fetchRemote('ssh_keys', uid)
    const res = reconcile(getKeys(), remote, (k) => keyToRow(k, uid), keyFromRow, upsertKeyFromCloud)
    await pushRows('ssh_keys', res.toUpsert)
    pulled += res.pulled; pushed += res.pushed
  }
  // hosts (last — references groups + credentials)
  {
    const remote = await fetchRemote('hosts', uid)
    const res = reconcile(getServers(), remote, (s) => hostToRow(s, uid), hostFromRow, upsertServerFromCloud)
    await pushRows('hosts', res.toUpsert)
    pulled += res.pulled; pushed += res.pushed
  }

  return { pulled, pushed }
}
