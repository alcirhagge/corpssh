import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, Search, ChevronDown, Grid, List, Terminal, Folder, FolderOpen, MoreHorizontal, Trash2, FolderPlus, Monitor } from 'lucide-react'
import {
  siUbuntu, siDebian, siCentos, siFedora, siRedhat,
  siArchlinux, siAlpinelinux, siOpensuse, siLinux,
  siRaspberrypi, siCisco, siHuawei, siFreebsd, siEspressif
} from 'simple-icons'

// ─── OS / Device brand icons ──────────────────────────────────────────────────

type SiIcon = { path: string }

function Si({ icon, s = 20 }: { icon: SiIcon; s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" opacity={0.95}>
      <path d={icon.path} />
    </svg>
  )
}

function WinSvg({ s = 20 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" opacity={0.95}>
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
    </svg>
  )
}

function VncSvg({ s = 20 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="3" width="20" height="13" rx="2.5" stroke="white" strokeWidth="1.8" opacity="0.8"/>
      <path d="M8 21h8M12 16v5" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.8"/>
      <circle cx="12" cy="9.5" r="3" fill="white" opacity="0.9"/>
    </svg>
  )
}

// Mikrotik: router icon (no simple-icons entry for this brand in v16)
function MikrotikSvg({ s = 20 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="8" width="20" height="8" rx="2" fill="white" opacity="0.9"/>
      <circle cx="6" cy="12" r="1.2" fill="#000" opacity="0.6"/>
      <circle cx="10" cy="12" r="1.2" fill="#000" opacity="0.6"/>
      <path d="M15 12h4" stroke="#000" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <path d="M12 8V5M8 8V5M16 8V5" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity="0.8"/>
      <path d="M12 16v3M8 16v3M16 16v3" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity="0.8"/>
    </svg>
  )
}

// OLT / generic network appliance: globe icon
function NetworkGlobeSvg({ s = 20 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.5" opacity="0.9"/>
      <ellipse cx="12" cy="12" rx="4.5" ry="9" stroke="white" strokeWidth="1.2" opacity="0.8"/>
      <path d="M3.5 8.5h17M3.5 15.5h17" stroke="white" strokeWidth="1.2" opacity="0.8"/>
    </svg>
  )
}

// Juniper Networks: minimal leaf/network icon
function JuniperSvg({ s = 20 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9z" stroke="white" strokeWidth="1.5" opacity="0.9"/>
      <path d="M12 7v5l3 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity="0.9"/>
      <circle cx="12" cy="12" r="1.5" fill="white" opacity="0.9"/>
    </svg>
  )
}

// Fortinet: shield icon
function FortinetSvg({ s = 20 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z" fill="white" opacity="0.9"/>
      <path d="M9 12h6M12 9v6" stroke="#EE2D24" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

// pfSense/OPNsense: firewall icon
function PfsenseSvg({ s = 20 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="white" strokeWidth="1.5" opacity="0.9"/>
      <path d="M2 9h20M7 4v5M12 4v5M17 4v5" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.8"/>
      <circle cx="8" cy="14" r="1.2" fill="white" opacity="0.9"/>
      <circle cx="12" cy="14" r="1.2" fill="white" opacity="0.9"/>
      <circle cx="16" cy="14" r="1.2" fill="white" opacity="0.9"/>
    </svg>
  )
}

type OsIconFn = (props: { s?: number }) => JSX.Element

function siIcon(si: SiIcon): OsIconFn {
  return ({ s = 20 }) => <Si icon={si} s={s} />
}

export const OS_MAP: Record<string, { color: string; Icon: OsIconFn }> = {
  // Linux distros
  ubuntu:       { color: '#E95420', Icon: siIcon(siUbuntu) },
  debian:       { color: '#A81D33', Icon: siIcon(siDebian) },
  centos:       { color: '#262577', Icon: siIcon(siCentos) },
  fedora:       { color: '#3C6EB4', Icon: siIcon(siFedora) },
  rhel:         { color: '#CC0000', Icon: siIcon(siRedhat) },
  arch:         { color: '#1793D1', Icon: siIcon(siArchlinux) },
  alpine:       { color: '#0D597F', Icon: siIcon(siAlpinelinux) },
  suse:         { color: '#73BA25', Icon: siIcon(siOpensuse) },
  linux:        { color: '#F7B731', Icon: siIcon(siLinux) },
  freebsd:      { color: '#AB2B28', Icon: siIcon(siFreebsd) },
  // Embedded / SBC
  raspberrypi:  { color: '#A22846', Icon: siIcon(siRaspberrypi) },
  espressif:    { color: '#E7352C', Icon: siIcon(siEspressif) },
  // Network devices
  mikrotik:     { color: '#293239', Icon: MikrotikSvg },
  huawei:       { color: '#CF0A2C', Icon: siIcon(siHuawei) },
  cisco:        { color: '#1BA0D7', Icon: siIcon(siCisco) },
  juniper:      { color: '#84B135', Icon: JuniperSvg },
  fortinet:     { color: '#EE2D24', Icon: FortinetSvg },
  pfsense:      { color: '#212121', Icon: PfsenseSvg },
  olt:          { color: '#0077B6', Icon: NetworkGlobeSvg },
  furukawa:     { color: '#0077B6', Icon: NetworkGlobeSvg },
  // Remote protocols
  windows:      { color: '#0078D4', Icon: WinSvg },
  vnc:          { color: '#6B46C1', Icon: VncSvg },
}

// Curated, user-pickable icons (manual override). Order = display order in the picker.
export const ICON_CHOICES: { key: string; label: string }[] = [
  { key: 'huawei', label: 'Huawei' },
  { key: 'mikrotik', label: 'MikroTik' },
  { key: 'cisco', label: 'Cisco' },
  { key: 'juniper', label: 'Juniper' },
  { key: 'fortinet', label: 'Fortinet' },
  { key: 'pfsense', label: 'pfSense' },
  { key: 'olt', label: 'OLT / Fiber' },
  { key: 'ubuntu', label: 'Ubuntu' },
  { key: 'debian', label: 'Debian' },
  { key: 'centos', label: 'CentOS' },
  { key: 'fedora', label: 'Fedora' },
  { key: 'rhel', label: 'Red Hat' },
  { key: 'arch', label: 'Arch' },
  { key: 'alpine', label: 'Alpine' },
  { key: 'suse', label: 'SUSE' },
  { key: 'freebsd', label: 'FreeBSD' },
  { key: 'linux', label: 'Linux' },
  { key: 'raspberrypi', label: 'Raspberry Pi' },
  { key: 'espressif', label: 'ESP / IoT' },
  { key: 'windows', label: 'Windows' },
]

// Detection: returns brand color + icon component for a server
// groupName: name of the group this server belongs to (used as extra hint)
export function getOsInfo(
  server: { name: string; host: string; protocol?: string; detectedOs?: string; iconOverride?: string },
  groupName?: string
): { color: string; Icon: OsIconFn } {
  // Manual override always wins — also fixes legacy devices that auto-detect wrong
  if (server.iconOverride && OS_MAP[server.iconOverride]) return OS_MAP[server.iconOverride]

  const proto = server.protocol ?? 'ssh'

  if (proto === 'vnc') return OS_MAP.vnc
  if (proto === 'rdp') return OS_MAP.windows

  // Combine name + host + group name for heuristic matching
  const q = (server.name + ' ' + server.host + ' ' + (groupName ?? '')).toLowerCase()

  // Network device / OLT overrides — checked BEFORE detectedOs because 'linux'
  // is the weakest fallback and persists incorrectly on network appliances
  if (/\bolt\b/.test(q) || q.startsWith('olt') || q.includes('-olt'))     return OS_MAP.olt
  if (q.includes('furukawa') || q.includes('fiberlink'))                   return OS_MAP.olt
  if (q.includes('mikrotik') || q.includes('routeros'))                    return OS_MAP.mikrotik
  if (q.includes('cisco') && !q.includes('linux'))                         return OS_MAP.cisco
  if (q.includes('huawei') && !q.includes('linux'))                        return OS_MAP.huawei

  // Use SSH-detected OS if it's a specific value (not the 'linux' catch-all)
  if (server.detectedOs && server.detectedOs !== 'linux' && OS_MAP[server.detectedOs])
    return OS_MAP[server.detectedOs]

  // Remaining name heuristics
  if (q.includes('raspberry') || q.includes('rpi'))                        return OS_MAP.raspberrypi
  if (q.includes('esp32') || q.includes('espressif'))                      return OS_MAP.espressif
  if (q.includes('freebsd'))                                                return OS_MAP.freebsd
  if (q.includes('windows') || /\bws-/.test(q) || /\bwin\b/.test(q))      return OS_MAP.windows
  if (q.includes('ubuntu'))                                                  return OS_MAP.ubuntu
  if (q.includes('debian'))                                                  return OS_MAP.debian
  if (q.includes('centos'))                                                  return OS_MAP.centos
  if (q.includes('fedora'))                                                  return OS_MAP.fedora
  if (q.includes('rhel') || q.includes('redhat') || q.includes('red-hat')) return OS_MAP.rhel
  if (q.includes('arch'))                                                    return OS_MAP.arch
  if (q.includes('alpine'))                                                  return OS_MAP.alpine
  if (q.includes('suse') || q.includes('opensuse'))                         return OS_MAP.suse

  // detectedOs: 'linux' as last resort
  if (server.detectedOs && OS_MAP[server.detectedOs]) return OS_MAP[server.detectedOs]

  return OS_MAP.linux
}
import { useAppStore } from '../../store/appStore'
import type { Server as ServerType, Group } from '../../types'
import { HOST_ICON_COLORS } from '../../types'

interface HostDashboardProps {
  onConnect: (server: ServerType) => void
  onConnectSftp: (server: ServerType) => void
}

let savedScrollTop = 0

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

const PANEL_WIDTH = 284  // HostForm width + border
const CARD_MIN   = 260  // minimum card width
const GRID_GAP   =  12  // gap-3 = 12px
const GRID_PAD   =  32  // padding 16px each side

export default function HostDashboard({ onConnect, onConnectSftp }: HostDashboardProps) {
  const { servers, groups, setGroups, setRightPanel, rightPanel, upsertGroup, removeServer, removeGroup, activePage } = useAppStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')

  const panelOpen = rightPanel !== null

  // Force re-render on window resize so the grid recalculates
  const [, setResizeTick] = useState(0)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onResize = () => { clearTimeout(timer); timer = setTimeout(() => setResizeTick(t => t + 1), 150) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); clearTimeout(timer) }
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = savedScrollTop
  }, [])
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('hostViewMode') as 'grid' | 'list') ?? 'grid'
  )
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [groupMenuId, setGroupMenuId] = useState<string | null>(null)
  const [serverMenuId, setServerMenuId] = useState<string | null>(null)
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')

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

  const handleAddGroup = async (name: string) => {
    const saved = await window.api.groups.save({ id: '', name })
    upsertGroup(saved)
  }

  const commitNewGroup = async () => {
    const name = newGroupName.trim()
    if (name) await handleAddGroup(name)
    setNewGroupName('')
    setAddingGroup(false)
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

  const handleStartEditGroup = (group: Group) => {
    setEditingGroupId(group.id)
    setEditingGroupName(group.name)
    setGroupMenuId(null)
  }

  const handleCommitEditGroup = async () => {
    const name = editingGroupName.trim()
    if (name && editingGroupId) {
      const group = groups.find((g) => g.id === editingGroupId)
      if (group && name !== group.name) {
        const updated = { ...group, name }
        await window.api.groups.save(updated)
        upsertGroup(updated)
      }
    }
    setEditingGroupId(null)
    setEditingGroupName('')
  }

  const handleGroupDragStart = (id: string) => setDraggingGroupId(id)
  const handleGroupDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (id !== draggingGroupId) setDragOverGroupId(id)
  }
  const handleGroupDragEnd = () => { setDraggingGroupId(null); setDragOverGroupId(null) }
  const handleGroupDrop = (targetId: string) => {
    if (!draggingGroupId || draggingGroupId === targetId) return
    const next = [...groups]
    const from = next.findIndex(g => g.id === draggingGroupId)
    const to = next.findIndex(g => g.id === targetId)
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setGroups(next)
    next.forEach((g, i) => window.api.groups.save({ ...g, sortOrder: i }).catch(() => {}))
    setDraggingGroupId(null)
    setDragOverGroupId(null)
  }

  // Compute card minWidth directly in render — no timing/state issues.
  // When panel open: find N (cols that fit full width), then compute the minWidth
  // that fits exactly N cols in the reduced space. Subtract 1px safety margin.
  let gridCols: number | undefined
  let scrollPadRight = 16
  if (panelOpen && scrollRef.current) {
    const w = scrollRef.current.offsetWidth
    const N = Math.max(1, Math.floor((w - GRID_PAD + GRID_GAP) / (CARD_MIN + GRID_GAP)))
    const reducedW = w - PANEL_WIDTH - 16
    gridCols = Math.max(80, Math.floor((reducedW - (N - 1) * GRID_GAP) / N) - 1)
    scrollPadRight = PANEL_WIDTH
  }

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden"
      style={{ background: 'var(--bg-app)' }}
      onClick={() => { setGroupMenuId(null); setServerMenuId(null) }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
      >
        {/* Search */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search host or ssh user@hostname..."
            style={{ paddingLeft: 34, background: 'var(--bg-input)', fontSize: 13 }}
          />
        </div>

        {/* New Host */}
        <button
          onClick={() => setRightPanel({ mode: 'new' })}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff', whiteSpace: 'nowrap' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
        >
          <Plus size={15} />
          New Host
        </button>

        {/* Add Group */}
        {addingGroup ? (
          <input
            autoFocus
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitNewGroup() }
              if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') }
            }}
            onBlur={commitNewGroup}
            placeholder="Group name..."
            style={{ width: 140, fontSize: 13, padding: '5px 10px' }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setAddingGroup(true) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            title="New Group"
          >
            <FolderPlus size={15} />
          </button>
        )}

        <div style={{ width: 1, height: 22, background: 'var(--border)' }} />

        {/* View toggle */}
        {(['grid', 'list'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => { setViewMode(mode); localStorage.setItem('hostViewMode', mode) }}
            className="flex items-center justify-center w-9 h-9 rounded"
            style={{
              background: viewMode === mode ? 'var(--bg-active)' : 'transparent',
              color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-muted)'
            }}
          >
            {mode === 'grid' ? <Grid size={15} /> : <List size={15} />}
          </button>
        ))}
      </div>

      {/* Content — paddingRight dinâmico quando o painel está aberto */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ padding: 16, paddingRight: scrollPadRight }}
        onScroll={(e) => { savedScrollTop = (e.currentTarget as HTMLDivElement).scrollTop }}
      >
        {servers.length === 0 && !search ? (
          <EmptyState onAdd={() => setRightPanel({ mode: 'new' })} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2" style={{ color: 'var(--text-muted)' }}>
            <Search size={28} />
            <p className="text-sm">No results for "{search}"</p>
          </div>
        ) : (
          <>
            {/* Groups */}
            {groups.map((group) => {
              const items = byGroup.get(group.id) ?? []
              if (items.length === 0 && search) return null
              const collapsed = collapsedGroups.has(group.id)
              return (
                <div
                  key={group.id}
                  className="mb-5"
                  style={{
                    opacity: draggingGroupId === group.id ? 0.4 : 1,
                    outline: dragOverGroupId === group.id ? '2px dashed var(--accent)' : 'none',
                    borderRadius: 8,
                    transition: 'opacity 0.15s'
                  }}
                  onDragOver={(e) => handleGroupDragOver(e, group.id)}
                  onDrop={() => handleGroupDrop(group.id)}
                >
                  <GroupHeader
                    group={group}
                    count={items.length}
                    collapsed={collapsed}
                    onToggle={() => toggleGroup(group.id)}
                    onAddHost={() => setRightPanel({ mode: 'new', groupId: group.id })}
                    onDelete={() => handleDeleteGroup(group.id)}
                    onEdit={() => handleStartEditGroup(group)}
                    editing={editingGroupId === group.id}
                    editingName={editingGroupId === group.id ? editingGroupName : ''}
                    onEditNameChange={(n) => setEditingGroupName(n)}
                    onEditCommit={handleCommitEditGroup}
                    onEditCancel={() => { setEditingGroupId(null); setEditingGroupName('') }}
                    menuOpen={groupMenuId === group.id}
                    onMenuOpen={(e) => { e.stopPropagation(); setGroupMenuId(group.id) }}
                    onMenuClose={() => setGroupMenuId(null)}
                    onDragStart={() => handleGroupDragStart(group.id)}
                    onDragEnd={handleGroupDragEnd}
                  />
                  {!collapsed && (
                    <HostGrid
                      servers={items}
                      viewMode={viewMode}
                      gridCols={gridCols}
                      onConnect={onConnect}
                      onConnectSftp={onConnectSftp}
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
              const label = groups.length > 0 ? 'No group' : 'Hosts'
              return (
                <div className="mb-5">
                  <SectionLabel label={label} count={items.length} />
                  <HostGrid
                    servers={items}
                    viewMode={viewMode}
                    gridCols={gridCols}
                    onConnect={onConnect}
                    onConnectSftp={onConnectSftp}
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

function GroupHeader({ group, count, collapsed, onToggle, onAddHost, onDelete, onEdit, editing, editingName, onEditNameChange, onEditCommit, onEditCancel, menuOpen, onMenuOpen, onMenuClose, onDragStart, onDragEnd }: {
  group: Group; count: number; collapsed: boolean
  onToggle: () => void; onAddHost: () => void; onDelete: () => void; onEdit: () => void
  editing: boolean; editingName: string
  onEditNameChange: (n: string) => void; onEditCommit: () => void; onEditCancel: () => void
  menuOpen: boolean; onMenuOpen: (e: React.MouseEvent) => void; onMenuClose: () => void
  onDragStart: () => void; onDragEnd: () => void
}) {
  return (
    <div
      className="flex items-center gap-1 mb-2 relative"
      draggable={!editing}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => { if (!editing) { e.preventDefault(); e.stopPropagation(); onMenuOpen(e) } }}
      style={{ cursor: editing ? 'default' : 'grab' }}
    >
      {/* Left: folder icon + name (toggle area) */}
      <button
        onClick={onToggle}
        className="flex items-center gap-2 flex-1 min-w-0"
        style={{ background: 'none', color: 'var(--text-secondary)', cursor: editing ? 'default' : 'grab' }}
        disabled={editing}
      >
        <span style={{ color: group.color ?? 'var(--text-muted)', flexShrink: 0 }}>
          {collapsed ? <Folder size={15} /> : <FolderOpen size={15} />}
        </span>
        {editing ? (
          <input
            autoFocus
            value={editingName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onEditCommit() }
              if (e.key === 'Escape') { e.preventDefault(); onEditCancel() }
            }}
            onBlur={onEditCommit}
            className="font-semibold uppercase"
            style={{ fontSize: 13, flex: 1, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-input)', border: '1px solid var(--accent)', outline: 'none', minWidth: 0 }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="font-semibold uppercase tracking-wider truncate" style={{ fontSize: 13 }}>{group.name}</span>
        )}
        {!editing && (
          <span className="px-1.5 rounded flex-shrink-0" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 12 }}>
            {count}
          </span>
        )}
      </button>

      {/* Right: ... and chevron side by side */}
      {!editing && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onMenuOpen(e) }}
            className="flex items-center justify-center w-6 h-6 rounded"
            style={{ color: 'var(--text-muted)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <MoreHorizontal size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            className="flex items-center justify-center w-6 h-6 rounded"
            style={{ color: 'var(--text-muted)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <ChevronDown size={13} style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
        </>
      )}

      {menuOpen && (
        <DropMenu onClose={onMenuClose} items={[
          { label: '+ Add Host', onClick: onAddHost },
          { label: 'Rename', onClick: onEdit },
          { label: 'Delete Group', onClick: onDelete, danger: true }
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
        style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.1em' }}
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

function HostGrid({ servers, viewMode, onConnect, onConnectSftp, onEdit, onDelete, menuOpenId, onMenuOpen, onMenuClose, gridCols }: {
  servers: ServerType[]
  viewMode: 'grid' | 'list'
  onConnect: (s: ServerType) => void
  onConnectSftp: (s: ServerType) => void
  onEdit: (s: ServerType) => void
  onDelete: (id: string) => void
  menuOpenId: string | null
  onMenuOpen: (id: string, e: React.MouseEvent) => void
  onMenuClose: () => void
  gridCols?: number
}) {
  if (viewMode === 'grid') {
    const cols = gridCols !== undefined
      ? `repeat(auto-fill, minmax(${gridCols}px, 1fr))`
      : 'repeat(auto-fill, minmax(260px, 1fr))'
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: cols }}>
        {servers.map((s) => (
          <HostCard
            key={s.id}
            server={s}
            onConnect={() => onConnect(s)}
            onConnectSftp={() => onConnectSftp(s)}
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
          onConnectSftp={() => onConnectSftp(s)}
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

function HostCard({ server, onConnect, onConnectSftp, onEdit, onDelete, menuOpen, onMenuOpen, onMenuClose }: {
  server: ServerType
  onConnect: () => void
  onConnectSftp: () => void
  onEdit: () => void
  onDelete: () => void
  menuOpen: boolean
  onMenuOpen: (e: React.MouseEvent) => void
  onMenuClose: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const color = getIconColor(server)
  const groups = useAppStore((s) => s.groups)
  const groupName = groups.find((g) => g.id === server.groupId)?.name
  const { color: osColor, Icon: OsIconComp } = getOsInfo(server, groupName)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      onConnect()
    } else {
      clickTimer.current = setTimeout(() => { clickTimer.current = null; onEdit() }, 220)
    }
  }

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
      onClick={handleClick}
    >
      {/* Color accent line at top */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, ${color}66)` }} />

      <div className="p-3.5">
        <div className="flex items-start justify-between mb-3">
          <div
            className="host-icon"
            style={{
              width: 42, height: 42,
              background: `linear-gradient(145deg, ${osColor}ee, ${osColor}99)`,
              boxShadow: `0 4px 12px ${osColor}55`,
              fontSize: 13, fontWeight: 700, borderRadius: 10
            }}
          >
            <OsIconComp s={22} />
          </div>
          <div className="flex items-center gap-1">
            {hovered && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onConnect() }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium"
                  style={{ background: 'var(--accent)', color: '#fff', fontSize: 11 }}
                  title="Connect terminal"
                >
                  {server.protocol === 'ssh' ? <Terminal size={10} /> : <Monitor size={10} />}
                  {(server.protocol ?? 'ssh').toUpperCase()}
                </button>
                {(server.protocol ?? 'ssh') === 'ssh' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onConnectSftp() }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium"
                    style={{ background: 'var(--purple, #8b5cf6)', color: '#fff', fontSize: 11 }}
                    title="Open SFTP"
                  >
                    <FolderOpen size={10} />
                    SFTP
                  </button>
                )}
              </>
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
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="font-semibold truncate" style={{ color: 'var(--text-primary)', fontSize: 14 }}>
              {server.name}
            </p>
            <ProtoBadge proto={server.protocol ?? 'ssh'} />
          </div>
          <p className="truncate" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            {server.username ? `${server.username}@` : ''}{server.host}
          </p>
          <p className="truncate" style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
            port {server.port}
          </p>
        </div>
      </div>

      {menuOpen && (
        <DropMenu onClose={onMenuClose} items={[
          { label: 'Connect', onClick: onConnect },
          ...((server.protocol ?? 'ssh') === 'ssh' ? [{ label: 'Open SFTP', onClick: onConnectSftp }] : []),
          { label: 'Edit', onClick: onEdit },
          { label: 'Delete', onClick: onDelete, danger: true }
        ]} />
      )}
    </div>
  )
}

function HostRow({ server, onConnect, onConnectSftp, onEdit, onDelete, menuOpen, onMenuOpen, onMenuClose }: {
  server: ServerType; onConnect: () => void; onConnectSftp: () => void; onEdit: () => void; onDelete: () => void
  menuOpen: boolean; onMenuOpen: (e: React.MouseEvent) => void; onMenuClose: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const color = getIconColor(server)
  const groups = useAppStore((s) => s.groups)
  const groupName = groups.find((g) => g.id === server.groupId)?.name
  const { color: osColor, Icon: OsIconComp } = getOsInfo(server, groupName)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      onConnect()
    } else {
      clickTimer.current = setTimeout(() => { clickTimer.current = null; onEdit() }, 220)
    }
  }

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
      onClick={handleClick}
    >
      <div
        className="host-icon"
        style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${osColor}ee, ${osColor}99)`, fontSize: 11 }}
      >
        <OsIconComp s={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{server.name}</p>
          <ProtoBadge proto={server.protocol ?? 'ssh'} />
        </div>
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
          {server.username ? `${server.username}@` : ''}{server.host}:{server.port}
        </p>
      </div>
      {hovered && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onConnect() }}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs"
            style={{ background: 'var(--accent)', color: '#fff' }}
            title="Conectar terminal"
          >
            {server.protocol === 'ssh' ? <Terminal size={11} /> : <Monitor size={11} />}
            {(server.protocol ?? 'ssh').toUpperCase()}
          </button>
          {(server.protocol ?? 'ssh') === 'ssh' && (
            <button
              onClick={(e) => { e.stopPropagation(); onConnectSftp() }}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs"
              style={{ background: 'var(--purple, #8b5cf6)', color: '#fff' }}
              title="Open SFTP"
            >
              <FolderOpen size={11} />
              SFTP
            </button>
          )}
        </>
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
          { label: 'Connect', onClick: onConnect },
          ...((server.protocol ?? 'ssh') === 'ssh' ? [{ label: 'Open SFTP', onClick: onConnectSftp }] : []),
          { label: 'Edit', onClick: onEdit },
          { label: 'Delete', onClick: onDelete, danger: true }
        ]} />
      )}
    </div>
  )
}

const PROTO_COLORS: Record<string, string> = {
  ssh: 'var(--success)', rdp: 'var(--accent)', vnc: 'var(--purple)'
}

function ProtoBadge({ proto }: { proto: string }) {
  return (
    <span
      className="rounded px-1 font-mono font-bold"
      style={{
        background: `${PROTO_COLORS[proto] ?? 'var(--text-muted)'}22`,
        color: PROTO_COLORS[proto] ?? 'var(--text-muted)',
        fontSize: 9, letterSpacing: '0.05em', flexShrink: 0, lineHeight: '16px'
      }}
    >
      {proto.toUpperCase()}
    </span>
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
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No hosts added</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Add your first SSH server</p>
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
