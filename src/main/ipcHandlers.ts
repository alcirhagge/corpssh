import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import { addLogEntry, getLogs, clearLogs } from './logger'
import { sendRemoteLog, testConnection, setRemoteConfig, type RemoteLogConfig } from './remoteLogger'
import { exportToXML, exportToXMLWithCredentials, importFromXML } from './xmlManager'
import {
  createSessionLog, closeSessionLog, listSessions, readSessionLog,
  deleteSession, cleanupOrphanedSessions
} from './sessionLogger'
import { launchRDP } from './rdpManager'
import { createVNCProxy, openVNCWindow, closeVNCSession } from './vncManager'
import {
  createSSHConnection,
  createShellSession,
  sendInput,
  resizeTerminal,
  disconnectSSH,
  listSFTPDirectory,
  downloadFile,
  uploadFile,
  uploadPath,
  downloadPath,
  getRemoteHome,
  deleteSFTPItem,
  detectRemoteOs,
  detectOsFromSession
} from './sshManager'
import {
  getServers,
  saveServer,
  deleteServer,
  getGroups,
  saveGroup,
  deleteGroup,
  getKeys,
  saveKey,
  deleteKey,
  getSettings,
  saveSettings,
  updateLastConnected,
  getCredentials,
  saveCredential,
  deleteCredential,
  resolveServerAuth,
  migrateEncryptionAtRest,
  type ServerRecord,
  type GroupRecord,
  type KeyRecord,
  type CredentialRecord
} from './store'
import * as path from 'path'
import * as os from 'os'

function generateId(): string {
  return randomUUID()
}

// Track session meta for natural-disconnect logging
const sessionMetaMap = new Map<string, { serverId: string; serverName: string; host: string; username: string; connectedAt: number }>()

// Background OS scan at startup: SSH into every server that has no confirmed OS
// and run the detection script. Results are pushed to the UI as they arrive.
function runStartupOsScan(): void {
  const toScan = getServers().filter((s) =>
    (s.protocol ?? 'ssh') === 'ssh' && !s.detectedOs
  )
  if (toScan.length === 0) return

  const CONCURRENCY = 5
  let idx = 0

  const runNext = async (): Promise<void> => {
    if (idx >= toScan.length) return
    const server = toScan[idx++]
    try {
      const detectedOs = await detectRemoteOs(server)
      if (detectedOs && detectedOs !== 'unknown' && detectedOs !== 'linux') {
        const fresh = getServers().find((s) => s.id === server.id)
        if (fresh && fresh.detectedOs !== detectedOs) {
          saveServer({ ...fresh, detectedOs })
          BrowserWindow.getAllWindows()[0]?.webContents.send('server:osDetected', { id: server.id, detectedOs })
        }
      }
    } catch {}
    return runNext()
  }

  // Start CONCURRENCY workers in parallel
  Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, toScan.length) }, () => runNext())
  ).catch(() => {})
}

export function setupIpcHandlers(): void {
  // Encrypt any legacy plaintext secrets now that the app (and safeStorage) is ready
  migrateEncryptionAtRest()

  // Close any sessions left open from a previous crash/force-quit
  cleanupOrphanedSessions()

  // Clear stale 'linux' detections so they are re-scanned on startup
  getServers().forEach((s) => {
    if (s.detectedOs === 'linux') saveServer({ ...s, detectedOs: undefined })
  })

  // Run SSH-based OS detection for all servers without a confirmed OS.
  // Delayed 4 s to let the renderer finish loading first.
  setTimeout(() => runStartupOsScan(), 4000)

  // --- Server CRUD ---
  ipcMain.handle('servers:list', () => getServers())
  ipcMain.handle('servers:save', (_e, server: ServerRecord) => {
    if (!server.id) server.id = generateId()
    saveServer(server)
    return server
  })
  ipcMain.handle('servers:delete', (_e, id: string) => { deleteServer(id); return true })

  // --- Group CRUD ---
  ipcMain.handle('groups:list', () => getGroups())
  ipcMain.handle('groups:save', (_e, group: GroupRecord) => {
    if (!group.id) group.id = generateId()
    saveGroup(group)
    return group
  })
  ipcMain.handle('groups:delete', (_e, id: string) => { deleteGroup(id); return true })

  // --- Credential vault CRUD ---
  ipcMain.handle('credentials:list', () => getCredentials())
  ipcMain.handle('credentials:save', (_e, cred: CredentialRecord) => {
    if (!cred.id) cred.id = generateId()
    saveCredential(cred)
    return cred
  })
  ipcMain.handle('credentials:delete', (_e, id: string) => { deleteCredential(id); return true })

  // --- Key CRUD ---
  ipcMain.handle('keys:list', () => getKeys())
  ipcMain.handle('keys:save', (_e, key: KeyRecord) => {
    if (!key.id) key.id = generateId()
    saveKey(key)
    return key
  })
  ipcMain.handle('keys:delete', (_e, id: string) => { deleteKey(id); return true })

  // --- Settings ---
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:save', (_e, s) => {
    saveSettings(s)
    if (s.remoteLogConfig) setRemoteConfig(s.remoteLogConfig)
    return true
  })

  // --- Logger ---
  ipcMain.handle('log:list', () => getLogs())
  ipcMain.handle('log:clear', () => { clearLogs(); return true })
  ipcMain.handle('log:testRemote', async (_e, config: RemoteLogConfig) => testConnection(config))
  ipcMain.handle('log:saveRemoteConfig', (_e, config: RemoteLogConfig) => {
    setRemoteConfig(config)
    return true
  })

  // --- XML Export/Import ---
  ipcMain.handle('xml:export', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showSaveDialog(win, {
      title: 'Exportar servidores',
      defaultPath: `corpssh-export-${Date.now()}.xml`,
      filters: [{ name: 'XML', extensions: ['xml'] }]
    })
    if (result.canceled || !result.filePath) return null
    const servers = getServers()
    const groups = getGroups()
    const xml = exportToXML(servers, groups)
    fs.writeFileSync(result.filePath, xml, 'utf-8')
    return result.filePath
  })

  ipcMain.handle('xml:exportWithCredentials', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showSaveDialog(win, {
      title: 'Exportar servidores com credenciais',
      defaultPath: `corpssh-export-credentials-${Date.now()}.xml`,
      filters: [{ name: 'XML', extensions: ['xml'] }]
    })
    if (result.canceled || !result.filePath) return null
    const servers = getServers()
    const groups = getGroups()
    const xml = exportToXMLWithCredentials(servers, groups)
    require('fs').writeFileSync(result.filePath, xml, 'utf-8')
    return result.filePath
  })

  ipcMain.handle('xml:import', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: 'Importar servidores',
      filters: [{ name: 'XML', extensions: ['xml'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths.length) return null
    const xml = fs.readFileSync(result.filePaths[0], 'utf-8')
    const data = importFromXML(xml)
    data.groups.forEach(g => { if (!g.id) g.id = generateId(); saveGroup(g) })
    data.servers.forEach(s => { if (!s.id) s.id = generateId(); saveServer(s) })
    return data
  })

  // --- RDP ---
  ipcMain.handle('rdp:connect', async (_e, config) => {
    const auth = config.id ? resolveServerAuth(config.id) : null
    if (auth) config = { ...config, username: auth.username ?? config.username, password: auth.password ?? config.password }
    const result = await launchRDP(config)
    if (result.ok) {
      addLogEntry({ type: 'connect', serverId: config.id ?? '', serverName: config.name ?? config.host, host: `${config.host}:${config.port}`, username: config.username, message: 'RDP' })
    }
    return result
  })

  // --- VNC ---
  ipcMain.handle('vnc:connect', async (_e, config) => {
    const sessionId = generateId()
    const wsPort = await createVNCProxy(sessionId, config.host, config.port)
    openVNCWindow(sessionId, wsPort, config.name ?? config.host, `${config.host}:${config.port}`, config.vncPassword)
    addLogEntry({ type: 'connect', serverId: config.id ?? '', serverName: config.name ?? config.host, host: `${config.host}:${config.port}`, username: config.username ?? 'vnc', message: 'VNC' })
    return { sessionId, wsPort }
  })
  ipcMain.handle('vnc:disconnect', (_e, sessionId: string) => {
    closeVNCSession(sessionId)
    return true
  })

  // --- Session logging (capture lives in sshManager; renderer only reads) ---
  ipcMain.handle('session:list', () => listSessions())
  ipcMain.handle('session:read', (_e, sessionId: string) => readSessionLog(sessionId))
  ipcMain.handle('session:delete', (_e, sessionId: string) => { deleteSession(sessionId); return true })

  // --- SSH Connection ---
  ipcMain.handle('ssh:connect', async (_e, config) => {
    // If the host references a vault credential, its auth overrides the host's own.
    // Resolved here in main so decrypted secrets never round-trip through the renderer.
    const auth = config.id ? resolveServerAuth(config.id) : null
    if (auth) config = { ...config, ...auth }

    const sessionId = generateId()
    const connectedAt = Date.now()
    const serverName = config.name ?? config.host
    const hostLabel = `${config.host}:${config.port}`
    const win = BrowserWindow.getAllWindows()[0]

    const naturalCloseHandler = () => {
      const meta = sessionMetaMap.get(sessionId)
      if (!meta) return  // already logged via manual disconnect
      sessionMetaMap.delete(sessionId)
      const now = Date.now()
      closeSessionLog(sessionId, now)
      const entry = addLogEntry({ type: 'disconnect', ...meta, duration: now - meta.connectedAt })
      BrowserWindow.getAllWindows()[0]?.webContents.send('log:new', entry)
      sendRemoteLog(entry)
    }

    try {
      await createSSHConnection(sessionId, config, naturalCloseHandler)
    } catch (e: any) {
      const msg = e.message ?? 'Connection failed'
      const isAuthFail = /all configured authentication|auth fail/i.test(msg)
      const errEntry = addLogEntry({
        type: isAuthFail ? 'auth_fail' : 'error',
        serverId: config.id, serverName, host: hostLabel,
        username: config.username, message: msg
      })
      win?.webContents.send('log:new', errEntry)
      sendRemoteLog(errEntry)
      throw e
    }

    updateLastConnected(config.id)
    sessionMetaMap.set(sessionId, { serverId: config.id, serverName, host: hostLabel, username: config.username, connectedAt })

    // Background OS detection using the open session (runs on every connect)
    if (config.id) {
      detectOsFromSession(sessionId).then((detectedOs) => {
        // Only persist specific values; 'linux' and 'unknown' are weak fallbacks
        if (detectedOs && detectedOs !== 'unknown' && detectedOs !== 'linux') {
          const fresh = getServers().find((s) => s.id === config.id)
          if (fresh && fresh.detectedOs !== detectedOs) {
            saveServer({ ...fresh, detectedOs })
            BrowserWindow.getAllWindows()[0]?.webContents.send('server:osDetected', { id: config.id, detectedOs })
          }
        }
      }).catch(() => {})
    }

    const entry = addLogEntry({ type: 'connect', serverId: config.id, serverName, host: hostLabel, username: config.username })
    createSessionLog({ sessionId, serverId: config.id, serverName, host: hostLabel, username: config.username, startedAt: connectedAt })
    win?.webContents.send('log:new', entry)
    sendRemoteLog(entry)
    return sessionId
  })

  ipcMain.handle('ssh:detectOs', async (_e, config) => {
    try {
      const detectedOs = await detectRemoteOs(config)
      if (config.id && detectedOs) {
        const servers = getServers()
        const srv = servers.find((s) => s.id === config.id)
        if (srv) saveServer({ ...srv, detectedOs })
      }
      return detectedOs
    } catch {
      return 'unknown'
    }
  })

  ipcMain.handle('ssh:shell', async (_e, sessionId: string, cols: number, rows: number) => {
    await createShellSession(sessionId, cols, rows)
    return true
  })

  // 'send' (fire-and-forget), not 'invoke' — avoids a Promise round-trip per keystroke
  ipcMain.on('ssh:input', (_e, sessionId: string, data: string) => {
    sendInput(sessionId, data)
  })

  ipcMain.handle('ssh:resize', (_e, sessionId: string, cols: number, rows: number) => {
    resizeTerminal(sessionId, cols, rows)
  })

  ipcMain.handle('ssh:disconnect', (_e, sessionId: string, meta?: { serverId: string; serverName: string; host: string; username: string; connectedAt?: number }) => {
    disconnectSSH(sessionId)
    sessionMetaMap.delete(sessionId)  // prevent double-log from naturalCloseHandler
    const now = Date.now()
    closeSessionLog(sessionId, now)
    if (meta) {
      const duration = meta.connectedAt ? now - meta.connectedAt : undefined
      const entry = addLogEntry({ type: 'disconnect', ...meta, duration })
      const win = BrowserWindow.getAllWindows()[0]
      win?.webContents.send('log:new', entry)
      sendRemoteLog(entry)
    }
    return true
  })

  // --- SFTP ---
  ipcMain.handle('sftp:list', async (_e, sessionId: string, remotePath: string) => {
    return listSFTPDirectory(sessionId, remotePath)
  })

  ipcMain.handle('sftp:download', async (_e, sessionId: string, remotePath: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showSaveDialog(win, {
      defaultPath: path.join(os.homedir(), 'Downloads', path.basename(remotePath))
    })
    if (!result.canceled && result.filePath) {
      await downloadFile(sessionId, remotePath, result.filePath)
      return result.filePath
    }
    return null
  })

  ipcMain.handle('sftp:upload', async (_e, sessionId: string, remotePath: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, { properties: ['openFile'] })
    if (!result.canceled && result.filePaths.length > 0) {
      const localPath = result.filePaths[0]
      const remoteFile = path.posix.join(remotePath, path.basename(localPath))
      await uploadFile(sessionId, localPath, remoteFile)
      return remoteFile
    }
    return null
  })

  ipcMain.handle('sftp:delete', async (_e, sessionId: string, remotePath: string, isDir: boolean) => {
    await deleteSFTPItem(sessionId, remotePath, isDir)
    return true
  })

  ipcMain.handle('sftp:reveal', async (_e, localPath: string) => {
    shell.showItemInFolder(localPath)
  })

  // --- File dialog for key selection ---
  ipcMain.handle('dialog:openKey', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: 'Select SSH Private Key',
      defaultPath: path.join(os.homedir(), '.ssh'),
      properties: ['openFile'],
      filters: [
        { name: 'SSH Keys', extensions: ['pem', 'key', 'ppk', ''] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // --- Local filesystem (for split-pane SFTP) ---
  ipcMain.handle('local:homedir', () => os.homedir())
  ipcMain.handle('local:list', (_e, dirPath: string) => {
    const fs = require('fs') as typeof import('fs')
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    return entries.map((e) => {
      const fullPath = path.join(dirPath, e.name)
      let size = 0
      let modifyTime = 0
      try {
        const stat = fs.statSync(fullPath)
        size = stat.size
        modifyTime = Math.floor(stat.mtimeMs / 1000)
      } catch {}
      return { name: e.name, type: e.isDirectory() ? 'directory' : 'file', size, modifyTime }
    })
  })

  // Resolve the remote home directory so the split-pane SFTP opens somewhere writable
  ipcMain.handle('sftp:home', (_e, sessionId: string) => getRemoteHome(sessionId))

  // Direct transfers without dialogs (used by split-pane SFTP) — handle files AND folders
  ipcMain.handle('sftp:uploadDirect', async (_e, sessionId: string, localPath: string, remotePath: string) => {
    await uploadPath(sessionId, localPath, remotePath)
    return true
  })
  ipcMain.handle('sftp:downloadDirect', async (_e, sessionId: string, remotePath: string, localPath: string) => {
    await downloadPath(sessionId, remotePath, localPath)
    return localPath
  })
}
