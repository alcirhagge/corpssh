import { useEffect, useState, useRef } from 'react'
import { Minus, Maximize2, Minimize2, X, Terminal } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { THEMES, applyTheme, getThemeBase } from '../../themes'

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const { theme, setTheme, settings, setSettings } = useAppStore()

  useEffect(() => {
    window.api.window.isMaximized().then(setIsMaximized)
    const unsub = window.api.window.onMaximized(setIsMaximized)
    return unsub
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectTheme = (themeId: string) => {
    const base = getThemeBase(themeId)
    setTheme(base)
    applyTheme(themeId)
    const updated = { ...settings, themeId, theme: base }
    setSettings(updated)
    window.api.settings.save({ themeId, theme: base })
    setPickerOpen(false)
  }

  const currentThemeId = settings.themeId ?? 'navy'

  return (
    <div
      className="flex items-center justify-between h-10 px-3 select-none drag"
      style={{ background: 'var(--titlebar-bg)', borderBottom: '1px solid var(--border-subtle)' }}
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-2 no-drag">
        <div
          className="flex items-center justify-center w-6 h-6 rounded-md"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Terminal size={13} strokeWidth={2.5} />
        </div>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          CorpSSH
        </span>
      </div>

      {/* Center: drag */}
      <div className="flex-1 drag h-full" />

      {/* Right: controls */}
      <div className="flex items-center no-drag" style={{ gap: 2 }}>
        {/* Theme picker */}
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center justify-center w-7 h-7 rounded text-xs"
            style={{
              color: 'var(--text-secondary)',
              background: pickerOpen ? 'var(--bg-hover)' : 'transparent'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = pickerOpen ? 'var(--bg-hover)' : 'transparent')}
            title="Tema"
          >
            <span style={{ fontSize: 14 }}>🎨</span>
          </button>

          {pickerOpen && (
            <div
              className="absolute right-0 top-8 z-50 p-2 rounded-xl shadow-2xl animate-fade-in"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', width: 200 }}
            >
              <p className="text-xs font-semibold px-1 pb-1.5 mb-1" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                Escuro
              </p>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {THEMES.filter((t) => t.base === 'dark').map((t) => (
                  <ThemeSwatch key={t.id} theme={t} active={currentThemeId === t.id} onClick={() => selectTheme(t.id)} />
                ))}
              </div>
              <p className="text-xs font-semibold px-1 pb-1.5 mb-1" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                Claro
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {THEMES.filter((t) => t.base === 'light').map((t) => (
                  <ThemeSwatch key={t.id} theme={t} active={currentThemeId === t.id} onClick={() => selectTheme(t.id)} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />

        {/* Window controls */}
        <WinBtn onClick={() => window.api.window.minimize()} title="Minimizar" hoverColor="var(--bg-hover)">
          <Minus size={15} />
        </WinBtn>
        <WinBtn onClick={() => window.api.window.maximize()} title={isMaximized ? 'Restaurar' : 'Maximizar'} hoverColor="var(--bg-hover)">
          {isMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </WinBtn>
        <WinBtn onClick={() => window.api.window.close()} title="Fechar" hoverColor="var(--error)" hoverTextColor="#fff">
          <X size={15} />
        </WinBtn>
      </div>
    </div>
  )
}

function ThemeSwatch({ theme, active, onClick }: { theme: typeof THEMES[0]; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={theme.name}
      className="flex flex-col items-center gap-1 p-1.5 rounded-lg"
      style={{
        background: active ? 'var(--accent-subtle)' : hovered ? 'var(--bg-hover)' : 'transparent',
        border: active ? '1px solid var(--accent)' : '1px solid transparent',
        cursor: 'pointer', transition: 'all 0.12s'
      }}
    >
      <div className="rounded-md overflow-hidden flex-shrink-0"
        style={{ width: 44, height: 30, background: theme.bg, position: 'relative', border: '1px solid rgba(128,128,128,0.2)' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, background: theme.surface }} />
        <div style={{ position: 'absolute', right: 6, top: 6, width: 8, height: 8, borderRadius: 2, background: theme.accent }} />
        <div style={{ position: 'absolute', left: 13, top: 8, width: 20, height: 3, borderRadius: 2, background: theme.text, opacity: 0.4 }} />
        <div style={{ position: 'absolute', left: 13, top: 14, width: 14, height: 3, borderRadius: 2, background: theme.text, opacity: 0.2 }} />
      </div>
      <span style={{ fontSize: 10, color: active ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: active ? 600 : 400 }}>
        {theme.name}
      </span>
    </button>
  )
}

function WinBtn({ children, onClick, title, hoverColor, hoverTextColor }: {
  children: React.ReactNode; onClick: () => void; title: string
  hoverColor: string; hoverTextColor?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-10 h-10 rounded"
      style={{ color: 'var(--text-secondary)', background: 'transparent' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverColor
        if (hoverTextColor) e.currentTarget.style.color = hoverTextColor
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--text-secondary)'
      }}
    >
      {children}
    </button>
  )
}
