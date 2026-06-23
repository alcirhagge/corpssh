import { useState } from 'react'
import { Monitor, List, FileDown, Settings, Terminal, KeyRound, Cloud, Code2, Network } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { NavPage } from '../../types'

const NAV_ITEMS: { id: NavPage; label: string; icon: React.ReactNode }[] = [
  { id: 'hosts',  label: 'Hosts',  icon: <Monitor size={15} /> },
  { id: 'vault',  label: 'Vault',  icon: <KeyRound size={15} /> },
  { id: 'snippets', label: 'Snippets', icon: <Code2 size={15} /> },
  { id: 'tunnels', label: 'Tunnels', icon: <Network size={15} /> },
  { id: 'logs',   label: 'Logs',   icon: <List size={15} /> },
  { id: 'export', label: 'Export', icon: <FileDown size={15} /> },
  { id: 'cloud',  label: 'Cloud',  icon: <Cloud size={15} /> },
]

export default function Sidebar() {
  const { activePage, setActivePage, tabs, setRightPanel, setActiveTab } = useAppStore()
  const isLive = (t: { status: string }) => t.status === 'connected' || t.status === 'connecting'
  const normalTabs = tabs.filter((t) => (t.kind ?? 'normal') === 'normal')
  const scriptTabs = tabs.filter((t) => t.kind === 'script')
  const normalCount = normalTabs.filter(isLive).length
  const scriptCount = scriptTabs.filter(isLive).length

  // Switch page AND make sure the active tab belongs to that strip
  const openStrip = (page: 'terminal' | 'scripts', stripTabs: typeof tabs) => {
    setActivePage(page)
    if (!stripTabs.some((t) => t.id === useAppStore.getState().activeTabId) && stripTabs.length > 0) {
      setActiveTab(stripTabs[stripTabs.length - 1].id)
    }
  }

  return (
    <div
      className="flex flex-col h-full select-none cs-glass"
      style={{ width: 168, background: 'var(--sidebar-bg)', borderRight: '1px solid var(--glass-border)', flexShrink: 0 }}
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

        {(normalCount > 0 || scriptCount > 0) && (
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 6px' }} />
        )}
        {normalCount > 0 && (
          <NavItem
            icon={<Terminal size={15} />}
            label="Terminal"
            active={activePage === 'terminal'}
            badge={normalCount}
            onClick={() => openStrip('terminal', normalTabs)}
          />
        )}
        {scriptCount > 0 && (
          <NavItem
            icon={<Code2 size={15} />}
            label="Scripts"
            active={activePage === 'scripts'}
            badge={scriptCount}
            onClick={() => openStrip('scripts', scriptTabs)}
          />
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
