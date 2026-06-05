import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { addLogEntry, getLogs, clearLogs } from './logger'
import { sendRemoteLog, testConnection, setRemoteConfig, type RemoteLogConfig } from './remoteLogger'
import { exportToXML, importFromXML } from './xmlManager'
import {
  createSessionLog, appendSessionData, appendSessionCommand,
  closeSessionLog, listSessions, readSessionLog, deleteSession
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
  deleteSFTPItem
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
  type ServerRecord,
  type GroupRecord,
  type KeyRecord
} from './store'
import * as path from 'path'
import * as os from 'os'

function generateId(): string {
  return randomUUID()
}

export function setupIpcHandlers(): void {
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
    const xml = require('fs').readFileSync(result.filePaths[0], 'utf-8')
    const data = importFromXML(xml)
    data.groups.forEach(g => { if (!g.id) g.id = generateId(); require('./store').saveGroup(g) })
    data.servers.forEach(s => { if (!s.id) s.id = generateId(); require('./store').saveServer(s) })
    return data
  })

  // --- RDP ---
  ipcMain.handle('rdp:connect', async (_e, config) => {
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

  // --- Session logging ---
  ipcMain.handle('session:data', (_e, sessionId: string, data: string) => {
    appendSessionData(sessionId, data)
  })
  ipcMain.handle('session:command', (_e, sessionId: string, command: string) => {
    appendSessionCommand(sessionId, command)
  })
  ipcMain.handle('session:list', () => listSessions())
  ipcMain.handle('session:read', (_e, sessionId: string) => readSessionLog(sessionId))
  ipcMain.handle('session:delete', (_e, sessionId: string) => { deleteSession(sessionId); return true })

  // --- SSH Connection ---
  ipcMain.handle('ssh:connect', async (_e, config) => {
    const sessionId = generateId()
    await createSSHConnection(sessionId, config)
    updateLastConnected(config.id)
    const entry = addLogEntry({
      type: 'connect', serverId: config.id,
      serverName: config.name ?? config.host,
      host: `${config.host}:${config.port}`,
      username: config.username
    })
    createSessionLog({
      sessionId, serverId: config.id,
      serverName: config.name ?? config.host,
      host: `${config.host}:${config.port}`,
      username: config.username,
      startedAt: Date.now()
    })
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('log:new', entry)
    sendRemoteLog(entry)
    return sessionId
  })

  ipcMain.handle('ssh:shell', async (_e, sessionId: string, cols: number, rows: number) => {
    await createShellSession(sessionId, cols, rows)
    return true
  })

  ipcMain.handle('ssh:input', (_e, sessionId: string, data: string) => {
    sendInput(sessionId, data)
  })

  ipcMain.handle('ssh:resize', (_e, sessionId: string, cols: number, rows: number) => {
    resizeTerminal(sessionId, cols, rows)
  })

  ipcMain.handle('ssh:disconnect', (_e, sessionId: string, meta?: { serverId: string; serverName: string; host: string; username: string; connectedAt?: number }) => {
    disconnectSSH(sessionId)
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
}
