import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../../store/appStore'
import type { Tab } from '../../types'
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react'

interface TerminalPaneProps {
  tab: Tab
  isActive: boolean
}

export default function TerminalPane({ tab, isActive }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const { settings } = useAppStore()
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const getTheme = useCallback(() => {
    const s = getComputedStyle(document.documentElement)
    const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
    const isDark = document.documentElement.classList.contains('dark')
    return {
      background:          v('--terminal-bg',        isDark ? '#0e0f18' : '#ffffff'),
      foreground:          v('--terminal-fg',        isDark ? '#c8cad8' : '#1e2040'),
      cursor:              v('--terminal-cursor',    isDark ? '#4c74ff' : '#2952cc'),
      cursorAccent:        v('--terminal-bg',        isDark ? '#0e0f18' : '#ffffff'),
      selectionBackground: v('--terminal-selection', isDark ? 'rgba(76,116,255,0.3)' : 'rgba(41,82,204,0.2)'),
      black:         isDark ? '#484f58' : '#24292f',
      red:           isDark ? '#f85149' : '#cf222e',
      green:         isDark ? '#3fb950' : '#1a7f37',
      yellow:        isDark ? '#d29922' : '#9a6700',
      blue:          isDark ? '#58a6ff' : '#0969da',
      magenta:       isDark ? '#bc8cff' : '#8250df',
      cyan:          isDark ? '#39c5cf' : '#0969da',
      white:         isDark ? '#b1bac4' : '#6e7781',
      brightBlack:   isDark ? '#6e7681' : '#57606a',
      brightRed:     isDark ? '#ff7b72' : '#a40e26',
      brightGreen:   isDark ? '#56d364' : '#2da44e',
      brightYellow:  isDark ? '#e3b341' : '#bf8700',
      brightBlue:    isDark ? '#79c0ff' : '#218bff',
      brightMagenta: isDark ? '#d2a8ff' : '#a475f9',
      brightCyan:    isDark ? '#56d4dd' : '#1b7c83',
      brightWhite:   isDark ? '#cdd9e5' : '#ffffff',
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current || !tab.sessionId) return

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const searchAddon = new SearchAddon()

    const terminal = new XTerm({
      fontFamily: settings.fontFamily || 'JetBrains Mono, Cascadia Code, monospace',
      fontSize: settings.fontSize || 14,
      lineHeight: 1.4,
      cursorBlink: settings.cursorBlink !== false,
      cursorStyle: settings.cursorStyle || 'block',
      scrollback: settings.scrollback || 5000,
      theme: getTheme(),
      allowTransparency: false,
      macOptionIsMeta: true,
    })

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.loadAddon(searchAddon)
    terminal.open(containerRef.current)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    // Copy/paste
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && terminal.hasSelection()) {
        navigator.clipboard.writeText(terminal.getSelection()).catch(() => {})
        return false
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        navigator.clipboard.writeText(terminal.getSelection()).catch(() => {})
        return false
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        navigator.clipboard.readText().then((text) => { if (text) terminal.paste(text) }).catch(() => {})
        return false
      }
      return true
    })

    containerRef.current?.addEventListener('contextmenu', () => {
      navigator.clipboard.readText().then((text) => { if (text) terminal.paste(text) }).catch(() => {})
    })

    // Input → SSH + session log
    let cmdBuffer = ''
    terminal.onData(data => {
      window.api.ssh.input(tab.sessionId!, data)
      if (data === '\r' || data === '\n') {
        const cmd = cmdBuffer.trim()
        if (cmd && tab.sessionId) window.api.session.command(tab.sessionId, cmd)
        cmdBuffer = ''
      } else if (data === '\x7f') {
        cmdBuffer = cmdBuffer.slice(0, -1)
      } else if (data.charCodeAt(0) >= 32) {
        cmdBuffer += data
      }
    })

    // SSH data → terminal + session log
    const unsubData = window.api.ssh.onData(tab.sessionId!, data => {
      terminal.write(data)
      if (tab.sessionId) window.api.session.data(tab.sessionId, data)
    })

    const unsubClosed = window.api.ssh.onClosed(tab.sessionId!, () => {
      terminal.write('\r\n\x1b[33m[Sessão encerrada]\x1b[0m\r\n')
    })

    // Resize observer — only for resizing after shell is open
    let shellOpened = false
    const resizeObserver = new ResizeObserver(() => {
      if (!shellOpened) return
      fitAddon.fit()
      const dims = fitAddon.proposeDimensions()
      if (dims && tab.sessionId) window.api.ssh.resize(tab.sessionId, dims.cols, dims.rows)
    })
    if (containerRef.current) resizeObserver.observe(containerRef.current)

    // Open shell after a short delay to ensure container is laid out
    const timer = setTimeout(() => {
      if (!containerRef.current) return
      fitAddon.fit()
      const cols = terminal.cols || 80
      const rows = terminal.rows || 24
      shellOpened = true
      window.api.ssh.shell(tab.sessionId!, cols, rows)
        .catch((err: any) => {
          terminal.write(`\r\n\x1b[31m[Erro ao abrir shell: ${err?.message ?? err}]\x1b[0m\r\n`)
        })
      terminal.focus()
    }, 50)

    return () => {
      clearTimeout(timer)
      unsubData()
      unsubClosed()
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
    }
  }, [tab.sessionId])

  // Refit + focus when tab becomes active
  useEffect(() => {
    if (!isActive || !terminalRef.current || !fitAddonRef.current) return
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      terminalRef.current?.refresh(0, terminalRef.current.rows - 1)
      terminalRef.current?.focus()
    })
  }, [isActive])

  const handleSearch = (direction: 'next' | 'prev') => {
    if (!searchAddonRef.current || !searchQuery) return
    if (direction === 'next') searchAddonRef.current.findNext(searchQuery)
    else searchAddonRef.current.findPrevious(searchQuery)
  }

  return (
    // Use absolute positioning so container dimensions are always defined
    <div style={{ position: 'absolute', inset: 0, background: 'var(--terminal-bg)' }}>
      {showSearch && (
        <div
          className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-lg px-2 py-1.5 shadow-xl"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <Search size={12} style={{ color: 'var(--text-muted)' }} />
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSearch(e.shiftKey ? 'prev' : 'next')
              if (e.key === 'Escape') { setShowSearch(false); terminalRef.current?.focus() }
            }}
            placeholder="Buscar..."
            className="text-xs w-40"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', padding: 0 }}
          />
          <button onClick={() => handleSearch('prev')} style={{ color: 'var(--text-secondary)' }}><ChevronUp size={13} /></button>
          <button onClick={() => handleSearch('next')} style={{ color: 'var(--text-secondary)' }}><ChevronDown size={13} /></button>
          <button onClick={() => setShowSearch(false)} style={{ color: 'var(--text-secondary)' }}><X size={13} /></button>
        </div>
      )}

      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault()
            setShowSearch(v => !v)
          }
        }}
        tabIndex={0}
      />
    </div>
  )
}
