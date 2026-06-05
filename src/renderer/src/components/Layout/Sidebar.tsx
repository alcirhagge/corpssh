import { useState } from 'react'
import { Server, Key, List, FileDown, Settings, Terminal, MonitorCheck } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { NavPage } from '../../types'

const NAV_ITEMS: { id: NavPage; label: string; icon: React.ReactNode }[] = [
  { id: 'hosts',    label: 'Hosts',    icon: <Server size={16} /> },
  { id: 'keys',     label: 'Keychain', icon: <Key size={16} /> },
  { id: 'logs',     label: 'Logs',     icon: <List size={16} /> },
  { id: 'export',   label: 'Export',   icon: <FileDown size={16} /> },
]

export default function Sidebar() {
  const { activePage, setActivePage, tabs, setRightPanel } = useAppStore()
  const activeSessions = tabs.filter((t) => t.status === 'connected' || t.status === 'connecting').length

  return (
    <div
      className="flex flex-col h-full py-2 select-none"
      style={{
        width: 160,
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border-subtle)',
        flexShrink: 0
      }}
    >
      {/* Main nav */}
      <div className="flex flex-col gap-0.5 px-2 flex-1">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activePage === item.id}
            onClick={() => {
              setActivePage(item.id)
              setRightPanel(null)
            }}
          />
        ))}

        {/* Active sessions */}
        {activeSessions > 0 && (
          <>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 4px' }} />
            <NavItem
              icon={<Terminal size={16} />}
              label="Terminal"
              active={activePage === 'terminal'}
              badge={activeSessions}
              onClick={() => setActivePage('terminal')}
            />
          </>
        )}
      </div>

      {/* Bottom: Settings */}
      <div className="px-2">
        <div style={{ height: 1, background: 'var(--border-subtle)', marginBottom: 6 }} />
        <NavItem
          icon={<Settings size={16} />}
          label="Settings"
          active={false}
          onClick={() => setActivePage('hosts')}
        />
      </div>
    </div>
  )
}

function NavItem({
  icon, label, active, badge, onClick
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md relative"
      style={{
        background: active ? 'var(--bg-active)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: active ? 500 : 400,
        textAlign: 'left'
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--bg-hover)'
        if (!active) e.currentTarget.style.color = 'var(--text-primary)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
        if (!active) e.currentTarget.style.color = 'var(--text-secondary)'
      }}
    >
      {/* Active indicator bar */}
      {active && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
          style={{ width: 3, height: 18, background: 'var(--accent)' }}
        />
      )}
      <span style={{ color: active ? 'var(--accent)' : 'inherit', flexShrink: 0 }}>{icon}</span>
      <span className="text-xs flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className="text-xs px-1.5 rounded-full"
          style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, minWidth: 18, textAlign: 'center' }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}
