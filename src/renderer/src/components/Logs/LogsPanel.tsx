import { useState, useEffect } from 'react'
import { Trash2, RefreshCw, Download, Settings, CheckCircle, XCircle, Wifi, Activity } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { LogEntry, RemoteLogConfig } from '../../types'

function formatDur(ms?: number): string {
  if (!ms) return '—'
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

const TYPE_STYLE: Record<LogEntry['type'], { label: string; color: string }> = {
  connect:   { label: 'CONNECT',   color: 'var(--success)' },
  disconnect:{ label: 'DISCONNECT',color: 'var(--text-secondary)' },
  error:     { label: 'ERROR',     color: 'var(--error)' },
  auth_fail: { label: 'AUTH FAIL', color: 'var(--warning)' }
}

export default function LogsPanel() {
  const { logs, setLogs, clearLogs, settings, setSettings } = useAppStore()
  const [tab, setTab] = useState<'events' | 'remote'>('events')
  const [remoteForm, setRemoteForm] = useState<RemoteLogConfig>(
    settings.remoteLogConfig ?? {
      enabled: false, provider: 'graylog', host: '', port: 12201, tls: false
    }
  )
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    window.api.log.list().then(setLogs)
  }, [])

  const handleClear = async () => {
    await window.api.log.clear()
    clearLogs()
  }

  const handleExportCSV = () => {
    const header = 'Timestamp,Type,Server,Host,User,Duration,Message\n'
    const rows = logs.map((l) =>
      [formatTs(l.timestamp), l.type, l.serverName, l.host, l.username, formatDur(l.duration), l.message ?? ''].join(',')
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `corpssh-logs-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleTestRemote = async () => {
    setTestState('testing')
    setTestMsg('')
    try {
      const result = await window.api.log.testRemote(remoteForm)
      setTestState(result.ok ? 'ok' : 'fail')
      setTestMsg(result.message)
    } catch (e: any) {
      setTestState('fail')
      setTestMsg(e.message)
    }
  }

  const handleSaveRemote = async () => {
    const newSettings = { ...settings, remoteLogConfig: remoteForm }
    await window.api.settings.save(newSettings)
    setSettings(newSettings)
    await window.api.log.saveRemoteConfig(remoteForm)
  }

  const filtered = filter
    ? logs.filter((l) => l.serverName.toLowerCase().includes(filter.toLowerCase()) || l.host.includes(filter))
    : logs

  const providers = [
    { id: 'graylog', label: 'Graylog (GELF HTTP)', defaultPort: 12201 },
    { id: 'loki', label: 'Grafana Loki', defaultPort: 3100 },
    { id: 'elasticsearch', label: 'Elasticsearch', defaultPort: 9200 },
    { id: 'syslog', label: 'Syslog (UDP)', defaultPort: 514 }
  ] as const

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-app)' }}>
      {/* Tabs */}
      <div
        className="flex items-center gap-0 px-4"
        style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}
      >
        {([
          { id: 'events', label: 'Eventos', icon: <Activity size={13} /> },
          { id: 'remote', label: 'Remote Logging', icon: <Wifi size={13} /> }
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-3 text-xs relative"
            style={{
              color: tab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: 'transparent',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent'
            }}
          >
            {t.icon}{t.label}
          </button>
        ))}

        <div className="flex-1" />

        {tab === 'events' && (
          <div className="flex items-center gap-2 py-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar..."
              style={{ width: 160, padding: '4px 8px', fontSize: 11 }}
            />
            <button onClick={() => window.api.log.list().then(setLogs)} style={{ color: 'var(--text-muted)', background: 'none' }}>
              <RefreshCw size={13} />
            </button>
            <button onClick={handleExportCSV} style={{ color: 'var(--text-muted)', background: 'none' }} title="Exportar CSV">
              <Download size={13} />
            </button>
            <button onClick={handleClear} style={{ color: 'var(--error)', background: 'none' }} title="Limpar logs">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {tab === 'events' && (
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2" style={{ color: 'var(--text-muted)' }}>
              <Activity size={28} />
              <p className="text-sm">Nenhum evento registrado</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                  {['Timestamp', 'Tipo', 'Servidor', 'Host', 'Usuario', 'Duração', 'Mensagem'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <LogRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'remote' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-lg mx-auto flex flex-col gap-5">
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Remote Logging</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Envie eventos de conexao para um servidor de logs externo.
              </p>
            </div>

            {/* Enable toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Ativar remote logging</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Envia eventos SSH para o servidor configurado</p>
              </div>
              <Toggle value={remoteForm.enabled} onChange={(v) => setRemoteForm((f) => ({ ...f, enabled: v }))} />
            </div>

            {/* Provider */}
            <FormRow label="Provedor">
              <select
                value={remoteForm.provider}
                onChange={(e) => {
                  const prov = e.target.value as RemoteLogConfig['provider']
                  const defaultPort = providers.find((p) => p.id === prov)?.defaultPort ?? 514
                  setRemoteForm((f) => ({ ...f, provider: prov, port: defaultPort }))
                }}
              >
                {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </FormRow>

            <FormRow label="Host">
              <input
                value={remoteForm.host}
                onChange={(e) => setRemoteForm((f) => ({ ...f, host: e.target.value }))}
                placeholder="ex: graylog.empresa.com"
              />
            </FormRow>

            <FormRow label="Porta">
              <input
                type="number"
                value={remoteForm.port}
                onChange={(e) => setRemoteForm((f) => ({ ...f, port: parseInt(e.target.value) || 514 }))}
              />
            </FormRow>

            {(remoteForm.provider === 'loki' || remoteForm.provider === 'elasticsearch') && (
              <FormRow label="Token / API Key">
                <input
                  type="password"
                  value={remoteForm.token ?? ''}
                  onChange={(e) => setRemoteForm((f) => ({ ...f, token: e.target.value }))}
                  placeholder="Bearer token ou API key"
                />
              </FormRow>
            )}

            {remoteForm.provider === 'elasticsearch' && (
              <FormRow label="Index">
                <input
                  value={remoteForm.index ?? 'corpssh-logs'}
                  onChange={(e) => setRemoteForm((f) => ({ ...f, index: e.target.value }))}
                />
              </FormRow>
            )}

            <FormRow label="TLS / HTTPS">
              <Toggle value={remoteForm.tls ?? false} onChange={(v) => setRemoteForm((f) => ({ ...f, tls: v }))} />
            </FormRow>

            {/* Test + Save */}
            <div className="flex gap-2">
              <button
                onClick={handleTestRemote}
                disabled={testState === 'testing' || !remoteForm.host}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)', opacity: !remoteForm.host ? 0.5 : 1 }}
              >
                {testState === 'testing' ? <RefreshCw size={12} className="animate-spin" /> : <Wifi size={12} />}
                Testar conexao
              </button>
              <button
                onClick={handleSaveRemote}
                className="flex-1 py-2 rounded-lg text-xs font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Salvar
              </button>
            </div>

            {testState === 'ok' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded text-xs" style={{ background: 'var(--success-subtle)', color: 'var(--success)' }}>
                <CheckCircle size={13} />
                {testMsg || 'Conexao bem-sucedida'}
              </div>
            )}
            {testState === 'fail' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded text-xs" style={{ background: 'var(--error-subtle)', color: 'var(--error)' }}>
                <XCircle size={13} />
                {testMsg || 'Falha na conexao'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function LogRow({ entry }: { entry: LogEntry }) {
  const style = TYPE_STYLE[entry.type]
  const [hovered, setHovered] = useState(false)
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: hovered ? 'var(--bg-hover)' : 'transparent'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td className="px-3 py-1.5 text-xs" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatTs(entry.timestamp)}</td>
      <td className="px-3 py-1.5 text-xs font-mono font-semibold" style={{ color: style.color, whiteSpace: 'nowrap' }}>{style.label}</td>
      <td className="px-3 py-1.5 text-xs" style={{ color: 'var(--text-primary)' }}>{entry.serverName}</td>
      <td className="px-3 py-1.5 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{entry.host}</td>
      <td className="px-3 py-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{entry.username}</td>
      <td className="px-3 py-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>{formatDur(entry.duration)}</td>
      <td className="px-3 py-1.5 text-xs" style={{ color: 'var(--text-muted)', maxWidth: 200 }}>
        <span className="truncate block">{entry.message ?? ''}</span>
      </td>
    </tr>
  )
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <label style={{ width: 120, flexShrink: 0, color: 'var(--text-secondary)', fontSize: 12 }}>{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative rounded-full transition-colors"
      style={{ width: 36, height: 20, background: value ? 'var(--accent)' : 'var(--bg-active)', flexShrink: 0 }}
    >
      <div
        className="absolute top-1 rounded-full bg-white"
        style={{ width: 12, height: 12, left: value ? 20 : 4, transition: 'left 0.15s' }}
      />
    </button>
  )
}
