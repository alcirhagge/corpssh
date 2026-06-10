import { scryptSync, randomBytes, createCipheriv, createDecipheriv, createHmac, createHash, hkdfSync } from 'crypto'

// ─── Portable, password-based encryption (scrypt KDF + AES-256-GCM) ──────────
// Unlike the safeStorage path in store.ts (which is bound to the OS keystore and
// only decrypts on the same machine/account), this module is portable: anything
// sealed here can be opened on ANY device given the password. Used for the
// encrypted XML export/import and, later, for sealing secrets synced to the cloud.

const KEYLEN = 32 // AES-256
// scrypt cost: N=16384,r=8,p=1 → ~16 MB working memory; raise maxmem headroom so
// it never trips the default 32 MB cap on slower/older runtimes.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export interface SealedBlob {
  salt: string // base64 (16 bytes)
  iv: string // base64 (12 bytes — GCM nonce)
  tag: string // base64 (16 bytes — GCM auth tag)
  data: string // base64 ciphertext
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEYLEN, SCRYPT_PARAMS)
}

// Encrypt a UTF-8 string with a password. A fresh random salt + IV is generated
// per call, so encrypting the same value twice yields different blobs.
export function sealWithPassword(plaintext: string, password: string): SealedBlob {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = deriveKey(password, salt)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64')
  }
}

// Decrypt a blob produced by sealWithPassword. Throws if the password is wrong
// (GCM auth-tag mismatch) or the blob is corrupt — callers should treat any throw
// as "wrong password / bad file".
export function openWithPassword(blob: SealedBlob, password: string): string {
  const salt = Buffer.from(blob.salt, 'base64')
  const iv = Buffer.from(blob.iv, 'base64')
  const tag = Buffer.from(blob.tag, 'base64')
  const key = deriveKey(password, salt)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()])
  return dec.toString('utf8')
}

// ─── Pre-derived key (cloud sync) ─────────────────────────────────────────────
// For syncing many records we derive the key ONCE (scrypt is intentionally slow)
// and reuse it to seal/open each secret. The KDF salt is stored server-side
// (profiles.kdf_salt) so the SAME master password yields the SAME key on every
// device — that is what makes cross-device decryption work.

export function newSaltB64(): string {
  return randomBytes(16).toString('base64')
}

export function deriveMasterKey(password: string, saltB64: string): Buffer {
  return deriveKey(password, Buffer.from(saltB64, 'base64'))
}

// Compact sealed value for a pre-derived key: { iv, data } where data is the
// ciphertext with the 16-byte GCM tag appended. No per-record salt (KDF already done).
export interface KeySealed {
  iv: string // base64 (12-byte nonce)
  data: string // base64 (ciphertext || tag)
}

export function sealWithKey(plaintext: string, key: Buffer): KeySealed {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return { iv: iv.toString('base64'), data: Buffer.concat([enc, tag]).toString('base64') }
}

// Throws on wrong key / corruption (GCM auth-tag mismatch).
export function openWithKey(sealed: KeySealed, key: Buffer): string {
  const iv = Buffer.from(sealed.iv, 'base64')
  const all = Buffer.from(sealed.data, 'base64')
  const tag = all.subarray(all.length - 16)
  const ct = all.subarray(0, all.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// ─── Single-password key hierarchy (Bitwarden-style split) ────────────────────
// One user password yields TWO independent values:
//   • authHash → sent to Supabase as the login password (server only sees this)
//   • pk       → wraps the data key locally and NEVER leaves the device
// A random Data Encryption Key (DEK) actually encrypts the secrets and is stored
// only in wrapped form (by pk, and by a recovery-code key) — so the server can
// never derive it, yet the user can recover via either password or recovery code.

// Deterministic salt from the email so authHash/pk are computable before any
// server round-trip (needed to log in on a fresh device).
function emailSalt(email: string): Buffer {
  return createHash('sha256').update('corpssh:' + email.trim().toLowerCase()).digest()
}

export function deriveBaseKey(password: string, email: string): Buffer {
  return scryptSync(password, emailSalt(email), KEYLEN, SCRYPT_PARAMS)
}

// One-way: server-stored bcrypt(authHash) cannot reveal baseKey or pk.
export function authHashFromBase(baseKey: Buffer): string {
  return createHmac('sha256', baseKey).update('corpssh-auth-v1').digest('base64')
}

// Encryption key (wraps the DEK). Distinct from authHash via HKDF context.
export function pkFromBase(baseKey: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', baseKey, Buffer.alloc(0), Buffer.from('corpssh-enc-v1'), KEYLEN))
}

export function randomDEK(): Buffer {
  return randomBytes(KEYLEN)
}

// Human-friendly recovery code: 24 unambiguous chars in 4 groups (e.g. AB7CD-...).
export function genRecoveryCode(): string {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
  const b = randomBytes(20)
  let s = ''
  for (let i = 0; i < 20; i++) s += alpha[b[i] % alpha.length]
  return s.match(/.{1,5}/g)!.join('-')
}

export function deriveRecoveryKey(code: string, saltB64: string): Buffer {
  const normalized = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return scryptSync(normalized, Buffer.from(saltB64, 'base64'), KEYLEN, SCRYPT_PARAMS)
}

// Wrap/unwrap the DEK (a 32-byte key) with another key, as base64 round-trips.
export function wrapKey(dek: Buffer, wrappingKey: Buffer): KeySealed {
  return sealWithKey(dek.toString('base64'), wrappingKey)
}
export function unwrapKey(sealed: KeySealed, wrappingKey: Buffer): Buffer {
  return Buffer.from(openWithKey(sealed, wrappingKey), 'base64')
}
