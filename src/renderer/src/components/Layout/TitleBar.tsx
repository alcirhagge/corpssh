import { useEffect, useState, useRef } from 'react'
import { Minus, Maximize2, Minimize2, X } from 'lucide-react'
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
      className="flex items-center justify-between px-3 select-none drag cs-glass"
      style={{ background: 'var(--titlebar-bg)', borderBottom: '1px solid var(--glass-border)', height: 52, position: 'relative', zIndex: 40 }}
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-2.5 no-drag">
        <CorpSSHLogo size={28} />
        <div className="flex flex-col" style={{ lineHeight: 1, gap: 1 }}>
          <span style={{
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)'
          }}>
            Corp<span style={{ color: 'var(--accent)' }}>SSH</span>
          </span>
        </div>
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
            title="Theme"
          >
            <span style={{ fontSize: 14 }}>🎨</span>
          </button>

          {pickerOpen && (
            <div
              className="absolute right-0 top-8 z-50 p-2 rounded-xl animate-fade-in cs-glass-strong"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', width: 200 }}
            >
              <p className="text-xs font-semibold px-1 pb-1.5 mb-1" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                Dark
              </p>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {THEMES.filter((t) => t.base === 'dark').map((t) => (
                  <ThemeSwatch key={t.id} theme={t} active={currentThemeId === t.id} onClick={() => selectTheme(t.id)} />
                ))}
              </div>
              <p className="text-xs font-semibold px-1 pb-1.5 mb-1" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                Light
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
        <WinBtn onClick={() => window.api.window.minimize()} title="Minimize" hoverColor="var(--bg-hover)">
          <Minus size={18} />
        </WinBtn>
        <WinBtn onClick={() => window.api.window.maximize()} title={isMaximized ? 'Restore' : 'Maximize'} hoverColor="var(--bg-hover)">
          {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </WinBtn>
        <WinBtn onClick={() => window.api.window.close()} title="Close" hoverColor="var(--error)" hoverTextColor="#fff">
          <X size={18} />
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
        style={{ width: 44, height: 30, background: `linear-gradient(140deg, ${theme.accent} 0%, ${theme.surface} 52%, ${theme.bg} 100%)`, position: 'relative', border: '1px solid rgba(255,255,255,0.22)' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, background: theme.surface, opacity: 0.85 }} />
        <div style={{ position: 'absolute', right: 5, bottom: 5, width: 9, height: 9, borderRadius: '50%', background: theme.accent, boxShadow: `0 0 6px ${theme.accent}` }} />
        <div style={{ position: 'absolute', left: 13, top: 9, width: 20, height: 3, borderRadius: 2, background: theme.text, opacity: 0.45 }} />
        <div style={{ position: 'absolute', left: 13, top: 15, width: 14, height: 3, borderRadius: 2, background: theme.text, opacity: 0.25 }} />
      </div>
      <span style={{ fontSize: 10, color: active ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: active ? 600 : 400 }}>
        {theme.name}
      </span>
    </button>
  )
}

function CorpSSHLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="csg-bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--accent-hover)"/>
          <stop offset="100%" stopColor="var(--accent)"/>
        </linearGradient>
        <linearGradient id="csg-shine" x1="0" y1="0" x2="0" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* base */}
      <rect width="32" height="32" rx="8" fill="url(#csg-bg)"/>
      {/* top shine */}
      <rect width="32" height="16" rx="8" fill="url(#csg-shine)"/>
      {/* > chevron */}
      <path d="M7 11L14 16L7 21" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
      {/* _ cursor */}
      <path d="M16.5 21H25" stroke="white" strokeWidth="2.6" strokeLinecap="round"/>
    </svg>
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
      className="flex items-center justify-center w-12 h-12 rounded"
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
