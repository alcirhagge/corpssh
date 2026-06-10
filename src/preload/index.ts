import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximized: (cb: (v: boolean) => void) => {
      ipcRenderer.on('window:maximized', (_e, v) => cb(v))
      return () => ipcRenderer.removeAllListeners('window:maximized')
    }
  },

  // Server management
  servers: {
    list: () => ipcRenderer.invoke('servers:list'),
    save: (server: unknown) => ipcRenderer.invoke('servers:save', server),
    delete: (id: string) => ipcRenderer.invoke('servers:delete', id)
  },

  // Group management
  groups: {
    list: () => ipcRenderer.invoke('groups:list'),
    save: (group: unknown) => ipcRenderer.invoke('groups:save', group),
    delete: (id: string) => ipcRenderer.invoke('groups:delete', id)
  },

  // Key management
  keys: {
    list: () => ipcRenderer.invoke('keys:list'),
    save: (key: unknown) => ipcRenderer.invoke('keys:save', key),
    delete: (id: string) => ipcRenderer.invoke('keys:delete', id)
  },

  // Credential vault
  credentials: {
    list: () => ipcRenderer.invoke('credentials:list'),
    save: (cred: unknown) => ipcRenderer.invoke('credentials:save', cred),
    delete: (id: string) => ipcRenderer.invoke('credentials:delete', id)
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (s: unknown) => ipcRenderer.invoke('settings:save', s)
  },

  // SSH
  ssh: {
    connect: (config: unknown) => ipcRenderer.invoke('ssh:connect', config),
    shell: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('ssh:shell', sessionId, cols, rows),
    input: (sessionId: string, data: string) => ipcRenderer.send('ssh:input', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('ssh:resize', sessionId, cols, rows),
    disconnect: (sessionId: string) => ipcRenderer.invoke('ssh:disconnect', sessionId),
    detectOs: (config: unknown) => ipcRenderer.invoke('ssh:detectOs', config),
    onData: (sessionId: string, cb: (data: string) => void) => {
      const channel = `ssh:data:${sessionId}`
      ipcRenderer.on(channel, (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners(channel)
    },
    onClosed: (sessionId: string, cb: () => void) => {
      const channel = `ssh:closed:${sessionId}`
      ipcRenderer.on(channel, () => cb())
      return () => ipcRenderer.removeAllListeners(channel)
    },
    onOsDetected: (cb: (data: { id: string; detectedOs: string }) => void) => {
      ipcRenderer.on('server:osDetected', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('server:osDetected')
    }
  },

  // SFTP
  sftp: {
    list: (sessionId: string, path: string) => ipcRenderer.invoke('sftp:list', sessionId, path),
    download: (sessionId: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:download', sessionId, remotePath),
    upload: (sessionId: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:upload', sessionId, remotePath),
    delete: (sessionId: string, remotePath: string, isDir: boolean) =>
      ipcRenderer.invoke('sftp:delete', sessionId, remotePath, isDir),
    reveal: (localPath: string) => ipcRenderer.invoke('sftp:reveal', localPath),
    home: (sessionId: string): Promise<string> => ipcRenderer.invoke('sftp:home', sessionId),
    uploadDirect: (sessionId: string, localPath: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:uploadDirect', sessionId, localPath, remotePath),
    downloadDirect: (sessionId: string, remotePath: string, localPath: string) =>
      ipcRenderer.invoke('sftp:downloadDirect', sessionId, remotePath, localPath)
  },

  // Local filesystem
  local: {
    homedir: (): Promise<string> => ipcRenderer.invoke('local:homedir'),
    list: (dirPath: string) => ipcRenderer.invoke('local:list', dirPath)
  },

  // Dialogs
  dialog: {
    openKey: () => ipcRenderer.invoke('dialog:openKey')
  },

  // RDP
  rdp: {
    connect: (config: unknown) => ipcRenderer.invoke('rdp:connect', config)
  },

  // VNC
  vnc: {
    connect: (config: unknown) => ipcRenderer.invoke('vnc:connect', config),
    disconnect: (sessionId: string) => ipcRenderer.invoke('vnc:disconnect', sessionId)
  },

  // Session logs (capture happens in the main process now; renderer only reads)
  session: {
    list: () => ipcRenderer.invoke('session:list'),
    read: (sessionId: string) => ipcRenderer.invoke('session:read', sessionId),
    delete: (sessionId: string) => ipcRenderer.invoke('session:delete', sessionId)
  },

  // Logger
  log: {
    list: () => ipcRenderer.invoke('log:list'),
    clear: () => ipcRenderer.invoke('log:clear'),
    testRemote: (config: unknown) => ipcRenderer.invoke('log:testRemote', config),
    saveRemoteConfig: (config: unknown) => ipcRenderer.invoke('log:saveRemoteConfig', config),
    onNew: (cb: (entry: unknown) => void) => {
      ipcRenderer.on('log:new', (_e, entry) => cb(entry))
      return () => ipcRenderer.removeAllListeners('log:new')
    }
  },

  // XML
  xml: {
    export: () => ipcRenderer.invoke('xml:export'),
    exportWithCredentials: (password: string) =>
      ipcRenderer.invoke('xml:exportWithCredentials', password),
    import: () => ipcRenderer.invoke('xml:import'),
    importWithPassword: (password: string) =>
      ipcRenderer.invoke('xml:importWithPassword', password)
  },

  // Cloud account (opt-in)
  cloud: {
    configured: (): Promise<boolean> => ipcRenderer.invoke('cloud:configured'),
    status: () => ipcRenderer.invoke('cloud:status'),
    signUp: (email: string, password: string) => ipcRenderer.invoke('cloud:signUp', email, password),
    signIn: (email: string, password: string) => ipcRenderer.invoke('cloud:signIn', email, password),
    signOut: () => ipcRenderer.invoke('cloud:signOut'),
    resetPassword: (email: string) => ipcRenderer.invoke('cloud:resetPassword', email),
    verifyRecovery: (email: string, token: string, pw: string) => ipcRenderer.invoke('cloud:verifyRecovery', email, token, pw),
    applyRecovery: (at: string, rt: string, pw: string) => ipcRenderer.invoke('cloud:applyRecovery', at, rt, pw),
    sync: () => ipcRenderer.invoke('cloud:sync'),
    onChanged: (cb: () => void) => {
      ipcRenderer.on('cloud:changed', cb)
      return () => ipcRenderer.removeAllListeners('cloud:changed')
    },
    onRecovery: (cb: (p: { access_token: string; refresh_token: string; type: string | null }) => void) => {
      ipcRenderer.on('cloud:recovery', (_e, p) => cb(p))
      return () => ipcRenderer.removeAllListeners('cloud:recovery')
    }
  },

  // Auto-update
  updater: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onChecking: (cb: () => void) => {
      ipcRenderer.on('update:checking', cb)
      return () => ipcRenderer.removeAllListeners('update:checking')
    },
    onAvailable: (cb: (info: { version: string }) => void) => {
      ipcRenderer.on('update:available', (_e, info) => cb(info))
      return () => ipcRenderer.removeAllListeners('update:available')
    },
    onNotAvailable: (cb: () => void) => {
      ipcRenderer.on('update:not-available', cb)
      return () => ipcRenderer.removeAllListeners('update:not-available')
    },
    onProgress: (cb: (p: { percent: number; bytesPerSecond: number }) => void) => {
      ipcRenderer.on('update:progress', (_e, p) => cb(p))
      return () => ipcRenderer.removeAllListeners('update:progress')
    },
    onDownloaded: (cb: (info: { version: string }) => void) => {
      ipcRenderer.on('update:downloaded', (_e, info) => cb(info))
      return () => ipcRenderer.removeAllListeners('update:downloaded')
    },
    onError: (cb: (msg: string) => void) => {
      ipcRenderer.on('update:error', (_e, msg) => cb(msg))
      return () => ipcRenderer.removeAllListeners('update:error')
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (e) {
    console.error(e)
  }
} else {
  ;(window as any).electron = electronAPI
  ;(window as any).api = api
}

export type API = typeof api
