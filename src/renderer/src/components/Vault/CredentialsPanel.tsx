import { useState } from 'react'
import { KeyRound, Plus, Pencil, Trash2, Eye, EyeOff, Folder, ArrowLeft, ShieldCheck } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { Credential } from '../../types'

const EMPTY: Partial<Credential> = { name: '', username: '', authMethod: 'password', password: '' }

export default function CredentialsPanel() {
  const { credentials, servers, upsertCredential, removeCredential } = useAppStore()
  const [editing, setEditing] = useState<Partial<Credential> | null>(null)

  const usageCount = (id: string) => servers.filter((s) => s.credentialId === id).length

  const handleDelete = async (cred: Credential) => {
    const used = usageCount(cred.id)
    const msg = used > 0
      ? `Delete "${cred.name}"? ${used} host(s) use it and will fall back to their own credentials.`
      : `Delete "${cred.name}"?`
    if (!confirm(msg)) return
    await window.api.credentials.delete(cred.id)
    removeCredential(cred.id)
  }

  if (editing) {
    return <CredentialEditor initial={editing} onDone={() => setEditing(null)} onSaved={upsertCredential} />
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2.5">
          <KeyRound size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Credential Vault</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Reusable logins shared across hosts — encrypted at rest with your OS keystore
            </p>
          </div>
        </div>
        <button
          onClick={() => setEditing({ ...EMPTY })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Plus size={13} /> New credential
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {credentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 mt-16" style={{ color: 'var(--text-muted)' }}>
            <ShieldCheck size={36} style={{ opacity: 0.4 }} />
            <p className="text-sm">No saved credentials yet</p>
            <p className="text-xs text-center" style={{ maxWidth: 320 }}>
              Create a credential (e.g. <span style={{ color: 'var(--text-secondary)' }}>admin-switches</span>) once,
              then attach it to any host. Update the password in one place.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2" style={{ maxWidth: 640 }}>
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
              >
                <div
                  className="flex items-center justify-center rounded-lg flex-shrink-0"
                  style={{ width: 34, height: 34, background: 'var(--accent-subtle)', color: 'var(--accent)' }}
                >
                  <KeyRound size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{cred.name}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {cred.username} · {cred.authMethod === 'password' ? 'password' : cred.authMethod === 'privateKey' ? 'SSH key' : 'agent'}
                    {usageCount(cred.id) > 0 && ` · used by ${usageCount(cred.id)} host(s)`}
                  </p>
                </div>
                <button
                  onClick={() => setEditing({ ...cred })}
                  className="flex items-center justify-center w-7 h-7 rounded"
                  style={{ color: 'var(--text-secondary)' }}
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => handleDelete(cred)}
                  className="flex items-center justify-center w-7 h-7 rounded"
                  style={{ color: 'var(--error)' }}
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CredentialEditor({ initial, onDone, onSaved }: {
  initial: Partial<Credential>
  onDone: () => void
  onSaved: (c: Credential) => void
}) {
  const [form, setForm] = useState<Partial<Credential>>(initial)
  const [showPw, setShowPw] = useState(false)
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const isEdit = !!initial.id

  const set = (k: keyof Credential, v: any) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name?.trim()) { setError('Name required'); return }
    if (!form.username?.trim()) { setError('Username required'); return }
    setSaving(true)
    try {
      const authMethod = form.privateKeyPath?.trim() ? 'privateKey' : (form.authMethod ?? 'password')
      const saved = await window.api.credentials.save({ ...form, name: form.name!.trim(), authMethod })
      onSaved(saved as Credential)
      onDone()
    } catch (e: any) {
      setError(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <div className="flex items-center gap-2 px-6 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <button onClick={onDone} className="flex items-center justify-center w-7 h-7 rounded" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={15} />
        </button>
        <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {isEdit ? 'Edit credential' : 'New credential'}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-3" style={{ maxWidth: 420 }}>
          <Field label="Name">
            <input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. admin-switches" autoFocus />
          </Field>
          <Field label="Username">
            <input value={form.username ?? ''} onChange={(e) => set('username', e.target.value)} placeholder="Username" />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={form.password ?? ''}
                onChange={(e) => set('password', e.target.value)}
                placeholder="Password"
                style={{ paddingRight: 32 }}
              />
              <button onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)', background: 'none' }}>
                {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          </Field>

          <Field label="SSH Key (optional)">
            <div className="flex gap-1.5">
              <input value={form.privateKeyPath ?? ''} onChange={(e) => set('privateKeyPath', e.target.value)} placeholder="~/.ssh/id_rsa" style={{ flex: 1 }} />
              <button
                onClick={async () => { const p = await window.api.dialog.openKey(); if (p) set('privateKeyPath', p) }}
                className="px-2 rounded text-xs"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                <Folder size={11} />
              </button>
            </div>
          </Field>
          {form.privateKeyPath?.trim() && (
            <Field label="Passphrase (optional)">
              <div className="relative">
                <input
                  type={showPassphrase ? 'text' : 'password'}
                  value={form.passphrase ?? ''}
                  onChange={(e) => set('passphrase', e.target.value)}
                  placeholder="Key passphrase"
                  style={{ paddingRight: 32 }}
                />
                <button onClick={() => setShowPassphrase((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)', background: 'none' }}>
                  {showPassphrase ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
            </Field>
          )}

          {error && (
            <div className="px-3 py-2 rounded text-xs" style={{ background: 'var(--error-subtle)', color: 'var(--error)' }}>{error}</div>
          )}

          <div className="flex gap-2 mt-2">
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--accent)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
              {isEdit ? 'Save changes' : 'Create credential'}
            </button>
            <button onClick={onDone} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
      {children}
    </div>
  )
}
