import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface RDPConfig {
  host: string
  port: number
  username: string
  password?: string
  domain?: string
  width?: number
  height?: number
  fullscreen?: boolean
}

// Strip control characters (incl. CR/LF). A newline in host/username/domain would
// otherwise inject extra directives into the generated .rdp file or extra tokens
// into the cmdkey/xfreerdp argument list. charCode-based to keep the source ASCII.
function stripCtrl(s?: string): string | undefined {
  if (s == null) return undefined
  let out = ''
  for (const ch of s) { const c = ch.charCodeAt(0); if (c >= 0x20 && c !== 0x7f) out += ch }
  return out
}

function sanitizeRDP(cfg: RDPConfig): RDPConfig {
  return {
    ...cfg,
    host: stripCtrl(cfg.host) ?? '',
    username: stripCtrl(cfg.username) ?? '',
    domain: stripCtrl(cfg.domain)
  }
}

function buildRDPFile(cfg: RDPConfig): string {
  const width = cfg.width ?? 1280
  const height = cfg.height ?? 800
  const lines = [
    `full address:s:${cfg.host}:${cfg.port}`,
    `username:s:${cfg.domain ? `${cfg.domain}\\${cfg.username}` : cfg.username}`,
    `screen mode id:i:${cfg.fullscreen ? 2 : 1}`,
    `desktopwidth:i:${width}`,
    `desktopheight:i:${height}`,
    `session bpp:i:32`,
    `compression:i:1`,
    `keyboardhook:i:2`,
    `audiocapturemode:i:0`,
    `videoplaybackmode:i:1`,
    `connection type:i:7`,
    `networkautodetect:i:1`,
    `bandwidthautodetect:i:1`,
    `displayconnectionbar:i:1`,
    `enableworkspacereconnect:i:0`,
    `disable wallpaper:i:0`,
    `allow font smoothing:i:1`,
    `allow desktop composition:i:1`,
    `redirectprinters:i:0`,
    `redirectcomports:i:0`,
    `redirectsmartcards:i:0`,
    `redirectclipboard:i:1`,
    `redirectposdevices:i:0`,
    `autoreconnection enabled:i:1`,
    `authentication level:i:0`,
    `prompt for credentials:i:0`,
    `negotiate security layer:i:1`,
    `enablecredsspsupport:i:1`,
    `remoteapplicationmode:i:0`,
    `alternate shell:s:`,
    `shell working directory:s:`,
    `gatewayhostname:s:`,
    `gatewayusagemethod:i:4`,
    `gatewaycredentialssource:i:4`,
    `gatewayprofileusagemethod:i:0`,
    `promptcredentialonce:i:0`,
    `gatewaybrokeringtype:i:0`,
    `use redirection server name:i:0`,
    `rdgiskdcproxy:i:0`,
    `kdcproxyname:s:`
  ]
  return lines.join('\r\n')
}

export async function launchRDP(cfg: RDPConfig): Promise<{ ok: boolean; message: string }> {
  cfg = sanitizeRDP(cfg)
  const platform = process.platform

  if (platform === 'win32') {
    return launchWindows(cfg)
  } else if (platform === 'darwin') {
    return launchMac(cfg)
  } else {
    return launchLinux(cfg)
  }
}

function launchWindows(cfg: RDPConfig): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const rdpContent = buildRDPFile(cfg)
    const tmpFile = path.join(os.tmpdir(), `corpssh-rdp-${Date.now()}.rdp`)
    fs.writeFileSync(tmpFile, rdpContent, 'utf-8')

    // Pre-register credentials in Windows Credential Manager so mstsc
    // doesn't show a password prompt. Cleaned up 60s after launch.
    const credTarget = `TERMSRV/${cfg.host}`
    const userFull = cfg.domain ? `${cfg.domain}\\${cfg.username}` : cfg.username
    if (cfg.password) {
      const credProc = spawn('cmdkey', [
        `/generic:${credTarget}`,
        `/user:${userFull}`,
        `/pass:${cfg.password}`
      ], { stdio: 'ignore' })
      credProc.unref()
      setTimeout(() => {
        const del = spawn('cmdkey', [`/delete:${credTarget}`], { stdio: 'ignore' })
        del.unref()
      }, 60000)
    }

    const proc = spawn('mstsc', [tmpFile], { detached: true, stdio: 'ignore' })
    proc.unref()

    // Cleanup temp file after 5s
    setTimeout(() => { try { fs.unlinkSync(tmpFile) } catch {} }, 5000)

    proc.on('error', (err) => resolve({ ok: false, message: err.message }))
    setTimeout(() => resolve({ ok: true, message: 'mstsc iniciado' }), 1000)
  })
}

function launchMac(cfg: RDPConfig): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const url = `rdp://${encodeURIComponent(cfg.username)}@${cfg.host}:${cfg.port}`
    const proc = spawn('open', [url], { detached: true, stdio: 'ignore' })
    proc.unref()
    proc.on('error', (err) => resolve({ ok: false, message: err.message }))
    setTimeout(() => resolve({ ok: true, message: 'Abrindo Microsoft Remote Desktop...' }), 500)
  })
}

function launchLinux(cfg: RDPConfig): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    // Try clients in order: remmina, xfreerdp, xdg-open
    const clients = [
      ['remmina', ['-c', `rdp://${cfg.username}@${cfg.host}:${cfg.port}`]],
      ['xfreerdp', [
        `/v:${cfg.host}:${cfg.port}`,
        `/u:${cfg.username}`,
        cfg.password ? `/p:${cfg.password}` : '/p:',
        '/dynamic-resolution', '/cert-ignore'
      ]],
      ['xdg-open', [`rdp://${cfg.username}@${cfg.host}:${cfg.port}`]]
    ] as [string, string[]][]

    let tried = 0
    const tryNext = () => {
      if (tried >= clients.length) {
        resolve({ ok: false, message: 'Nenhum cliente RDP encontrado (instale remmina ou xfreerdp)' })
        return
      }
      const [cmd, args] = clients[tried++]
      const proc = spawn(cmd, args, { detached: true, stdio: 'ignore' })
      proc.unref()
      proc.on('error', tryNext)
      proc.on('spawn', () => resolve({ ok: true, message: `${cmd} iniciado` }))
    }
    tryNext()
  })
}
