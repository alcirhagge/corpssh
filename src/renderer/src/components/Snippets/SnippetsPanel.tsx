import { useState, useMemo, useEffect } from 'react'
import { Plus, Search, Code2, Trash2, Pencil, Copy, X, Check, Send, CheckSquare, Square, CornerDownLeft } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { Snippet, Server } from '../../types'

type Draft = { id?: string; name: string; command: string; description: string }

const EMPTY: Draft = { name: '', command: '', description: '' }

interface SnippetsPanelProps {
  onBroadcast: (command: string, targets: Server[]) => void
}

export default function SnippetsPanel({ onBroadcast }: SnippetsPanelProps) {
  const { snippets, upsertSnippet, removeSnippet } = useAppStore()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Draft | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sending, setSending] = useState<Snippet | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return snippets
    const q = search.toLowerCase()
    return snippets.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.command.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q)
    )
  }, [snippets, search])

  const handleSave = async (draft: Draft) => {
    if (!draft.name.trim() || !draft.command.trim()) return
    const payload: Snippet = {
      id: draft.id ?? '',
      name: draft.name.trim(),
      command: draft.command,
      description: draft.description.trim() || undefined
    }
    const saved = await window.api.snippets.save(payload)
    upsertSnippet(saved)
    setEditing(null)
  }

  const handleDelete = async (id: string) => {
    await window.api.snippets.delete(id)
    removeSnippet(id)
  }

  const handleCopy = (s: Snippet) => {
    window.api.clipboard.writeText(s.command)
    setCopiedId(s.id)
    setTimeout(() => setCopiedId((c) => (c === s.id ? null : c)), 1200)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-3 flex-shrink-0 cs-glass"
        style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--bg-surface)' }}
      >
        <div className="flex items-center gap-2 mr-1" style={{ color: 'var(--text-primary)' }}>
          <Code2 size={16} style={{ color: 'var(--accent)' }} />
          <span className="font-semibold" style={{ fontSize: 14 }}>Snippets</span>
        </div>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search snippets..."
            style={{ paddingLeft: 34, background: 'var(--bg-input)', fontSize: 13 }}
          />
        </div>
        <button
          onClick={() => setEditing({ ...EMPTY })}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff', whiteSpace: 'nowrap' }}
        >
          <Plus size={15} />
          New Snippet
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
        {snippets.length === 0 ? (
          <EmptyState onAdd={() => setEditing({ ...EMPTY })} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2" style={{ color: 'var(--text-muted)' }}>
            <Search size={28} />
            <p className="text-sm">No results for "{search}"</p>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {filtered.map((s) => (
              <SnippetCard
                key={s.id}
                snippet={s}
                copied={copiedId === s.id}
                onCopy={() => handleCopy(s)}
                onSend={() => setSending(s)}
                onEdit={() => setEditing({ id: s.id, name: s.name, command: s.command, description: s.description ?? '' })}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <SnippetEditor
          draft={editing}
          onChange={setEditing}
          onSave={() => handleSave(editing)}
          onClose={() => setEditing(null)}
        />
      )}

      {sending && (
        <TargetPickerModal
          snippet={sending}
          onConfirm={(targets) => { onBroadcast(sending.command, targets); setSending(null) }}
          onClose={() => setSending(null)}
        />
      )}
    </div>
  )
}

function TargetPickerModal({ snippet, onConfirm, onClose }: {
  snippet: Snippet; onConfirm: (targets: Server[]) => void; onClose: () => void
}) {
  const { servers, groups } = useAppStore()
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sshServers = useMemo(() => servers.filter((s) => (s.protocol ?? 'ssh') === 'ssh'), [servers])
  const sections = useMemo(() => {
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

  const toggle = (id: string) =>
    setTargetIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = (items: Server[]) =>
    setTargetIds((p) => {
      const n = new Set(p)
      const allOn = items.every((s) => n.has(s.id))
      items.forEach((s) => (allOn ? n.delete(s.id) : n.add(s.id)))
      return n
    })

  const confirm = () => {
    if (targetIds.size === 0) return
    onConfirm(sshServers.filter((s) => targetIds.has(s.id)))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col rounded-xl animate-fade-in cs-glass-strong"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', width: 460, maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
          <div className="min-w-0">
            <span className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)', fontSize: 14 }}>
              <Send size={14} style={{ color: 'var(--accent)' }} /> Send to servers
            </span>
            <p className="truncate" style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{snippet.name}</p>
          </div>
          <button onClick={onClose} className="flex items-center justify-center w-6 h-6 rounded" style={{ color: 'var(--text-muted)', background: 'transparent' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ height: 1, background: 'var(--border-subtle)' }} />

        <div className="overflow-y-auto flex-1 py-2">
          {sections.length === 0 ? (
            <p className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>No SSH servers</p>
          ) : (
            sections.map(({ label, items }) => {
              const allOn = items.every((s) => targetIds.has(s.id))
              return (
                <div key={label} className="mb-1">
                  <button
                    onClick={() => toggleAll(items)}
                    className="flex items-center gap-2 w-full px-4 py-1.5"
                    style={{ background: 'transparent', color: 'var(--text-secondary)' }}
                  >
                    <span style={{ color: allOn ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {allOn ? <CheckSquare size={14} /> : <Square size={14} />}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({items.length})</span>
                  </button>
                  {items.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 px-4 py-1.5 cursor-pointer"
                      style={{ paddingLeft: 28, background: targetIds.has(s.id) ? 'var(--bg-hover)' : 'transparent' }}
                      onClick={() => toggle(s.id)}
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
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{targetIds.size} server{targetIds.size === 1 ? '' : 's'} selected</span>
          <button
            onClick={confirm}
            disabled={targetIds.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--accent)', color: '#fff', opacity: targetIds.size === 0 ? 0.5 : 1 }}
          >
            <CornerDownLeft size={12} /> Run on {targetIds.size}
          </button>
        </div>
      </div>
    </div>
  )
}

function SnippetCard({ snippet, copied, onCopy, onSend, onEdit, onDelete }: {
  snippet: Snippet; copied: boolean; onCopy: () => void; onSend: () => void; onEdit: () => void; onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="rounded-xl overflow-hidden cs-glass"
      style={{
        background: hovered ? 'var(--bg-elevated)' : 'var(--bg-card)',
        border: '1px solid var(--glass-border)',
        boxShadow: 'var(--glass-shadow)',
        transition: 'all 0.15s'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center justify-between px-3.5 pt-3">
        <p className="font-semibold truncate" style={{ color: 'var(--text-primary)', fontSize: 13 }}>
          {snippet.name}
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          <IconBtn title={copied ? 'Copied' : 'Copy command'} onClick={onCopy}>
            {copied ? <Check size={13} style={{ color: 'var(--success)' }} /> : <Copy size={13} />}
          </IconBtn>
          <IconBtn title="Send to servers" onClick={onSend}><Send size={13} /></IconBtn>
          <IconBtn title="Edit" onClick={onEdit}><Pencil size={13} /></IconBtn>
          <IconBtn title="Delete" onClick={onDelete} danger><Trash2 size={13} /></IconBtn>
        </div>
      </div>
      {snippet.description && (
        <p className="px-3.5 pt-1 truncate" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {snippet.description}
        </p>
      )}
      <pre
        className="mx-3.5 my-3 px-3 py-2 rounded-lg overflow-x-auto"
        style={{
          background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
          color: 'var(--text-secondary)', fontSize: 12,
          fontFamily: 'JetBrains Mono, Cascadia Code, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
        }}
      >
        {snippet.command}
      </pre>
    </div>
  )
}

function IconBtn({ children, title, onClick, danger }: {
  children: React.ReactNode; title: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-6 h-6 rounded-md"
      style={{ color: danger ? 'var(--error)' : 'var(--text-muted)', background: 'transparent' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? 'var(--error-subtle)' : 'var(--bg-active)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  )
}

function SnippetEditor({ draft, onChange, onSave, onClose }: {
  draft: Draft; onChange: (d: Draft) => void; onSave: () => void; onClose: () => void
}) {
  const isEdit = !!draft.id
  const valid = draft.name.trim() && draft.command.trim()
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl w-full overflow-hidden animate-fade-in"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: 'var(--accent-subtle)' }}>
              <Code2 size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {isEdit ? 'Edit Snippet' : 'New Snippet'}
            </h2>
          </div>
          <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <Field label="Name" required>
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              placeholder="Ex: Tail nginx log"
            />
          </Field>
          <Field label="Command" required>
            <textarea
              value={draft.command}
              onChange={(e) => onChange({ ...draft, command: e.target.value })}
              placeholder="tail -f /var/log/nginx/access.log"
              style={{
                resize: 'vertical', minHeight: 90, fontFamily: 'JetBrains Mono, Cascadia Code, monospace', fontSize: 13
              }}
            />
          </Field>
          <Field label="Description (optional)">
            <input
              value={draft.description}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
              placeholder="What this command does..."
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs"
            style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!valid}
            className="px-4 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--accent)', color: '#fff', opacity: valid ? 1 : 0.5 }}
          >
            {isEdit ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label} {required && <span style={{ color: 'var(--error)' }}>*</span>}
      </label>
      {children}
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl" style={{ background: 'var(--bg-elevated)', border: '2px dashed var(--border)' }}>
        <Code2 size={28} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No snippets yet</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Save commands you reuse often</p>
      </div>
      <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>
        <Plus size={13} />
        New Snippet
      </button>
    </div>
  )
}
