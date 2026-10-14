// ─── Bridge to CorpSSH RS (Windows) ──────────────────────────────────────────
// CorpSSH continues as CorpSSH RS: the NBN Telecom fork of this app with the
// backend rewritten in Rust (Tauri 2), Windows only, published with its own
// signed auto-update at NBN-PATRIC/corpssh-rs-releases. This is the last
// Electron release on Windows: on start it offers to install CorpSSH RS, or to
// open it when it is already installed.
//
// The CorpSSH RS installer removes this app (its data is kept: the uninstaller
// only deletes app data with --delete-app-data) and CorpSSH RS imports
// ~/.corpssh on its first run: hosts, credentials (the enc:v1 secrets are
// opened with this app's safeStorage key), keys, snippets, known hosts and
// command history. Nothing in ~/.corpssh is modified.

import { app, dialog, net, shell, BrowserWindow } from 'electron'
import { createPublicKey, verify } from 'crypto'
import { execFile, spawn } from 'child_process'
import { existsSync, promises as fsp } from 'fs'
import { basename, join } from 'path'
import { tmpdir } from 'os'

const FEED = 'https://github.com/NBN-PATRIC/corpssh-rs-releases/releases/latest/download/latest.json'
const RELEASES = 'https://github.com/NBN-PATRIC/corpssh-rs-releases/releases/latest'
const DOWNLOAD_PREFIX = 'https://github.com/NBN-PATRIC/corpssh-rs-releases/releases/download/'
// minisign public key of the CorpSSH RS releases (its tauri.conf.json updater pubkey).
const PUBKEY = 'RWROhtceVUN7tvS2TruV7usi15Gz0b0wYuYkZBjKqDk+uzWOWwBtYNZ6'
const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CorpSSH RS'

export function offerCorpSshRs(win: BrowserWindow): void {
  if (process.platform !== 'win32' || !app.isPackaged) return
  run(win).catch(() => { /* never block the app over the offer */ })
}

async function run(win: BrowserWindow): Promise<void> {
  const installed = await findCorpSshRs()
  if (installed) {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'CorpSSH RS',
      message: 'O CorpSSH RS já está instalado',
      detail:
        'Esta é a última versão do CorpSSH. Ele continua como CorpSSH RS, que já está neste computador e se atualiza sozinho.\n\n' +
        'O que for criado aqui a partir de agora não passa para o CorpSSH RS.',
      buttons: ['Abrir o CorpSSH RS', 'Continuar no CorpSSH'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    })
    if (response === 0) {
      spawn(installed, [], { detached: true, stdio: 'ignore' }).unref()
      app.quit()
    }
    return
  }

  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'CorpSSH RS',
    message: 'O CorpSSH agora é o CorpSSH RS',
    detail:
      'Esta é a última versão do CorpSSH. Ele continua como CorpSSH RS, mantido pela NBN Telecom, mais leve e com atualização própria.\n\n' +
      'Ao instalar, o CorpSSH fecha e é removido, e o CorpSSH RS abre sozinho com os seus hosts, credenciais, chaves e snippets. Nenhum dado é apagado.',
    buttons: ['Instalar o CorpSSH RS', 'Agora não'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })
  if (response !== 0) return

  try {
    const setup = await downloadInstaller(win)
    // Through `cmd /c start` so the installer is not a child of this process:
    // the CorpSSH uninstaller it runs does `taskkill /F /IM CorpSSH.exe /T`,
    // which would take the whole process tree down with it. /P = passive
    // (progress only), /R = open CorpSSH RS when done.
    spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'start', '""', `"${setup}"`, '/P', '/R'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: true
    }).unref()
    app.quit()
  } catch (err) {
    win.setProgressBar(-1)
    win.webContents.send('update:error', String(err))
    const { response: r } = await dialog.showMessageBox(win, {
      type: 'error',
      title: 'CorpSSH RS',
      message: 'Não foi possível instalar o CorpSSH RS',
      detail: `${err instanceof Error ? err.message : String(err)}\n\nO instalador também pode ser baixado na página de versões.`,
      buttons: ['Abrir a página', 'Fechar'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    })
    if (r === 0) shell.openExternal(RELEASES)
  }
}

/** Path of the installed corpssh-rs.exe, or null. */
function findCorpSshRs(): Promise<string | null> {
  const fallback = join(process.env.LOCALAPPDATA ?? '', 'CorpSSH RS', 'corpssh-rs.exe')
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', UNINSTALL_KEY, '/v', 'InstallLocation'], { windowsHide: true }, (err, stdout) => {
      const m = !err && /InstallLocation\s+REG_\w+\s+(.+)/.exec(stdout)
      const dir = m ? m[1].trim().replace(/^"|"$/g, '') : ''
      const exe = dir ? join(dir, 'corpssh-rs.exe') : fallback
      resolve(existsSync(exe) ? exe : existsSync(fallback) ? fallback : null)
    })
  })
}

/** Downloads the latest CorpSSH RS installer, checks its signature, returns its path. */
async function downloadInstaller(win: BrowserWindow): Promise<string> {
  const feed = JSON.parse((await fetchBytes(FEED)).toString('utf8'))
  const target = feed?.platforms?.['windows-x86_64']
  const url: string = target?.url ?? ''
  if (!url.startsWith(DOWNLOAD_PREFIX) || typeof target?.signature !== 'string') {
    throw new Error('Resposta inesperada do servidor de versões do CorpSSH RS.')
  }
  win.webContents.send('update:available', { version: `CorpSSH RS ${feed.version}` })
  const started = Date.now()
  const bytes = await fetchBytes(url, (got, total) => {
    const percent = total ? Math.round((got / total) * 100) : 0
    win.setProgressBar(total ? got / total : 2)
    win.webContents.send('update:progress', {
      percent,
      transferred: got,
      total,
      bytesPerSecond: Math.round(got / Math.max(0.001, (Date.now() - started) / 1000))
    })
  })
  win.setProgressBar(-1)
  if (!verifyMinisign(bytes, target.signature)) {
    throw new Error('A assinatura do instalador baixado não confere. Nada foi instalado.')
  }
  const dir = await fsp.mkdtemp(join(tmpdir(), 'corpssh-rs-'))
  const file = join(dir, basename(new URL(url).pathname))
  await fsp.writeFile(file, bytes)
  return file
}

/** GET through Chromium's network stack (system proxy and certificates). */
async function fetchBytes(url: string, onProgress?: (got: number, total: number) => void): Promise<Buffer> {
  const res = await net.fetch(url)
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ao baixar ${url}`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks: Buffer[] = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
    got += value.length
    onProgress?.(got, total)
  }
  return Buffer.concat(chunks)
}

// ─── minisign (prehashed, as signed by `tauri signer`) ──────────────────────
// The signature field of latest.json is the base64 of the .sig file:
//   untrusted comment / base64("ED" + key id + Ed25519(BLAKE2b-512(file)))
//   trusted comment: ... / base64(Ed25519(signature + trusted comment))

export function verifyMinisign(file: Uint8Array, signatureB64: string): boolean {
  const lines = Buffer.from(signatureB64, 'base64').toString('utf8').split(/\r?\n/)
  const sig = Buffer.from(lines[1] ?? '', 'base64')
  const trusted = lines[2]?.startsWith('trusted comment: ') ? lines[2].slice('trusted comment: '.length) : null
  const global = Buffer.from(lines[3] ?? '', 'base64')
  const pk = Buffer.from(PUBKEY, 'base64')
  if (sig.length !== 74 || pk.length !== 42 || global.length !== 64 || trusted === null) return false
  if (sig.subarray(0, 2).toString('latin1') !== 'ED' || !sig.subarray(2, 10).equals(pk.subarray(2, 10))) return false
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pk.subarray(10)]),
    format: 'der',
    type: 'spki'
  })
  const signature = sig.subarray(10)
  return (
    verify(null, blake2b512(file), key, signature) &&
    verify(null, Buffer.concat([signature, Buffer.from(trusted, 'utf8')]), key, global)
  )
}

// ─── BLAKE2b-512 (RFC 7693, unkeyed) ─────────────────────────────────────────
// Electron's BoringSSL has no blake2b512. 64-bit words are (lo, hi) uint32 pairs.

const IV = new Uint32Array([
  0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85, 0xfe94f82b, 0x3c6ef372, 0x5f1d36f1, 0xa54ff53a,
  0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c, 0xfb41bd6b, 0x1f83d9ab, 0x137e2179, 0x5be0cd19
])

const SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0]
]

function add(v: Uint32Array, a: number, lo: number, hi: number): void {
  const l = v[a] + lo
  v[a] = l
  v[a + 1] = v[a + 1] + hi + (l >= 0x100000000 ? 1 : 0)
}

function mix(v: Uint32Array, m: Uint32Array, a: number, b: number, c: number, d: number, x: number, y: number): void {
  add(v, a, v[b], v[b + 1])
  add(v, a, m[x], m[x + 1])
  let lo = v[d] ^ v[a]
  let hi = v[d + 1] ^ v[a + 1]
  v[d] = hi // rotr 32
  v[d + 1] = lo
  add(v, c, v[d], v[d + 1])
  lo = v[b] ^ v[c]
  hi = v[b + 1] ^ v[c + 1]
  v[b] = (lo >>> 24) ^ (hi << 8) // rotr 24
  v[b + 1] = (hi >>> 24) ^ (lo << 8)
  add(v, a, v[b], v[b + 1])
  add(v, a, m[y], m[y + 1])
  lo = v[d] ^ v[a]
  hi = v[d + 1] ^ v[a + 1]
  v[d] = (lo >>> 16) ^ (hi << 16) // rotr 16
  v[d + 1] = (hi >>> 16) ^ (lo << 16)
  add(v, c, v[d], v[d + 1])
  lo = v[b] ^ v[c]
  hi = v[b + 1] ^ v[c + 1]
  v[b] = (hi >>> 31) ^ (lo << 1) // rotr 63
  v[b + 1] = (lo >>> 31) ^ (hi << 1)
}

function compress(h: Uint32Array, v: Uint32Array, m: Uint32Array, block: Uint8Array, off: number, t: number, last: boolean): void {
  for (let i = 0; i < 32; i++) {
    const o = off + i * 4
    m[i] = block[o] | (block[o + 1] << 8) | (block[o + 2] << 16) | (block[o + 3] << 24)
  }
  v.set(h, 0)
  v.set(IV, 16)
  v[24] ^= t % 0x100000000
  v[25] ^= Math.floor(t / 0x100000000)
  if (last) {
    v[28] = ~v[28]
    v[29] = ~v[29]
  }
  for (let r = 0; r < 12; r++) {
    const s = SIGMA[r % 10]
    mix(v, m, 0, 8, 16, 24, s[0] * 2, s[1] * 2)
    mix(v, m, 2, 10, 18, 26, s[2] * 2, s[3] * 2)
    mix(v, m, 4, 12, 20, 28, s[4] * 2, s[5] * 2)
    mix(v, m, 6, 14, 22, 30, s[6] * 2, s[7] * 2)
    mix(v, m, 0, 10, 20, 30, s[8] * 2, s[9] * 2)
    mix(v, m, 2, 12, 22, 24, s[10] * 2, s[11] * 2)
    mix(v, m, 4, 14, 16, 26, s[12] * 2, s[13] * 2)
    mix(v, m, 6, 8, 18, 28, s[14] * 2, s[15] * 2)
  }
  for (let i = 0; i < 16; i++) h[i] ^= v[i] ^ v[i + 16]
}

export function blake2b512(data: Uint8Array): Buffer {
  const h = new Uint32Array(IV)
  h[0] ^= 0x01010040 // digest 64 bytes, no key, fanout 1, depth 1
  const v = new Uint32Array(32)
  const m = new Uint32Array(32)
  let off = 0
  let t = 0
  while (data.length - off > 128) {
    t += 128
    compress(h, v, m, data, off, t, false)
    off += 128
  }
  const tail = new Uint8Array(128)
  tail.set(data.subarray(off))
  t += data.length - off
  compress(h, v, m, tail, 0, t, true)
  const out = Buffer.alloc(64)
  for (let i = 0; i < 16; i++) out.writeUInt32LE(h[i], i * 4)
  return out
}
