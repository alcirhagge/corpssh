import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import TitleBar from './components/Layout/TitleBar'
import Sidebar from './components/Layout/Sidebar'
import StatusBar from './components/Layout/StatusBar'
import TabBar from './components/Terminal/TabBar'
import TerminalPane from './components/Terminal/TerminalPane'
import SFTPBrowser from './components/SFTP/SFTPBrowser'
import HostDashboard from './components/Dashboard/HostDashboard'
import HostForm, { EmptyHostPanel } from './components/Dashboard/HostForm'
import LogsPanel from './components/Logs/LogsPanel'
import ExportPanel from './components/Export/ExportPanel'
import CredentialsPanel from './components/Vault/CredentialsPanel'
import CloudPanel from './components/Cloud/CloudPanel'
import SnippetsPanel from './components/Snippets/SnippetsPanel'
import SettingsPanel from './components/Dialogs/SettingsPanel'
import UpdateNotification from './components/Layout/UpdateNotification'
import type { Server, Tab, LogEntry } from './types'
import { applyTheme, getThemeBase } from './themes'

export default function App() {
  const {
    setServers, setGroups, setKeys, setCredentials, setSnippets, setSettings,
    addTab, updateTab, removeTab, setActiveTab, setActivePage,
    upsertServer, theme, setTheme, addLog, setCloudRecovery,
    servers, tabs, activeTabId, activePage, rightPanel
  } = useAppStore()

  // Load data + apply theme
  useEffect(() => {
    const load = async () => {
      const [serverList, groupList, keyList, credList, snippetList, settingsData] = await Promise.all([
        window.api.servers.list(),
        window.api.groups.list(),
        window.api.keys.list(),
        window.api.credentials.list(),
        window.api.snippets.list(),
        window.api.settings.get()
      ])
      setServers(serverList)
      setGroups(groupList.slice().sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)))
      setKeys(keyList)
      setCredentials(credList)
      setSnippets(snippetList)
      setSettings(settingsData)
      const themeId = settingsData.themeId ?? 'navy'
      const base = getThemeBase(themeId)
      setTheme(base)
      applyTheme(themeId)
      document.documentElement.style.setProperty('--ui-font-size', `${settingsData.uiFontSize ?? 15}px`)
    }
    load()

    // Listen for new log entries from main process
    const unsub = window.api.log.onNew((entry) => addLog(entry as LogEntry))

    // Listen for OS detection results pushed from the main process after connect
    const unsubOs = window.api.ssh.onOsDetected(({ id, detectedOs }) => {
      const server = useAppStore.getState().servers.find((s) => s.id === id)
      if (server) upsertServer({ ...server, detectedOs })
    })

    // Cloud sync may pull new/updated records — reload local lists when notified.
    const unsubCloud = window.api.cloud.onChanged(async () => {
      const [s, g, k, c] = await Promise.all([
        window.api.servers.list(), window.api.groups.list(),
        window.api.keys.list(), window.api.credentials.list()
      ])
      setServers(s)
      setGroups(g.slice().sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)))
      setKeys(k)
      setCredentials(c)
    })

    // Password-recovery deep link (corpssh://) → go to Cloud page with the tokens.
    const unsubRecovery = window.api.cloud.onRecovery((payload) => {
      setCloudRecovery(payload)
      setActivePage('cloud')
    })

    return () => { unsub(); unsubOs(); unsubCloud(); unsubRecovery() }
  }, [])

  const openSSHTab = async (
    server: Server,
    mode: 'terminal' | 'sftp',
    pendingCommand?: string,
    kind: 'normal' | 'script' = 'normal'
  ) => {
    const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    addTab({
      id: tabId,
      serverId: server.id,
      serverName: server.name,
      serverHost: `${server.host}:${server.port}`,
      status: 'connecting',
      mode,
      connectedAt: Date.now(),
      pendingCommand,
      kind
    })
    setActivePage(kind === 'script' ? 'scripts' : 'terminal')
    try {
      const sessionId = await window.api.ssh.connect({
        id: server.id, name: server.name,
        host: server.host, port: server.port,
        username: server.username,
        authMethod: server.authMethod,
        password: server.password,
        privateKeyPath: server.privateKeyPath,
        privateKeyContent: server.privateKeyContent,
        passphrase: server.passphrase,
        credentialId: server.credentialId  // main overlays the vault credential's auth
      })
      updateTab(tabId, { sessionId, status: 'connected', connectedAt: Date.now() })
    } catch (e: any) {
      updateTab(tabId, { status: 'error', errorMessage: e.message || 'Connection failed' })
    }
  }

  const handleConnectServer = async (server: Server) => {
    const proto = server.protocol ?? 'ssh'

    if (proto === 'rdp') {
      const result = await window.api.rdp.connect({
        id: server.id, name: server.name,
        host: server.host, port: server.port,
        username: server.username, password: server.password,
        domain: server.rdpDomain, fullscreen: server.rdpFullscreen,
        credentialId: server.credentialId
      })
      if (!result.ok) alert(`RDP: ${result.message}`)
      return
    }

    if (proto === 'vnc') {
      alert('VNC: Feature in development.\nThis functionality is not yet available in this version.')
      return
    }

    await openSSHTab(server, 'terminal')
  }

  const handleConnectSftp = (server: Server) => openSSHTab(server, 'sftp')

  const handleNewTab = (tab: Tab) => {
    const server = servers.find((s) => s.id === tab.serverId)
    if (server) handleConnectServer(server)
  }

  // Snippet broadcast: open one SSH tab per target server and auto-run the command.
  // Only SSH hosts (RDP/VNC run in external windows and can't take piped input).
  const handleBroadcastSnippet = (command: string, targets: Server[]) => {
    const sshTargets = targets.filter((s) => (s.protocol ?? 'ssh') === 'ssh')
    if (sshTargets.length === 0) return
    setActivePage('scripts')
    sshTargets.forEach((s) => openSSHTab(s, 'terminal', command, 'script'))
  }

  const handleToggleSftp = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab || tab.status !== 'connected') return
    updateTab(tabId, { mode: tab.mode === 'sftp' ? 'terminal' : 'sftp' })
  }

  const handleCloseTab = async (tab: Tab) => {
    if (tab.sessionId) {
      try {
        await window.api.ssh.disconnect(tab.sessionId, {
          serverId: tab.serverId,
          serverName: tab.serverName,
          host: tab.serverHost,
          username: servers.find((s) => s.id === tab.serverId)?.username ?? '',
          connectedAt: tab.connectedAt
        })
      } catch {}
    }
    removeTab(tab.id)
    if (tabs.filter((t) => t.id !== tab.id).length === 0) setActivePage('hosts')
  }

  // Determine what to render in the main area
  const showTerminal = activePage === 'terminal'
  const showScripts = activePage === 'scripts'
  const showHosts = activePage === 'hosts'
  const showLogs = activePage === 'logs'
  const showExport = activePage === 'export'
  const showVault = activePage === 'vault'
  const showCloud = activePage === 'cloud'
  const showSnippets = activePage === 'snippets'
  const showSettings = activePage === 'keys'

  // Normal vs script (snippet-broadcast) sessions live in separate strips
  const inTerminalArea = showTerminal || showScripts
  const pageKind: 'normal' | 'script' = showScripts ? 'script' : 'normal'
  const tabKind = (t: Tab) => t.kind ?? 'normal'
  const currentTabs = tabs.filter((t) => tabKind(t) === pageKind)

  return (
    <div className={`flex flex-col h-screen ${theme}`} style={{ background: 'var(--bg-app)' }}>
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        {/* Main content */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Terminal tabs — visível nas páginas terminal/scripts, filtrado por kind */}
          {inTerminalArea && currentTabs.length > 0 && (
            <TabBar
              kind={pageKind}
              onCloseTab={handleCloseTab}
              onNewTab={handleNewTab}
              onToggleSftp={handleToggleSftp}
              onConnectServer={handleConnectServer}
              onBroadcastSnippet={handleBroadcastSnippet}
            />
          )}

          {/* Page content */}
          <div className="flex flex-1 overflow-hidden relative">
            {/* Hosts dashboard + docked side panel.
                The side panel is now ALWAYS present (fixed column) so opening the
                host editor no longer reflows/bugs the grid. When nothing is
                selected it shows quick "new connection / new group" actions. */}
            {showHosts && (
              <HostDashboard onConnect={handleConnectServer} onConnectSftp={handleConnectSftp} />
            )}
            {showHosts && (
              rightPanel
                ? <HostForm onConnect={handleConnectServer} />
                : <EmptyHostPanel />
            )}

            {/* Terminal sessions — SEMPRE no DOM quando há tabs, só esconde visualmente.
                Isso evita que o TerminalPane seja desmontado ao navegar para outra página,
                o que causaria reinício do shell e perda do histórico. */}
            {tabs.length > 0 && (
              <div
                className="flex-1 overflow-hidden relative"
                style={{ display: inTerminalArea ? 'block' : 'none' }}
              >
                {tabs.map((tab) => {
                  const visible = tab.id === activeTabId && tabKind(tab) === pageKind
                  return (
                  <div
                    key={tab.id}
                    className="absolute inset-0"
                    style={{
                      visibility: visible ? 'visible' : 'hidden',
                      pointerEvents: visible ? 'auto' : 'none'
                    }}
                  >
                    {tab.status === 'connecting' && <LoadingScreen name={tab.serverName} host={tab.serverHost} />}
                    {tab.status === 'error' && (
                      <ErrorScreen
                        name={tab.serverName}
                        error={tab.errorMessage ?? 'Unknown error'}
                        onRetry={() => {
                          const server = servers.find((s) => s.id === tab.serverId)
                          if (server) { removeTab(tab.id); handleConnectServer(server) }
                        }}
                        onClose={() => handleCloseTab(tab)}
                      />
                    )}
                    {(tab.status === 'connected' || tab.status === 'disconnected') && tab.sessionId && (
                      <>
                        {/* TerminalPane sempre montado — só escondido em modo SFTP para preservar histórico */}
                        <div style={{ position: 'absolute', inset: 0, display: tab.mode === 'sftp' && tab.status === 'connected' ? 'none' : 'block' }}>
                          <TerminalPane
                            tab={tab}
                            isActive={visible && !(tab.mode === 'sftp' && tab.status === 'connected')}
                            isPageVisible={inTerminalArea && tabKind(tab) === pageKind}
                            onReconnect={() => {
                              const server = servers.find((s) => s.id === tab.serverId)
                              if (server) { removeTab(tab.id); handleConnectServer(server) }
                            }}
                            onClose={() => handleCloseTab(tab)}
                          />
                        </div>
                        {tab.mode === 'sftp' && tab.status === 'connected' && (
                          <div style={{ position: 'absolute', inset: 0 }}>
                            <SFTPBrowser tab={tab} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  )
                })}
              </div>
            )}

            {/* Estado vazio das páginas terminal/scripts */}
            {inTerminalArea && currentTabs.length === 0 && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">{showScripts ? 'No script sessions' : 'No active sessions'}</p>
                <button
                  onClick={() => setActivePage(showScripts ? 'snippets' : 'hosts')}
                  className="px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {showScripts ? 'Go to Snippets' : 'Go to Hosts'}
                </button>
              </div>
            )}

            {showLogs && <LogsPanel />}
            {showExport && <ExportPanel />}
            {showVault && <CredentialsPanel />}
            {showCloud && <CloudPanel />}
            {showSnippets && <SnippetsPanel onBroadcast={handleBroadcastSnippet} />}
            {showSettings && <SettingsPanel onClose={() => setActivePage('hosts')} />}
          </div>
        </div>
      </div>

      <StatusBar />
      <UpdateNotification />
    </div>
  )
}

function LoadingScreen({ name, host }: { name: string; host: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: 'var(--bg-app)' }}>
      <div className="w-10 h-10 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Connecting to {name}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{host}</p>
      </div>
    </div>
  )
}

function friendlyError(raw: string): { title: string; detail: string } {
  const r = raw.toLowerCase()
  if (r.includes('all configured authentication methods failed') || r.includes('auth fail'))
    return { title: 'Invalid credentials', detail: 'Check your username and password and try again.' }
  if (r.includes('no matching key exchange'))
    return { title: 'Incompatible security algorithm', detail: 'The server uses legacy encryption. Try again — CorpSSH already includes support for legacy algorithms.' }
  if (r.includes('handshake failed'))
    return { title: 'SSH handshake failed', detail: 'The server rejected the security negotiation. Check the host configuration.' }
  if (r.includes('econnrefused') || r.includes('connection refused'))
    return { title: 'Connection refused', detail: 'The server is not accepting connections. Check the host, port, and whether SSH is active.' }
  if (r.includes('ehostunreach') || r.includes('host unreachable'))
    return { title: 'Host unreachable', detail: 'Could not reach the server. Check the IP address and network connectivity.' }
  if (r.includes('etimedout') || r.includes('timed out') || r.includes('timeout'))
    return { title: 'Connection timed out', detail: 'The server took too long to respond. Check whether the host is accessible.' }
  if (r.includes('enotfound'))
    return { title: 'Host not found', detail: 'The server address could not be resolved. Check the hostname or IP.' }
  if (r.includes('cannot read private key') || r.includes('private key'))
    return { title: 'Private key error', detail: 'Could not read the key file. Check the file path and passphrase.' }
  if (r.includes('socket hang up') || r.includes('connection reset'))
    return { title: 'Connection interrupted', detail: 'The server closed the connection unexpectedly.' }
  if (r.includes('keepalive'))
    return { title: 'Session expired', detail: 'The connection was closed due to inactivity.' }
  // fallback — strip the electron IPC prefix for cleaner display
  const clean = raw.replace(/^Error invoking remote method '[^']+': /, '').replace(/^Error: /, '')
  return { title: 'Connection failed', detail: clean }
}

function ErrorScreen({ name, error, onRetry, onClose }: {
  name: string; error: string; onRetry: () => void; onClose: () => void
}) {
  const { title, detail } = friendlyError(error)
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: 'var(--bg-app)' }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
        style={{ background: 'var(--error-subtle)' }}>✕</div>
      <div className="text-center" style={{ maxWidth: 320 }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Failed to connect to {name}</p>
        <p className="font-semibold mt-2" style={{ color: 'var(--error)', fontSize: 14 }}>{title}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{detail}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={onRetry} className="px-4 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}>Try again</button>
        <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
          Close
        </button>
      </div>
    </div>
  )
}
