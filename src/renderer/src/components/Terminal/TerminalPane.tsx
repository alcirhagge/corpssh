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
  isPageVisible: boolean
  onReconnect: () => void
  onClose: () => void
}

export default function TerminalPane({ tab, isActive, isPageVisible, onReconnect, onClose }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const { settings, updateTab } = useAppStore()
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isDisconnected, setIsDisconnected] = useState(false)
  const [copyNotice, setCopyNotice] = useState<{ chars: number; key: number } | null>(null)

  // Auto-dismiss the "copied N chars" toast
  useEffect(() => {
    if (!copyNotice) return
    const t = setTimeout(() => setCopyNotice(null), 1400)
    return () => clearTimeout(t)
  }, [copyNotice])

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

    const container = containerRef.current

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
    terminal.open(container)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    // Copy: Ctrl+C with selection, Ctrl+Shift+C
    // Paste: block \x16 from going to SSH — the paste DOM event handles the actual paste
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
        return false  // block \x16; paste event below handles actual paste
      }
      return true
    })

    // Copy-on-select: when a mouse selection completes, copy it and flash a toast
    const onMouseUp = () => {
      if (!terminal.hasSelection()) return
      const sel = terminal.getSelection()
      if (!sel) return
      navigator.clipboard.writeText(sel).catch(() => {})
      setCopyNotice({ chars: sel.length, key: Date.now() })
    }
    container.addEventListener('mouseup', onMouseUp)

    // Single paste handler (capture phase = intercepts before xterm's own handler)
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const text = e.clipboardData?.getData('text/plain')
      if (text) terminal.paste(text)
    }
    container.addEventListener('paste', onPaste, true)

    // Right-click: copy if selection, paste if not
    container.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      if (terminal.hasSelection()) {
        navigator.clipboard.writeText(terminal.getSelection()).catch(() => {})
        terminal.clearSelection()
      } else {
        navigator.clipboard.readText().then((text) => { if (text) terminal.paste(text) }).catch(() => {})
      }
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
      terminal.write('\r\n\x1b[33m[Session closed]\x1b[0m\r\n')
      setIsDisconnected(true)
      updateTab(tab.id, { status: 'disconnected' })
    })

    let shellOpened = false
    const resizeObserver = new ResizeObserver(() => {
      if (!shellOpened) return
      fitAddon.fit()
      const dims = fitAddon.proposeDimensions()
      if (dims && tab.sessionId) window.api.ssh.resize(tab.sessionId, dims.cols, dims.rows)
    })
    resizeObserver.observe(container)

    const timer = setTimeout(() => {
      if (!containerRef.current) return
      fitAddon.fit()
      const cols = terminal.cols || 80
      const rows = terminal.rows || 24
      shellOpened = true
      window.api.ssh.shell(tab.sessionId!, cols, rows)
        .catch((err: any) => {
          terminal.write(`\r\n\x1b[31m[Error opening shell: ${err?.message ?? err}]\x1b[0m\r\n`)
        })
      terminal.focus()
    }, 50)

    return () => {
      clearTimeout(timer)
      unsubData()
      unsubClosed()
      resizeObserver.disconnect()
      container.removeEventListener('paste', onPaste, true)
      container.removeEventListener('mouseup', onMouseUp)
      terminal.dispose()
      terminalRef.current = null
    }
  }, [tab.sessionId])

  // Refit + focus when tab becomes active OR when terminal page becomes visible
  useEffect(() => {
    if (!isActive || !isPageVisible || !terminalRef.current || !fitAddonRef.current) return
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      terminalRef.current?.refresh(0, terminalRef.current.rows - 1)
      terminalRef.current?.focus()
    })
  }, [isActive, isPageVisible])

  const handleSearch = (direction: 'next' | 'prev') => {
    if (!searchAddonRef.current || !searchQuery) return
    if (direction === 'next') searchAddonRef.current.findNext(searchQuery)
    else searchAddonRef.current.findPrevious(searchQuery)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--terminal-bg)' }}>
      {isDisconnected && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)', zIndex: 20 }}
        >
          <div
            className="flex flex-col items-center gap-4 p-6 rounded-xl"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', minWidth: 280 }}
          >
            <div style={{ color: 'var(--warning, #f7b731)', fontSize: 14, fontWeight: 600 }}>
              Session closed
            </div>
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              {tab.serverName}<br />{tab.serverHost}
            </p>
            <div className="flex gap-2">
              <button
                onClick={onReconnect}
                className="px-5 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Reconnect
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs"
                style={{ background: 'var(--bg-active)', color: 'var(--text-primary)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {copyNotice && (
        <div
          key={copyNotice.key}
          className="absolute z-30 px-2.5 py-1 rounded-md text-xs font-medium pointer-events-none"
          style={{
            top: showSearch ? 46 : 8, right: 8,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', boxShadow: '0 4px 12px rgba(0,0,0,0.25)'
          }}
        >
          copied {copyNotice.chars} {copyNotice.chars === 1 ? 'char' : 'chars'} to clipboard
        </div>
      )}
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
            placeholder="Search..."
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
