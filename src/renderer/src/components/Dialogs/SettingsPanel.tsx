import { useState } from 'react'
import { X, Monitor, Terminal, Palette, Key, Info } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { AppSettings } from '../../types'

interface SettingsPanelProps {
  onClose: () => void
}

type Section = 'appearance' | 'terminal' | 'keys' | 'about'

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
    if (form.theme !== settings.theme) {
      const t = form.theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : form.theme
      setTheme(t as 'dark' | 'light')
      document.documentElement.classList.remove('dark', 'light')
      document.documentElement.classList.add(t)
    }
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
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl flex overflow-hidden animate-fade-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
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
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Configurações</p>
          </div>
          {([
            ['appearance', 'Aparência', <Palette size={13} />],
            ['terminal', 'Terminal', <Terminal size={13} />],
            ['keys', 'Chaves SSH', <Key size={13} />],
            ['about', 'Sobre', <Info size={13} />]
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
              {section === 'appearance' ? 'Aparência' : section === 'terminal' ? 'Terminal' : section === 'keys' ? 'Chaves SSH' : 'Sobre'}
            </h3>
            <button onClick={onClose} className="flex items-center justify-center w-6 h-6 rounded" style={{ color: 'var(--text-secondary)' }}>
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4">
            {section === 'appearance' && (
              <div className="flex flex-col gap-4">
                <SettingRow label="Tema" description="Escolha entre dark, light ou automático">
                  <select value={form.theme} onChange={e => set('theme', e.target.value)}>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="system">Sistema</option>
                  </select>
                </SettingRow>
              </div>
            )}

            {section === 'terminal' && (
              <div className="flex flex-col gap-4">
                <SettingRow label="Fonte do Terminal" description="Fonte monoespaçada usada no terminal">
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
                    <option value="monospace">Monospace (sistema)</option>
                  </select>
                </SettingRow>

                <SettingRow label="Tamanho da Fonte" description="Tamanho em pixels">
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

                <SettingRow label="Estilo do Cursor">
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
                        {style === 'block' ? 'Bloco' : style === 'bar' ? 'Barra' : 'Sublinhado'}
                      </button>
                    ))}
                  </div>
                </SettingRow>

                <SettingRow label="Cursor Piscando">
                  <Toggle value={form.cursorBlink} onChange={v => set('cursorBlink', v)} />
                </SettingRow>

                <SettingRow label="Scrollback" description="Número de linhas no histórico">
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

            {section === 'keys' && (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {keys.length} chave{keys.length !== 1 ? 's' : ''} salva{keys.length !== 1 ? 's' : ''}
                  </p>
                  <button
                    onClick={addKey}
                    className="px-3 py-1 rounded-lg text-xs"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    + Importar Chave
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
                    Nenhuma chave importada
                  </div>
                )}
              </div>
            )}

            {section === 'about' && (
              <div className="flex flex-col items-center justify-center gap-3 h-48">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl" style={{ background: 'var(--accent)' }}>
                  <Terminal size={32} color="#fff" />
                </div>
                <div className="text-center">
                  <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>CorpSSH</h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Versão 1.0.0</p>
                  <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                    Cliente SSH corporativo com suporte a múltiplas conexões,<br />
                    SFTP, chaves SSH e temas dark/light.
                  </p>
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
              {saved && <span className="text-xs" style={{ color: 'var(--success)' }}>Salvo!</span>}
              <button
                onClick={handleSave}
                className="px-4 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Salvar
              </button>
            </div>
          )}
        </div>
      </div>
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
