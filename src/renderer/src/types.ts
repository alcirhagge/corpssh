export interface Server {
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

export interface Group {
  id: string
  name: string
  color?: string
  expanded?: boolean
}

export interface SSHKey {
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

export interface Tab {
  id: string
  sessionId?: string
  serverId: string
  serverName: string
  serverHost: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  errorMessage?: string
  mode: 'terminal' | 'sftp'
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

export type Theme = 'dark' | 'light'

export const SERVER_COLORS = [
  '#58a6ff', '#3fb950', '#d29922', '#f85149',
  '#bc8cff', '#ff7b72', '#ffa657', '#79c0ff',
  '#56d364', '#e3b341', '#f78166', '#d2a8ff'
]
