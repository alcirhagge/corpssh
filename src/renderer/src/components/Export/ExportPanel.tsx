import { useState } from 'react'
import { FileDown, FileUp, CheckCircle, XCircle, RefreshCw, FileCode } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

export default function ExportPanel() {
  const { servers, groups, upsertServer, upsertGroup } = useAppStore()
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleExport = async () => {
    setState('loading')
    try {
      const path = await window.api.xml.export()
      if (path) {
        setState('ok')
        setMessage(`Exportado para: ${path}`)
      } else {
        setState('idle')
      }
    } catch (e: any) {
      setState('error')
      setMessage(e.message)
    }
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
    } catch (e: any) {
      setState('error')
      setMessage(e.message)
    }
  }

  return (
    <div className="flex flex-col h-full p-6" style={{ background: 'var(--bg-app)' }}>
      <div className="max-w-lg mx-auto w-full flex flex-col gap-6">
        {/* Header */}
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Export / Import</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
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
            icon={<FileDown size={20} />}
            title="Exportar para XML"
            description="Salva todos os servidores e grupos num arquivo .xml que pode ser importado em outro computador."
            buttonLabel="Exportar"
            buttonColor="var(--accent)"
            onClick={handleExport}
            loading={state === 'loading'}
          />
          <ActionCard
            icon={<FileUp size={20} />}
            title="Importar de XML"
            description="Carrega servidores e grupos a partir de um arquivo .xml exportado anteriormente. Dados existentes nao sao removidos."
            buttonLabel="Importar"
            buttonColor="var(--success)"
            onClick={handleImport}
            loading={state === 'loading'}
          />
        </div>

        {/* Status */}
        {state === 'ok' && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs animate-fade-in" style={{ background: 'var(--success-subtle)', color: 'var(--success)' }}>
            <CheckCircle size={14} />
            {message}
          </div>
        )}
        {state === 'error' && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs animate-fade-in" style={{ background: 'var(--error-subtle)', color: 'var(--error)' }}>
            <XCircle size={14} />
            {message}
          </div>
        )}

        {/* XML Format docs */}
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <FileCode size={14} style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Formato XML</span>
          </div>
          <pre
            className="text-xs overflow-x-auto"
            style={{
              color: 'var(--text-muted)',
              fontFamily: 'JetBrains Mono, monospace',
              lineHeight: 1.6
            }}
          >{`<CorpSSH version="1.0">
  <Groups>
    <Group id="..." name="Producao" color="#4c74ff"/>
  </Groups>
  <Servers>
    <Server
      id="..."       name="Web Server"
      host="10.0.0.1" port="22"
      username="ubuntu" authMethod="password"
      groupId="..."  color="#30d48a"/>
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
      <span className="text-2xl font-bold" style={{ color }}>{value}</span>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

function ActionCard({ icon, title, description, buttonLabel, buttonColor, onClick, loading }: {
  icon: React.ReactNode; title: string; description: string
  buttonLabel: string; buttonColor: string; onClick: () => void; loading: boolean
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0" style={{ background: `${buttonColor}22`, color: buttonColor }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>
      </div>
      <button
        onClick={onClick}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
        style={{ background: buttonColor, color: '#fff', opacity: loading ? 0.7 : 1 }}
      >
        {loading ? <RefreshCw size={11} className="animate-spin" /> : null}
        {buttonLabel}
      </button>
    </div>
  )
}
