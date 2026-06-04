import { useState, useMemo } from 'react'
import {
  Search, Plus, ChevronRight, ChevronDown, Server, Folder,
  FolderOpen, Key, Settings, Wifi, WifiOff, Clock
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { Server as ServerType, Group } from '../../types'
import { SERVER_COLORS } from '../../types'

interface SidebarProps {
  onConnectServer: (server: ServerType) => void
  onOpenSettings: () => void
  onOpenKeyManager: () => void
  onEditServer: (server: ServerType) => void
  onAddServer: (groupId?: string) => void
}

export default function Sidebar({
  onConnectServer,
  onOpenSettings,
  onOpenKeyManager,
  onEditServer,
  onAddServer
}: SidebarProps) {
  const { servers, groups, tabs } = useAppStore()
  const [search, setSearch] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['__ungrouped__']))
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; server: ServerType
  } | null>(null)

  const activeSessions = useMemo(() => {
    const set = new Set<string>()
    tabs.filter(t => t.status === 'connected').forEach(t => set.add(t.serverId))
    return set
  }, [tabs])

  const filteredServers = useMemo(() => {
    if (!search.trim()) return servers
    const q = search.toLowerCase()
    return servers.filter(
      s => s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q) || s.username.toLowerCase().includes(q)
    )
  }, [servers, search])

  const serversByGroup = useMemo(() => {
    const map = new Map<string, ServerType[]>()
    map.set('__ungrouped__', [])
    groups.forEach(g => map.set(g.id, []))
    filteredServers.forEach(s => {
      const key = s.groupId && map.has(s.groupId) ? s.groupId : '__ungrouped__'
      map.get(key)!.push(s)
    })
    return map
  }, [filteredServers, groups])

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleContextMenu = (e: React.MouseEvent, server: ServerType) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, server })
  }

  const closeContextMenu = () => setContextMenu(null)

  const recentServers = useMemo(() =>
    [...servers]
      .filter(s => s.lastConnected)
      .sort((a, b) => (b.lastConnected ?? 0) - (a.lastConnected ?? 0))
      .slice(0, 3),
    [servers]
  )

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border)', width: 240 }}
      onClick={closeContextMenu}
    >
      {/* Search */}
      <div className="p-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar servidores..."
            className="pl-7 py-1.5 text-xs"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              width: '100%'
            }}
          />
        </div>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Recent (only when not searching) */}
        {!search && recentServers.length > 0 && (
          <SectionHeader icon={<Clock size={11} />} label="Recentes" />
        )}
        {!search && recentServers.map(server => (
          <ServerItem
            key={`recent-${server.id}`}
            server={server}
            isActive={activeSessions.has(server.id)}
            onConnect={() => onConnectServer(server)}
            onContextMenu={handleContextMenu}
          />
        ))}

        {/* Groups */}
        {groups.map(group => {
          const groupServers = serversByGroup.get(group.id) ?? []
          if (groupServers.length === 0 && search) return null
          const expanded = expandedGroups.has(group.id)
          return (
            <div key={group.id}>
              <GroupHeader
                group={group}
                count={groupServers.length}
                expanded={expanded}
                onToggle={() => toggleGroup(group.id)}
                onAddServer={() => onAddServer(group.id)}
              />
              {expanded && groupServers.map(server => (
                <ServerItem
                  key={server.id}
                  server={server}
                  isActive={activeSessions.has(server.id)}
                  onConnect={() => onConnectServer(server)}
                  onContextMenu={handleContextMenu}
                  indent
                />
              ))}
            </div>
          )
        })}

        {/* Ungrouped */}
        {(() => {
          const ungrouped = serversByGroup.get('__ungrouped__') ?? []
          if (ungrouped.length === 0 && groups.length > 0) return null
          const expanded = expandedGroups.has('__ungrouped__')
          return (
            <div>
              {groups.length > 0 && (
                <GroupHeader
                  group={{ id: '__ungrouped__', name: 'Sem grupo' }}
                  count={ungrouped.length}
                  expanded={expanded}
                  onToggle={() => toggleGroup('__ungrouped__')}
                  onAddServer={() => onAddServer(undefined)}
                />
              )}
              {(groups.length === 0 || expanded) && ungrouped.map(server => (
                <ServerItem
                  key={server.id}
                  server={server}
                  isActive={activeSessions.has(server.id)}
                  onConnect={() => onConnectServer(server)}
                  onContextMenu={handleContextMenu}
                  indent={groups.length > 0}
                />
              ))}
            </div>
          )
        })()}

        {servers.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
            <Server size={28} style={{ color: 'var(--text-muted)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Nenhum servidor cadastrado.<br />Clique em + para adicionar.
            </p>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div style={{ borderTop: '1px solid var(--border-subtle)' }} className="p-2 flex flex-col gap-1">
        <SidebarAction icon={<Plus size={13} />} label="Novo Servidor" onClick={() => onAddServer()} />
        <SidebarAction icon={<Key size={13} />} label="Chaves SSH" onClick={onOpenKeyManager} />
        <SidebarAction icon={<Settings size={13} />} label="Configurações" onClick={onOpenSettings} />
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-lg py-1 shadow-xl animate-fade-in"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            minWidth: 160
          }}
          onClick={e => e.stopPropagation()}
        >
          <ContextMenuItem label="Conectar" onClick={() => { onConnectServer(contextMenu.server); closeContextMenu() }} />
          <ContextMenuItem label="Editar" onClick={() => { onEditServer(contextMenu.server); closeContextMenu() }} />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <ContextMenuItem label="Duplicar" onClick={closeContextMenu} />
          <ContextMenuItem label="Excluir" onClick={closeContextMenu} danger />
        </div>
      )}
    </div>
  )
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5">
      <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
        {label}
      </span>
    </div>
  )
}

function GroupHeader({
  group, count, expanded, onToggle, onAddServer
}: {
  group: Group; count: number; expanded: boolean; onToggle: () => void; onAddServer: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  return (
    <div
      className="flex items-center px-2 py-1 cursor-pointer group"
      style={{ gap: 4 }}
      onClick={onToggle}
      onMouseEnter={() => setShowAdd(true)}
      onMouseLeave={() => setShowAdd(false)}
    >
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
        {expanded
          ? <ChevronDown size={11} />
          : <ChevronRight size={11} />
        }
      </span>
      <span style={{ color: group.color ?? 'var(--text-secondary)', flexShrink: 0 }}>
        {expanded ? <FolderOpen size={13} /> : <Folder size={13} />}
      </span>
      <span className="text-xs font-medium flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
        {group.name}
      </span>
      {showAdd && (
        <button
          className="flex items-center justify-center w-4 h-4 rounded"
          onClick={e => { e.stopPropagation(); onAddServer() }}
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <Plus size={10} />
        </button>
      )}
      <span
        className="text-xs px-1 rounded"
        style={{ background: 'var(--bg-active)', color: 'var(--text-muted)', fontSize: 10 }}
      >
        {count}
      </span>
    </div>
  )
}

function ServerItem({
  server, isActive, onConnect, onContextMenu, indent = false
}: {
  server: ServerType
  isActive: boolean
  onConnect: () => void
  onContextMenu: (e: React.MouseEvent, s: ServerType) => void
  indent?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const color = server.color ?? SERVER_COLORS[0]

  return (
    <div
      className="flex items-center px-2 py-1.5 cursor-pointer rounded-md mx-1"
      style={{
        paddingLeft: indent ? 20 : 8,
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 0.1s'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onConnect}
      onContextMenu={e => onContextMenu(e, server)}
    >
      {/* Color indicator */}
      <div className="w-1.5 h-6 rounded-full flex-shrink-0 mr-2" style={{ background: color }} />

      {/* Icon */}
      <span className="flex-shrink-0 mr-2" style={{ color }}>
        <Server size={14} />
      </span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {server.name}
        </div>
        <div className="text-xs truncate" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {server.username}@{server.host}:{server.port}
        </div>
      </div>

      {/* Active indicator */}
      {isActive && (
        <div className="status-dot connected flex-shrink-0" />
      )}
    </div>
  )
}

function SidebarAction({
  icon, label, onClick
}: {
  icon: React.ReactNode; label: string; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors"
      style={{
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        color: hovered ? 'var(--text-primary)' : 'var(--text-secondary)'
      }}
    >
      {icon}
      {label}
    </button>
  )
}

function ContextMenuItem({
  label, onClick, danger = false
}: {
  label: string; onClick: () => void; danger?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex w-full px-3 py-1.5 text-xs"
      style={{
        background: hovered ? (danger ? 'var(--error-subtle)' : 'var(--bg-hover)') : 'transparent',
        color: danger ? 'var(--error)' : 'var(--text-primary)'
      }}
    >
      {label}
    </button>
  )
}
