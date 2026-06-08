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
