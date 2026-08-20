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
  detectedOs?: string
  iconOverride?: string
  credentialId?: string
  /** Optional saved-server id to tunnel through before reaching this host (ProxyJump). */
  jumpHostId?: string
  /** Shell integration (OSC 133/7 marks via an injected bash snippet).
   *  'auto' (default) = only when the detected OS is Linux; never network gear. */
  shellIntegration?: 'auto' | 'on' | 'off'
}

export interface Credential {
  id: string
  name: string
  username: string
  authMethod: 'password' | 'privateKey' | 'agent'
  password?: string
  privateKeyPath?: string
  privateKeyContent?: string
  passphrase?: string
}

export interface Group {
  id: string
  name: string
  color?: string
  expanded?: boolean
  sortOrder?: number
}

export interface SSHKey {
  id: string
  name: string
  path: string
  comment?: string
}

export interface Snippet {
  id: string
  name: string
  command: string
  description?: string
}

export type TunnelType = 'local' | 'remote' | 'dynamic'

export interface Tunnel {
  id: string
  type: TunnelType
  bindAddr?: string
  bindPort: number
  destHost?: string
  destPort?: number
}

export interface TunnelStatus extends Tunnel {
  sessionId: string
  status: 'open' | 'error'
  error?: string
  connections: number
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system'
  themeId: string
  uiFontSize: number
  fontSize: number
  fontFamily: string
  cursorStyle: 'block' | 'bar' | 'underline'
  cursorBlink: boolean
  scrollback: number
  bellStyle: 'none' | 'sound' | 'visual'
  /** Optional override for the terminal text color. Empty/undefined = use theme. */
  terminalFgColor?: string
  /** Auto-enable ls/grep/ip colors on connect for Linux hosts. Default true. */
  terminalAutoColor?: boolean
  /** Inject the bash shell-integration snippet on Linux hosts (real command
   *  history, exit codes, cwd in tab, SFTP-at-cwd). Default true. */
  terminalShellIntegration?: boolean
  /** TOFU host-key verification. Default true. */
  strictHostKey?: boolean
  /** Auto-reconnect a session dropped unexpectedly. Default true. */
  autoReconnect?: boolean
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
  /** command to auto-run once the shell is ready (snippet broadcast) */
  pendingCommand?: string
  /** 'normal' = user-opened session; 'script' = spawned by a snippet broadcast */
  kind?: 'normal' | 'script'
  /** Remote working directory reported by the shell integration (OSC 7). */
  cwd?: string
  /** True once the remote shell started emitting integration marks. */
  shellIntegrated?: boolean
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
export type NavPage = 'hosts' | 'keys' | 'logs' | 'export' | 'terminal' | 'vault' | 'cloud' | 'snippets' | 'scripts' | 'tunnels'

export const SERVER_COLORS = [
  '#4c74ff', '#30d48a', '#f7b731', '#ff5757',
  '#a77bff', '#ff8c42', '#00bcd4', '#e91e8c',
  '#ff6b6b', '#48dbfb', '#6c5ce7', '#fd79a8'
]

export const HOST_ICON_COLORS = [
  '#e84040', '#e87040', '#e8a040', '#40a8e8',
  '#4065e8', '#7340e8', '#40e87b', '#e84095'
]
