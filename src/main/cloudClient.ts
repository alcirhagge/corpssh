import type { SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { randomDEK } from './crypto'

// ─── Cloud (Supabase) client — main process ──────────────────────────────────
// Lives in main because the sync engine needs direct access to the local store.
// The anon key is public by design (RLS protects the data). Cloud is OPT-IN:
// nothing here runs unless the user explicitly signs in.

const SESSION_FILE = path.join(os.homedir(), '.corpssh', 'cloud-session.json')

// electron-vite injects MAIN_VITE_* from the root .env at build time; fall back to
// process.env so it also works if provided at runtime.
// Public-by-design fallback so packaged/CI builds (which have no .env) ship with
// the cloud configured. The anon key is meant to be public — it is shipped in
// every client binary and is protected by Row-Level Security on the server.
const DEFAULT_SUPABASE_URL = 'https://lkenbxriksbonxrebzcz.supabase.co'
const DEFAULT_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZW5ieHJpa3Nib254cmViemN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDQ5NDYsImV4cCI6MjA5NjY4MDk0Nn0.mzvNSV2px_jl288MC7fuCIGPHApVmJt8PwflUMZxgyQ'

const env = (import.meta as any).env ?? {}
const SUPABASE_URL: string = env.MAIN_VITE_SUPABASE_URL || process.env.MAIN_VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
const SUPABASE_ANON: string = env.MAIN_VITE_SUPABASE_ANON_KEY || process.env.MAIN_VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON

// File-backed storage so the Supabase session survives restarts (main has no
// localStorage). Supabase reads/writes a small set of string keys.
function readStore(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8')) } catch { return {} }
}
function writeStore(o: Record<string, string>): void {
  try {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true })
    fs.writeFileSync(SESSION_FILE, JSON.stringify(o))
  } catch { /* ignore */ }
}
const fileStorage = {
  getItem: (key: string): string | null => readStore()[key] ?? null,
  setItem: (key: string, value: string): void => { const a = readStore(); a[key] = value; writeStore(a) },
  removeItem: (key: string): void => { const a = readStore(); delete a[key]; writeStore(a) }
}

let client: SupabaseClient | null = null

export function isCloudConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON)
}

export function getClient(): SupabaseClient {
  if (!client) {
    if (!isCloudConfigured()) throw new Error('Nuvem não configurada (.env ausente).')
    // Loaded lazily so the package's Node-version deprecation check doesn't run
    // at app startup — cloud is dormant (UI removed since v1.17.0) and this path
    // is only reached if a cloud op is actually invoked.
    const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js')
    client = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        storage: fileStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      // Electron 28 ships Node 18, which has no global WebSocket. supabase-js
      // builds a Realtime client even when unused; give it `ws` so it doesn't
      // throw. (We only use auth + REST, but the client still constructs it.)
      realtime: { transport: WebSocket as any }
    })
  }
  return client
}

export interface CloudStatus {
  configured: boolean
  signedIn: boolean
  email?: string
  userId?: string
}

export async function cloudStatus(): Promise<CloudStatus> {
  if (!isCloudConfigured()) return { configured: false, signedIn: false }
  try {
    const { data } = await getClient().auth.getSession()
    const s = data.session
    return { configured: true, signedIn: !!s, email: s?.user?.email ?? undefined, userId: s?.user?.id }
  } catch {
    return { configured: true, signedIn: false }
  }
}

// ─── Simple model: account login = access ────────────────────────────────────
// One password. Log in → sync works, no extra steps. Forgot it? Standard email
// reset. Secrets are encrypted at rest with a per-user random key (DEK) stored in
// the user's profile (RLS-protected) and loaded automatically after login.
// NOTE: this is NOT zero-knowledge — the server can decrypt. A deliberate
// trade-off for practicality (see project notes).

let dek: Buffer | null = null // per-user data-encryption key (loaded after login)

async function sessionUserId(): Promise<string> {
  const { data } = await getClient().auth.getSession()
  if (!data.session) throw new Error('Não autenticado.')
  return data.session.user.id
}

export type SignUpResult = { email?: string; needsConfirmation: boolean }

export async function cloudSignUp(email: string, password: string): Promise<SignUpResult> {
  if (password.length < 6) throw new Error('Senha muito curta (mínimo 6 caracteres).')
  const { data, error } = await getClient().auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  return { email: data.user?.email ?? email, needsConfirmation: !data.session }
}

export async function cloudSignIn(email: string, password: string): Promise<{ email?: string }> {
  const { data, error } = await getClient().auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  dek = null // reloaded on the next sync
  return { email: data.user?.email ?? email }
}

export async function cloudSignOut(): Promise<void> {
  dek = null
  if (!isCloudConfigured()) return
  await getClient().auth.signOut()
}

// Sends the recovery email containing a one-time code (OTP). The user types that
// code + a new password into the app (verifyRecovery) — no link/deep-link needed.
export async function resetPassword(email: string): Promise<void> {
  const { error } = await getClient().auth.resetPasswordForEmail(email)
  if (error) throw new Error(error.message)
}

// Verify the emailed recovery code and set the new password.
export async function verifyRecovery(email: string, token: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new Error('Senha muito curta (mínimo 6 caracteres).')
  const sb = getClient()
  const v = await sb.auth.verifyOtp({ email, token: token.trim(), type: 'recovery' })
  if (v.error) throw new Error('Código inválido ou expirado.')
  const upd = await sb.auth.updateUser({ password: newPassword })
  if (upd.error) throw new Error(upd.error.message)
  dek = null // reloaded on next sync (same per-user DEK in the profile)
}

// Complete a password recovery: establish the session from the recovery tokens
// (delivered via the deep link) and set the new password.
export async function applyRecovery(accessToken: string, refreshToken: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new Error('Senha muito curta (mínimo 6 caracteres).')
  const sb = getClient()
  const setRes = await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  if (setRes.error) throw new Error('Link de recuperação inválido ou expirado.')
  const upd = await sb.auth.updateUser({ password: newPassword })
  if (upd.error) throw new Error(upd.error.message)
  dek = null // reloaded on next sync (same per-user DEK in the profile)
}

// Load (or lazily create) this user's data-encryption key from their profile.
// On first creation, any rows from a previous encryption scheme are wiped so the
// next push re-encrypts cleanly. Called by the sync engine before any seal/open.
export async function ensureDek(): Promise<Buffer> {
  if (dek) return dek
  const id = await sessionUserId()
  const { data, error } = await getClient().from('profiles').select('kdf_verifier').eq('id', id).single()
  if (error) throw new Error(error.message)
  let stored: any = null
  try { stored = data?.kdf_verifier ? JSON.parse(data.kdf_verifier) : null } catch { stored = null }
  if (stored?.dek) {
    dek = Buffer.from(stored.dek, 'base64')
    return dek
  }
  const fresh = randomDEK()
  const up = await getClient().from('profiles')
    .update({ kdf_verifier: JSON.stringify({ dek: fresh.toString('base64') }) }).eq('id', id)
  if (up.error) throw new Error(up.error.message)
  await wipeCloudData(id) // clear rows from any previous scheme
  dek = fresh
  return dek
}

// Used by the sync engine to seal/open secrets. ensureDek() runs first in syncNow.
export function getMasterKey(): Buffer {
  if (!dek) throw new Error('Chave de criptografia não carregada.')
  return dek
}

async function wipeCloudData(userId: string): Promise<void> {
  const sb = getClient()
  for (const table of ['hosts', 'credentials', 'ssh_keys', 'host_groups']) {
    await sb.from(table).delete().eq('user_id', userId)
  }
}
