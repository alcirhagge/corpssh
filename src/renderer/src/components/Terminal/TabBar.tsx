import { useState, useRef } from 'react'
import { Terminal, FolderOpen, Plus } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { Tab } from '../../types'

interface TabBarProps {
  onCloseTab: (tab: Tab) => void
  onNewTab: (tab: Tab) => void
  onToggleSftp: (tabId: string) => void
}

export default function TabBar({ onCloseTab, onNewTab, onToggleSftp }: TabBarProps) {
  const { tabs, activeTabId, setActiveTab } = useAppStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  if (tabs.length === 0) return null

  return (
    <div
      className="flex items-center overflow-x-auto"
      style={{
        background: 'var(--tabbar-bg)',
        borderBottom: '1px solid var(--border)',
        height: 46,
        minHeight: 46
      }}
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onClick={() => setActiveTab(tab.id)}
          onClose={() => onCloseTab(tab)}
          onToggleSftp={() => onToggleSftp(tab.id)}
        />
      ))}

      {/* New terminal for same server */}
      <button
        onClick={() => activeTab && onNewTab(activeTab)}
        title="Novo terminal (mesmo servidor)"
        className="flex items-center justify-center h-full px-3 flex-shrink-0"
        style={{ color: 'var(--text-muted)', background: 'transparent' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        <Plus size={15} />
      </button>
    </div>
  )
}

function TabItem({
  tab, isActive, onClick, onClose, onToggleSftp
}: {
  tab: Tab; isActive: boolean; onClick: () => void; onClose: () => void; onToggleSftp: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const statusColor = {
    connected: 'var(--success)',
    connecting: 'var(--warning)',
    disconnected: 'var(--text-muted)',
    error: 'var(--error)'
  }[tab.status]

  const handleClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      onClose()
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null
        onClick()
      }, 220)
    }
  }

  return (
    <div
      className="flex items-center gap-1.5 px-3 h-full cursor-pointer relative flex-shrink-0"
      style={{
        background: isActive ? 'var(--bg-surface)' : hovered ? 'var(--bg-hover)' : 'transparent',
        borderRight: '1px solid var(--border-subtle)',
        maxWidth: 220,
        transition: 'background 0.1s'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      title="Clique: ativar · Duplo clique: fechar"
    >
      {/* Active indicator */}
      {isActive && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ background: 'var(--accent)' }}
        />
      )}

      {/* Mode toggle chips — Terminal | SFTP */}
      <div
        className="flex items-center flex-shrink-0 rounded overflow-hidden"
        style={{
          border: '1px solid var(--border)',
          opacity: tab.status === 'connected' ? 1 : 0.35,
          pointerEvents: tab.status === 'connected' ? 'auto' : 'none'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => tab.mode === 'sftp' && onToggleSftp()}
          title="Modo Terminal"
          className="flex items-center gap-1 px-1.5"
          style={{
            height: 22,
            fontSize: 10, fontWeight: 600,
            background: tab.mode === 'terminal' ? 'var(--accent)' : 'transparent',
            color: tab.mode === 'terminal' ? '#fff' : 'var(--text-muted)',
            cursor: tab.mode === 'sftp' ? 'pointer' : 'default'
          }}
        >
          <Terminal size={10} />
          SSH
        </button>
        <button
          onClick={() => tab.mode === 'terminal' && onToggleSftp()}
          title="Modo SFTP"
          className="flex items-center gap-1 px-1.5"
          style={{
            height: 22,
            fontSize: 10, fontWeight: 600,
            background: tab.mode === 'sftp' ? 'var(--purple, #8b5cf6)' : 'transparent',
            color: tab.mode === 'sftp' ? '#fff' : 'var(--text-muted)',
            cursor: tab.mode === 'terminal' ? 'pointer' : 'default'
          }}
        >
          <FolderOpen size={10} />
          SFTP
        </button>
      </div>

      {/* Status dot */}
      <div
        className="flex-shrink-0 rounded-full"
        style={{ width: 7, height: 7, background: statusColor }}
      />

      {/* Label */}
      <span className="truncate" style={{
        fontSize: 13,
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        maxWidth: 140
      }}>
        {tab.serverName}
      </span>
    </div>
  )
}
