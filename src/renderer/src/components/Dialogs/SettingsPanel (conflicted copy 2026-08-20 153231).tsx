import { useState, useEffect } from 'react'
import { X, Terminal, Palette, Key, Info, Pipette, ShieldCheck, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { THEMES, applyTheme, getThemeBase } from '../../themes'
import type { AppSettings } from '../../types'

declare const __APP_VERSION__: string

interface SettingsPanelProps {
  onClose: () => void
}

type Section = 'appearance' | 'terminal' | 'security' | 'keys' | 'about'

// Quick-pick terminal text colors (classic phosphor / amber / paper / cyan)
const TERM_COLOR_PRESETS = ['#3bdc6b', '#ffb000', '#e8eaf0', '#5ad7ff', '#ff6b9d']

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, setSettings, theme, setTheme, keys, upsertKey, removeKey } = useAppStore()
  const [section, setSection] = useState<Section>('appearance')
  const [form, setForm] = useState<AppSettings>({ ...settings })
  const [saved, setSaved] = useState(false)

  const set = (key: keyof AppSettings, value: any) =>
    setForm(f => ({ ...f, [key]: value }))

  const handleSave = async () => {
    await window.api.settings.save(form)
    setSettings(form)
    if (form.themeId !== settings.themeId) {
      const base = getThemeBase(form.themeId ?? 'navy')
      setTheme(base)
      applyTheme(form.themeId ?? 'navy')
    }
    document.documentElement.style.setProperty('--ui-font-size', `${form.uiFontSize ?? 14}px`)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const addKey = async () => {
    const path = await window.api.dialog.openKey()
    if (!path) return
    const name = path.split('/').pop()?.split('\\').pop() ?? 'key'
    const key = await window.api.keys.save({ id: '', name, path })
    upsertKey(key)
  }

  const deleteKey = async (id: string) => {
    await window.api.keys.delete(id)
    removeKey(id)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl flex overflow-hidden animate-fade-in cs-glass-strong"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
          width: 640,
          height: 480
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div
          className="flex flex-col py-2"
          style={{ width: 160, background: 'var(--bg-elevated)', borderRight: '1px solid var(--border)' }}
        >
          <div className="px-3 pb-2 mb-1" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Settings</p>
          </div>
          {([
            ['appearance', 'Appearance', <Palette size={13} />],
            ['terminal', 'Terminal', <Terminal size={13} />],
            ['security', 'Security', <ShieldCheck size={13} />],
            ['keys', 'SSH Keys', <Key size={13} />],
            ['about', 'About', <Info size={13} />]
          ] as const).map(([id, label, icon]) => (
            <NavItem
              key={id}
              icon={icon}
              label={label}
              active={section === id}
              onClick={() => setSection(id)}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-col flex-1">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {section === 'appearance' ? 'Appearance' : section === 'terminal' ? 'Terminal' : section === 'security' ? 'Security' : section === 'keys' ? 'SSH Keys' : 'About'}
            </h3>
            <button onClick={onClose} className="flex items-center justify-center w-6 h-6 rounded" style={{ color: 'var(--text-secondary)' }}>
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4">
            {section === 'appearance' && (
              <div className="flex flex-col gap-5">
                {/* Theme picker */}
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Theme</p>
                  <div className="mb-1">
                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Dark</p>
                    <div className="flex gap-2">
                      {THEMES.filter(t => t.base === 'dark').map(t => (
                        <SettingsThemeSwatch
                          key={t.id}
                          theme={t}
                          active={(form.themeId ?? 'navy') === t.id}
                          onClick={() => set('themeId', t.id)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Light</p>
                    <div className="flex gap-2">
                      {THEMES.filter(t => t.base === 'light').map(t => (
                        <SettingsThemeSwatch
                          key={t.id}
                          theme={t}
                          active={(form.themeId ?? 'navy') === t.id}
                          onClick={() => set('themeId', t.id)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <SettingRow label="UI Font Size" description="Interface text size (not terminal)">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={11}
                      max={20}
                      step={1}
                      value={form.uiFontSize ?? 14}
                      onChange={e => set('uiFontSize', parseInt(e.target.value))}
                      style={{ flex: 1 }}
                    />
                    <span className="text-xs w-8 text-right" style={{ color: 'var(--text-secondary)' }}>
                      {form.uiFontSize ?? 14}px
                    </span>
                  </div>
                </SettingRow>
              </div>
            )}

            {section === 'terminal' && (
              <div className="flex flex-col gap-4">
                <SettingRow label="Terminal Font" description="Monospaced font used in the terminal">
                  <select
                    value={form.fontFamily}
                    onChange={e => set('fontFamily', e.target.value)}
                  >
                    <option value="JetBrains Mono, monospace">JetBrains Mono</option>
                    <option value="Cascadia Code, monospace">Cascadia Code</option>
                    <option value="Fira Code, monospace">Fira Code</option>
                    <option value="Source Code Pro, monospace">Source Code Pro</option>
                    <option value="Consolas, monospace">Consolas</option>
                    <option value="Courier New, monospace">Courier New</option>
                    <option value="monospace">Monospace (system)</option>
                  </select>
                </SettingRow>

                <SettingRow label="Font Size" description="Size in pixels">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={10}
                      max={24}
                      value={form.fontSize}
                      onChange={e => set('fontSize', parseInt(e.target.value))}
                      style={{ flex: 1 }}
                    />
                    <span className="text-xs w-6 text-right" style={{ color: 'var(--text-secondary)' }}>
                      {form.fontSize}
                    </span>
                  </div>
                </SettingRow>

                <SettingRow label="Text Color" description="Terminal font color (Theme = follow palette)">
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {TERM_COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        onClick={() => set('terminalFgColor', c)}
                        title={c}
                        style={{
                          width: 22, height: 22, borderRadius: 6, background: c,
                          border: (form.terminalFgColor ?? '').toLowerCase() === c.toLowerCase()
                            ? '2px solid var(--accent)' : '1px solid var(--border)',
                          cursor: 'pointer', flexShrink: 0
                        }}
                      />
                    ))}
                    <label
                      className="flex items-center justify-center relative"
                      title="Custom color"
                      style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', cursor: 'pointer', flexShrink: 0 }}
                    >
                      <Pipette size={11} style={{ color: 'var(--text-secondary)' }} />
                      <input
                        type="color"
                        value={form.terminalFgColor || '#c8cad8'}
                        onChange={(e) => set('terminalFgColor', e.target.value)}
                        style={{ position: 'absolute', inset: 0, opacity: 0, padding: 0, cursor: 'pointer' }}
                      />
                    </label>
                    <button
                      onClick={() => set('terminalFgColor', '')}
                      title="Use theme default"
                      className="px-2 rounded"
                      style={{
                        height: 22, fontSize: 10, flexShrink: 0,
                        background: !form.terminalFgColor ? 'var(--accent)' : 'var(--bg-input)',
                        color: !form.terminalFgColor ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${!form.terminalFgColor ? 'var(--accent)' : 'var(--border)'}`
                      }}
                    >
                      Theme
                    </button>
                  </div>
                </SettingRow>

                <SettingRow label="Cursor Style">
                  <div className="flex gap-2">
                    {(['block', 'bar', 'underline'] as const).map(style => (
                      <button
                        key={style}
                        onClick={() => set('cursorStyle', style)}
                        className="flex-1 py-1 text-xs rounded"
                        style={{
                          background: form.cursorStyle === style ? 'var(--accent)' : 'var(--bg-input)',
                          color: form.cursorStyle === style ? '#fff' : 'var(--text-secondary)',
                          border: `1px solid ${form.cursorStyle === style ? 'var(--accent)' : 'var(--border)'}`
                        }}
                      >
                        {style === 'block' ? 'Block' : style === 'bar' ? 'Bar' : 'Underline'}
                      </button>
                    ))}
                  </div>
                </SettingRow>

                <SettingRow label="Blinking Cursor">
                  <Toggle value={form.cursorBlink} onChange={v => set('cursorBlink', v)} />
                </SettingRow>

                <SettingRow label="Auto Colors (Linux)" description="Enable ls / grep / ip colors on connect">
                  <Toggle value={form.terminalAutoColor !== false} onChange={v => set('terminalAutoColor', v)} />
                </SettingRow>

                <SettingRow label="Shell Integration (Linux)" description="Real command history + exit codes, cwd in tab, SFTP opens at cwd. Per-host override in the host form.">
                  <Toggle value={form.terminalShellIntegration !== false} onChange={v => set('terminalShellIntegration', v)} />
                </SettingRow>

                <SettingRow label="Scrollback" description="Number of lines in history">
                  <input
                    type="number"
                    value={form.scrollback}
                    onChange={e => set('scrollback', parseInt(e.target.value) || 5000)}
                    min={100}
                    max={50000}
                  />
                </SettingRow>
              </div>
            )}

            {section === 'security' && (
              <div className="flex flex-col gap-4">
                <SettingRow label="Verify host keys (TOFU)" description="Pin each server's key and warn on a mismatch">
                  <Toggle value={form.strictHostKey !== false} onChange={v => set('strictHostKey', v)} />
                </SettingRow>
                <SettingRow label="Auto-reconnect" description="Silently reconnect a dropped session in place">
                  <Toggle value={form.autoReconnect !== false} onChange={v => set('autoReconnect', v)} />
                </SettingRow>
                <div style={{ height: 1, background: 'var(--border-subtle)' }} />
                <KnownHostsManager />
              </div>
            )}

            {section === 'keys' && (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {keys.length} saved key{keys.length !== 1 ? 's' : ''}
                  </p>
                  <button
                    onClick={addKey}
                    className="px-3 py-1 rounded-lg text-xs"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    + Import Key
                  </button>
                </div>
                {keys.map(key => (
                  <div
                    key={key.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    <Key size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{key.name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{key.path}</p>
                    </div>
                    <button
                      onClick={() => deleteKey(key.id)}
                      className="text-xs"
                      style={{ color: 'var(--error)' }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                {keys.length === 0 && (
                  <div className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                    No keys imported
                  </div>
                )}
              </div>
            )}

            {section === 'about' && (
              <div className="flex flex-col items-center justify-center gap-4 py-8 px-6">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl" style={{ background: 'var(--accent)', boxShadow: '0 8px 24px var(--accent-shadow, #0004)' }}>
                  <Terminal size={32} color="#fff" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>CorpSSH</h3>
                  <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--accent)' }}>v{__APP_VERSION__}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Corporate SSH Client</p>
                </div>
                <div
                  className="w-full rounded-xl p-4 grid gap-2"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', gridTemplateColumns: '1fr 1fr', maxWidth: 380 }}
                >
                  {[
                    ['SSH Terminal', 'Multiple sessions in tabs'],
                    ['SFTP', 'Remote file manager'],
                    ['RDP', 'Remote Windows access'],
                    ['Session Logs', 'Full session recording w/ ANSI colors'],
                    ['OS Detection', 'Linux, MikroTik, OLT, ESP32...'],
                    ['SSH Keys', 'Ed25519, RSA, PEM, PPK'],
                    ['Remote Logging', 'Graylog, Loki, Elasticsearch'],
                    ['Themes', '6 glass themes + terminal colors'],
                  ].map(([feat, desc]) => (
                    <div key={feat} className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)', fontSize: 11 }}>{feat}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {section !== 'about' && section !== 'keys' && (
            <div
              className="flex items-center justify-end gap-2 px-4 py-3"
              style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
            >
              {saved && <span className="text-xs" style={{ color: 'var(--success)' }}>Saved!</span>}
              <button
                onClick={handleSave}
                className="px-4 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Save
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface KnownHost { host: string; port: number; fp: string }

function KnownHostsManager() {
  const [hosts, setHosts] = useState<KnownHost[]>([])
  const [loading, setLoading] = useState(true)

  const reload = () => {
    window.api.ssh.listKnownHosts()
      .then((list) => setHosts(list))
      .catch(() => setHosts([]))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [])

  const forget = async (h: KnownHost) => {
    await window.api.ssh.forgetHostKey(h.host, h.port)
    setHosts((prev) => prev.filter((x) => !(x.host === h.host && x.port === h.port)))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Trusted host keys</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {loading ? '…' : `${hosts.length} pinned`}
        </p>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Forget a host to re-pin its key on the next connect (e.g. a rebuilt server).
      </p>
      {!loading && hosts.length === 0 ? (
        <div className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>
          No pinned hosts yet
        </div>
      ) : (
        hosts.map((h) => (
          <div
            key={`${h.host}:${h.port}`}
            className="flex items-center gap-3 px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <ShieldCheck size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {h.host}{h.port !== 22 ? `:${h.port}` : ''}
              </p>
              <p className="text-xs truncate font-mono" style={{ color: 'var(--text-muted)', fontSize: 10 }} title={h.fp}>
                {h.fp}
              </p>
            </div>
            <button
              onClick={() => forget(h)}
              title="Forget this host key"
              className="flex items-center justify-center w-6 h-6 rounded flex-shrink-0"
              style={{ color: 'var(--error)', background: 'transparent' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))
      )}
    </div>
  )
}

function NavItem({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 mx-1 rounded-md text-xs"
      style={{
        background: active ? 'var(--accent-subtle)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)'
      }}
      onMouseEnter={e => !active && (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => !active && (e.currentTarget.style.background = 'transparent')}
    >
      {icon}
      {label}
    </button>
  )
}

function SettingRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {description && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{description}</p>}
      </div>
      <div style={{ width: 200, flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function SettingsThemeSwatch({ theme, active, onClick }: {
  theme: typeof THEMES[0]; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={theme.name}
      className="flex flex-col items-center gap-1 p-1.5 rounded-lg"
      style={{
        border: active ? '2px solid var(--accent)' : '2px solid var(--border)',
        background: active ? 'var(--accent-subtle)' : 'transparent',
        cursor: 'pointer', transition: 'all 0.12s'
      }}
    >
      <div
        className="rounded overflow-hidden"
        style={{ width: 52, height: 34, background: `linear-gradient(140deg, ${theme.accent} 0%, ${theme.surface} 52%, ${theme.bg} 100%)`, position: 'relative', border: '1px solid rgba(255,255,255,0.22)' }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 12, background: theme.surface, opacity: 0.85 }} />
        <div style={{ position: 'absolute', right: 6, bottom: 6, width: 10, height: 10, borderRadius: '50%', background: theme.accent, boxShadow: `0 0 6px ${theme.accent}` }} />
        <div style={{ position: 'absolute', left: 16, top: 9, width: 24, height: 3, borderRadius: 2, background: theme.text, opacity: 0.45 }} />
        <div style={{ position: 'absolute', left: 16, top: 15, width: 18, height: 3, borderRadius: 2, background: theme.text, opacity: 0.25 }} />
      </div>
      <span style={{ fontSize: 10, color: active ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: active ? 600 : 400 }}>
        {theme.name}
      </span>
    </button>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative rounded-full transition-colors"
      style={{
        width: 36,
        height: 20,
        background: value ? 'var(--accent)' : 'var(--bg-active)'
      }}
    >
      <div
        className="absolute top-1 rounded-full bg-white transition-transform"
        style={{
          width: 12,
          height: 12,
          left: value ? 20 : 4,
          transition: 'left 0.15s'
        }}
      />
    </button>
  )
}
