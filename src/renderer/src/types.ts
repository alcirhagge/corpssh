export interface Server {
  id: string
  name: string
  host: string
  port: number
  username: string
  protocol: 'ssh' | 'rdp' | 'vnc'
  // SSH
  authMethod?: 'password' | 'privateKey' | 'agent'
  password?: string
  privateKeyPath?: string
  privateKeyContent?: string
  passphrase?: string
  // VNC
  vncPassword?: string
  // RDP
  rdpDomain?: string
  rdpFullscreen?: boolean
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
  remoteLogConfig?: RemoteLogConfig
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
  connectedAt?: number
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

export interface LogEntry {
  id: string
  timestamp: number
  type: 'connect' | 'disconnect' | 'error' | 'auth_fail'
  serverId: string
  serverName: string
  host: string
  username: string
  duration?: number
  message?: string
}

export interface RemoteLogConfig {
  enabled: boolean
  provider: 'graylog' | 'loki' | 'syslog' | 'elasticsearch'
  host: string
  port: number
  token?: string
  index?: string
  tls?: boolean
}

export type Theme = 'dark' | 'light'
export type NavPage = 'hosts' | 'keys' | 'logs' | 'export' | 'terminal'

export const SERVER_COLORS = [
  '#4c74ff', '#30d48a', '#f7b731', '#ff5757',
  '#a77bff', '#ff8c42', '#00bcd4', '#e91e8c',
  '#ff6b6b', '#48dbfb', '#6c5ce7', '#fd79a8'
]

export const HOST_ICON_COLORS = [
  '#e84040', '#e87040', '#e8a040', '#40a8e8',
  '#4065e8', '#7340e8', '#40e87b', '#e84095'
]
