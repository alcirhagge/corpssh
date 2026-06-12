import { useAppStore } from '../../store/appStore'
import { Wifi } from 'lucide-react'

declare const __APP_VERSION__: string

export default function StatusBar() {
  const { tabs, activeTabId } = useAppStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const connectedCount = tabs.filter((t) => t.status === 'connected').length

  return (
    <div
      className="flex items-center justify-between px-4 text-xs select-none cs-glass"
      style={{
        height: 26,
        background: 'var(--bg-elevated)',
        borderTop: '1px solid var(--glass-border)',
        color: 'var(--text-muted)'
      }}
    >
      <div className="flex items-center gap-3">
        {activeTab ? (
          <>
            <div className={`status-dot ${activeTab.status}`} />
            <span style={{ color: 'var(--text-secondary)' }}>{activeTab.serverName}</span>
            <span style={{ color: 'var(--text-muted)' }}>{activeTab.serverHost}</span>
            {activeTab.status === 'connecting' && (
              <span style={{ color: 'var(--warning)' }}>Connecting...</span>
            )}
            {activeTab.status === 'error' && (
              <span style={{ color: 'var(--error)' }}>{activeTab.errorMessage}</span>
            )}
          </>
        ) : (
          <span>Ready</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {connectedCount > 0 && (
          <div className="flex items-center gap-1" style={{ color: 'var(--success)' }}>
            <Wifi size={10} />
            <span>{connectedCount} active session{connectedCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        <span style={{ color: 'var(--text-muted)' }}>v{__APP_VERSION__}</span>
      </div>
    </div>
  )
}
