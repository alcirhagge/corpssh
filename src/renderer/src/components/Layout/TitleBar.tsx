import { useEffect, useState } from 'react'
import { Minus, Maximize2, Minimize2, X, Terminal } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const { theme, setTheme } = useAppStore()

  useEffect(() => {
    window.api.window.isMaximized().then(setIsMaximized)
    const unsub = window.api.window.onMaximized(setIsMaximized)
    return unsub
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.remove('dark', 'light')
    document.documentElement.classList.add(next)
    window.api.settings.save({ theme: next })
  }

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

      {/* Center: drag region */}
      <div className="flex-1 drag h-full" />

      {/* Right: controls */}
      <div className="flex items-center no-drag" style={{ gap: 2 }}>
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center w-7 h-7 rounded text-xs transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title={theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}
        >
          {theme === 'dark' ? '☀' : '🌙'}
        </button>

        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />

        {/* Window controls */}
        <WinBtn
          onClick={() => window.api.window.minimize()}
          title="Minimizar"
          hoverColor="var(--bg-hover)"
        >
          <Minus size={12} />
        </WinBtn>
        <WinBtn
          onClick={() => window.api.window.maximize()}
          title={isMaximized ? 'Restaurar' : 'Maximizar'}
          hoverColor="var(--bg-hover)"
        >
          {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </WinBtn>
        <WinBtn
          onClick={() => window.api.window.close()}
          title="Fechar"
          hoverColor="var(--error)"
          hoverTextColor="#fff"
        >
          <X size={12} />
        </WinBtn>
      </div>
    </div>
  )
}

function WinBtn({
  children,
  onClick,
  title,
  hoverColor,
  hoverTextColor
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  hoverColor: string
  hoverTextColor?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-8 h-8 rounded transition-colors"
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
