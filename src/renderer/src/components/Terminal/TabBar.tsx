import { useState, useRef, useEffect, useMemo } from 'react'
import { Terminal, FolderOpen, Plus, Search, X, Code2, CornerDownLeft, CheckCircle2, Circle, CheckSquare, Square, Radio, Columns, LayoutGrid } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { Tab, Server, Snippet } from '../../types'
import { HOST_ICON_COLORS } from '../../types'

interface TabBarProps {
  kind: 'normal' | 'script'
  onCloseTab: (tab: Tab) => void
  onNewTab: (tab: Tab) => void
  onToggleSftp: (tabId: string) => void
  onConnectServer: (server: Server) => void
  onBroadcastSnippet: (command: string, targets: Server[]) => void
}

interface CtxMenu { tabId: string; x: number; y: number }

export default function TabBar({ kind, onCloseTab, onNewTab, onToggleSftp, onConnectServer, onBroadcastSnippet }: TabBarProps) {
  const { tabs, activeTabId, activateTab, focusTerminal, broadcastInput, setBroadcastInput, paneLayout, panes, setPaneLayout } = useAppStore()
  const kindTabs = tabs.filter((t) => (t.kind ?? 'normal') === kind)
  // Live broadcast only makes sense with 2+ connected terminals in this strip.
  const liveCount = kindTabs.filter((t) => t.status === 'connected' && t.mode === 'terminal').length
  const activeTab = kindTabs.find((t) => t.id === activeTabId)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [showSnippets, setShowSnippets] = useState(false)

  // Send a snippet into the active session. `run` appends a newline (executes);
  // otherwise the command is just typed so the user can review before Enter.
  const insertSnippet = (snippet: Snippet, run: boolean) => {
    if (activeTab?.sessionId && activeTab.status === 'connected' && activeTab.mode === 'terminal') {
      window.api.ssh.input(activeTab.sessionId, snippet.command + (run ? '\n' : ''))
    }
    setShowSnippets(false)
    focusTerminal()  // picker stole focus — hand it back to the terminal
  }

  const broadcastSnippet = (snippet: Snippet, targets: Server[]) => {
    onBroadcastSnippet(snippet.command, targets)
    setShowSnippets(false)
  }

  const canInsertSnippet = !!activeTab && activeTab.status === 'connected' && activeTab.mode === 'terminal'

  useEffect(() => {
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => { window.removeEventListener('click', close); window.removeEventListener('blur', close) }
  }, [])

  if (kindTabs.length === 0) return null

  const ctxTab = ctxMenu ? tabs.find((t) => t.id === ctxMenu.tabId) : null

  return (
    <>
      <div
        className="flex items-center overflow-x-auto cs-glass"
        style={{
          background: 'var(--tabbar-bg)',
          borderBottom: '1px solid var(--glass-border)',
          height: 46,
          minHeight: 46
        }}
      >
        {kindTabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            inPane={paneLayout !== '1' && panes.includes(tab.id)}
            onClick={() => activateTab(tab.id)}
            onClose={() => onCloseTab(tab)}
            onToggleSftp={() => onToggleSftp(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setCtxMenu({ tabId: tab.id, x: e.clientX, y: e.clientY })
            }}
          />
        ))}

        {/* Nova conexão — só na faixa de sessões normais */}
        {kind === 'normal' && (
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
        )}

        {/* Snippets */}
        <button
          onClick={() => setShowSnippets(true)}
          title="Snippets — insert here or broadcast to many"
          className="flex items-center justify-center h-full px-2.5 flex-shrink-0"
          style={{ color: 'var(--text-muted)', background: 'transparent' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <Code2 size={15} />
        </button>

        {/* Split layout controls — only on the normal strip with 2+ tabs. Toggle:
            clicking the active layout collapses back to single. */}
        {kind === 'normal' && kindTabs.length >= 2 && (
          <div className="flex items-center h-full flex-shrink-0" style={{ borderLeft: '1px solid var(--border-subtle)', borderRight: '1px solid var(--border-subtle)' }}>
            {([
              ['2v', Columns, 'Split side by side'],
              ['2x2', LayoutGrid, '2×2 grid']
            ] as const).map(([layout, Icon, label]) => {
              const on = paneLayout === layout
              return (
                <button
                  key={layout}
                  onClick={() => setPaneLayout(on ? '1' : layout)}
                  title={on ? `${label} (active — click to unsplit)` : label}
                  className="flex items-center justify-center h-full px-2.5"
                  style={{ color: on ? '#fff' : 'var(--text-muted)', background: on ? 'var(--accent)' : 'transparent' }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = 'var(--text-secondary)' }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <Icon size={15} />
                </button>
              )
            })}
          </div>
        )}

        {/* Live broadcast toggle: mirror keystrokes from the focused terminal to
            every connected terminal in this strip. Only shown when 2+ are live. */}
        {(liveCount >= 2 || broadcastInput) && (
          <button
            onClick={() => setBroadcastInput(!broadcastInput)}
            title={broadcastInput
              ? `Broadcast ON — typing goes to all ${liveCount} terminals. Click to stop.`
              : `Broadcast input to all ${liveCount} connected terminals`}
            className="flex items-center gap-1 h-full px-2.5 flex-shrink-0 text-xs font-semibold"
            style={{
              color: broadcastInput ? '#fff' : 'var(--text-muted)',
              background: broadcastInput ? 'var(--accent)' : 'transparent'
            }}
            onMouseEnter={(e) => { if (!broadcastInput) e.currentTarget.style.color = 'var(--text-secondary)' }}
            onMouseLeave={(e) => { if (!broadcastInput) e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Radio size={15} />
            {broadcastInput && <span>{liveCount}</span>}
          </button>
        )}

      </div>

      {/* Context menu — rendered outside the scrolling tabbar so overflow/backdrop
          ancestors don't clip the fixed-positioned popup */}
      {ctxMenu && ctxTab && (
        <div
          className="fixed z-50 rounded-lg py-1 animate-fade-in cs-glass-strong"
          style={{
            left: ctxMenu.x,
            top: ctxMenu.y,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--glass-shadow)',
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

      {/* Server picker modal */}
      {showPicker && (
        <ServerPickerModal
          activeServerId={activeTab?.serverId ?? ''}
          onSelect={(server) => { onConnectServer(server); setShowPicker(false) }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Snippet picker modal */}
      {showSnippets && (
        <SnippetPickerModal
          canInsert={canInsertSnippet}
          onInsert={(s) => insertSnippet(s, false)}
          onRun={(s) => insertSnippet(s, true)}
          onBroadcast={broadcastSnippet}
          onClose={() => setShowSnippets(false)}
        />
      )}
    </>
  )
}

// ─── Snippet Picker Modal ─────────────────────────────────────────────────────

function SnippetPickerModal({ canInsert, onInsert, onRun, onBroadcast, onClose }: {
  canInsert: boolean
  onInsert: (s: Snippet) => void
  onRun: (s: Snippet) => void
  onBroadcast: (s: Snippet, targets: Server[]) => void
  onClose: () => void
}) {
  const { snippets, servers, groups } = useAppStore()
  const setActivePage = useAppStore((s) => s.setActivePage)
  const [mode, setMode] = useState<'here' | 'broadcast'>(canInsert ? 'here' : 'broadcast')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Snippet | null>(null)
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return snippets
    const q = search.toLowerCase()
    return snippets.filter(
      (s) => s.name.toLowerCase().includes(q) || s.command.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)
    )
  }, [snippets, search])

  // Broadcast targets — SSH only (RDP/VNC run in external windows, no piped input)
  const sshServers = useMemo(() => servers.filter((s) => (s.protocol ?? 'ssh') === 'ssh'), [servers])
  const targetSections = useMemo(() => {
    const map = new Map<string, Server[]>()
    map.set('__none__', [])
    groups.forEach((g) => map.set(g.id, []))
    sshServers.forEach((s) => {
      const key = s.groupId && map.has(s.groupId) ? s.groupId : '__none__'
      map.get(key)!.push(s)
    })
    const out: { label: string; items: Server[] }[] = []
    groups.forEach((g) => { const it = map.get(g.id) ?? []; if (it.length) out.push({ label: g.name, items: it }) })
    const ung = map.get('__none__') ?? []
    if (ung.length) out.push({ label: groups.length > 0 ? 'No group' : 'Servers', items: ung })
    return out
  }, [sshServers, groups])

  const toggleTarget = (id: string) =>
    setTargetIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSection = (items: Server[]) =>
    setTargetIds((prev) => {
      const n = new Set(prev)
      const allOn = items.every((s) => n.has(s.id))
      items.forEach((s) => (allOn ? n.delete(s.id) : n.add(s.id)))
      return n
    })

  const runBroadcast = () => {
    if (!picked || targetIds.size === 0) return
    onBroadcast(picked, sshServers.filter((s) => targetIds.has(s.id)))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col rounded-xl animate-fade-in cs-glass-strong"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', width: 480, maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
          <span className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)', fontSize: 14 }}>
            <Code2 size={15} style={{ color: 'var(--accent)' }} /> Snippets
          </span>
          <button onClick={onClose} className="flex items-center justify-center w-6 h-6 rounded" style={{ color: 'var(--text-muted)', background: 'transparent' }}>
            <X size={14} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1.5 px-4 pb-3 flex-shrink-0">
          <ModeTab label="This terminal" active={mode === 'here'} disabled={!canInsert} onClick={() => { if (canInsert) setMode('here') }} />
          <ModeTab label="Broadcast" active={mode === 'broadcast'} onClick={() => setMode('broadcast')} />
        </div>

        <div className="relative px-4 pb-3 flex-shrink-0">
          <Search size={13} className="absolute left-7 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search snippet..."
            style={{ paddingLeft: 32, fontSize: 13 }}
          />
        </div>

        <div style={{ height: 1, background: 'var(--border-subtle)' }} />

        {snippets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No snippets yet</p>
            <button
              onClick={() => { onClose(); setActivePage('snippets') }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Manage snippets
            </button>
          </div>
        ) : mode === 'here' ? (
          <div className="overflow-y-auto flex-1 py-2">
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>No snippets found</p>
            ) : (
              filtered.map((s) => (
                <SnippetPickerItem key={s.id} snippet={s} onInsert={() => onInsert(s)} onRun={() => onRun(s)} />
              ))
            )}
          </div>
        ) : (
          <>
            <div className="overflow-y-auto flex-1">
              {/* Step 1: pick snippet */}
              <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>1 · Snippet</p>
              {filtered.length === 0 ? (
                <p className="text-center py-4 text-xs" style={{ color: 'var(--text-muted)' }}>No snippets found</p>
              ) : (
                filtered.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 px-4 py-2 cursor-pointer"
                    style={{ background: picked?.id === s.id ? 'var(--accent-subtle)' : 'transparent' }}
                    onClick={() => setPicked(s)}
                  >
                    <span style={{ color: picked?.id === s.id ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {picked?.id === s.id ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--text-primary)', fontSize: 13 }}>{s.name}</p>
                      <p className="truncate" style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{s.command}</p>
                    </div>
                  </div>
                ))
              )}

              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

              {/* Step 2: pick targets */}
              <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                2 · Targets ({targetIds.size})
              </p>
              {targetSections.length === 0 ? (
                <p className="text-center py-4 text-xs" style={{ color: 'var(--text-muted)' }}>No SSH servers</p>
              ) : (
                targetSections.map(({ label, items }) => {
                  const allOn = items.every((s) => targetIds.has(s.id))
                  return (
                    <div key={label} className="mb-1">
                      <button
                        onClick={() => toggleSection(items)}
                        className="flex items-center gap-2 w-full px-4 py-1.5"
                        style={{ background: 'transparent', color: 'var(--text-secondary)' }}
                      >
                        <span style={{ color: allOn ? 'var(--accent)' : 'var(--text-muted)' }}>
                          {allOn ? <CheckSquare size={14} /> : <Square size={14} />}
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ letterSpacing: '0.06em' }}>{label}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({items.length})</span>
                      </button>
                      {items.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-2 px-4 py-1.5 cursor-pointer"
                          style={{ paddingLeft: 28, background: targetIds.has(s.id) ? 'var(--bg-hover)' : 'transparent' }}
                          onClick={() => toggleTarget(s.id)}
                        >
                          <span style={{ color: targetIds.has(s.id) ? 'var(--accent)' : 'var(--text-muted)' }}>
                            {targetIds.has(s.id) ? <CheckSquare size={13} /> : <Square size={13} />}
                          </span>
                          <span className="truncate" style={{ color: 'var(--text-primary)', fontSize: 12 }}>{s.name}</span>
                          <span className="truncate" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{s.host}</span>
                        </div>
                      ))}
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {picked ? `Run "${picked.name}"` : 'Pick a snippet'} on {targetIds.size} server{targetIds.size === 1 ? '' : 's'}
              </span>
              <button
                onClick={runBroadcast}
                disabled={!picked || targetIds.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--accent)', color: '#fff', opacity: !picked || targetIds.size === 0 ? 0.5 : 1 }}
              >
                <CornerDownLeft size={12} /> Run on {targetIds.size}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ModeTab({ label, active, disabled, onClick }: { label: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-lg text-xs font-medium"
      style={{
        background: active ? 'var(--accent)' : 'var(--bg-active)',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer'
      }}
      title={disabled ? 'Open a terminal first' : undefined}
    >
      {label}
    </button>
  )
}

function SnippetPickerItem({ snippet, onInsert, onRun }: {
  snippet: Snippet; onInsert: () => void; onRun: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
      style={{ background: hovered ? 'var(--bg-hover)' : 'transparent', transition: 'background 0.1s' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onInsert}
      title="Click: type into terminal · Run: type and execute"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate" style={{ color: 'var(--text-primary)', fontSize: 13 }}>{snippet.name}</p>
        <p className="truncate" style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
          {snippet.command}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRun() }}
        className="flex items-center gap-1 flex-shrink-0 px-2 py-1 rounded text-xs font-medium"
        style={{ background: 'var(--accent)', color: '#fff', opacity: hovered ? 1 : 0.7 }}
        title="Type and execute"
      >
        <CornerDownLeft size={11} /> Run
      </button>
    </div>
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
  const [groupFilter, setGroupFilter] = useState<string>('all')
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
    if (groupFilter !== 'all' && groupFilter !== g.id) return
    const items = byGroup.get(g.id) ?? []
    if (items.length) sections.push({ label: g.name, items })
  })
  if (groupFilter === 'all' || groupFilter === '__none__') {
    const ungrouped = byGroup.get('__none__') ?? []
    if (ungrouped.length) sections.push({ label: groups.length > 0 ? 'No group' : 'Servers', items: ungrouped })
  }

  // Only show group filter chips when there's more than one bucket to choose from
  const ungroupedCount = (byGroup.get('__none__') ?? []).length
  const groupChips = groups.filter((g) => (byGroup.get(g.id) ?? []).length > 0)
  const showFilter = groupChips.length > 0 && (groupChips.length + (ungroupedCount > 0 ? 1 : 0)) > 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col rounded-xl animate-fade-in cs-glass-strong"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
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

        {/* Group filter chips */}
        {showFilter && (
          <div className="flex items-center gap-1.5 px-4 pb-3 flex-shrink-0 overflow-x-auto">
            <GroupChip label="All" active={groupFilter === 'all'} onClick={() => setGroupFilter('all')} />
            {groupChips.map((g) => (
              <GroupChip
                key={g.id}
                label={g.name}
                active={groupFilter === g.id}
                onClick={() => setGroupFilter(g.id)}
              />
            ))}
            {ungroupedCount > 0 && (
              <GroupChip label="No group" active={groupFilter === '__none__'} onClick={() => setGroupFilter('__none__')} />
            )}
          </div>
        )}

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

function GroupChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{
        background: active ? 'var(--accent)' : 'var(--bg-active)',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        whiteSpace: 'nowrap',
        transition: 'background 0.12s, color 0.12s'
      }}
    >
      {label}
    </button>
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
  tab, isActive, inPane, onClick, onClose, onToggleSftp, onContextMenu
}: {
  tab: Tab; isActive: boolean; inPane?: boolean; onClick: () => void; onClose: () => void; onToggleSftp: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)

  const statusColor = {
    connected: 'var(--success)',
    connecting: 'var(--warning)',
    disconnected: 'var(--text-muted)',
    error: 'var(--error)'
  }[tab.status]

  // Single click activates immediately (no double-click delay). The X closes.
  return (
    <div
      className="flex items-center gap-1.5 pl-3 pr-1.5 h-full cursor-pointer relative flex-shrink-0"
      style={{
        background: isActive ? 'var(--bg-surface)' : hovered ? 'var(--bg-hover)' : 'transparent',
        borderRight: '1px solid var(--border-subtle)',
        transition: 'background 0.1s'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      onDoubleClick={onClose}
      onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose() } }}
      onContextMenu={onContextMenu}
      title="Click: activate · Double-click / middle-click / ✕: close · Right-click: options"
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

      {/* Shown-in-grid marker (split mode): a thin accent dot when this tab
          occupies a pane but isn't the focused one. */}
      {inPane && !isActive && (
        <div className="flex-shrink-0 rounded-full" style={{ width: 5, height: 5, background: 'var(--accent)', opacity: 0.7 }} title="Shown in a split pane" />
      )}

      {/* Close — always visible on the active tab, on hover otherwise. */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        title="Close (Ctrl+Shift+W)"
        className="flex items-center justify-center rounded flex-shrink-0 ml-0.5"
        style={{
          width: 18, height: 18,
          color: 'var(--text-muted)',
          opacity: hovered || isActive ? 1 : 0,
          transition: 'opacity 0.12s, background 0.12s, color 0.12s'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-active, rgba(255,255,255,0.08))'; e.currentTarget.style.color = 'var(--text-primary)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        <X size={13} />
      </button>
    </div>
  )
}
