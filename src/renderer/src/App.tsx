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
      setGroups(groupList.slice().sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)))
      setKeys(keyList)
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
    return unsub
  }, [])

  const openSSHTab = async (server: Server, mode: 'terminal' | 'sftp') => {
    const tabId = `tab-${Date.now()}`
    addTab({
      id: tabId,
      serverId: server.id,
      serverName: server.name,
      serverHost: `${server.host}:${server.port}`,
      status: 'connecting',
      mode,
      connectedAt: Date.now()
    })
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

  const handleConnectServer = async (server: Server) => {
    const proto = server.protocol ?? 'ssh'

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

    if (proto === 'vnc') {
      alert('VNC: Função sendo implementada.\nEsta funcionalidade ainda não está disponível nesta versão.')
      return
    }

    await openSSHTab(server, 'terminal')
  }

  const handleConnectSftp = (server: Server) => openSSHTab(server, 'sftp')

  const handleNewTab = (tab: Tab) => {
    const server = servers.find((s) => s.id === tab.serverId)
    if (server) handleConnectServer(server)
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

          {/* Terminal tabs — só visível na página terminal */}
          {showTerminal && tabs.length > 0 && (
            <TabBar
              onCloseTab={handleCloseTab}
              onNewTab={handleNewTab}
              onToggleSftp={handleToggleSftp}
              onConnectServer={handleConnectServer}
            />
          )}

          {/* Page content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Hosts dashboard */}
            {showHosts && (
              <>
                <HostDashboard onConnect={handleConnectServer} onConnectSftp={handleConnectSftp} />
                {showRightPanel && <HostForm onConnect={handleConnectServer} />}
              </>
            )}

            {/* Terminal sessions — SEMPRE no DOM quando há tabs, só esconde visualmente.
                Isso evita que o TerminalPane seja desmontado ao navegar para outra página,
                o que causaria reinício do shell e perda do histórico. */}
            {tabs.length > 0 && (
              <div
                className="flex-1 overflow-hidden relative"
                style={{ display: showTerminal ? 'block' : 'none' }}
              >
                {tabs.map((tab) => (
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
                    {(tab.status === 'connected' || tab.status === 'disconnected') && tab.sessionId && (
                      <>
                        {/* TerminalPane sempre montado — só escondido em modo SFTP para preservar histórico */}
                        <div style={{ position: 'absolute', inset: 0, display: tab.mode === 'sftp' && tab.status === 'connected' ? 'none' : 'block' }}>
                          <TerminalPane
                            tab={tab}
                            isActive={tab.id === activeTabId && !(tab.mode === 'sftp' && tab.status === 'connected')}
                            isPageVisible={showTerminal}
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
                ))}
              </div>
            )}

            {/* Estado vazio da página terminal */}
            {showTerminal && tabs.length === 0 && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">Nenhuma sessao ativa</p>
                <button
                  onClick={() => setActivePage('hosts')}
                  className="px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  Ir para Hosts
                </button>
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

function friendlyError(raw: string): { title: string; detail: string } {
  const r = raw.toLowerCase()
  if (r.includes('all configured authentication methods failed') || r.includes('auth fail'))
    return { title: 'Credenciais inválidas', detail: 'Verifique o usuário e a senha e tente novamente.' }
  if (r.includes('no matching key exchange'))
    return { title: 'Algoritmo de segurança incompatível', detail: 'O servidor usa criptografia antiga. Tente novamente — o CorpSSH já inclui suporte a algoritmos legados.' }
  if (r.includes('handshake failed'))
    return { title: 'Falha no handshake SSH', detail: 'O servidor recusou a negociação de segurança. Verifique as configurações do host.' }
  if (r.includes('econnrefused') || r.includes('connection refused'))
    return { title: 'Conexão recusada', detail: 'O servidor não está aceitando conexões. Verifique o host, porta e se o SSH está ativo.' }
  if (r.includes('ehostunreach') || r.includes('host unreachable'))
    return { title: 'Host inacessível', detail: 'Não foi possível alcançar o servidor. Verifique o IP e a conectividade de rede.' }
  if (r.includes('etimedout') || r.includes('timed out') || r.includes('timeout'))
    return { title: 'Tempo esgotado', detail: 'O servidor demorou demais para responder. Verifique se o host está acessível.' }
  if (r.includes('enotfound'))
    return { title: 'Host não encontrado', detail: 'O endereço do servidor não foi resolvido. Verifique o nome ou IP.' }
  if (r.includes('cannot read private key') || r.includes('private key'))
    return { title: 'Erro na chave privada', detail: 'Não foi possível ler a chave. Verifique o arquivo e a passphrase.' }
  if (r.includes('socket hang up') || r.includes('connection reset'))
    return { title: 'Conexão interrompida', detail: 'O servidor encerrou a conexão inesperadamente.' }
  if (r.includes('keepalive'))
    return { title: 'Sessão expirada', detail: 'A conexão foi encerrada por inatividade.' }
  // fallback — strip the electron IPC prefix for cleaner display
  const clean = raw.replace(/^Error invoking remote method '[^']+': /, '').replace(/^Error: /, '')
  return { title: 'Falha ao conectar', detail: clean }
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
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Falha ao conectar em {name}</p>
        <p className="font-semibold mt-2" style={{ color: 'var(--error)', fontSize: 14 }}>{title}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{detail}</p>
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
