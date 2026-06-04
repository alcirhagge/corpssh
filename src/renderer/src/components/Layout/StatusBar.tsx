import { useAppStore } from '../../store/appStore'
import { Wifi, WifiOff, Terminal } from 'lucide-react'

export default function StatusBar() {
  const { tabs, activeTabId } = useAppStore()
  const activeTab = tabs.find(t => t.id === activeTabId)
  const connectedCount = tabs.filter(t => t.status === 'connected').length

  return (
    <div
      className="flex items-center justify-between px-3 text-xs"
      style={{
        height: 24,
        background: 'var(--bg-elevated)',
        borderTop: '1px solid var(--border-subtle)',
        color: 'var(--text-muted)'
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-3">
        {activeTab ? (
          <>
            <div className={`status-dot ${activeTab.status}`} />
            <span style={{ color: 'var(--text-secondary)' }}>
              {activeTab.serverName}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {activeTab.serverHost}
            </span>
            {activeTab.status === 'connecting' && (
              <span style={{ color: 'var(--warning)' }}>Conectando...</span>
            )}
            {activeTab.status === 'error' && (
              <span style={{ color: 'var(--error)' }}>{activeTab.errorMessage}</span>
            )}
          </>
        ) : (
          <span>Pronto</span>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {connectedCount > 0 && (
          <div className="flex items-center gap-1" style={{ color: 'var(--success)' }}>
            <Wifi size={10} />
            <span>{connectedCount} conexã{connectedCount !== 1 ? 'ões' : 'o'}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Terminal size={10} />
          <span>CorpSSH v1.0</span>
        </div>
      </div>
    </div>
  )
}
