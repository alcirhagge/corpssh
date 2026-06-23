import { useState, useEffect, useRef } from 'react'
import { X, Eye, EyeOff, Folder, Sparkles, Plus, FolderPlus, MonitorDot } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { Server } from '../../types'
import { HOST_ICON_COLORS } from '../../types'
import { OS_MAP, ICON_CHOICES, getOsInfo } from './HostDashboard'

function getInitials(name: string): string {
  return name.split(/[\s\-_]+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'H'
}

function getIconColor(server: Partial<Server>): string {
  if (server.color) return server.color
  const idx = (server.name ?? 'H').charCodeAt(0) % HOST_ICON_COLORS.length
  return HOST_ICON_COLORS[idx]
}

export default function HostForm({ onConnect }: { onConnect: (server: Server) => void }) {
  const { rightPanel, setRightPanel, groups, credentials, servers, upsertServer } = useAppStore()
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
  const [showKeySection, setShowKeySection] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [portFocused, setPortFocused] = useState(false)

  const isDirty = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serverIdRef = useRef<string | undefined>(editServer?.id)

  const defaultPort = (proto: string) => proto === 'rdp' ? 3389 : proto === 'vnc' ? 5900 : 22

  useEffect(() => {
    isDirty.current = false
    serverIdRef.current = editServer?.id
    if (editServer) {
      setForm({ ...editServer })
      setShowKeySection(editServer.authMethod === 'privateKey' || !!editServer.privateKeyPath)
    } else {
      setForm({ name: '', host: '', port: 22, username: '', protocol: 'ssh', authMethod: 'password', password: '', groupId: defaultGroupId })
      setShowKeySection(false)
    }
    setError('')
  }, [rightPanel])

  const set = (k: keyof Server, v: any) => {
    isDirty.current = true
    setForm((f) => ({ ...f, [k]: v }))
  }

  // Auto-save
  useEffect(() => {
    if (!isDirty.current || !form.host?.trim()) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const derivedAuthMethod = form.privateKeyPath?.trim() ? 'privateKey' : 'password'
        const toSave = { ...form, id: serverIdRef.current, name: form.name?.trim() || form.host!, authMethod: derivedAuthMethod, port: form.port || defaultPort(form.protocol ?? 'ssh') }
        const saved = await window.api.servers.save(toSave as Server)
        upsertServer(saved)
        serverIdRef.current = saved.id

        // Detectar OS em background quando tiver credenciais suficientes
        const canDetect = saved.protocol === 'ssh' &&
          saved.host?.trim() && saved.username?.trim() &&
          (saved.password?.trim() || saved.privateKeyPath?.trim() || saved.privateKeyContent?.trim())
        if (canDetect && !saved.detectedOs) {
          window.api.ssh.detectOs(saved).then((detectedOs: string) => {
            if (detectedOs && detectedOs !== 'unknown') {
              upsertServer({ ...saved, detectedOs })
            }
          }).catch(() => {})
        }
      } catch (e: any) {
        // silent auto-save fail
      }
    }, 800)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [form])

  const validate = () => {
    if (!form.host?.trim()) return 'Host required'
    // A vault credential supplies the username, so the inline field can be empty
    if (form.protocol !== 'vnc' && !form.credentialId && !form.username?.trim()) return 'Username required'
    return ''
  }

  const handleConnect = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setSaving(true)
    try {
      const derivedAuthMethod = form.privateKeyPath?.trim() ? 'privateKey' : 'password'
      const toSave = { ...form, id: serverIdRef.current, name: form.name?.trim() || form.host!, authMethod: derivedAuthMethod }
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
      className="flex flex-col h-full animate-slide-right cs-glass-strong"
      style={{ width: 280, background: 'var(--bg-surface)', borderLeft: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', flexShrink: 0 }}
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
              {isEdit ? 'Edit Host' : 'New Host'}
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

        {/* Nome / General */}
        <FormSection label="Nome">
          <input
            value={form.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Label (optional)"
            autoFocus
            className="mb-2"
          />
          <select
            value={form.groupId ?? ''}
            onChange={(e) => set('groupId', e.target.value || undefined)}
            className="mb-2"
          >
            <option value="">No group</option>
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

        {/* Icon override — useful for network gear where OS auto-detection can't run */}
        <FormSection label="Icon">
          <div className="flex flex-wrap gap-1.5">
            {(() => {
              const groupName = groups.find((g) => g.id === form.groupId)?.name
              const auto = getOsInfo({ ...(form as any), iconOverride: undefined }, groupName)
              const AutoIcon = auto.Icon
              const isAuto = !form.iconOverride
              return (
                <button
                  onClick={() => set('iconOverride', undefined)}
                  title="Auto-detect"
                  className="relative flex items-center justify-center rounded-lg"
                  style={{
                    width: 30, height: 30, background: `linear-gradient(135deg, ${auto.color}, ${auto.color}bb)`,
                    outline: isAuto ? '2px solid var(--accent)' : '2px solid transparent', outlineOffset: 1
                  }}
                >
                  <AutoIcon s={16} />
                  <span className="absolute -bottom-1 -right-1 rounded-full flex items-center justify-center"
                    style={{ width: 13, height: 13, background: 'var(--accent)', color: '#fff' }}>
                    <Sparkles size={8} />
                  </span>
                </button>
              )
            })()}
            {ICON_CHOICES.map(({ key, label }) => {
              const info = OS_MAP[key]
              if (!info) return null
              const Icon = info.Icon
              const selected = form.iconOverride === key
              return (
                <button
                  key={key}
                  onClick={() => set('iconOverride', key)}
                  title={label}
                  className="flex items-center justify-center rounded-lg"
                  style={{
                    width: 30, height: 30, background: `linear-gradient(135deg, ${info.color}, ${info.color}bb)`,
                    outline: selected ? '2px solid var(--accent)' : '2px solid transparent', outlineOffset: 1
                  }}
                >
                  <Icon s={16} />
                </button>
              )
            })}
          </div>
        </FormSection>

        {/* Address + Port */}
        <FormSection label="Address">
          <div className="flex gap-2">
            <input
              value={form.host ?? ''}
              onChange={(e) => set('host', e.target.value)}
              placeholder="IP or Hostname"
              style={{ flex: 1 }}
            />
            <div
              style={{
                width: portFocused ? 116 : 64,
                flexShrink: 0,
                transition: 'width 180ms cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              <input
                type="text"
                inputMode="numeric"
                value={form.port ?? ''}
                placeholder={String(defaultPort(form.protocol ?? 'ssh'))}
                onFocus={() => setPortFocused(true)}
                onBlur={() => setPortFocused(false)}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 5)
                  set('port', digits === '' ? undefined : parseInt(digits, 10))
                }}
                style={{ textAlign: 'center', width: '100%' }}
              />
            </div>
          </div>
        </FormSection>

        {/* SSH section */}
        {form.protocol === 'ssh' && (
          <FormSection label="SSH">
            {/* Credential source: a saved vault credential overrides the inline fields */}
            <select
              value={form.credentialId ?? ''}
              onChange={(e) => set('credentialId', e.target.value || undefined)}
              className="mb-2"
            >
              <option value="">This host (custom credentials)</option>
              {credentials.map((c) => (
                <option key={c.id} value={c.id}>🔑 {c.name} ({c.username})</option>
              ))}
            </select>

            {/* Jump host (ProxyJump): tunnel through a saved bastion to reach this host */}
            <select
              value={form.jumpHostId ?? ''}
              onChange={(e) => set('jumpHostId', e.target.value || undefined)}
              className="mb-2"
              title="Conectar através de um bastion (ProxyJump)"
            >
              <option value="">Direct (no jump host)</option>
              {servers
                .filter((s) => (s.protocol ?? 'ssh') === 'ssh' && s.id !== serverIdRef.current)
                .map((s) => (
                  <option key={s.id} value={s.id}>↪ via {s.name || s.host}</option>
                ))}
            </select>

            {form.credentialId ? (
              <div
                className="px-3 py-2 rounded text-xs mb-1"
                style={{ background: 'var(--accent-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Using saved credential
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {' '}{credentials.find((c) => c.id === form.credentialId)?.name ?? '—'}
                </span>. Manage it in the Vault.
              </div>
            ) : (
            <>
            <input
              value={form.username ?? ''}
              onChange={(e) => set('username', e.target.value)}
              placeholder="Username"
              className="mb-2"
            />
            <div className="relative mb-2">
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

            {/* SSH key toggle */}
            <button
              onClick={() => setShowKeySection((v) => !v)}
              className="flex items-center gap-1.5 text-xs mb-2"
              style={{ color: 'var(--text-secondary)', background: 'none', padding: 0, cursor: 'pointer' }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 16, height: 16, borderRadius: 4, fontSize: 14, lineHeight: 1,
                background: showKeySection ? 'var(--accent)' : 'var(--bg-elevated)',
                color: showKeySection ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${showKeySection ? 'var(--accent)' : 'var(--border)'}`,
                flexShrink: 0
              }}>
                {showKeySection ? '−' : '+'}
              </span>
              SSH Key
            </button>

            {showKeySection && (
              <div className="pl-2" style={{ borderLeft: '2px solid var(--accent-subtle)' }}>
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
                    placeholder="Passphrase (optional)"
                    style={{ paddingRight: 32 }}
                  />
                  <button onClick={() => setShowPassphrase((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)', background: 'none' }}>
                    {showPassphrase ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>
            )}
            </>
            )}
          </FormSection>
        )}

        {/* RDP section */}
        {form.protocol === 'rdp' && (
          <FormSection label="RDP">
            <input
              value={form.username ?? ''}
              onChange={(e) => set('username', e.target.value)}
              placeholder="Username"
              className="mb-2"
            />
            <div className="relative mb-2">
              <input
                type={showPw ? 'text' : 'password'}
                value={form.password ?? ''}
                onChange={(e) => set('password', e.target.value)}
                placeholder="Password (optional)"
                style={{ paddingRight: 32 }}
              />
              <button onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)', background: 'none' }}>
                {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            <input
              value={form.rdpDomain ?? ''}
              onChange={(e) => set('rdpDomain', e.target.value)}
              placeholder="Domain (optional)"
              className="mb-2"
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => set('rdpFullscreen', !form.rdpFullscreen)}
                className="relative rounded-full"
                style={{ width: 32, height: 18, background: form.rdpFullscreen ? 'var(--accent)' : 'var(--bg-active)', cursor: 'pointer', flexShrink: 0 }}
              >
                <div className="absolute top-1 rounded-full bg-white" style={{ width: 10, height: 10, left: form.rdpFullscreen ? 18 : 4, transition: 'left 0.15s' }} />
              </div>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Start fullscreen</span>
            </label>
          </FormSection>
        )}

        {/* VNC section */}
        {form.protocol === 'vnc' && (
          <FormSection label="VNC">
            <div
              className="flex flex-col items-center gap-2 py-3 px-2 rounded-lg text-center"
              style={{ background: 'var(--warning-subtle)', border: '1px solid var(--warning)', opacity: 0.9 }}
            >
              <span style={{ fontSize: 20 }}>🚧</span>
              <p className="text-xs font-semibold" style={{ color: 'var(--warning)' }}>
                Feature in development
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: 10, lineHeight: 1.4 }}>
                VNC support is still in development and is not available in this version.
              </p>
            </div>
          </FormSection>
        )}

        {error && (
          <div className="mx-4 mb-3 px-3 py-2 rounded text-xs" style={{ background: 'var(--error-subtle)', color: 'var(--error)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          onClick={handleConnect}
          disabled={saving || form.protocol === 'vnc'}
          className="w-full py-2 rounded-lg text-xs font-semibold"
          style={{
            background: form.protocol === 'vnc' ? 'var(--bg-active)' : 'var(--accent)',
            color: form.protocol === 'vnc' ? 'var(--text-muted)' : '#fff',
            opacity: saving ? 0.7 : 1,
            cursor: form.protocol === 'vnc' ? 'not-allowed' : 'pointer'
          }}
        >
          {form.protocol === 'vnc' ? 'Unavailable' : 'Connect'}
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

// ─── Empty side panel ─────────────────────────────────────────────────────────
// Shown in the (now permanently docked) right column when nothing is selected.
// Offers the quick "new connection / new group" actions so the panel never
// pops in/out and reflows the host grid.
export function EmptyHostPanel() {
  const { setRightPanel, upsertGroup } = useAppStore()
  const [addingGroup, setAddingGroup] = useState(false)
  const [groupName, setGroupName] = useState('')

  const commitGroup = async () => {
    const name = groupName.trim()
    if (name) {
      const saved = await window.api.groups.save({ id: '', name })
      upsertGroup(saved)
    }
    setGroupName('')
    setAddingGroup(false)
  }

  return (
    <div
      className="flex flex-col h-full cs-glass-strong"
      style={{ width: 280, background: 'var(--bg-surface)', borderLeft: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', flexShrink: 0 }}
    >
      <div className="flex flex-col items-center justify-center flex-1 px-6 text-center gap-5">
        <div
          className="flex items-center justify-center"
          style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--accent-subtle)', border: '1px solid var(--glass-border)' }}
        >
          <MonitorDot size={28} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: 15 }}>Nothing selected</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Create a connection or a group<br />to organize your hosts.
          </p>
        </div>

        <div className="flex flex-col gap-2 w-full" style={{ maxWidth: 200 }}>
          <button
            onClick={() => setRightPanel({ mode: 'new' })}
            className="flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium"
            style={{ background: 'var(--accent)', color: '#fff', fontSize: 13 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          >
            <Plus size={16} /> New Connection
          </button>

          {addingGroup ? (
            <input
              autoFocus
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitGroup() }
                if (e.key === 'Escape') { setAddingGroup(false); setGroupName('') }
              }}
              onBlur={commitGroup}
              placeholder="Group name..."
              style={{ fontSize: 13, textAlign: 'center' }}
            />
          ) : (
            <button
              onClick={() => setAddingGroup(true)}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 13 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >
              <FolderPlus size={16} /> New Group
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
