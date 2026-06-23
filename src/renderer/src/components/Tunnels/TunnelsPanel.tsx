import { useState, useEffect, useMemo } from 'react'
import { Network, Plus, X, ArrowRight, ArrowLeft, Globe, Square, Zap, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { TunnelStatus, TunnelType, Tab } from '../../types'

// Generate a short unique id without pulling in a uuid dep — good enough to key
// a handful of tunnels per session.
function tunnelId(): string {
  return `tun_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

const TYPE_META: Record<TunnelType, { label: string; flag: string; icon: typeof ArrowRight; hint: string }> = {
  local: { label: 'Local', flag: '-L', icon: ArrowRight, hint: 'Local port → reachable from the server' },
  remote: { label: 'Remote', flag: '-R', icon: ArrowLeft, hint: 'Server port → reachable from this machine' },
  dynamic: { label: 'Dynamic (SOCKS5)', flag: '-D', icon: Globe, hint: 'Local SOCKS5 proxy; server is the exit' }
}

export default function TunnelsPanel() {
  const { tabs } = useAppStore()
  const [tunnels, setTunnels] = useState<TunnelStatus[]>([])
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Connected SSH sessions are the only valid tunnel hosts.
  const sessions = useMemo(
    () => tabs.filter((t) => t.status === 'connected' && t.sessionId && t.mode === 'terminal'),
    [tabs]
  )

  useEffect(() => {
    window.api.forward.list().then((list) => setTunnels(list as TunnelStatus[]))
    const off = window.api.forward.onStatus((list) => setTunnels(list as TunnelStatus[]))
    return () => { off() }
  }, [])

  const handleStop = async (id: string) => {
    await window.api.forward.stop(id)
  }

  const sessionLabel = (sessionId: string): string => {
    const tab = sessions.find((t) => t.sessionId === sessionId)
    return tab ? `${tab.serverName} (${tab.serverHost})` : 'closed session'
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <div
        className="flex items-center gap-2 px-4 py-3 flex-shrink-0 cs-glass"
        style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--bg-surface)' }}
      >
        <div className="flex items-center gap-2 mr-1" style={{ color: 'var(--text-primary)' }}>
          <Network size={16} style={{ color: 'var(--accent)' }} />
          <span className="font-semibold" style={{ fontSize: 14 }}>Port Forwarding</span>
        </div>
        <span className="text-xs flex-1" style={{ color: 'var(--text-muted)' }}>
          {tunnels.length} active tunnel{tunnels.length === 1 ? '' : 's'}
        </span>
        <button
          onClick={() => { setError(null); setAdding(true) }}
          disabled={sessions.length === 0}
          title={sessions.length === 0 ? 'Open an SSH session first' : 'New tunnel'}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff', whiteSpace: 'nowrap', opacity: sessions.length === 0 ? 0.5 : 1 }}
        >
          <Plus size={15} />
          New Tunnel
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
        {tunnels.length === 0 ? (
          <EmptyState canAdd={sessions.length > 0} onAdd={() => setAdding(true)} />
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {tunnels.map((t) => (
              <TunnelCard key={t.id} tunnel={t} sessionLabel={sessionLabel(t.sessionId)} onStop={() => handleStop(t.id)} />
            ))}
          </div>
        )}
      </div>

      {adding && (
        <TunnelEditor
          sessions={sessions}
          error={error}
          onError={setError}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

function TunnelCard({ tunnel, sessionLabel, onStop }: {
  tunnel: TunnelStatus; sessionLabel: string; onStop: () => void
}) {
  const meta = TYPE_META[tunnel.type]
  const Icon = meta.icon
  const bad = tunnel.status === 'error'
  const route =
    tunnel.type === 'dynamic'
      ? `${tunnel.bindAddr ?? '127.0.0.1'}:${tunnel.bindPort}  ·  SOCKS5`
      : tunnel.type === 'local'
        ? `${tunnel.bindAddr ?? '127.0.0.1'}:${tunnel.bindPort} → ${tunnel.destHost}:${tunnel.destPort}`
        : `${tunnel.destHost}:${tunnel.destPort} ← server:${tunnel.bindPort}`

  return (
    <div
      className="rounded-xl overflow-hidden cs-glass"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}
    >
      <div className="flex items-center justify-between px-3.5 pt-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={14} style={{ color: bad ? 'var(--error)' : 'var(--accent)' }} />
          <span className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: 13 }}>{meta.label}</span>
          <span
            className="px-1.5 rounded text-xs font-mono"
            style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', fontSize: 10 }}
          >
            {meta.flag}
          </span>
        </div>
        <button
          onClick={onStop}
          title="Stop tunnel"
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs"
          style={{ color: 'var(--error)', background: 'var(--error-subtle)' }}
        >
          <Square size={11} /> Stop
        </button>
      </div>

      <p
        className="mx-3.5 my-2.5 px-3 py-2 rounded-lg"
        style={{
          background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
          color: 'var(--text-secondary)', fontSize: 12,
          fontFamily: 'JetBrains Mono, Cascadia Code, monospace', wordBreak: 'break-all'
        }}
      >
        {route}
      </p>

      <div className="flex items-center justify-between px-3.5 pb-3" style={{ fontSize: 11 }}>
        <span className="truncate" style={{ color: 'var(--text-muted)' }}>{sessionLabel}</span>
        {bad ? (
          <span className="flex items-center gap-1" style={{ color: 'var(--error)' }}>
            <AlertTriangle size={11} /> {tunnel.error ?? 'error'}
          </span>
        ) : (
          <span className="flex items-center gap-1" style={{ color: 'var(--success)' }}>
            <Zap size={11} /> {tunnel.connections} conn
          </span>
        )}
      </div>
    </div>
  )
}

type Draft = {
  sessionId: string
  type: TunnelType
  bindAddr: string
  bindPort: string
  destHost: string
  destPort: string
  exposeAll: boolean
}

function TunnelEditor({ sessions, error, onError, onClose }: {
  sessions: Tab[]; error: string | null; onError: (e: string | null) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState<Draft>({
    sessionId: sessions[0]?.sessionId ?? '',
    type: 'local',
    bindAddr: '127.0.0.1',
    bindPort: '',
    destHost: '',
    destPort: '',
    exposeAll: false
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const needsDest = draft.type !== 'dynamic'
  const bindPortN = Number(draft.bindPort)
  const destPortN = Number(draft.destPort)
  const valid =
    draft.sessionId &&
    bindPortN > 0 && bindPortN < 65536 &&
    (!needsDest || (draft.destHost.trim() && destPortN > 0 && destPortN < 65536))

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    onError(null)
    // bindAddr 0.0.0.0 exposes the tunnel to the LAN; loopback by default.
    const bindAddr = draft.exposeAll ? '0.0.0.0' : (draft.bindAddr.trim() || '127.0.0.1')
    try {
      await window.api.forward.start(draft.sessionId, {
        id: tunnelId(),
        type: draft.type,
        bindAddr,
        bindPort: bindPortN,
        destHost: needsDest ? draft.destHost.trim() : undefined,
        destPort: needsDest ? destPortN : undefined
      })
      onClose()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl w-full overflow-hidden animate-fade-in"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', maxWidth: 540 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: 'var(--accent-subtle)' }}>
              <Network size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New Tunnel</h2>
          </div>
          <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <Field label="SSH session">
            <select
              value={draft.sessionId}
              onChange={(e) => setDraft({ ...draft, sessionId: e.target.value })}
            >
              {sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>{s.serverName} ({s.serverHost})</option>
              ))}
            </select>
          </Field>

          <Field label="Type">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TYPE_META) as TunnelType[]).map((tp) => {
                const m = TYPE_META[tp]
                const on = draft.type === tp
                return (
                  <button
                    key={tp}
                    onClick={() => setDraft({ ...draft, type: tp })}
                    className="flex flex-col items-start gap-1 px-3 py-2 rounded-lg text-left"
                    style={{
                      background: on ? 'var(--accent-subtle)' : 'var(--bg-input)',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      color: on ? 'var(--accent)' : 'var(--text-secondary)'
                    }}
                  >
                    <span className="text-xs font-semibold">{m.label.split(' ')[0]}</span>
                    <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.flag}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>{TYPE_META[draft.type].hint}</p>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={draft.type === 'remote' ? 'Server bind port' : 'Local port'} required>
              <input
                value={draft.bindPort}
                onChange={(e) => setDraft({ ...draft, bindPort: e.target.value.replace(/\D/g, '') })}
                placeholder="8080"
                inputMode="numeric"
              />
            </Field>
            {needsDest ? (
              <Field label="Destination port" required>
                <input
                  value={draft.destPort}
                  onChange={(e) => setDraft({ ...draft, destPort: e.target.value.replace(/\D/g, '') })}
                  placeholder="80"
                  inputMode="numeric"
                />
              </Field>
            ) : <div />}
          </div>

          {needsDest && (
            <Field label="Destination host" required>
              <input
                value={draft.destHost}
                onChange={(e) => setDraft({ ...draft, destHost: e.target.value })}
                placeholder={draft.type === 'local' ? '10.0.0.5 or internal.example.com' : '127.0.0.1'}
              />
            </Field>
          )}

          <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={draft.exposeAll}
              onChange={(e) => setDraft({ ...draft, exposeAll: e.target.checked })}
              style={{ width: 'auto' }}
            />
            <span className="text-xs">
              Expose on all interfaces (0.0.0.0) — reachable from the LAN, not just this machine
            </span>
          </label>

          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'var(--error-subtle)', color: 'var(--error)' }}
            >
              <AlertTriangle size={13} /> {error}
            </div>
          )}
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
            onClick={submit}
            disabled={!valid || busy}
            className="px-4 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--accent)', color: '#fff', opacity: valid && !busy ? 1 : 0.5 }}
          >
            {busy ? 'Starting…' : 'Start Tunnel'}
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

function EmptyState({ canAdd, onAdd }: { canAdd: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl" style={{ background: 'var(--bg-elevated)', border: '2px dashed var(--border)' }}>
        <Network size={28} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No active tunnels</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {canAdd ? 'Forward a local or remote port over an SSH session' : 'Open an SSH session first, then forward a port'}
        </p>
      </div>
      {canAdd && (
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>
          <Plus size={13} />
          New Tunnel
        </button>
      )}
    </div>
  )
}
