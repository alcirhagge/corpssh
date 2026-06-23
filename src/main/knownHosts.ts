import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'

// ─── Host-key trust store (TOFU) ─────────────────────────────────────────────
// Trust-On-First-Use, like OpenSSH known_hosts. The first time we see a host we
// record its key fingerprint; on every later connect we compare. A MISMATCH is
// the dangerous case (possible MITM / server impersonation) — we reject and let
// the user explicitly re-trust. An unknown host is accepted and pinned.
//
// Stored as host:port → "sha256:BASE64". Plain JSON in ~/.corpssh; the
// fingerprint is public data (no secret), so no encryption needed.

const STORE_DIR = path.join(os.homedir(), '.corpssh')
const KNOWN_HOSTS_FILE = path.join(STORE_DIR, 'known_hosts.json')

type KnownHosts = Record<string, string>

function load(): KnownHosts {
  try {
    if (!fs.existsSync(KNOWN_HOSTS_FILE)) return {}
    return JSON.parse(fs.readFileSync(KNOWN_HOSTS_FILE, 'utf-8')) as KnownHosts
  } catch {
    return {}
  }
}

function persist(data: KnownHosts): void {
  try {
    if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true })
    fs.writeFileSync(KNOWN_HOSTS_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch { /* ignore write failures — worst case we re-pin next time */ }
}

function keyFor(host: string, port: number): string {
  return `${host}:${port}`
}

// ssh2's hostVerifier hands us the raw host key buffer. The standard SSH
// fingerprint is the base64 SHA-256 of that buffer (same value `ssh-keygen -lf`
// prints as "SHA256:…").
export function fingerprint(hostKey: Buffer): string {
  return 'sha256:' + crypto.createHash('sha256').update(hostKey).digest('base64')
}

export type HostKeyVerdict =
  | { status: 'trusted' }                      // matches the pinned key
  | { status: 'new'; fp: string }              // first time — now pinned
  | { status: 'changed'; oldFp: string; newFp: string } // MISMATCH — rejected

// Check a presented key against the store. On first sight, pin it and return
// 'new'. On match, 'trusted'. On mismatch, 'changed' WITHOUT overwriting — the
// user must explicitly forget the old key to re-trust.
export function verifyHostKey(host: string, port: number, hostKey: Buffer): HostKeyVerdict {
  const fp = fingerprint(hostKey)
  const store = load()
  const k = keyFor(host, port)
  const existing = store[k]

  if (!existing) {
    store[k] = fp
    persist(store)
    return { status: 'new', fp }
  }
  if (existing === fp) return { status: 'trusted' }
  return { status: 'changed', oldFp: existing, newFp: fp }
}

// User explicitly re-trusts after a legitimate key change (server rebuilt /
// rekeyed). Pins the new fingerprint so the next connect succeeds.
export function trustHostKey(host: string, port: number, fp: string): void {
  const store = load()
  store[keyFor(host, port)] = fp
  persist(store)
}

// Forget a host entirely (e.g. server decommissioned) so the next connect
// re-pins from scratch.
export function forgetHostKey(host: string, port: number): void {
  const store = load()
  delete store[keyFor(host, port)]
  persist(store)
}
