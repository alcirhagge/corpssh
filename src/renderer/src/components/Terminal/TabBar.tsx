import { useState, useRef, useEffect, useMemo } from 'react'
import { Terminal, FolderOpen, Plus, Search, X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { Tab, Server } from '../../types'
import { HOST_ICON_COLORS } from '../../types'

interface TabBarProps {
  onCloseTab: (tab: Tab) => void
  onNewTab: (tab: Tab) => void
  onToggleSftp: (tabId: string) => void
  onConnectServer: (server: Server) => void
}

interface CtxMenu { tabId: string; x: number; y: number }

export default function TabBar({ onCloseTab, onNewTab, onToggleSftp, onConnectServer }: TabBarProps) {
  const { tabs, activeTabId, setActiveTab } = useAppStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => { window.removeEventListener('click', close); window.removeEventListener('blur', close) }
  }, [])

  if (tabs.length === 0) return null

  const ctxTab = ctxMenu ? tabs.find((t) => t.id === ctxMenu.tabId) : null

  return (
    <>
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
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setCtxMenu({ tabId: tab.id, x: e.clientX, y: e.clientY })
            }}
          />
        ))}

        {/* Nova conexão */}
        <button
          onClick={() => setShowPicker(true)}
          title="New connection"
          className="flex items-center justify-center h-full px-3 flex-shrink-0"
          style={{ color: 'var(--text-muted)', background: 'transparent' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <Plus size={15} />
        </button>

        {/* Context menu */}
        {ctxMenu && ctxTab && (
          <div
            className="fixed z-50 rounded-lg py-1 shadow-2xl animate-fade-in"
            style={{
              left: ctxMenu.x,
              top: ctxMenu.y,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              minWidth: 180
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {ctxTab.status === 'connected' && (
              <CtxItem
                label={ctxTab.mode === 'sftp' ? 'Switch to Terminal' : 'Open SFTP'}
                icon={ctxTab.mode === 'sftp' ? '⌨' : '📁'}
                onClick={() => { onToggleSftp(ctxTab.id); setCtxMenu(null) }}
              />
            )}
            <CtxItem
              label="New terminal (same server)"
              icon="＋"
              onClick={() => { onNewTab(ctxTab); setCtxMenu(null) }}
            />
            <div style={{ height: 1, margin: '3px 8px', background: 'var(--border)' }} />
            <CtxItem
              label="Close tab"
              icon="✕"
              onClick={() => { onCloseTab(ctxTab); setCtxMenu(null) }}
              danger
            />
          </div>
        )}
      </div>

      {/* Server picker modal */}
      {showPicker && (
        <ServerPickerModal
          activeServerId={activeTab?.serverId ?? ''}
          onSelect={(server) => { onConnectServer(server); setShowPicker(false) }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  )
}

// ─── Server Picker Modal ──────────────────────────────────────────────────────

function ServerPickerModal({ activeServerId, onSelect, onClose }: {
  activeServerId: string
  onSelect: (server: Server) => void
  onClose: () => void
}) {
  const { servers, groups } = useAppStore()
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return servers
    const q = search.toLowerCase()
    return servers.filter(
      (s) => s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q) || (s.username ?? '').toLowerCase().includes(q)
    )
  }, [servers, search])

  const byGroup = useMemo(() => {
    const map = new Map<string, Server[]>()
    map.set('__none__', [])
    groups.forEach((g) => map.set(g.id, []))
    filtered.forEach((s) => {
      const key = s.groupId && map.has(s.groupId) ? s.groupId : '__none__'
      map.get(key)!.push(s)
    })
    return map
  }, [filtered, groups])

  const sections: { label: string; items: Server[] }[] = []
  groups.forEach((g) => {
    const items = byGroup.get(g.id) ?? []
    if (items.length) sections.push({ label: g.name, items })
  })
  const ungrouped = byGroup.get('__none__') ?? []
  if (ungrouped.length) sections.push({ label: groups.length > 0 ? 'No group' : 'Servers', items: ungrouped })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col rounded-xl shadow-2xl animate-fade-in"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          width: 420,
          maxHeight: '72vh'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
          <span className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: 14 }}>
            New connection
          </span>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded"
            style={{ color: 'var(--text-muted)', background: 'transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="relative px-4 pb-3 flex-shrink-0">
          <Search size={13} className="absolute left-7 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search server..."
            style={{ paddingLeft: 32, fontSize: 13 }}
          />
        </div>

        <div style={{ height: 1, background: 'var(--border-subtle)' }} />

        {/* Server list */}
        <div className="overflow-y-auto flex-1 py-2">
          {sections.length === 0 ? (
            <p className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>
              No servers found
            </p>
          ) : (
            sections.map(({ label, items }) => (
              <div key={label} className="mb-1">
                <p
                  className="px-4 py-1 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}
                >
                  {label}
                </p>
                {items.map((server) => (
                  <ServerPickerItem
                    key={server.id}
                    server={server}
                    isCurrent={server.id === activeServerId}
                    onSelect={() => onSelect(server)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function getIconColor(server: Server): string {
  if (server.color) return server.color
  const idx = server.name.charCodeAt(0) % HOST_ICON_COLORS.length
  return HOST_ICON_COLORS[idx]
}

function ServerPickerItem({ server, isCurrent, onSelect }: {
  server: Server; isCurrent: boolean; onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const color = getIconColor(server)

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
      style={{
        background: isCurrent
          ? 'var(--accent-subtle)'
          : hovered ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 0.1s'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      {/* Color dot */}
      <div
        className="flex-shrink-0 rounded-lg flex items-center justify-center"
        style={{
          width: 32, height: 32,
          background: `linear-gradient(135deg, ${color}, ${color}bb)`,
          fontSize: 11, fontWeight: 700, color: '#fff'
        }}
      >
        {server.name.slice(0, 2).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate" style={{ color: 'var(--text-primary)', fontSize: 13 }}>
            {server.name}
          </p>
          {isCurrent && (
            <span
              className="px-1.5 rounded text-xs font-semibold flex-shrink-0"
              style={{ background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: 10 }}
            >
              current
            </span>
          )}
        </div>
        <p className="truncate" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {server.username ? `${server.username}@` : ''}{server.host}:{server.port}
        </p>
      </div>

      <span
        className="flex-shrink-0 px-2 py-0.5 rounded font-mono font-bold"
        style={{
          fontSize: 9,
          background: 'var(--bg-active)',
          color: server.protocol === 'ssh' ? 'var(--success)' : server.protocol === 'rdp' ? 'var(--accent)' : 'var(--purple)'
        }}
      >
        {(server.protocol ?? 'ssh').toUpperCase()}
      </span>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function CtxItem({ label, icon, onClick, danger }: {
  label: string; icon: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left"
      style={{
        background: 'transparent', borderRadius: 0,
        color: danger ? 'var(--error)' : 'var(--text-primary)',
        fontSize: 13
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? 'var(--error-subtle)' : 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontSize: 11, opacity: 0.7, width: 14, textAlign: 'center' }}>{icon}</span>
      {label}
    </button>
  )
}

function TabItem({
  tab, isActive, onClick, onClose, onToggleSftp, onContextMenu
}: {
  tab: Tab; isActive: boolean; onClick: () => void; onClose: () => void; onToggleSftp: () => void
  onContextMenu: (e: React.MouseEvent) => void
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
        transition: 'background 0.1s'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      title="Click: activate · Double-click: close · Right-click: options"
    >
      {isActive && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ background: 'var(--accent)' }}
        />
      )}

      <button
        onClick={(e) => {
          e.stopPropagation()
          if (tab.status === 'connected') onToggleSftp()
        }}
        title={tab.mode === 'sftp' ? 'Switch to Terminal (click)' : 'Open SFTP (click)'}
        className="flex items-center gap-1 flex-shrink-0"
        style={{
          color: tab.mode === 'sftp' ? 'var(--purple, #8b5cf6)' : 'var(--accent)',
          background: tab.mode === 'sftp' ? 'rgba(139,92,246,0.12)' : 'rgba(var(--accent-rgb, 59,130,246),0.10)',
          border: `1px solid ${tab.mode === 'sftp' ? 'rgba(139,92,246,0.45)' : 'rgba(var(--accent-rgb,59,130,246),0.40)'}`,
          borderRadius: 5,
          padding: '2px 6px',
          fontSize: 10,
          fontWeight: 700,
          fontFamily: 'monospace',
          opacity: tab.status === 'connected' ? 1 : 0.35,
          cursor: tab.status === 'connected' ? 'pointer' : 'default',
          transition: 'opacity 0.15s, background 0.15s',
          letterSpacing: '0.02em'
        }}
        onMouseEnter={(e) => {
          if (tab.status === 'connected') {
            e.currentTarget.style.opacity = '0.8'
            e.currentTarget.style.filter = 'brightness(1.2)'
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = tab.status === 'connected' ? '1' : '0.35'
          e.currentTarget.style.filter = ''
        }}
      >
        {tab.mode === 'sftp' ? <FolderOpen size={11} /> : <Terminal size={11} />}
        <span>{tab.mode === 'sftp' ? 'SFTP' : 'SSH'}</span>
      </button>

      <div
        className="flex-shrink-0 rounded-full"
        style={{ width: 7, height: 7, background: statusColor }}
      />

      <span style={{
        fontSize: 13,
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        whiteSpace: 'nowrap'
      }}>
        {tab.serverName}
      </span>
    </div>
  )
}
