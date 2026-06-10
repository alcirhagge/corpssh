import { useState } from 'react'
import { Monitor, List, FileDown, Settings, Terminal, KeyRound } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { NavPage } from '../../types'

const NAV_ITEMS: { id: NavPage; label: string; icon: React.ReactNode }[] = [
  { id: 'hosts',  label: 'Hosts',  icon: <Monitor size={15} /> },
  { id: 'vault',  label: 'Vault',  icon: <KeyRound size={15} /> },
  { id: 'logs',   label: 'Logs',   icon: <List size={15} /> },
  { id: 'export', label: 'Export', icon: <FileDown size={15} /> },
]

export default function Sidebar() {
  const { activePage, setActivePage, tabs, setRightPanel } = useAppStore()
  const activeSessions = tabs.filter((t) => t.status === 'connected' || t.status === 'connecting').length

  return (
    <div
      className="flex flex-col h-full select-none"
      style={{ width: 168, background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border-subtle)', flexShrink: 0 }}
    >
      {/* Nav */}
      <div className="flex flex-col gap-0.5 p-2 flex-1">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activePage === item.id}
            onClick={() => { setActivePage(item.id); setRightPanel(null) }}
          />
        ))}

        {activeSessions > 0 && (
          <>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 6px' }} />
            <NavItem
              icon={<Terminal size={15} />}
              label="Terminal"
              active={activePage === 'terminal'}
              badge={activeSessions}
              onClick={() => setActivePage('terminal')}
            />
          </>
        )}
      </div>

      {/* Settings at bottom */}
      <div className="p-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <NavItem
          icon={<Settings size={15} />}
          label="Settings"
          active={activePage === 'keys'}
          onClick={() => setActivePage('keys')}
        />
      </div>
    </div>
  )
}

function NavItem({ icon, label, active, badge, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; badge?: number; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg relative"
      style={{
        background: active ? 'var(--bg-active)' : hovered ? 'var(--bg-hover)' : 'transparent',
        color: active ? 'var(--text-primary)' : hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: active ? 600 : 400,
        fontSize: 13,
        textAlign: 'left',
        transition: 'background 0.12s, color 0.12s'
      }}
    >
      {active && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
          style={{ width: 3, height: 16, background: 'var(--accent)' }}
        />
      )}
      <span style={{ color: active ? 'var(--accent)' : 'inherit', flexShrink: 0 }}>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className="rounded-full px-1.5 text-center"
          style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, minWidth: 18, lineHeight: '18px' }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}
