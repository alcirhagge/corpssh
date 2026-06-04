import { useEffect, useState } from 'react'
import { useAppStore } from './store/appStore'
import TitleBar from './components/Layout/TitleBar'
import Sidebar from './components/Layout/Sidebar'
import StatusBar from './components/Layout/StatusBar'
import TabBar from './components/Terminal/TabBar'
import TerminalPane from './components/Terminal/TerminalPane'
import SFTPBrowser from './components/SFTP/SFTPBrowser'
import WelcomeScreen from './components/Layout/WelcomeScreen'
import AddServerDialog from './components/Dialogs/AddServerDialog'
import SettingsPanel from './components/Dialogs/SettingsPanel'
import UpdateNotification from './components/Layout/UpdateNotification'
import type { Server, Tab } from './types'

type Modal =
  | { type: 'addServer'; groupId?: string }
  | { type: 'editServer'; server: Server }
  | { type: 'settings' }
  | null

export default function App() {
  const {
    setServers, setGroups, setKeys, setSettings,
    addTab, updateTab, removeTab, setActiveTab,
    upsertServer, theme, setTheme,
    servers, groups, tabs, activeTabId
  } = useAppStore()

  const [modal, setModal] = useState<Modal>(null)
  const [sidebarWidth] = useState(240)

  // Load data on mount
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

      // Apply saved theme
      const savedTheme = settingsData.theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : settingsData.theme
      setTheme(savedTheme as 'dark' | 'light')
      document.documentElement.classList.remove('dark', 'light')
      document.documentElement.classList.add(savedTheme)
    }
    load()
  }, [])

  const handleConnectServer = async (server: Server) => {
    const tabId = `tab-${Date.now()}`
    const newTab: Tab = {
      id: tabId,
      serverId: server.id,
      serverName: server.name,
      serverHost: `${server.host}:${server.port}`,
      status: 'connecting',
      mode: 'terminal'
    }
    addTab(newTab)

    try {
      const sessionId = await window.api.ssh.connect({
        id: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        authMethod: server.authMethod,
        password: server.password,
        privateKeyPath: server.privateKeyPath,
        privateKeyContent: server.privateKeyContent,
        passphrase: server.passphrase
      })
      updateTab(tabId, { sessionId, status: 'connected' })
    } catch (e: any) {
      updateTab(tabId, {
        status: 'error',
        errorMessage: e.message || 'Falha na conexão'
      })
    }
  }

  const handleCloseTab = async (tab: Tab) => {
    if (tab.sessionId) {
      try { await window.api.ssh.disconnect(tab.sessionId) } catch {}
    }
    removeTab(tab.id)
  }

  const handleOpenSFTP = (tab: Tab) => {
    updateTab(tab.id, { mode: tab.mode === 'sftp' ? 'terminal' : 'sftp' })
  }

  const activeTab = tabs.find(t => t.id === activeTabId)

  return (
    <div className={`flex flex-col h-screen ${theme}`} style={{ background: 'var(--bg-app)' }}>
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          onConnectServer={handleConnectServer}
          onOpenSettings={() => setModal({ type: 'settings' })}
          onOpenKeyManager={() => setModal({ type: 'settings' })}
          onEditServer={(server) => setModal({ type: 'editServer', server })}
          onAddServer={(groupId) => setModal({ type: 'addServer', groupId })}
        />

        {/* Main content */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Tab bar */}
          <TabBar onCloseTab={handleCloseTab} />

          {/* Content area */}
          <div className="flex-1 overflow-hidden relative">
            {tabs.length === 0 ? (
              <WelcomeScreen
                serverCount={servers.length}
                onAddServer={() => setModal({ type: 'addServer' })}
              />
            ) : (
              <>
                {tabs.map(tab => (
                  <div
                    key={tab.id}
                    className="absolute inset-0"
                    style={{
                      visibility: tab.id === activeTabId ? 'visible' : 'hidden',
                      pointerEvents: tab.id === activeTabId ? 'auto' : 'none'
                    }}
                  >
                    {tab.status === 'connecting' && (
                      <ConnectingScreen name={tab.serverName} host={tab.serverHost} />
                    )}
                    {tab.status === 'error' && (
                      <ErrorScreen
                        name={tab.serverName}
                        error={tab.errorMessage ?? 'Erro desconhecido'}
                        onRetry={() => {
                          const server = servers.find(s => s.id === tab.serverId)
                          if (server) {
                            removeTab(tab.id)
                            handleConnectServer(server)
                          }
                        }}
                        onClose={() => handleCloseTab(tab)}
                      />
                    )}
                    {tab.status === 'disconnected' && (
                      <DisconnectedScreen
                        name={tab.serverName}
                        onReconnect={() => {
                          const server = servers.find(s => s.id === tab.serverId)
                          if (server) {
                            removeTab(tab.id)
                            handleConnectServer(server)
                          }
                        }}
                      />
                    )}
                    {tab.status === 'connected' && tab.sessionId && (
                      tab.mode === 'sftp'
                        ? <SFTPBrowser tab={tab} />
                        : <TerminalPane tab={tab} />
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      <StatusBar />

      {/* Modals */}
      {modal?.type === 'addServer' && (
        <AddServerDialog
          defaultGroupId={(modal as any).groupId}
          onClose={() => setModal(null)}
          onSaved={(server) => {
            upsertServer(server)
            setModal(null)
          }}
        />
      )}
      {modal?.type === 'editServer' && (
        <AddServerDialog
          server={(modal as any).server}
          onClose={() => setModal(null)}
          onSaved={(server) => {
            upsertServer(server)
            setModal(null)
          }}
        />
      )}
      {modal?.type === 'settings' && (
        <SettingsPanel onClose={() => setModal(null)} />
      )}

      <UpdateNotification />
    </div>
  )
}

function ConnectingScreen({ name, host }: { name: string; host: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div
        className="w-12 h-12 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
      />
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Conectando a {name}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{host}</p>
      </div>
    </div>
  )
}

function ErrorScreen({ name, error, onRetry, onClose }: {
  name: string; error: string; onRetry: () => void; onClose: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div
        className="flex items-center justify-center w-12 h-12 rounded-full"
        style={{ background: 'var(--error-subtle)' }}
      >
        <span style={{ color: 'var(--error)', fontSize: 24 }}>✕</span>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Falha ao conectar em {name}
        </p>
        <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--error)' }}>{error}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onRetry}
          className="px-4 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Tentar novamente
        </button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg text-xs"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          Fechar
        </button>
      </div>
    </div>
  )
}

function DisconnectedScreen({ name, onReconnect }: { name: string; onReconnect: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div
        className="flex items-center justify-center w-12 h-12 rounded-full"
        style={{ background: 'var(--bg-elevated)' }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: 24 }}>⏻</span>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Sessão encerrada — {name}
        </p>
      </div>
      <button
        onClick={onReconnect}
        className="px-4 py-1.5 rounded-lg text-xs font-medium"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        Reconectar
      </button>
    </div>
  )
}
