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
  const isDark = document.documentElement.classList.contains('dark') || !document.documentElement.classList.contains('light')

  const getTheme = useCallback(() => ({
    background: isDark ? '#0d1117' : '#ffffff',
    foreground: isDark ? '#c9d1d9' : '#1f2328',
    cursor: isDark ? '#58a6ff' : '#0969da',
    cursorAccent: isDark ? '#0d1117' : '#ffffff',
    selectionBackground: isDark ? 'rgba(88,166,255,0.3)' : 'rgba(9,105,218,0.2)',
    black: isDark ? '#484f58' : '#24292f',
    red: isDark ? '#f85149' : '#cf222e',
    green: isDark ? '#3fb950' : '#1a7f37',
    yellow: isDark ? '#d29922' : '#9a6700',
    blue: isDark ? '#58a6ff' : '#0969da',
    magenta: isDark ? '#bc8cff' : '#8250df',
    cyan: isDark ? '#39c5cf' : '#0969da',
    white: isDark ? '#b1bac4' : '#6e7781',
    brightBlack: isDark ? '#6e7681' : '#57606a',
    brightRed: isDark ? '#ff7b72' : '#a40e26',
    brightGreen: isDark ? '#56d364' : '#2da44e',
    brightYellow: isDark ? '#e3b341' : '#bf8700',
    brightBlue: isDark ? '#79c0ff' : '#218bff',
    brightMagenta: isDark ? '#d2a8ff' : '#a475f9',
    brightCyan: isDark ? '#56d4dd' : '#1b7c83',
    brightWhite: isDark ? '#cdd9e5' : '#ffffff'
  }), [isDark])

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
      allowTransparency: true,
      macOptionIsMeta: true
    })

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.loadAddon(searchAddon)
    terminal.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    // Ctrl+C (copy selection) / Ctrl+V (paste) / Ctrl+Shift+C / Ctrl+Shift+V
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true

      // Ctrl+C or Ctrl+Shift+C — copy selection
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && terminal.hasSelection()) {
        navigator.clipboard.writeText(terminal.getSelection()).catch(() => {})
        return false
      }

      // Ctrl+Shift+C — always copy
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        navigator.clipboard.writeText(terminal.getSelection()).catch(() => {})
        return false
      }

      // Ctrl+V or Ctrl+Shift+V — paste
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        navigator.clipboard.readText().then((text) => {
          if (text) terminal.paste(text)
        }).catch(() => {})
        return false
      }

      return true
    })

    // Right-click paste
    containerRef.current?.addEventListener('contextmenu', () => {
      navigator.clipboard.readText().then((text) => {
        if (text) terminal.paste(text)
      }).catch(() => {})
    })

    // Send input to SSH + capture commands for session log
    let cmdBuffer = ''
    terminal.onData(data => {
      window.api.ssh.input(tab.sessionId!, data)
      // Build command buffer and log on Enter
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

    // Receive data from SSH + stream to session log
    const unsubData = window.api.ssh.onData(tab.sessionId!, data => {
      terminal.write(data)
      if (tab.sessionId) window.api.session.data(tab.sessionId, data)
    })

    // Connection closed
    const unsubClosed = window.api.ssh.onClosed(tab.sessionId!, () => {
      terminal.write('\r\n\x1b[33m[Sessão encerrada]\x1b[0m\r\n')
    })

    // Resize observer
    const observer = new ResizeObserver(() => {
      fitAddon.fit()
      const dims = fitAddon.proposeDimensions()
      if (dims && tab.sessionId) {
        window.api.ssh.resize(tab.sessionId, dims.cols, dims.rows)
      }
    })
    if (containerRef.current) observer.observe(containerRef.current)

    // Initial shell
    const { cols, rows } = terminal
    window.api.ssh.shell(tab.sessionId, cols, rows)

    terminal.focus()

    return () => {
      unsubData()
      unsubClosed()
      observer.disconnect()
      terminal.dispose()
      terminalRef.current = null
    }
  }, [tab.sessionId])

  // Repaint + refit when this tab becomes active again
  // Fixes the "only new text visible" corruption after switching tabs
  useEffect(() => {
    if (!isActive || !terminalRef.current || !fitAddonRef.current) return
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      if (terminalRef.current) {
        terminalRef.current.refresh(0, terminalRef.current.rows - 1)
        terminalRef.current.focus()
      }
    })
  }, [isActive])

  const handleSearch = (direction: 'next' | 'prev') => {
    if (!searchAddonRef.current || !searchQuery) return
    if (direction === 'next') searchAddonRef.current.findNext(searchQuery)
    else searchAddonRef.current.findPrevious(searchQuery)
  }

  return (
    <div className="relative flex flex-col h-full" style={{ background: 'var(--terminal-bg)' }}>
      {/* Search overlay */}
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
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              outline: 'none',
              padding: 0
            }}
          />
          <button onClick={() => handleSearch('prev')} style={{ color: 'var(--text-secondary)' }}>
            <ChevronUp size={13} />
          </button>
          <button onClick={() => handleSearch('next')} style={{ color: 'var(--text-secondary)' }}>
            <ChevronDown size={13} />
          </button>
          <button onClick={() => setShowSearch(false)} style={{ color: 'var(--text-secondary)' }}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        style={{ padding: 4 }}
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
