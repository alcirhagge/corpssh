import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
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
  ipcMain.handle('settings:save', (_e, s) => { saveSettings(s); return true })

  // --- SSH Connection ---
  ipcMain.handle('ssh:connect', async (_e, config) => {
    const sessionId = generateId()
    await createSSHConnection(sessionId, config)
    updateLastConnected(config.id)
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

  ipcMain.handle('ssh:disconnect', (_e, sessionId: string) => {
    disconnectSSH(sessionId)
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
