import { useState } from 'react'
import { FileDown, FileUp, CheckCircle, XCircle, RefreshCw, FileCode, ShieldAlert, Lock, KeyRound } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

export default function ExportPanel() {
  const { upsertServer, upsertGroup } = useAppStore()
  const servers = useAppStore((s) => s.servers)
  const groups = useAppStore((s) => s.groups)
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [includeCredentials, setIncludeCredentials] = useState(false)
  const [exportPassword, setExportPassword] = useState('')
  const [exportPasswordConfirm, setExportPasswordConfirm] = useState('')
  // Set when an encrypted file was picked and we need its password to finish import.
  const [awaitingImportPassword, setAwaitingImportPassword] = useState(false)
  const [importPassword, setImportPassword] = useState('')

  const applyResult = (result: { servers: any[]; groups: any[] }) => {
    result.servers.forEach(upsertServer)
    result.groups.forEach(upsertGroup)
    setState('ok')
    setMessage(`Imported: ${result.servers.length} server${result.servers.length !== 1 ? 's' : ''}, ${result.groups.length} group${result.groups.length !== 1 ? 's' : ''}`)
  }

  const handleExport = async () => {
    if (includeCredentials) {
      if (exportPassword.length < 4) {
        setState('error'); setMessage('Defina uma senha de pelo menos 4 caracteres'); return
      }
      if (exportPassword !== exportPasswordConfirm) {
        setState('error'); setMessage('As senhas não coincidem'); return
      }
    }
    setState('loading')
    try {
      const path = includeCredentials
        ? await window.api.xml.exportWithCredentials(exportPassword)
        : await window.api.xml.export()
      if (path) {
        setState('ok')
        setMessage(includeCredentials ? `Exportado (criptografado) para: ${path}` : `Exported to: ${path}`)
        setExportPassword(''); setExportPasswordConfirm('')
      } else {
        setState('idle')
      }
    } catch (e: any) { setState('error'); setMessage(e.message) }
  }

  const handleImport = async () => {
    setState('loading')
    try {
      const result = await window.api.xml.import()
      if (!result) { setState('idle'); return }
      if ((result as any).needsPassword) {
        setAwaitingImportPassword(true)
        setImportPassword('')
        setState('idle')
        return
      }
      applyResult(result as any)
    } catch (e: any) { setState('error'); setMessage(e.message) }
  }

  const handleImportWithPassword = async () => {
    if (!importPassword) return
    setState('loading')
    try {
      const result = await window.api.xml.importWithPassword(importPassword)
      applyResult(result as any)
      setAwaitingImportPassword(false)
      setImportPassword('')
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
              Save and restore your server and group list in XML format.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Servers" value={servers.length} color="var(--accent)" />
            <StatCard label="Groups" value={groups.length} color="var(--purple)" />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            {/* Export card with inline credential checkbox */}
            <div
              className="flex items-start gap-4 p-4 rounded-xl"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <div
                className="flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0"
                style={{
                  background: includeCredentials ? 'rgba(247,183,49,0.13)' : 'rgba(59,130,246,0.12)',
                  color: includeCredentials ? 'var(--warning, #f7b731)' : 'var(--accent)',
                  transition: 'all 0.15s'
                }}
              >
                {includeCredentials ? <ShieldAlert size={22} /> : <FileDown size={22} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: 14 }}>
                  Export to XML
                </p>
                <p className="mt-0.5" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  Saves all servers and groups to an .xml file importable on another machine.
                </p>
                <label
                  className="flex items-center gap-2 mt-2.5 cursor-pointer"
                  style={{ width: 'fit-content' }}
                >
                  <input
                    type="checkbox"
                    checked={includeCredentials}
                    onChange={(e) => setIncludeCredentials(e.target.checked)}
                    style={{ accentColor: 'var(--warning, #f7b731)', width: 14, height: 14, cursor: 'pointer' }}
                  />
                  <span style={{
                    fontSize: 12,
                    color: includeCredentials ? 'var(--warning, #f7b731)' : 'var(--text-secondary)',
                    transition: 'color 0.15s'
                  }}>
                    Export with credentials (user &amp; password)
                  </span>
                </label>

                {includeCredentials && (
                  <div className="flex flex-col gap-2 mt-3">
                    <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      <Lock size={11} />
                      <span>O arquivo é criptografado com esta senha. Sem ela, não há como importar.</span>
                    </div>
                    <input
                      type="password"
                      value={exportPassword}
                      onChange={(e) => setExportPassword(e.target.value)}
                      placeholder="Senha de criptografia"
                      className="px-2.5 py-1.5 rounded-md"
                      style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12 }}
                    />
                    <input
                      type="password"
                      value={exportPasswordConfirm}
                      onChange={(e) => setExportPasswordConfirm(e.target.value)}
                      placeholder="Confirmar senha"
                      className="px-2.5 py-1.5 rounded-md"
                      style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12 }}
                    />
                  </div>
                )}
              </div>
              <button
                onClick={handleExport}
                disabled={state === 'loading'}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium flex-shrink-0"
                style={{
                  background: includeCredentials ? 'var(--warning, #f7b731)' : 'var(--accent)',
                  color: includeCredentials ? '#1a1100' : '#fff',
                  opacity: state === 'loading' ? 0.7 : 1,
                  fontSize: 13,
                  transition: 'background 0.15s, color 0.15s'
                }}
              >
                {state === 'loading' ? <RefreshCw size={12} className="animate-spin" /> : null}
                Export
              </button>
            </div>

            <ActionCard
              icon={<FileUp size={22} />}
              title="Import from XML"
              description="Loads servers and groups from a previously exported .xml file. Existing data is not removed."
              buttonLabel="Import"
              buttonColor="var(--success)"
              onClick={handleImport}
              loading={state === 'loading'}
            />

            {awaitingImportPassword && (
              <div
                className="flex flex-col gap-2.5 p-4 rounded-xl animate-fade-in"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--warning, #f7b731)' }}
              >
                <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
                  <KeyRound size={15} style={{ color: 'var(--warning, #f7b731)' }} />
                  Arquivo criptografado
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  Digite a senha usada na exportação para importar este arquivo.
                </p>
                <input
                  type="password"
                  autoFocus
                  value={importPassword}
                  onChange={(e) => setImportPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleImportWithPassword() }}
                  placeholder="Senha do arquivo"
                  className="px-2.5 py-1.5 rounded-md"
                  style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12 }}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleImportWithPassword}
                    disabled={state === 'loading' || !importPassword}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium"
                    style={{ background: 'var(--success)', color: '#fff', fontSize: 13, opacity: !importPassword ? 0.6 : 1 }}
                  >
                    {state === 'loading' ? <RefreshCw size={12} className="animate-spin" /> : null}
                    Descriptografar e importar
                  </button>
                  <button
                    onClick={() => { setAwaitingImportPassword(false); setImportPassword(''); setState('idle') }}
                    className="px-3 py-2 rounded-lg font-medium"
                    style={{ background: 'var(--bg-app)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 13 }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
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
              XML Format
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
