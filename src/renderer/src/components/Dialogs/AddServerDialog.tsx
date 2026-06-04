import { useState, useEffect } from 'react'
import { X, Server, Key, Eye, EyeOff, Folder } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { Server as ServerType } from '../../types'
import { SERVER_COLORS } from '../../types'

interface AddServerDialogProps {
  server?: ServerType | null
  defaultGroupId?: string
  onClose: () => void
  onSaved: (server: ServerType) => void
}

const DEFAULT: Partial<ServerType> = {
  name: '',
  host: '',
  port: 22,
  username: '',
  authMethod: 'password',
  password: '',
  color: SERVER_COLORS[0]
}

export default function AddServerDialog({ server, defaultGroupId, onClose, onSaved }: AddServerDialogProps) {
  const { groups } = useAppStore()
  const [form, setForm] = useState<Partial<ServerType>>({
    ...DEFAULT,
    groupId: defaultGroupId,
    ...(server ?? {})
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!server

  const set = (key: keyof ServerType, value: any) =>
    setForm(f => ({ ...f, [key]: value }))

  const handleBrowseKey = async () => {
    const path = await window.api.dialog.openKey()
    if (path) set('privateKeyPath', path)
  }

  const validate = () => {
    if (!form.name?.trim()) return 'Nome é obrigatório'
    if (!form.host?.trim()) return 'Host é obrigatório'
    if (!form.username?.trim()) return 'Usuário é obrigatório'
    if (!form.port || form.port < 1 || form.port > 65535) return 'Porta inválida'
    if (form.authMethod === 'password' && !form.password?.trim()) return 'Senha é obrigatória'
    if (form.authMethod === 'privateKey' && !form.privateKeyPath?.trim() && !form.privateKeyContent?.trim())
      return 'Chave privada é obrigatória'
    return ''
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setSaving(true)
    try {
      const saved = await window.api.servers.save(form as ServerType)
      onSaved(saved)
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className="rounded-xl shadow-2xl w-full overflow-hidden animate-fade-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          maxWidth: 520
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: 'var(--accent-subtle)' }}>
              <Server size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {isEdit ? 'Editar Servidor' : 'Adicionar Servidor'}
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Configure a conexão SSH
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Color + Name */}
          <div className="flex gap-3">
            <div>
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-1.5 mt-1" style={{ width: 120 }}>
                {SERVER_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => set('color', c)}
                    className="w-5 h-5 rounded-full transition-transform"
                    style={{
                      background: c,
                      outline: form.color === c ? `2px solid ${c}` : '2px solid transparent',
                      outlineOffset: 2,
                      transform: form.color === c ? 'scale(1.2)' : 'scale(1)'
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="flex-1">
              <Field label="Nome" required>
                <input
                  value={form.name ?? ''}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Ex: Servidor Produção"
                />
              </Field>
            </div>
          </div>

          <Divider />

          {/* Connection */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Host / IP" required>
                <input
                  value={form.host ?? ''}
                  onChange={e => set('host', e.target.value)}
                  placeholder="Ex: 192.168.1.10 ou meu.servidor.com"
                />
              </Field>
            </div>
            <Field label="Porta">
              <input
                type="number"
                value={form.port ?? 22}
                onChange={e => set('port', parseInt(e.target.value) || 22)}
                min={1}
                max={65535}
              />
            </Field>
          </div>

          <Field label="Usuário" required>
            <input
              value={form.username ?? ''}
              onChange={e => set('username', e.target.value)}
              placeholder="Ex: ubuntu, ec2-user, root"
            />
          </Field>

          {/* Auth */}
          <div>
            <Label>Autenticação</Label>
            <div className="flex gap-2 mt-1">
              {(['password', 'privateKey', 'agent'] as const).map(method => (
                <button
                  key={method}
                  onClick={() => set('authMethod', method)}
                  className="flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: form.authMethod === method ? 'var(--accent)' : 'var(--bg-input)',
                    color: form.authMethod === method ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${form.authMethod === method ? 'var(--accent)' : 'var(--border)'}`
                  }}
                >
                  {method === 'password' ? 'Senha' : method === 'privateKey' ? 'Chave SSH' : 'Agente SSH'}
                </button>
              ))}
            </div>
          </div>

          {form.authMethod === 'password' && (
            <Field label="Senha" required>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password ?? ''}
                  onChange={e => set('password', e.target.value)}
                  placeholder="••••••••"
                  style={{ paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)', background: 'none' }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>
          )}

          {form.authMethod === 'privateKey' && (
            <>
              <Field label="Caminho da Chave Privada" required>
                <div className="flex gap-2">
                  <input
                    value={form.privateKeyPath ?? ''}
                    onChange={e => set('privateKeyPath', e.target.value)}
                    placeholder="~/.ssh/id_rsa"
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={handleBrowseKey}
                    className="flex items-center gap-1 px-2 rounded-lg text-xs"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      flexShrink: 0
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                  >
                    <Folder size={12} />
                    Buscar
                  </button>
                </div>
              </Field>
              <Field label="Passphrase (opcional)">
                <div className="relative">
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    value={form.passphrase ?? ''}
                    onChange={e => set('passphrase', e.target.value)}
                    placeholder="Deixe vazio se não tiver"
                    style={{ paddingRight: 36 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)', background: 'none' }}
                  >
                    {showPassphrase ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>
            </>
          )}

          {form.authMethod === 'agent' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs" style={{ background: 'var(--success-subtle)', color: 'var(--success)' }}>
              <Key size={13} />
              Usando o agente SSH do sistema (SSH_AUTH_SOCK)
            </div>
          )}

          <Divider />

          {/* Group */}
          <Field label="Grupo (opcional)">
            <select value={form.groupId ?? ''} onChange={e => set('groupId', e.target.value || undefined)}>
              <option value="">Sem grupo</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>

          {/* Notes */}
          <Field label="Notas (opcional)">
            <textarea
              value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
              placeholder="Observações sobre este servidor..."
              style={{ resize: 'none', height: 60 }}
            />
          </Field>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
        >
          {error && <p className="text-xs" style={{ color: 'var(--error)' }}>{error}</p>}
          {!error && <div />}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs"
              style={{
                background: 'var(--bg-input)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)'
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg text-xs font-medium"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </label>
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

function Divider() {
  return <div style={{ height: 1, background: 'var(--border-subtle)' }} />
}
