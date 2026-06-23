import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import { addLogEntry, getLogs, clearLogs } from './logger'
import { sendRemoteLog, testConnection, setRemoteConfig, type RemoteLogConfig } from './remoteLogger'
import {
  exportToXML, exportToXMLWithCredentials, importFromXML,
  isEncryptedXML, encryptXMLEnvelope, decryptXMLEnvelope, type ImportResult
} from './xmlManager'
import {
  parseMremotengXml, MremotengPasswordError, MREMOTENG_DEFAULT_PASSWORD
} from './mremoteng'
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
  detectOsFromSession,
  onSessionClosed
} from './sshManager'
import { forgetHostKey, trustHostKey, listKnownHosts } from './knownHosts'
import { listCommands, clearCommandHistory } from './commandHistory'
import { startTunnel, stopTunnel, listTunnels, type TunnelConfig } from './portForward'
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
  getSnippets,
  saveSnippet,
  deleteSnippet,
  type ServerRecord,
  type GroupRecord,
  type KeyRecord,
  type CredentialRecord,
  type SnippetRecord
} from './store'
import {
  isCloudConfigured, cloudStatus, cloudSignUp, cloudSignIn, cloudSignOut,
  resetPassword, verifyRecovery, applyRecovery
} from './cloudClient'
import { syncNow } from './cloudSync'
import * as path from 'path'
import * as os from 'os'
import * as net from 'net'

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

  // --- Snippet CRUD ---
  ipcMain.handle('snippets:list', () => getSnippets())
  ipcMain.handle('snippets:save', (_e, snippet: SnippetRecord) => {
    if (!snippet.id) snippet.id = generateId()
    saveSnippet(snippet)
    return snippet
  })
  ipcMain.handle('snippets:delete', (_e, id: string) => { deleteSnippet(id); return true })

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

  // Export with credentials is ALWAYS encrypted now: the credential-bearing XML
  // is sealed with the user's password before hitting disk.
  ipcMain.handle('xml:exportWithCredentials', async (_e, password: string) => {
    if (!password || password.length < 4) {
      throw new Error('Senha de exportacao muito curta (minimo 4 caracteres)')
    }
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showSaveDialog(win, {
      title: 'Exportar servidores com credenciais (criptografado)',
      defaultPath: `corpssh-export-secure-${Date.now()}.xml`,
      filters: [{ name: 'XML', extensions: ['xml'] }]
    })
    if (result.canceled || !result.filePath) return null
    const inner = exportToXMLWithCredentials(getServers(), getGroups())
    const xml = encryptXMLEnvelope(inner, password)
    fs.writeFileSync(result.filePath, xml, 'utf-8')
    return result.filePath
  })

  // Holds the raw content of an encrypted file picked via xml:import while the
  // renderer prompts for its password (then resolved by xml:importWithPassword).
  let pendingEncryptedImport: string | null = null

  const applyImport = (xml: string): ImportResult => {
    const data = importFromXML(xml)
    data.groups.forEach(g => { if (!g.id) g.id = generateId(); saveGroup(g) })
    data.servers.forEach(s => { if (!s.id) s.id = generateId(); saveServer(s) })
    return data
  }

  ipcMain.handle('xml:import', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: 'Importar servidores',
      filters: [{ name: 'XML', extensions: ['xml'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths.length) return null
    const xml = fs.readFileSync(result.filePaths[0], 'utf-8')
    if (isEncryptedXML(xml)) {
      pendingEncryptedImport = xml
      return { needsPassword: true }
    }
    return applyImport(xml)
  })

  ipcMain.handle('xml:importWithPassword', async (_e, password: string) => {
    if (!pendingEncryptedImport) throw new Error('Nenhuma importacao pendente')
    const enc = pendingEncryptedImport
    pendingEncryptedImport = null
    const xml = decryptXMLEnvelope(enc, password) // throws on wrong password
    return applyImport(xml)
  })

  // --- mRemoteNG import (confCons.xml) ---
  // New users migrating from mRemoteNG point us at their confCons.xml. We try
  // the default password ("mR3m") first; if a secret won't decrypt we hold the
  // file and ask the renderer for the custom password.
  let pendingMremotengXml: string | null = null

  const applyMremoteng = (xml: string, password: string) => {
    const data = parseMremotengXml(xml, password) // throws MremotengPasswordError on bad pw
    data.groups.forEach((g) => saveGroup(g))
    data.servers.forEach((s) => saveServer(s))
    return { servers: data.servers, groups: data.groups, skipped: data.skipped }
  }

  ipcMain.handle('mremoteng:import', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: 'Importar do mRemoteNG (confCons.xml)',
      filters: [{ name: 'mRemoteNG', extensions: ['xml'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths.length) return null
    const xml = fs.readFileSync(result.filePaths[0], 'utf-8')
    try {
      return applyMremoteng(xml, MREMOTENG_DEFAULT_PASSWORD)
    } catch (e) {
      if (e instanceof MremotengPasswordError) {
        pendingMremotengXml = xml
        return { needsPassword: true }
      }
      throw e
    }
  })

  ipcMain.handle('mremoteng:importWithPassword', async (_e, password: string) => {
    if (!pendingMremotengXml) throw new Error('Nenhuma importacao pendente')
    const xml = pendingMremotengXml
    try {
      const out = applyMremoteng(xml, password) // throws MremotengPasswordError on bad pw
      pendingMremotengXml = null
      return out
    } catch (e) {
      if (e instanceof MremotengPasswordError) {
        throw new Error('Senha incorreta. Tente a senha de criptografia definida no mRemoteNG.')
      }
      throw e
    }
  })

  // --- Cloud account (opt-in) ---
  ipcMain.handle('cloud:configured', () => isCloudConfigured())
  ipcMain.handle('cloud:status', () => cloudStatus())
  ipcMain.handle('cloud:signUp', (_e, email: string, password: string) => cloudSignUp(email, password))
  ipcMain.handle('cloud:signIn', (_e, email: string, password: string) => cloudSignIn(email, password))
  ipcMain.handle('cloud:signOut', () => cloudSignOut())
  ipcMain.handle('cloud:resetPassword', (_e, email: string) => resetPassword(email))
  ipcMain.handle('cloud:verifyRecovery', (_e, email: string, token: string, pw: string) => verifyRecovery(email, token, pw))
  ipcMain.handle('cloud:applyRecovery', (_e, at: string, rt: string, pw: string) => applyRecovery(at, rt, pw))
  ipcMain.handle('cloud:sync', async () => {
    const result = await syncNow()
    // Tell the renderer to reload its lists (pull may have changed local data).
    BrowserWindow.getAllWindows()[0]?.webContents.send('cloud:changed')
    return result
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

  // Build a nested jumpHost connection config from a saved server id, resolving
  // its vault credential and applying the global TOFU policy. Recurses so a
  // bastion that itself has a jumpHost yields a full multi-hop chain. `seen`
  // guards against a cyclic jumpHostId graph (A→B→A) becoming infinite.
  const strict = (): boolean => getSettings().strictHostKey !== false
  const buildJump = (jumpId: string | undefined, seen: Set<string>): any => {
    if (!jumpId || seen.has(jumpId)) return undefined
    seen.add(jumpId)
    const srv = getServers().find((s) => s.id === jumpId && (s.protocol ?? 'ssh') === 'ssh')
    if (!srv) return undefined
    const auth = resolveServerAuth(srv.id)
    return {
      ...srv,
      ...(auth ?? {}),
      strictHostKey: strict(),
      jumpHost: buildJump(srv.jumpHostId, seen)
    }
  }

  // --- SSH Connection ---
  ipcMain.handle('ssh:connect', async (_e, config) => {
    // If the host references a vault credential, its auth overrides the host's own.
    // Resolved here in main so decrypted secrets never round-trip through the renderer.
    const auth = config.id ? resolveServerAuth(config.id) : null
    if (auth) config = { ...config, ...auth }

    // Global TOFU host-key policy (default on) applied here so the renderer
    // never has to thread it through every connect call.
    config = { ...config, strictHostKey: strict() }

    // Resolve a ProxyJump bastion chain if this host references one.
    if (config.jumpHostId) {
      config = { ...config, jumpHost: buildJump(config.jumpHostId, new Set([config.id].filter(Boolean))) }
    }

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

  // Re-trust a host after a legitimate key change: forget the pinned key so the
  // next connect re-pins the new one. host/port identify the entry.
  ipcMain.handle('ssh:forgetHostKey', (_e, host: string, port: number) => {
    forgetHostKey(host, port)
    return true
  })
  ipcMain.handle('ssh:trustHostKey', (_e, host: string, port: number, fp: string) => {
    trustHostKey(host, port, fp)
    return true
  })
  ipcMain.handle('ssh:listKnownHosts', () => listKnownHosts())

  // --- Command history (Ctrl+R reverse search) ---
  ipcMain.handle('history:list', (_e, query?: string, limit?: number) => listCommands(query ?? '', limit ?? 200))
  ipcMain.handle('history:clear', () => { clearCommandHistory(); return true })

  // --- Network RTT (status-bar latency) ---
  // Time a raw TCP connect to host:port. Deliberately NOT an SSH-level ping: it
  // touches no channels, so it's safe against single-session appliances (switches,
  // OLTs). Returns milliseconds, or -1 on error/timeout.
  ipcMain.handle('net:rtt', (_e, host: string, port: number) => new Promise<number>((resolve) => {
    const start = Date.now()
    let done = false
    const finish = (v: number): void => { if (done) return; done = true; try { sock.destroy() } catch {} resolve(v) }
    const sock = net.connect({ host, port: port || 22 })
    sock.once('connect', () => finish(Date.now() - start))
    sock.once('error', () => finish(-1))
    setTimeout(() => finish(-1), 4000)
  }))

  // ─── Port forwarding (tunnels) ──────────────────────────────────────────────
  ipcMain.handle('forward:start', async (_e, sessionId: string, cfg: TunnelConfig) => {
    return startTunnel(sessionId, cfg)
  })
  ipcMain.handle('forward:stop', (_e, id: string) => {
    stopTunnel(id)
    return true
  })
  ipcMain.handle('forward:list', () => listTunnels())

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

  // --- Edit a remote file inline ---
  // Download it to a private temp dir, open it in the OS default editor, and watch
  // the file: each save re-uploads it to the server. The watch is on the temp DIR
  // (not the file) so it survives editors that save atomically via rename. Watchers
  // are torn down on stopEdit and when the owning SSH session closes.
  const activeEdits = new Map<string, fs.FSWatcher>()  // `${sessionId}|${remotePath}` → watcher

  onSessionClosed((sessionId) => {
    for (const [key, watcher] of activeEdits) {
      if (key.startsWith(`${sessionId}|`)) { try { watcher.close() } catch {} activeEdits.delete(key) }
    }
  })

  ipcMain.handle('sftp:editRemote', async (_e, sessionId: string, remotePath: string) => {
    const base = path.basename(remotePath) || 'remote-file'
    const dir = path.join(os.tmpdir(), `corpssh-edit-${generateId()}`)
    fs.mkdirSync(dir, { recursive: true })
    const local = path.join(dir, base)

    await downloadFile(sessionId, remotePath, local)
    await shell.openPath(local)

    const key = `${sessionId}|${remotePath}`
    try { activeEdits.get(key)?.close() } catch {}

    let lastMtime = 0
    let timer: NodeJS.Timeout | null = null
    const watcher = fs.watch(dir, (_evt, fname) => {
      // Only react to OUR file; ignore editor swap/backup files in the same dir.
      if (fname && fname.toString() !== base) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        try {
          const st = fs.statSync(local)
          if (st.mtimeMs === lastMtime) return  // de-dupe the burst of fs events per save
          lastMtime = st.mtimeMs
          await uploadFile(sessionId, local, remotePath)
          BrowserWindow.getAllWindows()[0]?.webContents.send('sftp:editSync', { remotePath, at: Date.now() })
        } catch { /* file mid-write or session gone — next event retries */ }
      }, 350)
    })
    activeEdits.set(key, watcher)
    return local
  })

  ipcMain.handle('sftp:stopEdit', (_e, sessionId: string, remotePath: string) => {
    const key = `${sessionId}|${remotePath}`
    try { activeEdits.get(key)?.close() } catch {}
    activeEdits.delete(key)
    return true
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
