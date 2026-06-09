import { Client, ConnectConfig } from 'ssh2'
import { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface SSHConnectionConfig {
  id: string
  host: string
  port: number
  username: string
  authMethod: 'password' | 'privateKey' | 'agent'
  password?: string
  privateKeyPath?: string
  privateKeyContent?: string
  passphrase?: string
}

export interface SFTPEntry {
  name: string
  type: 'file' | 'directory' | 'symlink'
  size: number
  modifyTime: number
  permissions: number
  owner: number
  group: number
}

interface ActiveConnection {
  client: Client
  sessionId: string
  config: SSHConnectionConfig
}

const activeConnections = new Map<string, ActiveConnection>()

function getWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  return wins.length > 0 ? wins[0] : null
}

export function createSSHConnection(
  sessionId: string,
  config: SSHConnectionConfig,
  onNaturalClose?: () => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new Client()

    const connectConfig: ConnectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 15000,
      keepaliveInterval: 30000,
      tryKeyboard: true,
      algorithms: {
        kex: [
          'curve25519-sha256',
          'curve25519-sha256@libssh.org',
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group14-sha256',
          'diffie-hellman-group14-sha1',
          'diffie-hellman-group-exchange-sha1',
          'diffie-hellman-group1-sha1'
        ],
        serverHostKey: [
          'ecdsa-sha2-nistp256',
          'ecdsa-sha2-nistp384',
          'ecdsa-sha2-nistp521',
          'rsa-sha2-512',
          'rsa-sha2-256',
          'ssh-rsa',
          'ssh-dss'
        ],
        cipher: [
          'aes128-gcm',
          'aes128-gcm@openssh.com',
          'aes256-gcm',
          'aes256-gcm@openssh.com',
          'aes128-ctr',
          'aes192-ctr',
          'aes256-ctr',
          'aes256-cbc',
          'aes192-cbc',
          'aes128-cbc',
          '3des-cbc'
        ],
        hmac: [
          'hmac-sha2-256',
          'hmac-sha2-512',
          'hmac-sha1',
          'hmac-md5'
        ]
      }
    }

    if (config.authMethod === 'password' && config.password) {
      connectConfig.password = config.password
    } else if (config.authMethod === 'privateKey') {
      if (config.privateKeyContent) {
        connectConfig.privateKey = config.privateKeyContent
      } else if (config.privateKeyPath) {
        try {
          connectConfig.privateKey = fs.readFileSync(
            config.privateKeyPath.replace('~', os.homedir())
          )
        } catch {
          return reject(new Error(`Cannot read private key: ${config.privateKeyPath}`))
        }
      }
      if (config.passphrase) connectConfig.passphrase = config.passphrase
    } else if (config.authMethod === 'agent') {
      connectConfig.agent = process.env.SSH_AUTH_SOCK || undefined
    }

    client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
      finish(prompts.map(() => config.password ?? ''))
    })

    client.on('ready', () => {
      activeConnections.set(sessionId, { client, sessionId, config })
      resolve()
    })

    client.on('error', (err) => {
      activeConnections.delete(sessionId)
      reject(err)
    })

    client.on('close', () => {
      activeConnections.delete(sessionId)
      const win = getWindow()
      win?.webContents.send(`ssh:closed:${sessionId}`)
      onNaturalClose?.()
    })

    client.connect(connectConfig)
  })
}

export function createShellSession(sessionId: string, cols: number, rows: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = activeConnections.get(sessionId)
    if (!conn) return reject(new Error('Connection not found'))

    conn.client.shell(
      { term: 'xterm-256color', cols, rows },
      (err, stream) => {
        if (err) return reject(err)

        const win = getWindow()

        stream.on('data', (data: Buffer) => {
          win?.webContents.send(`ssh:data:${sessionId}`, data.toString())
        })

        stream.stderr.on('data', (data: Buffer) => {
          win?.webContents.send(`ssh:data:${sessionId}`, data.toString())
        })

        stream.on('close', () => {
          win?.webContents.send(`ssh:closed:${sessionId}`)
          activeConnections.delete(sessionId)
        })

        ;(conn as any).stream = stream
        resolve()
      }
    )
  })
}

export function sendInput(sessionId: string, data: string): void {
  const conn = activeConnections.get(sessionId) as any
  if (conn?.stream) conn.stream.write(data)
}

export function resizeTerminal(sessionId: string, cols: number, rows: number): void {
  const conn = activeConnections.get(sessionId) as any
  if (conn?.stream) conn.stream.setWindow(rows, cols, 0, 0)
}

export function disconnectSSH(sessionId: string): void {
  const conn = activeConnections.get(sessionId)
  if (conn) {
    const s = conn as any
    if (s.stream) s.stream.end()
    conn.client.end()
    activeConnections.delete(sessionId)
  }
}

export function listSFTPDirectory(sessionId: string, remotePath: string): Promise<SFTPEntry[]> {
  return new Promise((resolve, reject) => {
    const conn = activeConnections.get(sessionId)
    if (!conn) return reject(new Error('Connection not found'))

    conn.client.sftp((err, sftp) => {
      if (err) return reject(err)

      sftp.readdir(remotePath, (err2, list) => {
        if (err2) return reject(err2)

        const entries: SFTPEntry[] = list.map((item) => ({
          name: item.filename,
          type: item.attrs.isDirectory()
            ? 'directory'
            : item.attrs.isSymbolicLink()
              ? 'symlink'
              : 'file',
          size: item.attrs.size ?? 0,
          modifyTime: item.attrs.mtime ?? 0,
          permissions: item.attrs.mode ?? 0,
          owner: item.attrs.uid ?? 0,
          group: item.attrs.gid ?? 0
        }))

        entries.sort((a, b) => {
          if (a.type === 'directory' && b.type !== 'directory') return -1
          if (a.type !== 'directory' && b.type === 'directory') return 1
          return a.name.localeCompare(b.name)
        })

        sftp.end()
        resolve(entries)
      })
    })
  })
}

export function downloadFile(
  sessionId: string,
  remotePath: string,
  localPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = activeConnections.get(sessionId)
    if (!conn) return reject(new Error('Connection not found'))

    conn.client.sftp((err, sftp) => {
      if (err) return reject(err)
      sftp.fastGet(remotePath, localPath, (err2) => {
        sftp.end()
        if (err2) reject(err2)
        else resolve()
      })
    })
  })
}

export function uploadFile(
  sessionId: string,
  localPath: string,
  remotePath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = activeConnections.get(sessionId)
    if (!conn) return reject(new Error('Connection not found'))

    conn.client.sftp((err, sftp) => {
      if (err) return reject(err)
      sftp.fastPut(localPath, remotePath, (err2) => {
        sftp.end()
        if (err2) reject(err2)
        else resolve()
      })
    })
  })
}

export function deleteSFTPItem(sessionId: string, remotePath: string, isDir: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = activeConnections.get(sessionId)
    if (!conn) return reject(new Error('Connection not found'))

    conn.client.sftp((err, sftp) => {
      if (err) return reject(err)
      const op = isDir
        ? (p: string, cb: (e: Error | undefined) => void) => sftp.rmdir(p, cb)
        : (p: string, cb: (e: Error | undefined) => void) => sftp.unlink(p, cb)

      op(remotePath, (err2) => {
        sftp.end()
        if (err2) reject(err2)
        else resolve()
      })
    })
  })
}

export function getActiveConnectionIds(): string[] {
  return Array.from(activeConnections.keys())
}

// ─── OS / Device Detection ────────────────────────────────────────────────────

// Phase-1: standard Linux/Unix probe with CPU and uname info
const OS_DETECT_CMD = [
  'cat /etc/os-release 2>/dev/null',
  'echo "###DEB###"',
  'cat /etc/debian_version 2>/dev/null',
  'echo "###RH###"',
  'cat /etc/redhat-release 2>/dev/null',
  'echo "###ALP###"',
  'cat /etc/alpine-release 2>/dev/null',
  'echo "###LSB###"',
  'cat /etc/lsb-release 2>/dev/null',
  'echo "###CPU###"',
  'cat /proc/cpuinfo 2>/dev/null | grep -m4 -iE "Hardware|Model|Raspberry|ESP32|Xtensa"',
  'echo "###UNAME###"',
  'uname -a 2>/dev/null',
].join('; ')

// Helper: exec a single command on an already-open client, capturing stdout + stderr
function execCapture(client: Client, cmd: string, ms = 5000): Promise<{ out: string; err: string }> {
  return new Promise((resolve) => {
    const tid = setTimeout(() => resolve({ out: '', err: '' }), ms)
    client.exec(cmd, (error, stream) => {
      if (error) { clearTimeout(tid); resolve({ out: '', err: error.message }); return }
      let out = '', err = ''
      stream.on('data', (d: Buffer) => { out += d.toString() })
      stream.stderr.on('data', (d: Buffer) => { err += d.toString() })
      stream.on('close', () => { clearTimeout(tid); resolve({ out, err }) })
    })
  })
}

// Full 2-phase detection using any already-authenticated Client
async function detectOsWithClient(client: Client): Promise<string> {
  // ── Phase 1: Linux probe ──────────────────────────────────────────────────
  const { out, err } = await execCapture(client, OS_DETECT_CMD, 8000)

  // Instant network-device ID via stderr signatures (no second probe needed)
  const se = err.toLowerCase()
  if (se.includes('bad command name'))                               return 'mikrotik'  // RouterOS CLI
  if (se.includes('unrecognized command') && se.includes('^'))      return 'huawei'    // Huawei VRP
  if (se.includes('% invalid input') || se.includes('% unknown'))   return 'cisco'     // Cisco IOS
  if (se.includes('syntax error') && se.includes('line'))           return 'mikrotik'  // older RouterOS

  const p1 = parseOsId(out)

  // If ALL Phase 1 sections are empty the device doesn't have standard Linux files:
  // it's some kind of network device / appliance → always run Phase 2
  const isNetworkAppliance = out.trim().length < 20

  if (!isNetworkAppliance && p1 !== 'linux') return p1

  // ── Phase 2: parallel network-device probes ───────────────────────────────
  const [ros, vrp, ver, sys, inv] = await Promise.all([
    execCapture(client, '/system resource print', 4000),  // Mikrotik RouterOS
    execCapture(client, 'display version', 4000),          // Huawei VRP
    execCapture(client, 'show version', 4000),             // Cisco / Furukawa / generic
    execCapture(client, 'show system', 4000),              // Furukawa OLT / Nokia / generic
    execCapture(client, 'show inventory', 4000),           // Furukawa / Cisco fallback
  ])

  const r = (ros.out + ros.err).toLowerCase()
  const h = (vrp.out + vrp.err).toLowerCase()
  const c = (ver.out + ver.err).toLowerCase()
  const s = (sys.out + sys.err).toLowerCase()
  const v = (inv.out + inv.err).toLowerCase()
  const all = [r, h, c, s, v].join('\n')

  if (r.includes('mikrotik') || r.includes('routeros'))              return 'mikrotik'
  if ((h.includes('huawei') || h.includes('vrp'))
      && !h.includes('imagemagick'))                                 return 'huawei'
  if (c.includes('cisco ios') || c.includes('cisco adaptive')
      || c.includes('cisco nexus') || c.includes('cisco nx-os'))     return 'cisco'
  if (c.includes('junos') || c.includes('juniper networks'))         return 'juniper'
  if (c.includes('fortios') || c.includes('fortigate'))              return 'fortinet'
  if (c.includes('pfsense') || c.includes('opnsense'))               return 'pfsense'
  if (all.includes('furukawa') || all.includes('fiberlink')
      || all.includes('fiberhome') || all.includes('flos'))          return 'olt'
  if (all.includes('zte') || all.includes('c300') || all.includes('c600')
      || all.includes('zxan'))                                       return 'olt'
  if (all.includes('bdcom') || all.includes('dasan') || all.includes('zhone')
      || all.includes('calix') || all.includes('parks'))             return 'olt'
  if (h.includes('huawei') || r.includes('huawei'))                  return 'huawei'

  // Phase 1 was empty and Phase 2 gave no specific brand → generic network appliance
  if (isNetworkAppliance)                                            return 'olt'

  return 'linux'
}

function parseOsId(output: string): string {
  const ID_MAP: Record<string, string> = {
    // Ubuntu family
    ubuntu: 'ubuntu', linuxmint: 'ubuntu', neon: 'ubuntu',
    'pop-os': 'ubuntu', pop: 'ubuntu', elementary: 'ubuntu', zorin: 'ubuntu',
    // Raspberry Pi (before generic debian so it gets specific icon)
    raspios: 'raspberrypi', raspbian: 'raspberrypi',
    // Debian family
    debian: 'debian', kali: 'debian', 'debian-gnu/linux': 'debian',
    // RHEL/CentOS family
    centos: 'centos', 'centos-stream': 'centos',
    fedora: 'fedora',
    rhel: 'rhel', ol: 'rhel', oracle: 'rhel', rocky: 'rhel',
    almalinux: 'rhel', redhat: 'rhel',
    // Arch family
    arch: 'arch', manjaro: 'arch', endeavouros: 'arch', arcolinux: 'arch',
    // Alpine
    alpine: 'alpine',
    // SUSE family
    opensuse: 'suse', 'opensuse-leap': 'suse', 'opensuse-tumbleweed': 'suse',
    sles: 'suse', suse: 'suse',
    // BSD
    freebsd: 'freebsd', openbsd: 'freebsd', netbsd: 'freebsd',
  }

  // Layer 1: ID= from /etc/os-release
  const idMatch = output.match(/^ID=["']?([a-zA-Z0-9._/-]+)["']?/m)
  if (idMatch) {
    const id = idMatch[1].toLowerCase().trim()
    if (ID_MAP[id]) return ID_MAP[id]
  }

  // Layer 2: NAME= / PRETTY_NAME= keyword scan
  const nameMatch = output.match(/^(?:PRETTY_)?NAME=["']?([^"'\n\r]+)/mi)
  if (nameMatch) {
    const n = nameMatch[1].toLowerCase()
    const KW: Array<[string, string]> = [
      ['raspberry pi', 'raspberrypi'], ['raspbian', 'raspberrypi'],
      ['ubuntu', 'ubuntu'], ['debian', 'debian'], ['centos', 'centos'],
      ['fedora', 'fedora'], ['red hat', 'rhel'], ['rocky', 'rhel'],
      ['alma', 'rhel'], ['oracle linux', 'rhel'], ['arch linux', 'arch'],
      ['alpine', 'alpine'], ['opensuse', 'suse'], ['suse linux', 'suse'],
      ['kali', 'debian'], ['mint', 'ubuntu'], ['manjaro', 'arch'],
      ['freebsd', 'freebsd'], ['openbsd', 'freebsd'], ['netbsd', 'freebsd'],
    ]
    for (const [kw, val] of KW) { if (n.includes(kw)) return val }
  }

  // Layer 3: DISTRIB_ID from /etc/lsb-release
  const lsbMatch = output.match(/^DISTRIB_ID=["']?([a-zA-Z]+)["']?/mi)
  if (lsbMatch) {
    const d = lsbMatch[1].toLowerCase()
    if (ID_MAP[d]) return ID_MAP[d]
    if (d.includes('ubuntu')) return 'ubuntu'
    if (d.includes('debian')) return 'debian'
    if (d.includes('raspberry')) return 'raspberrypi'
  }

  // Layer 4: /etc/debian_version → Debian family
  const debSection = output.split('###DEB###')[1]?.split('###RH###')[0]?.trim()
  if (debSection && debSection.length > 0) return 'debian'

  // Layer 5: /etc/redhat-release → RHEL/CentOS/Fedora
  const rhSection = output.split('###RH###')[1]?.split('###ALP###')[0]?.trim()
  if (rhSection) {
    const r = rhSection.toLowerCase()
    if (r.includes('centos stream') || r.includes('centos')) return 'centos'
    if (r.includes('fedora')) return 'fedora'
    if (r.includes('red hat') || r.includes('rhel')) return 'rhel'
    if (r.includes('rocky') || r.includes('alma') || r.includes('oracle')) return 'rhel'
    return 'rhel'
  }

  // Layer 6: /etc/alpine-release → Alpine
  const alpSection = output.split('###ALP###')[1]?.split('###LSB###')[0]?.trim()
  if (alpSection && /^\d/.test(alpSection)) return 'alpine'

  // Layer 7: /proc/cpuinfo → Raspberry Pi / ESP32
  const cpuSection = output.split('###CPU###')[1]?.split('###UNAME###')[0]?.toLowerCase() || ''
  if (cpuSection.includes('raspberry pi') || /bcm2[5-9]\d\d|bcm271\d/.test(cpuSection)) return 'raspberrypi'
  if (cpuSection.includes('esp32') || cpuSection.includes('xtensa')) return 'espressif'

  // Layer 8: uname -a → BSD / architecture hints
  const unameSection = output.split('###UNAME###')[1]?.trim().toLowerCase() || ''
  if (unameSection.includes('freebsd') || unameSection.includes('openbsd') || unameSection.includes('netbsd')) return 'freebsd'
  if (unameSection.includes('xtensa')) return 'espressif'

  return 'linux'
}

// Public: detect using an existing open session
export function detectOsFromSession(sessionId: string): Promise<string> {
  const conn = activeConnections.get(sessionId)
  if (!conn) return Promise.resolve('unknown')
  return detectOsWithClient(conn.client).catch(() => 'unknown')
}

// Public: detect by opening a temporary SSH connection (used by HostForm)
export function detectRemoteOs(config: SSHConnectionConfig): Promise<string> {
  return new Promise((resolve) => {
    const client = new Client()
    let settled = false

    const done = (result: string) => {
      if (settled) return
      settled = true
      try { client.end() } catch {}
      resolve(result)
    }

    const masterTid = setTimeout(() => done('unknown'), 25000)

    const connectConfig: ConnectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 8000,
      tryKeyboard: true,
      algorithms: {
        kex: [
          'curve25519-sha256', 'curve25519-sha256@libssh.org',
          'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha256',
          'diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha1',
          'diffie-hellman-group1-sha1'
        ],
        serverHostKey: [
          'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521',
          'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ssh-dss'
        ],
        cipher: [
          'aes128-gcm', 'aes128-gcm@openssh.com', 'aes256-gcm', 'aes256-gcm@openssh.com',
          'aes128-ctr', 'aes192-ctr', 'aes256-ctr',
          'aes256-cbc', 'aes192-cbc', 'aes128-cbc', '3des-cbc'
        ],
        hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1', 'hmac-md5']
      }
    }

    if (config.authMethod === 'password' && config.password) {
      connectConfig.password = config.password
    } else if (config.authMethod === 'privateKey') {
      if (config.privateKeyContent) {
        connectConfig.privateKey = config.privateKeyContent
      } else if (config.privateKeyPath) {
        try {
          connectConfig.privateKey = fs.readFileSync(config.privateKeyPath.replace('~', os.homedir()))
        } catch { clearTimeout(masterTid); return done('unknown') }
      }
      if (config.passphrase) connectConfig.passphrase = config.passphrase
    }

    client.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => {
      finish(prompts.map(() => config.password ?? ''))
    })

    client.on('ready', () => {
      clearTimeout(masterTid)
      detectOsWithClient(client).then(done).catch(() => done('unknown'))
    })

    client.on('error', () => { clearTimeout(masterTid); done('unknown') })
    client.connect(connectConfig)
  })
}
