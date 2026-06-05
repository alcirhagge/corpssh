import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import TitleBar from './components/Layout/TitleBar'
import Sidebar from './components/Layout/Sidebar'
import StatusBar from './components/Layout/StatusBar'
import TabBar from './components/Terminal/TabBar'
import TerminalPane from './components/Terminal/TerminalPane'
import SFTPBrowser from './components/SFTP/SFTPBrowser'
import HostDashboard from './components/Dashboard/HostDashboard'
import HostForm from './components/Dashboard/HostForm'
import LogsPanel from './components/Logs/LogsPanel'
import ExportPanel from './components/Export/ExportPanel'
import SettingsPanel from './components/Dialogs/SettingsPanel'
import UpdateNotification from './components/Layout/UpdateNotification'
import type { Server, Tab, LogEntry } from './types'
import { applyTheme, getThemeBase } from './themes'

export default function App() {
  const {
    setServers, setGroups, setKeys, setSettings,
    addTab, updateTab, removeTab, setActiveTab, setActivePage,
    upsertServer, theme, setTheme, addLog,
    servers, tabs, activeTabId, activePage, rightPanel
  } = useAppStore()

  // Load data + apply theme
  useEffect(() => {
    const load = async () => {
      const [serverList, groupList, keyList, settingsData] = await Promise.all([
        window.api.servers.list(),
        window.api.groups.list(),
        window.api.keys.list(),
        window.api.settings.get()
      ])
      setServers(serverList)
      setGroups(groupList)
      setKeys(keyList)
      setSettings(settingsData)
      const themeId = settingsData.themeId ?? 'navy'
      const base = getThemeBase(themeId)
      setTheme(base)
      applyTheme(themeId)
      document.documentElement.style.setProperty('--ui-font-size', `${settingsData.uiFontSize ?? 14}px`)
    }
    load()

    // Listen for new log entries from main process
    const unsub = window.api.log.onNew((entry) => addLog(entry as LogEntry))
    return unsub
  }, [])

  const handleConnectServer = async (server: Server) => {
    const proto = server.protocol ?? 'ssh'

    // RDP — abre cliente nativo, sem tab no app
    if (proto === 'rdp') {
      const result = await window.api.rdp.connect({
        id: server.id, name: server.name,
        host: server.host, port: server.port,
        username: server.username, password: server.password,
        domain: server.rdpDomain, fullscreen: server.rdpFullscreen
      })
      if (!result.ok) alert(`RDP: ${result.message}`)
      return
    }

    // VNC — abre janela separada com noVNC
    if (proto === 'vnc') {
      try {
        await window.api.vnc.connect({
          id: server.id, name: server.name,
          host: server.host, port: server.port,
          username: server.username, vncPassword: server.vncPassword
        })
      } catch (e: any) {
        alert(`VNC: ${e.message}`)
      }
      return
    }

    // SSH — flow existente
    const tabId = `tab-${Date.now()}`
    const newTab: Tab = {
      id: tabId,
      serverId: server.id,
      serverName: server.name,
      serverHost: `${server.host}:${server.port}`,
      status: 'connecting',
      mode: 'terminal',
      connectedAt: Date.now()
    }
    addTab(newTab)
    setActivePage('terminal')

    try {
      const sessionId = await window.api.ssh.connect({
        id: server.id, name: server.name,
        host: server.host, port: server.port,
        username: server.username,
        authMethod: server.authMethod,
        password: server.password,
        privateKeyPath: server.privateKeyPath,
        privateKeyContent: server.privateKeyContent,
        passphrase: server.passphrase
      })
      updateTab(tabId, { sessionId, status: 'connected', connectedAt: Date.now() })
    } catch (e: any) {
      updateTab(tabId, { status: 'error', errorMessage: e.message || 'Falha na conexao' })
    }
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

  const activeTab = tabs.find((t) => t.id === activeTabId)

  // Determine what to render in the main area
  const showTerminal = activePage === 'terminal'
  const showHosts = activePage === 'hosts'
  const showLogs = activePage === 'logs'
  const showExport = activePage === 'export'
  const showSettings = activePage === 'keys'
  const showRightPanel = rightPanel !== null && showHosts

  return (
    <div className={`flex flex-col h-screen ${theme}`} style={{ background: 'var(--bg-app)' }}>
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        {/* Main content */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Terminal tabs (always rendered when terminal page) */}
          {showTerminal && (
            <TabBar onCloseTab={handleCloseTab} />
          )}

          {/* Page content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Hosts dashboard */}
            {showHosts && (
              <>
                <HostDashboard onConnect={handleConnectServer} />
                {showRightPanel && <HostForm onConnect={handleConnectServer} />}
              </>
            )}

            {/* Terminal sessions */}
            {showTerminal && (
              <div className="flex-1 overflow-hidden relative">
                {tabs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: 'var(--text-muted)' }}>
                    <p className="text-sm">Nenhuma sessao ativa</p>
                    <button
                      onClick={() => setActivePage('hosts')}
                      className="px-3 py-1.5 rounded-lg text-xs"
                      style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                      Ir para Hosts
                    </button>
                  </div>
                ) : (
                  tabs.map((tab) => (
                    <div
                      key={tab.id}
                      className="absolute inset-0"
                      style={{
                        visibility: tab.id === activeTabId ? 'visible' : 'hidden',
                        pointerEvents: tab.id === activeTabId ? 'auto' : 'none'
                      }}
                    >
                      {tab.status === 'connecting' && <LoadingScreen name={tab.serverName} host={tab.serverHost} />}
                      {tab.status === 'error' && (
                        <ErrorScreen
                          name={tab.serverName}
                          error={tab.errorMessage ?? 'Erro desconhecido'}
                          onRetry={() => {
                            const server = servers.find((s) => s.id === tab.serverId)
                            if (server) { removeTab(tab.id); handleConnectServer(server) }
                          }}
                          onClose={() => handleCloseTab(tab)}
                        />
                      )}
                      {tab.status === 'connected' && tab.sessionId && (
                        tab.mode === 'sftp'
                          ? <SFTPBrowser tab={tab} />
                          : <TerminalPane tab={tab} isActive={tab.id === activeTabId} />
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {showLogs && <LogsPanel />}
            {showExport && <ExportPanel />}
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
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Conectando a {name}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{host}</p>
      </div>
    </div>
  )
}

function ErrorScreen({ name, error, onRetry, onClose }: {
  name: string; error: string; onRetry: () => void; onClose: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: 'var(--bg-app)' }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
        style={{ background: 'var(--error-subtle)' }}>✕</div>
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Falha ao conectar em {name}</p>
        <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--error)' }}>{error}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={onRetry} className="px-4 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}>Tentar novamente</button>
        <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
          Fechar
        </button>
      </div>
    </div>
  )
}
