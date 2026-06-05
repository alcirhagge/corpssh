import { useState, useMemo } from 'react'
import { Plus, Search, ChevronDown, Grid, List, Terminal, Folder, FolderOpen, MoreHorizontal, Trash2, FolderPlus, Monitor } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { Server as ServerType, Group } from '../../types'
import { HOST_ICON_COLORS } from '../../types'

interface HostDashboardProps {
  onConnect: (server: ServerType) => void
}

function getIconColor(server: ServerType): string {
  if (server.color) return server.color
  const idx = server.name.charCodeAt(0) % HOST_ICON_COLORS.length
  return HOST_ICON_COLORS[idx]
}

function getInitials(name: string): string {
  return name
    .split(/[\s\-_]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export default function HostDashboard({ onConnect }: HostDashboardProps) {
  const { servers, groups, setRightPanel, upsertGroup, removeServer, removeGroup, activePage } = useAppStore()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [groupMenuId, setGroupMenuId] = useState<string | null>(null)
  const [serverMenuId, setServerMenuId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return servers
    const q = search.toLowerCase()
    return servers.filter(
      (s) => s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q) || s.username.toLowerCase().includes(q)
    )
  }, [servers, search])

  const byGroup = useMemo(() => {
    const map = new Map<string, ServerType[]>()
    map.set('__none__', [])
    groups.forEach((g) => map.set(g.id, []))
    filtered.forEach((s) => {
      const key = s.groupId && map.has(s.groupId) ? s.groupId : '__none__'
      map.get(key)!.push(s)
    })
    return map
  }, [filtered, groups])

  const toggleGroup = (id: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleAddGroup = async () => {
    const name = prompt('Nome do grupo:')
    if (!name?.trim()) return
    const saved = await window.api.groups.save({ id: '', name: name.trim() })
    upsertGroup(saved)
  }

  const handleDeleteServer = async (id: string) => {
    await window.api.servers.delete(id)
    removeServer(id)
    setServerMenuId(null)
  }

  const handleDeleteGroup = async (id: string) => {
    await window.api.groups.delete(id)
    removeGroup(id)
    setGroupMenuId(null)
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-app)' }}
      onClick={() => { setGroupMenuId(null); setServerMenuId(null) }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
      >
        {/* Search */}
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar host ou ssh user@hostname..."
            style={{ paddingLeft: 32, background: 'var(--bg-input)', fontSize: 12 }}
          />
        </div>

        {/* New Host */}
        <button
          onClick={() => setRightPanel({ mode: 'new' })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
        >
          <Plus size={13} />
          New Host
        </button>

        {/* Add Group */}
        <button
          onClick={handleAddGroup}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          title="Novo Grupo"
        >
          <FolderPlus size={13} />
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* View toggle */}
        {(['grid', 'list'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className="flex items-center justify-center w-7 h-7 rounded"
            style={{
              background: viewMode === mode ? 'var(--bg-active)' : 'transparent',
              color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-muted)'
            }}
          >
            {mode === 'grid' ? <Grid size={13} /> : <List size={13} />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {servers.length === 0 && !search ? (
          <EmptyState onAdd={() => setRightPanel({ mode: 'new' })} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2" style={{ color: 'var(--text-muted)' }}>
            <Search size={28} />
            <p className="text-sm">Nenhum resultado para "{search}"</p>
          </div>
        ) : (
          <>
            {/* Groups */}
            {groups.map((group) => {
              const items = byGroup.get(group.id) ?? []
              if (items.length === 0 && search) return null
              const collapsed = collapsedGroups.has(group.id)
              return (
                <div key={group.id} className="mb-5">
                  <GroupHeader
                    group={group}
                    count={items.length}
                    collapsed={collapsed}
                    onToggle={() => toggleGroup(group.id)}
                    onAddHost={() => setRightPanel({ mode: 'new', groupId: group.id })}
                    onDelete={() => handleDeleteGroup(group.id)}
                    menuOpen={groupMenuId === group.id}
                    onMenuOpen={(e) => { e.stopPropagation(); setGroupMenuId(group.id) }}
                    onMenuClose={() => setGroupMenuId(null)}
                  />
                  {!collapsed && (
                    <HostGrid
                      servers={items}
                      viewMode={viewMode}
                      onConnect={onConnect}
                      onEdit={(s) => setRightPanel({ mode: 'edit', server: s })}
                      onDelete={handleDeleteServer}
                      menuOpenId={serverMenuId}
                      onMenuOpen={(id, e) => { e.stopPropagation(); setServerMenuId(id) }}
                      onMenuClose={() => setServerMenuId(null)}
                    />
                  )}
                </div>
              )
            })}

            {/* Ungrouped */}
            {(() => {
              const items = byGroup.get('__none__') ?? []
              if (items.length === 0) return null
              const label = groups.length > 0 ? 'Sem grupo' : 'Hosts'
              return (
                <div className="mb-5">
                  <SectionLabel label={label} count={items.length} />
                  <HostGrid
                    servers={items}
                    viewMode={viewMode}
                    onConnect={onConnect}
                    onEdit={(s) => setRightPanel({ mode: 'edit', server: s })}
                    onDelete={handleDeleteServer}
                    menuOpenId={serverMenuId}
                    onMenuOpen={(id, e) => { e.stopPropagation(); setServerMenuId(id) }}
                    onMenuClose={() => setServerMenuId(null)}
                  />
                </div>
              )
            })()}
          </>
        )}
      </div>
    </div>
  )
}

function GroupHeader({ group, count, collapsed, onToggle, onAddHost, onDelete, menuOpen, onMenuOpen, onMenuClose }: {
  group: Group; count: number; collapsed: boolean
  onToggle: () => void; onAddHost: () => void; onDelete: () => void
  menuOpen: boolean; onMenuOpen: (e: React.MouseEvent) => void; onMenuClose: () => void
}) {
  return (
    <div className="flex items-center gap-2 mb-2 relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 flex-1"
        style={{ background: 'none', color: 'var(--text-secondary)' }}
      >
        <span style={{ color: group.color ?? 'var(--text-muted)' }}>
          {collapsed ? <Folder size={14} /> : <FolderOpen size={14} />}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider">{group.name}</span>
        <span
          className="text-xs px-1.5 rounded"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 10 }}
        >
          {count}
        </span>
        <ChevronDown
          size={12}
          style={{ color: 'var(--text-muted)', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }}
        />
      </button>
      <button
        onClick={onMenuOpen}
        className="flex items-center justify-center w-6 h-6 rounded"
        style={{ color: 'var(--text-muted)', background: 'transparent' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <MoreHorizontal size={13} />
      </button>
      {menuOpen && (
        <DropMenu onClose={onMenuClose} items={[
          { label: '+ Adicionar Host', onClick: onAddHost },
          { label: 'Excluir Grupo', onClick: onDelete, danger: true }
        ]} />
      )}
    </div>
  )
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span
        className="font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.1em' }}
      >
        {label}
      </span>
      <span
        className="rounded-full px-1.5"
        style={{ background: 'var(--bg-active)', color: 'var(--text-muted)', fontSize: 10, lineHeight: '16px' }}
      >
        {count}
      </span>
    </div>
  )
}

function HostGrid({ servers, viewMode, onConnect, onEdit, onDelete, menuOpenId, onMenuOpen, onMenuClose }: {
  servers: ServerType[]
  viewMode: 'grid' | 'list'
  onConnect: (s: ServerType) => void
  onEdit: (s: ServerType) => void
  onDelete: (id: string) => void
  menuOpenId: string | null
  onMenuOpen: (id: string, e: React.MouseEvent) => void
  onMenuClose: () => void
}) {
  if (viewMode === 'grid') {
    return (
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {servers.map((s) => (
          <HostCard
            key={s.id}
            server={s}
            onConnect={() => onConnect(s)}
            onEdit={() => onEdit(s)}
            onDelete={() => onDelete(s.id)}
            menuOpen={menuOpenId === s.id}
            onMenuOpen={(e) => onMenuOpen(s.id, e)}
            onMenuClose={onMenuClose}
          />
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {servers.map((s) => (
        <HostRow
          key={s.id}
          server={s}
          onConnect={() => onConnect(s)}
          onEdit={() => onEdit(s)}
          onDelete={() => onDelete(s.id)}
          menuOpen={menuOpenId === s.id}
          onMenuOpen={(e) => onMenuOpen(s.id, e)}
          onMenuClose={onMenuClose}
        />
      ))}
    </div>
  )
}

function HostCard({ server, onConnect, onEdit, onDelete, menuOpen, onMenuOpen, onMenuClose }: {
  server: ServerType
  onConnect: () => void
  onEdit: () => void
  onDelete: () => void
  menuOpen: boolean
  onMenuOpen: (e: React.MouseEvent) => void
  onMenuClose: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const color = getIconColor(server)
  const initials = getInitials(server.name)

  return (
    <div
      className="relative rounded-xl cursor-pointer overflow-hidden"
      style={{
        background: hovered ? 'var(--bg-elevated)' : 'var(--bg-card)',
        border: `1px solid ${hovered ? color + '55' : 'var(--border)'}`,
        boxShadow: hovered ? `0 4px 20px rgba(0,0,0,0.25), 0 0 0 1px ${color}22` : '0 1px 4px rgba(0,0,0,0.15)',
        transition: 'all 0.18s ease'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onConnect}
    >
      {/* Color accent line at top */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, ${color}66)` }} />

      <div className="p-3.5">
        <div className="flex items-start justify-between mb-3">
          <div
            className="host-icon"
            style={{
              width: 42, height: 42,
              background: `linear-gradient(145deg, ${color}dd, ${color}88)`,
              boxShadow: `0 4px 12px ${color}44`,
              fontSize: 13, fontWeight: 700, borderRadius: 10
            }}
          >
            {initials}
          </div>
          <div className="flex items-center gap-1">
            {hovered && (
              <button
                onClick={(e) => { e.stopPropagation(); onConnect() }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium"
                style={{ background: 'var(--accent)', color: '#fff', fontSize: 11 }}
              >
                <Terminal size={10} />
                SSH
              </button>
            )}
            <button
              onClick={onMenuOpen}
              className="flex items-center justify-center w-6 h-6 rounded-md"
              style={{ color: hovered ? 'var(--text-secondary)' : 'var(--text-muted)', background: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-active)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <MoreHorizontal size={13} />
            </button>
          </div>
        </div>

        <div className="min-w-0">
          <p className="font-semibold truncate mb-0.5" style={{ color: 'var(--text-primary)', fontSize: 13 }}>
            {server.name}
          </p>
          <p className="truncate" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
            {server.username}@{server.host}
          </p>
          <p className="truncate" style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
            SSH · port {server.port}
          </p>
        </div>
      </div>

      {menuOpen && (
        <DropMenu onClose={onMenuClose} items={[
          { label: 'Conectar', onClick: onConnect },
          { label: 'Editar', onClick: onEdit },
          { label: 'Excluir', onClick: onDelete, danger: true }
        ]} />
      )}
    </div>
  )
}

function HostRow({ server, onConnect, onEdit, onDelete, menuOpen, onMenuOpen, onMenuClose }: {
  server: ServerType; onConnect: () => void; onEdit: () => void; onDelete: () => void
  menuOpen: boolean; onMenuOpen: (e: React.MouseEvent) => void; onMenuClose: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const color = getIconColor(server)

  return (
    <div
      className="relative flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer"
      style={{
        background: hovered ? 'var(--bg-elevated)' : 'var(--bg-card)',
        border: `1px solid ${hovered ? 'var(--accent)' : 'var(--border)'}`,
        transition: 'all 0.12s'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onConnect}
    >
      <div
        className="host-icon"
        style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${color}, ${color}bb)`, fontSize: 11 }}
      >
        {getInitials(server.name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{server.name}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
          ssh, {server.username}@{server.host}
        </p>
      </div>
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onConnect() }}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Terminal size={11} />SSH
        </button>
      )}
      <button
        onClick={onMenuOpen}
        className="flex items-center justify-center w-6 h-6 rounded"
        style={{ color: 'var(--text-muted)', background: 'transparent' }}
      >
        <MoreHorizontal size={13} />
      </button>
      {menuOpen && (
        <DropMenu onClose={onMenuClose} items={[
          { label: 'Conectar', onClick: onConnect },
          { label: 'Editar', onClick: onEdit },
          { label: 'Excluir', onClick: onDelete, danger: true }
        ]} />
      )}
    </div>
  )
}

function DropMenu({ items, onClose }: {
  items: { label: string; onClick: () => void; danger?: boolean }[]
  onClose: () => void
}) {
  return (
    <div
      className="absolute right-0 top-7 z-50 rounded-lg py-1 shadow-xl animate-fade-in"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', minWidth: 140 }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => { item.onClick(); onClose() }}
          className="flex w-full px-3 py-1.5 text-xs"
          style={{ color: item.danger ? 'var(--error)' : 'var(--text-primary)', background: 'transparent', borderRadius: 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = item.danger ? 'var(--error-subtle)' : 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
      <div
        className="flex items-center justify-center w-16 h-16 rounded-2xl"
        style={{ background: 'var(--bg-elevated)', border: '2px dashed var(--border)' }}
      >
        <Monitor size={28} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Nenhum host cadastrado</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Adicione o primeiro servidor SSH</p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        <Plus size={13} />
        New Host
      </button>
    </div>
  )
}
