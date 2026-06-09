import { useState, useEffect, useMemo } from 'react'
import {
  Trash2, RefreshCw, Download, CheckCircle, XCircle, Wifi,
  Activity, FileText, ChevronLeft, Search, Terminal, AlertCircle,
  LogIn, LogOut, Filter, Copy
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { LogEntry, RemoteLogConfig } from '../../types'

interface SessionMeta {
  sessionId: string; serverId: string; serverName: string
  host: string; username: string; startedAt: number; endedAt?: number
}

function formatDur(ms?: number): string {
  if (!ms) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return formatTs(ts)
}

function stripAnsi(str: string): string {
  const cleaned = str
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[^[\]]/g, '')
    .replace(/\x9b[0-9;?]*[A-Za-z]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
  return cleaned.split('\n').map(line => {
    const parts = line.split('\r')
    return parts[parts.length - 1]
  }).join('\n')
}

// ─── ANSI color renderer ──────────────────────────────────────────────────────

const ANSI_FG: Record<number, string> = {
  30: '#4e4e4e', 31: '#cc3333', 32: '#4caf50', 33: '#c4a000',
  34: '#5b8ed9', 35: '#b57bdb', 36: '#34c5c5', 37: '#d0cfcc',
  90: '#888888', 91: '#ff5555', 92: '#55ff55', 93: '#ffff55',
  94: '#5555ff', 95: '#ff55ff', 96: '#55ffff', 97: '#ffffff'
}

function xtermColor(n: number): string {
  if (n < 8) return ['#000','#800000','#008000','#808000','#000080','#800080','#008080','#c0c0c0'][n]
  if (n < 16) return ['#808080','#ff0000','#00ff00','#ffff00','#0000ff','#ff00ff','#00ffff','#fff'][n - 8]
  if (n < 232) { const i = n - 16; return `rgb(${Math.floor(i/36)*51},${Math.floor((i%36)/6)*51},${(i%6)*51})` }
  const v = (n - 232) * 10 + 8; return `rgb(${v},${v},${v})`
}

type AnsiSeg = { text: string; color?: string; bg?: string; bold?: boolean }

function parseAnsiSegments(text: string): AnsiSeg[] {
  const segs: AnsiSeg[] = []
  let fg: string | undefined, bg: string | undefined, bold = false, cursor = 0
  const re = /\x1b\[([0-9;]*)([A-Za-z])|\x9b[0-9;]*[A-Za-z]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) segs.push({ text: text.slice(cursor, m.index), color: fg, bg, bold })
    cursor = m.index + m[0].length
    if (m[2] !== 'm') continue
    const codes = m[1] ? m[1].split(';').map(Number) : [0]
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i]
      if (c === 0) { fg = undefined; bg = undefined; bold = false }
      else if (c === 1) bold = true
      else if (c === 22) bold = false
      else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) fg = ANSI_FG[c]
      else if (c === 39) fg = undefined
      else if (c === 38 && codes[i+1] === 5) { fg = xtermColor(codes[i+2]); i += 2 }
      else if (c === 48 && codes[i+1] === 5) { bg = xtermColor(codes[i+2]); i += 2 }
      else if (c === 49) bg = undefined
    }
  }
  if (cursor < text.length) segs.push({ text: text.slice(cursor), color: fg, bg, bold })
  return segs
}

function AnsiLine({ text }: { text: string }) {
  const segs = parseAnsiSegments(text)
  return (
    <>
      {segs.map((s, i) => (
        <span key={i} style={{ color: s.color, background: s.bg, fontWeight: s.bold ? 700 : undefined }}>
          {s.text}
        </span>
      ))}
    </>
  )
}

const TYPE_CONFIG: Record<LogEntry['type'], { label: string; color: string; bg: string; Icon: React.FC<any> }> = {
  connect:    { label: 'CONNECT',    color: 'var(--success)', bg: 'var(--success-subtle)',  Icon: LogIn },
  disconnect: { label: 'DISCONNECT', color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', Icon: LogOut },
  error:      { label: 'ERROR',      color: 'var(--error)',   bg: 'var(--error-subtle)',   Icon: AlertCircle },
  auth_fail:  { label: 'AUTH FAIL',  color: 'var(--warning)', bg: 'var(--warning-subtle)', Icon: AlertCircle }
}

export default function LogsPanel() {
  const { logs, setLogs, clearLogs, settings, setSettings } = useAppStore()
  const [tab, setTab] = useState<'events' | 'sessions' | 'remote'>('events')
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [viewingSession, setViewingSession] = useState<{ meta: SessionMeta; raw: string; content: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [sessionSearch, setSessionSearch] = useState('')
  const [cmdOnly, setCmdOnly] = useState(false)
  const [remoteForm, setRemoteForm] = useState<RemoteLogConfig>(
    settings.remoteLogConfig ?? { enabled: false, provider: 'graylog', host: '', port: 12201, tls: false }
  )
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<LogEntry['type'] | 'all'>('all')

  useEffect(() => {
    window.api.log.list().then(setLogs)
    window.api.session.list().then(setSessions)
  }, [])

  useEffect(() => {
    if (tab === 'sessions') {
      window.api.session.list().then(setSessions)
    }
  }, [tab])

  const handleClear = async () => {
    if (!confirm('Clear all log events?')) return
    await window.api.log.clear()
    clearLogs()
  }

  const handleRefreshSessions = async () => {
    const list = await window.api.session.list()
    setSessions(list)
  }

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await window.api.session.delete(sessionId)
    setSessions((prev) => prev.filter((x) => x.sessionId !== sessionId))
  }

  const handleViewSession = async (meta: SessionMeta) => {
    const raw = await window.api.session.read(meta.sessionId)
    setViewingSession({ meta, raw, content: stripAnsi(raw) })
    setSessionSearch('')
    setCmdOnly(false)
  }

  const handleCopySession = () => {
    const text = sessionContent.map(p => p.stripped).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }

  const handleDownloadSession = () => {
    if (!viewingSession) return
    const blob = new Blob([viewingSession.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `session-${viewingSession.meta.serverName}-${viewingSession.meta.sessionId.slice(0, 8)}.log`
    a.click()
    URL.revokeObjectURL(url)
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
    a.download = `corpssh-events-${Date.now()}.csv`
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

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (typeFilter !== 'all' && l.type !== typeFilter) return false
      if (!filter) return true
      const q = filter.toLowerCase()
      return l.serverName.toLowerCase().includes(q) || l.host.includes(q) || l.username.toLowerCase().includes(q)
    })
  }, [logs, filter, typeFilter])

  const stats = useMemo(() => {
    const today = new Date().toDateString()
    return {
      total: logs.length,
      connects: logs.filter((l) => l.type === 'connect').length,
      errors: logs.filter((l) => l.type === 'error' || l.type === 'auth_fail').length,
      todayConnects: logs.filter((l) => l.type === 'connect' && new Date(l.timestamp).toDateString() === today).length
    }
  }, [logs])

  const sessionContent = useMemo(() => {
    if (!viewingSession) return []
    const strippedLines = viewingSession.content.split('\n')
    const rawLines = viewingSession.raw.split('\n').map(line => {
      const parts = line.split('\r')
      return parts[parts.length - 1]
    })
    let pairs = strippedLines.map((stripped, i) => ({ stripped, raw: rawLines[i] ?? stripped }))
    if (cmdOnly) pairs = pairs.filter(p => p.stripped.includes('CMD>'))
    if (sessionSearch.trim()) {
      const q = sessionSearch.toLowerCase()
      pairs = pairs.filter(p => p.stripped.toLowerCase().includes(q))
    }
    return pairs
  }, [viewingSession, cmdOnly, sessionSearch])

  const providers = [
    { id: 'graylog',       label: 'Graylog (GELF HTTP)', defaultPort: 12201 },
    { id: 'loki',          label: 'Grafana Loki',         defaultPort: 3100 },
    { id: 'elasticsearch', label: 'Elasticsearch',        defaultPort: 9200 },
    { id: 'syslog',        label: 'Syslog (UDP)',          defaultPort: 514 }
  ] as const

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      {/* Tab bar */}
      <div
        className="flex items-center px-4 flex-shrink-0"
        style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', height: 44 }}
      >
        {([
          { id: 'events',   label: 'Events',   icon: <Activity size={13} /> },
          { id: 'sessions', label: 'Sessions', icon: <FileText size={13} /> },
          { id: 'remote',   label: 'Remote Logging', icon: <Wifi size={13} /> }
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3 h-full text-xs relative"
            style={{
              color: tab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
              background: 'transparent',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              fontWeight: tab === t.id ? 600 : 400,
              borderRadius: 0
            }}
          >
            {t.icon}{t.label}
            {t.id === 'events' && logs.length > 0 && (
              <span
                className="ml-1 rounded-full px-1.5"
                style={{ background: 'var(--bg-active)', color: 'var(--text-muted)', fontSize: 10, lineHeight: '16px' }}
              >
                {logs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── EVENTS ── */}
      {tab === 'events' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Stats bar */}
          {logs.length > 0 && (
            <div
              className="flex items-center gap-6 px-4 py-2 flex-shrink-0"
              style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}
            >
              <StatPill label="Total" value={stats.total} color="var(--text-secondary)" />
              <StatPill label="Connections" value={stats.connects} color="var(--success)" />
              <StatPill label="Errors" value={stats.errors} color="var(--error)" />
              <StatPill label="Today" value={stats.todayConnects} color="var(--accent)" />
            </div>
          )}

          {/* Toolbar */}
          <div
            className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
            style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="relative flex-1" style={{ maxWidth: 240 }}>
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by server, host, user..."
                style={{ paddingLeft: 28, fontSize: 12, padding: '5px 8px 5px 28px' }}
              />
            </div>
            {/* Type filter buttons */}
            <div className="flex items-center gap-1">
              {(['all', 'connect', 'disconnect', 'error', 'auth_fail'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className="px-2 py-1 rounded text-xs"
                  style={{
                    background: typeFilter === t ? 'var(--bg-active)' : 'transparent',
                    color: typeFilter === t ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 11, fontWeight: typeFilter === t ? 600 : 400
                  }}
                >
                  {t === 'all' ? 'All' : t === 'connect' ? 'Connect' : t === 'disconnect' ? 'Disconnect' : t === 'error' ? 'Error' : 'Auth Fail'}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <button
              onClick={() => window.api.log.list().then(setLogs)}
              style={{ color: 'var(--text-muted)', background: 'none' }}
              title="Refresh"
            >
              <RefreshCw size={13} />
            </button>
            <button onClick={handleExportCSV} style={{ color: 'var(--text-muted)', background: 'none' }} title="Export CSV">
              <Download size={13} />
            </button>
            <button onClick={handleClear} style={{ color: 'var(--error)', background: 'none' }} title="Clear logs">
              <Trash2 size={13} />
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3" style={{ color: 'var(--text-muted)' }}>
                <Activity size={32} strokeWidth={1.5} />
                <div className="text-center">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {logs.length === 0 ? 'No events recorded' : 'No results'}
                  </p>
                  <p className="text-xs mt-1">Events will appear here when you connect</p>
                </div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 1 }}>
                    {[
                      { label: 'Type',     width: 100 },
                      { label: 'Server',   width: undefined },
                      { label: 'Host',     width: 160 },
                      { label: 'User',     width: 120 },
                      { label: 'When',     width: 130 },
                      { label: 'Duration', width: 80 },
                      { label: 'Message',  width: 200 }
                    ].map(({ label, width }) => (
                      <th
                        key={label}
                        className="text-left px-3 py-2 text-xs font-semibold"
                        style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', width }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((entry) => <LogRow key={entry.id} entry={entry} />)}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── SESSIONS ── */}
      {tab === 'sessions' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {viewingSession ? (
            <>
              {/* Session viewer header */}
              <div
                className="flex items-center gap-3 px-3 py-2 flex-shrink-0"
                style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}
              >
                <button
                  onClick={() => setViewingSession(null)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                  style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                >
                  <ChevronLeft size={12} />
                  Back
                </button>

                <div className="flex items-center gap-2 flex-1">
                  <div
                    className="flex items-center justify-center rounded"
                    style={{ width: 28, height: 28, background: 'var(--accent-subtle)', flexShrink: 0 }}
                  >
                    <Terminal size={14} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {viewingSession.meta.serverName}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {viewingSession.meta.username}@{viewingSession.meta.host}
                      {' · '}
                      {viewingSession.meta.endedAt
                        ? formatDur(viewingSession.meta.endedAt - viewingSession.meta.startedAt)
                        : <span style={{ color: 'var(--success)' }}>active</span>}
                      {' · '}
                      {formatTs(viewingSession.meta.startedAt)}
                    </p>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input
                      value={sessionSearch}
                      onChange={(e) => setSessionSearch(e.target.value)}
                      placeholder="Search in log..."
                      style={{ paddingLeft: 24, fontSize: 12, padding: '4px 8px 4px 24px', width: 160 }}
                    />
                  </div>
                  <button
                    onClick={() => setCmdOnly((v) => !v)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs"
                    style={{
                      background: cmdOnly ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: cmdOnly ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${cmdOnly ? 'var(--accent)' : 'var(--border)'}`
                    }}
                    title="Show commands only"
                  >
                    <Filter size={11} />
                    Commands
                  </button>
                  <button
                    onClick={handleCopySession}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs"
                    style={{
                      background: copied ? 'var(--success-subtle)' : 'var(--bg-elevated)',
                      color: copied ? 'var(--success)' : 'var(--text-secondary)',
                      border: `1px solid ${copied ? 'var(--success)' : 'var(--border)'}`,
                      transition: 'all 0.15s'
                    }}
                    title="Copy visible content"
                  >
                    {copied ? <CheckCircle size={11} /> : <Copy size={11} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={handleDownloadSession}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    title="Download full log"
                  >
                    <Download size={11} />
                  </button>
                </div>
              </div>

              {/* Line count */}
              {(sessionSearch || cmdOnly) && (
                <div
                  className="px-4 py-1 text-xs flex-shrink-0"
                  style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
                >
                  {sessionContent.length} line{sessionContent.length !== 1 ? 's' : ''}
                  {cmdOnly && ' (commands only)'}
                  {sessionSearch && ` · "${sessionSearch}"`}
                </div>
              )}

              {/* Log content */}
              <div className="flex-1 overflow-auto" style={{ background: 'var(--terminal-bg)' }}>
                <pre
                  className="p-4 text-xs"
                  style={{
                    fontFamily: 'JetBrains Mono, Cascadia Code, monospace',
                    color: 'var(--terminal-fg)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    lineHeight: 1.6,
                    margin: 0,
                    userSelect: 'text',
                    cursor: 'text'
                  }}
                >
                  {sessionContent.map(({ raw, stripped }, i) => {
                    const isCmd = stripped.includes('CMD>')
                    const isSeparator = stripped.startsWith('=')
                    const isHeader = stripped.startsWith('Server') || stripped.startsWith('Host') || stripped.startsWith('User') || stripped.startsWith('Started') || stripped.startsWith('Session ended')
                    return (
                      <span key={i} style={{ fontWeight: isCmd ? 600 : undefined }}>
                        {isCmd || isSeparator || isHeader ? (
                          <span style={{ color: isCmd ? 'var(--accent)' : 'var(--text-muted)' }}>
                            {stripped}
                          </span>
                        ) : (
                          <AnsiLine text={raw} />
                        )}{'\n'}
                      </span>
                    )
                  })}
                </pre>
              </div>
            </>
          ) : (
            <>
              {/* Sessions list toolbar */}
              <div
                className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
                style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}
              >
                <p className="text-xs font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
                  {sessions.length} session{sessions.length !== 1 ? 's' : ''} recorded
                </p>
                <button
                  onClick={handleRefreshSessions}
                  style={{ color: 'var(--text-muted)', background: 'none' }}
                  title="Refresh list"
                >
                  <RefreshCw size={13} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {sessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-3" style={{ color: 'var(--text-muted)' }}>
                    <FileText size={32} strokeWidth={1.5} />
                    <div className="text-center">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No sessions recorded</p>
                      <p className="text-xs mt-1">Start an SSH connection to record a session</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {sessions.map((s) => {
                      const isActive = !s.endedAt
                      const dur = s.endedAt ? s.endedAt - s.startedAt : undefined
                      return (
                        <SessionRow
                          key={s.sessionId}
                          session={s}
                          isActive={isActive}
                          dur={dur}
                          onClick={() => handleViewSession(s)}
                          onDelete={(e) => handleDeleteSession(s.sessionId, e)}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── REMOTE LOGGING ── */}
      {tab === 'remote' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-lg mx-auto flex flex-col gap-5">
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Remote Logging</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Send connection events to an external log server in real time.
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Enable remote logging</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sends SSH events to the configured server</p>
              </div>
              <Toggle value={remoteForm.enabled} onChange={(v) => setRemoteForm((f) => ({ ...f, enabled: v }))} />
            </div>

            <FormRow label="Provider">
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
                placeholder="e.g. graylog.company.com"
              />
            </FormRow>

            <FormRow label="Port">
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

            <div className="flex gap-2">
              <button
                onClick={handleTestRemote}
                disabled={testState === 'testing' || !remoteForm.host}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs"
                style={{
                  background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)', opacity: !remoteForm.host ? 0.5 : 1
                }}
              >
                {testState === 'testing' ? <RefreshCw size={12} className="animate-spin" /> : <Wifi size={12} />}
                Test connection
              </button>
              <button
                onClick={handleSaveRemote}
                className="flex-1 py-2 rounded-lg text-xs font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Save
              </button>
            </div>

            {testState === 'ok' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded text-xs" style={{ background: 'var(--success-subtle)', color: 'var(--success)' }}>
                <CheckCircle size={13} />{testMsg || 'Connection successful'}
              </div>
            )}
            {testState === 'fail' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded text-xs" style={{ background: 'var(--error-subtle)', color: 'var(--error)' }}>
                <XCircle size={13} />{testMsg || 'Connection failed'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-bold" style={{ color }}>{value}</span>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

function LogRow({ entry }: { entry: LogEntry }) {
  const cfg = TYPE_CONFIG[entry.type]
  const [hovered, setHovered] = useState(false)
  const Icon = cfg.Icon
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 0.1s'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td className="px-3 py-2">
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-md w-fit"
          style={{ background: cfg.bg }}
        >
          <Icon size={11} style={{ color: cfg.color, flexShrink: 0 }} />
          <span className="text-xs font-semibold font-mono" style={{ color: cfg.color, fontSize: 10 }}>
            {cfg.label}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{entry.serverName}</td>
      <td className="px-3 py-2 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{entry.host}</td>
      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{entry.username}</td>
      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatTimeAgo(entry.timestamp)}</td>
      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>{formatDur(entry.duration)}</td>
      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)', maxWidth: 200 }}>
        <span className="truncate block">{entry.message ?? ''}</span>
      </td>
    </tr>
  )
}

function SessionRow({ session, isActive, dur, onClick, onDelete }: {
  session: SessionMeta; isActive: boolean; dur?: number
  onClick: () => void; onDelete: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 0.1s'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {/* Icon */}
      <div
        className="flex items-center justify-center rounded-lg flex-shrink-0"
        style={{ width: 36, height: 36, background: isActive ? 'var(--success-subtle)' : 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <Terminal size={14} style={{ color: isActive ? 'var(--success)' : 'var(--text-muted)' }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {session.serverName}
          </p>
          {isActive && (
            <span
              className="flex items-center gap-1 rounded-full px-1.5 text-xs"
              style={{ background: 'var(--success-subtle)', color: 'var(--success)', fontSize: 10, lineHeight: '16px' }}
            >
              <span className="status-dot connected" style={{ width: 5, height: 5 }} />
              active
            </span>
          )}
        </div>
        <p className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
          {session.username}@{session.host}
        </p>
      </div>

      {/* Meta */}
      <div className="text-right flex-shrink-0">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {dur !== undefined ? formatDur(dur) : '—'}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          {formatTimeAgo(session.startedAt)}
        </p>
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="flex items-center justify-center w-6 h-6 rounded opacity-0 flex-shrink-0"
        style={{
          color: 'var(--error)', background: 'none',
          opacity: hovered ? 1 : 0, transition: 'opacity 0.1s'
        }}
        title="Delete session"
      >
        <Trash2 size={12} />
      </button>
    </div>
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
      className="relative rounded-full flex-shrink-0"
      style={{ width: 36, height: 20, background: value ? 'var(--accent)' : 'var(--bg-active)' }}
    >
      <div
        className="absolute top-1 rounded-full bg-white"
        style={{ width: 12, height: 12, left: value ? 20 : 4, transition: 'left 0.15s' }}
      />
    </button>
  )
}
