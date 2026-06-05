import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, Folder, ChevronRight } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { Server } from '../../types'
import { HOST_ICON_COLORS } from '../../types'

function getInitials(name: string): string {
  return name.split(/[\s\-_]+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'H'
}

function getIconColor(server: Partial<Server>): string {
  if (server.color) return server.color
  const idx = (server.name ?? 'H').charCodeAt(0) % HOST_ICON_COLORS.length
  return HOST_ICON_COLORS[idx]
}

export default function HostForm({ onConnect }: { onConnect: (server: Server) => void }) {
  const { rightPanel, setRightPanel, groups, upsertServer } = useAppStore()
  const isEdit = rightPanel?.mode === 'edit'
  const editServer = isEdit ? (rightPanel as any).server as Server : null
  const defaultGroupId = rightPanel?.mode === 'new' ? (rightPanel as any).groupId : undefined

  const [form, setForm] = useState<Partial<Server>>({
    name: '', host: '', port: 22, username: '',
    protocol: 'ssh', authMethod: 'password', password: '', color: undefined,
    groupId: defaultGroupId, notes: ''
  })
  const [showPw, setShowPw] = useState(false)
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const defaultPort = (proto: string) => proto === 'rdp' ? 3389 : proto === 'vnc' ? 5900 : 22

  useEffect(() => {
    if (editServer) {
      setForm({ ...editServer })
    } else {
      setForm({ name: '', host: '', port: 22, username: '', protocol: 'ssh', authMethod: 'password', password: '', groupId: defaultGroupId })
    }
    setError('')
  }, [rightPanel])

  const set = (k: keyof Server, v: any) => setForm((f) => ({ ...f, [k]: v }))

  const validate = () => {
    if (!form.host?.trim()) return 'Host obrigatorio'
    if (!form.username?.trim()) return 'Usuario obrigatorio'
    return ''
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { setError(err); return }
    if (!form.name?.trim()) set('name', form.host!)
    setSaving(true)
    try {
      const toSave = { ...form, name: form.name?.trim() || form.host! }
      const saved = await window.api.servers.save(toSave as Server)
      upsertServer(saved)
      setRightPanel(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleConnect = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setSaving(true)
    try {
      const toSave = { ...form, name: form.name?.trim() || form.host! }
      const saved = await window.api.servers.save(toSave as Server)
      upsertServer(saved)
      setRightPanel(null)
      onConnect(saved)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const color = getIconColor(form)

  return (
    <div
      className="flex flex-col h-full animate-slide-right"
      style={{ width: 280, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)', flexShrink: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <div
            className="host-icon"
            style={{ width: 28, height: 28, background: `linear-gradient(135deg, ${color}, ${color}bb)`, fontSize: 10 }}
          >
            {getInitials(form.name || 'H')}
          </div>
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              {isEdit ? 'Editar Host' : 'New Host'}
            </p>
            {form.host && (
              <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: 10 }}>{form.host}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => setRightPanel(null)}
          className="flex items-center justify-center w-6 h-6 rounded"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={13} />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto">
        {/* Protocol selector */}
        <div className="flex gap-1 px-4 pt-3">
          {(['ssh', 'rdp', 'vnc'] as const).map((proto) => (
            <button
              key={proto}
              onClick={() => { set('protocol', proto); set('port', defaultPort(proto)) }}
              className="flex-1 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider"
              style={{
                background: form.protocol === proto ? 'var(--accent)' : 'var(--bg-elevated)',
                color: form.protocol === proto ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${form.protocol === proto ? 'var(--accent)' : 'var(--border)'}`
              }}
            >
              {proto}
            </button>
          ))}
        </div>

        <FormSection label="Address">
          <input
            value={form.host ?? ''}
            onChange={(e) => set('host', e.target.value)}
            placeholder="IP ou Hostname"
            autoFocus
          />
        </FormSection>

        <FormSection label="General">
          <input
            value={form.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Label (opcional)"
            className="mb-2"
          />
          <select
            value={form.groupId ?? ''}
            onChange={(e) => set('groupId', e.target.value || undefined)}
            className="mb-2"
          >
            <option value="">Sem grupo</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {HOST_ICON_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => set('color', c)}
                className="rounded-md transition-transform"
                style={{
                  width: 18, height: 18, background: c,
                  outline: form.color === c ? `2px solid ${c}` : '2px solid transparent',
                  outlineOffset: 2,
                  transform: form.color === c ? 'scale(1.25)' : 'scale(1)'
                }}
              />
            ))}
          </div>
        </FormSection>

        {/* Connection section — varia por protocolo */}
        <FormSection label={form.protocol === 'ssh' ? 'SSH' : form.protocol === 'rdp' ? 'RDP' : 'VNC'}>
          <div className="flex gap-2">
            {form.protocol !== 'vnc' && (
              <div className="flex-1">
                <input
                  value={form.username ?? ''}
                  onChange={(e) => set('username', e.target.value)}
                  placeholder="Username"
                />
              </div>
            )}
            <div style={{ width: form.protocol === 'vnc' ? '100%' : 64 }}>
              <input
                type="number"
                value={form.port ?? defaultPort(form.protocol ?? 'ssh')}
                onChange={(e) => set('port', parseInt(e.target.value) || defaultPort(form.protocol ?? 'ssh'))}
                min={1} max={65535}
              />
            </div>
          </div>
          {form.protocol === 'rdp' && (
            <input
              value={form.rdpDomain ?? ''}
              onChange={(e) => set('rdpDomain', e.target.value)}
              placeholder="Domínio (opcional)"
              className="mt-2"
            />
          )}
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            {form.protocol?.toUpperCase()} on port {form.port ?? defaultPort(form.protocol ?? 'ssh')}
          </p>
        </FormSection>

        <FormSection label="Credentials">
          {/* SSH auth */}
          {form.protocol === 'ssh' && (
            <>
              <div className="flex gap-1 mb-2">
                {(['password', 'privateKey', 'agent'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => set('authMethod', m)}
                    className="flex-1 py-1 text-xs rounded-md"
                    style={{
                      background: form.authMethod === m ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: form.authMethod === m ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${form.authMethod === m ? 'var(--accent)' : 'var(--border)'}`,
                      fontSize: 10
                    }}
                  >
                    {m === 'password' ? 'Senha' : m === 'privateKey' ? 'Chave' : 'Agente'}
                  </button>
                ))}
              </div>

              {form.authMethod === 'password' && (
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={form.password ?? ''}
                    onChange={(e) => set('password', e.target.value)}
                    placeholder="Password"
                    style={{ paddingRight: 32 }}
                  />
                  <button onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)', background: 'none' }}>
                    {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              )}

              {form.authMethod === 'privateKey' && (
                <>
                  <div className="flex gap-1.5 mb-2">
                    <input
                      value={form.privateKeyPath ?? ''}
                      onChange={(e) => set('privateKeyPath', e.target.value)}
                      placeholder="~/.ssh/id_rsa"
                      style={{ flex: 1 }}
                    />
                    <button
                      onClick={async () => { const p = await window.api.dialog.openKey(); if (p) set('privateKeyPath', p) }}
                      className="px-2 py-1 rounded text-xs"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', flexShrink: 0 }}
                    >
                      <Folder size={11} />
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassphrase ? 'text' : 'password'}
                      value={form.passphrase ?? ''}
                      onChange={(e) => set('passphrase', e.target.value)}
                      placeholder="Passphrase (opcional)"
                      style={{ paddingRight: 32 }}
                    />
                    <button onClick={() => setShowPassphrase((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--text-muted)', background: 'none' }}>
                      {showPassphrase ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  </div>
                </>
              )}

              {form.authMethod === 'agent' && (
                <div className="text-xs px-2 py-2 rounded" style={{ background: 'var(--success-subtle)', color: 'var(--success)' }}>
                  Usando agente SSH do sistema
                </div>
              )}
            </>
          )}

          {/* RDP password */}
          {form.protocol === 'rdp' && (
            <>
              <div className="relative mb-2">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password ?? ''}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="Senha (opcional)"
                  style={{ paddingRight: 32 }}
                />
                <button onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)', background: 'none' }}>
                  {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => set('rdpFullscreen', !form.rdpFullscreen)}
                  className="relative rounded-full"
                  style={{ width: 32, height: 18, background: form.rdpFullscreen ? 'var(--accent)' : 'var(--bg-active)', cursor: 'pointer', flexShrink: 0 }}
                >
                  <div className="absolute top-1 rounded-full bg-white" style={{ width: 10, height: 10, left: form.rdpFullscreen ? 18 : 4, transition: 'left 0.15s' }} />
                </div>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Iniciar em tela cheia</span>
              </label>
            </>
          )}

          {/* VNC password */}
          {form.protocol === 'vnc' && (
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={form.vncPassword ?? ''}
                onChange={(e) => set('vncPassword', e.target.value)}
                placeholder="Senha VNC (opcional)"
                style={{ paddingRight: 32 }}
              />
              <button onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)', background: 'none' }}>
                {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          )}

        </FormSection>

        {error && (
          <div className="mx-4 mb-3 px-3 py-2 rounded text-xs" style={{ background: 'var(--error-subtle)', color: 'var(--error)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          onClick={handleConnect}
          disabled={saving}
          className="w-full py-2 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--accent)', color: '#fff', opacity: saving ? 0.7 : 1 }}
        >
          Connect
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-1.5 rounded-lg text-xs"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          {isEdit ? 'Salvar' : 'Salvar sem conectar'}
        </button>
      </div>
    </div>
  )
}

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </p>
      {children}
    </div>
  )
}
