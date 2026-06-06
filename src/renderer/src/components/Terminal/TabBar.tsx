import { useState } from 'react'
import { X, Terminal, FolderOpen } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { Tab } from '../../types'

interface TabBarProps {
  onCloseTab: (tab: Tab) => void
}

export default function TabBar({ onCloseTab }: TabBarProps) {
  const { tabs, activeTabId, setActiveTab } = useAppStore()

  if (tabs.length === 0) return null

  return (
    <div
      className="flex items-center overflow-x-auto"
      style={{
        background: 'var(--tabbar-bg)',
        borderBottom: '1px solid var(--border)',
        height: 38,
        minHeight: 38
      }}
    >
      {tabs.map(tab => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onClick={() => setActiveTab(tab.id)}
          onClose={() => onCloseTab(tab)}
        />
      ))}
    </div>
  )
}

function TabItem({
  tab, isActive, onClick, onClose
}: {
  tab: Tab; isActive: boolean; onClick: () => void; onClose: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const statusColor = {
    connected: 'var(--success)',
    connecting: 'var(--warning)',
    disconnected: 'var(--text-muted)',
    error: 'var(--error)'
  }[tab.status]

  return (
    <div
      className="flex items-center gap-1.5 px-3 h-full cursor-pointer relative flex-shrink-0"
      style={{
        background: isActive ? 'var(--bg-surface)' : hovered ? 'var(--bg-hover)' : 'transparent',
        borderRight: '1px solid var(--border-subtle)',
        maxWidth: 200,
        transition: 'background 0.1s'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ background: 'var(--accent)' }}
        />
      )}

      {/* Icon */}
      <span style={{ color: tab.mode === 'sftp' ? 'var(--purple)' : 'var(--accent)', flexShrink: 0 }}>
        {tab.mode === 'sftp' ? <FolderOpen size={13} /> : <Terminal size={13} />}
      </span>

      {/* Status dot */}
      <div className={`status-dot ${tab.status} flex-shrink-0`} style={{ width: 6, height: 6 }} />

      {/* Label */}
      <span className="text-xs truncate" style={{
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        maxWidth: 120
      }}>
        {tab.serverName}
      </span>

      {/* Close */}
      <button
        onClick={e => { e.stopPropagation(); onClose() }}
        className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
        style={{
          color: 'var(--text-muted)',
          background: 'transparent',
          opacity: hovered || isActive ? 1 : 0.3,
          transition: 'opacity 0.1s'
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <X size={12} />
      </button>
    </div>
  )
}
