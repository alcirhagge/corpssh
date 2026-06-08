import { useState } from 'react'
import { FileDown, FileUp, CheckCircle, XCircle, RefreshCw, FileCode, ShieldAlert } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

export default function ExportPanel() {
  const { servers, groups, upsertServer, upsertGroup } = useAppStore()
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleExport = async () => {
    setState('loading')
    try {
      const path = await window.api.xml.export()
      if (path) { setState('ok'); setMessage(`Exportado para: ${path}`) }
      else setState('idle')
    } catch (e: any) { setState('error'); setMessage(e.message) }
  }

  const handleExportWithCredentials = async () => {
    setState('loading')
    try {
      const path = await window.api.xml.exportWithCredentials()
      if (path) { setState('ok'); setMessage(`Exportado com credenciais para: ${path}`) }
      else setState('idle')
    } catch (e: any) { setState('error'); setMessage(e.message) }
  }

  const handleImport = async () => {
    setState('loading')
    try {
      const result = await window.api.xml.import()
      if (result) {
        result.servers.forEach(upsertServer)
        result.groups.forEach(upsertGroup)
        setState('ok')
        setMessage(`Importado: ${result.servers.length} servidores, ${result.groups.length} grupos`)
      } else {
        setState('idle')
      }
    } catch (e: any) { setState('error'); setMessage(e.message) }
  }

  return (
    <div
      className="flex flex-1 overflow-y-auto p-6"
      style={{ background: 'var(--bg-app)', justifyContent: 'center', alignItems: 'center' }}
    >
      {/* 2-column layout: actions left, XML format right */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: 24,
          width: '100%',
          maxWidth: 940,
          alignItems: 'stretch'
        }}
      >
        {/* ── Left column ── */}
        <div className="flex flex-col gap-5">
          {/* Header */}
          <div>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: 18 }}>
              Export / Import
            </h2>
            <p className="mt-1" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Salve e restaure sua lista de servidores e grupos em formato XML.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Servidores" value={servers.length} color="var(--accent)" />
            <StatCard label="Grupos" value={groups.length} color="var(--purple)" />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <ActionCard
              icon={<FileDown size={22} />}
              title="Exportar para XML"
              description="Salva todos os servidores e grupos num arquivo .xml que pode ser importado em outro computador. Senhas não são incluídas."
              buttonLabel="Exportar"
              buttonColor="var(--accent)"
              onClick={handleExport}
              loading={state === 'loading'}
            />
            <ActionCard
              icon={<ShieldAlert size={22} />}
              title="Exportar com credenciais"
              description="Inclui senhas e chaves no arquivo XML. Use apenas em ambiente seguro — as credenciais ficam em texto puro no arquivo."
              buttonLabel="Exportar"
              buttonColor="var(--warning, #f7b731)"
              onClick={handleExportWithCredentials}
              loading={state === 'loading'}
            />
            <ActionCard
              icon={<FileUp size={22} />}
              title="Importar de XML"
              description="Carrega servidores e grupos a partir de um arquivo .xml exportado anteriormente. Dados existentes não são removidos."
              buttonLabel="Importar"
              buttonColor="var(--success)"
              onClick={handleImport}
              loading={state === 'loading'}
            />
          </div>

          {/* Status */}
          {state === 'ok' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg animate-fade-in" style={{ background: 'var(--success-subtle)', color: 'var(--success)', fontSize: 13 }}>
              <CheckCircle size={15} />
              {message}
            </div>
          )}
          {state === 'error' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg animate-fade-in" style={{ background: 'var(--error-subtle)', color: 'var(--error)', fontSize: 13 }}>
              <XCircle size={15} />
              {message}
            </div>
          )}
        </div>

        {/* ── Right column — XML format ── */}
        <div
          className="rounded-xl p-5 flex-shrink-0"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)'
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <FileCode size={15} style={{ color: 'var(--text-muted)' }} />
            <span className="font-semibold" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Formato XML
            </span>
          </div>
          <pre
            style={{
              color: 'var(--text-muted)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              lineHeight: 1.7,
              overflowX: 'auto',
              margin: 0,
              whiteSpace: 'pre'
            }}
          >{`<CorpSSH version="1.0">
  <Groups>
    <Group
      id="..."
      name="Producao"
      color="#4c74ff"/>
  </Groups>
  <Servers>
    <Server
      id="..."
      name="Web Server"
      host="10.0.0.1"
      port="22"
      username="ubuntu"
      authMethod="password"
      groupId="..."
      color="#30d48a"/>
  </Servers>
</CorpSSH>`}</pre>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <span style={{ fontSize: 28, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

function ActionCard({ icon, title, description, buttonLabel, buttonColor, onClick, loading }: {
  icon: React.ReactNode; title: string; description: string
  buttonLabel: string; buttonColor: string; onClick: () => void; loading: boolean
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0" style={{ background: `${buttonColor}22`, color: buttonColor }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: 14 }}>{title}</p>
        <p className="mt-0.5" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{description}</p>
      </div>
      <button
        onClick={onClick}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium flex-shrink-0"
        style={{ background: buttonColor, color: '#fff', opacity: loading ? 0.7 : 1, fontSize: 13 }}
      >
        {loading ? <RefreshCw size={12} className="animate-spin" /> : null}
        {buttonLabel}
      </button>
    </div>
  )
}
