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

      {/* Mode icon — click to toggle SFTP/Terminal */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (tab.status === 'connected') onToggleSftp()
        }}
        title={tab.mode === 'sftp' ? 'Voltar ao Terminal' : 'Abrir SFTP'}
        className="flex items-center justify-center flex-shrink-0 rounded"
        style={{
          color: tab.mode === 'sftp' ? 'var(--purple, #8b5cf6)' : 'var(--accent)',
          background: 'transparent',
          padding: 3,
          cursor: tab.status === 'connected' ? 'pointer' : 'default'
        }}
        onMouseEnter={(e) => {
          if (tab.status === 'connected') e.currentTarget.style.background = 'var(--bg-active)'
        }}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {tab.mode === 'sftp' ? <FolderOpen size={15} /> : <Terminal size={15} />}
      </button>

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
