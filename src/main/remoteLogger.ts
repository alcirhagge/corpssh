import * as dgram from 'dgram'
import * as https from 'https'
import * as http from 'http'
import type { LogEntry } from './logger'

export interface RemoteLogConfig {
  enabled: boolean
  provider: 'graylog' | 'loki' | 'elasticsearch' | 'syslog'
  host: string
  port: number
  token?: string
  index?: string
  tls?: boolean
}

let currentConfig: RemoteLogConfig | null = null

export function setRemoteConfig(config: RemoteLogConfig): void {
  currentConfig = config
}

export async function sendRemoteLog(entry: LogEntry): Promise<void> {
  if (!currentConfig?.enabled || !currentConfig.host) return
  try {
    switch (currentConfig.provider) {
      case 'graylog':      await sendGELF(entry, currentConfig); break
      case 'loki':         await sendLoki(entry, currentConfig); break
      case 'elasticsearch':await sendElastic(entry, currentConfig); break
      case 'syslog':       await sendSyslog(entry, currentConfig); break
    }
  } catch (e) {
    console.error('[RemoteLogger] send error:', e)
  }
}

export async function testConnection(config: RemoteLogConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const testEntry: LogEntry = {
      id: 'test', timestamp: Date.now(),
      type: 'connect', serverId: 'test',
      serverName: 'CorpSSH Test', host: 'test.host',
      username: 'test', message: 'Connection test from CorpSSH'
    }
    switch (config.provider) {
      case 'graylog':      await sendGELF(testEntry, config); break
      case 'loki':         await sendLoki(testEntry, config); break
      case 'elasticsearch':await sendElastic(testEntry, config); break
      case 'syslog':       await sendSyslog(testEntry, config); break
    }
    return { ok: true, message: `Conexao com ${config.provider} bem-sucedida` }
  } catch (e: any) {
    return { ok: false, message: e.message ?? 'Erro desconhecido' }
  }
}

// ─── Graylog GELF HTTP ──────────────────────────────────────────────────
async function sendGELF(entry: LogEntry, cfg: RemoteLogConfig): Promise<void> {
  const body = JSON.stringify({
    version: '1.1',
    host: 'corpssh',
    short_message: `[${entry.type.toUpperCase()}] ${entry.serverName} (${entry.host})`,
    timestamp: entry.timestamp / 1000,
    level: entry.type === 'error' ? 3 : 6,
    _server_name: entry.serverName,
    _server_host: entry.host,
    _username: entry.username,
    _event_type: entry.type,
    _duration_ms: entry.duration,
    _message: entry.message
  })
  await httpPost({ host: cfg.host, port: cfg.port, path: '/gelf', tls: cfg.tls }, body)
}

// ─── Grafana Loki ───────────────────────────────────────────────────────
async function sendLoki(entry: LogEntry, cfg: RemoteLogConfig): Promise<void> {
  const body = JSON.stringify({
    streams: [{
      stream: { app: 'corpssh', event: entry.type, server: entry.serverName },
      values: [[
        `${entry.timestamp * 1_000_000}`,
        JSON.stringify({ type: entry.type, server: entry.serverName, host: entry.host, user: entry.username, msg: entry.message })
      ]]
    }]
  })
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.token) headers['Authorization'] = `Bearer ${cfg.token}`
  await httpPost({ host: cfg.host, port: cfg.port, path: '/loki/api/v1/push', tls: cfg.tls, headers }, body)
}

// ─── Elasticsearch ──────────────────────────────────────────────────────
async function sendElastic(entry: LogEntry, cfg: RemoteLogConfig): Promise<void> {
  const index = cfg.index ?? 'corpssh-logs'
  const body = JSON.stringify({
    '@timestamp': new Date(entry.timestamp).toISOString(),
    event_type: entry.type,
    server_name: entry.serverName,
    server_host: entry.host,
    username: entry.username,
    duration_ms: entry.duration,
    message: entry.message,
    app: 'corpssh'
  })
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.token) headers['Authorization'] = `ApiKey ${cfg.token}`
  await httpPost({ host: cfg.host, port: cfg.port, path: `/${index}/_doc`, tls: cfg.tls, headers }, body)
}

// ─── Syslog UDP RFC5424 ─────────────────────────────────────────────────
async function sendSyslog(entry: LogEntry, cfg: RemoteLogConfig): Promise<void> {
  const severity = entry.type === 'error' ? 3 : entry.type === 'auth_fail' ? 4 : 6
  const facility = 1
  const priority = facility * 8 + severity
  const ts = new Date(entry.timestamp).toISOString()
  const msg = `[${entry.type.toUpperCase()}] ${entry.serverName} ${entry.username}@${entry.host}`
  const packet = `<${priority}>1 ${ts} corpssh CorpSSH - - - ${msg}`

  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4')
    const buf = Buffer.from(packet)
    client.send(buf, 0, buf.length, cfg.port, cfg.host, (err) => {
      client.close()
      if (err) reject(err)
      else resolve()
    })
  })
}

// ─── HTTP helper ────────────────────────────────────────────────────────
function httpPost(opts: {
  host: string; port: number; path: string; tls?: boolean; headers?: Record<string, string>
}, body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const mod = opts.tls ? https : http
    const req = mod.request({
      hostname: opts.host,
      port: opts.port,
      path: opts.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(opts.headers ?? {})
      },
      rejectUnauthorized: false,
      timeout: 5000
    }, (res) => {
      res.resume()
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve()
      else reject(new Error(`HTTP ${res.statusCode}`))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    req.write(body)
    req.end()
  })
}
