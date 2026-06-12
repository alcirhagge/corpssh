import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
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

// OSes where it's safe to send bash color aliases on connect (NOT network gear).
const LINUX_OS = new Set([
  'ubuntu', 'debian', 'centos', 'fedora', 'rhel', 'arch',
  'alpine', 'suse', 'linux', 'freebsd', 'raspberrypi'
])

// Leading space keeps it out of history (HISTCONTROL=ignorespace); the trailing
// `clear` wipes the echoed aliases so the session opens on a clean prompt.
const COLOR_PRELUDE =
  " alias ls='ls --color=auto' 2>/dev/null; alias grep='grep --color=auto' 2>/dev/null;" +
  " command ip -c -V >/dev/null 2>&1 && alias ip='ip -c'; clear\n"

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
    const fgOverride = settings.terminalFgColor?.trim()
    return {
      background:          v('--terminal-bg',        isDark ? '#0e0f18' : '#ffffff'),
      foreground:          fgOverride || v('--terminal-fg', isDark ? '#c8cad8' : '#1e2040'),
      cursor:              v('--terminal-cursor',    isDark ? '#4c74ff' : '#2952cc'),
      cursorAccent:        v('--terminal-bg',        isDark ? '#0e0f18' : '#ffffff'),
      selectionBackground: v('--terminal-selection', isDark ? 'rgba(76,116,255,0.3)' : 'rgba(41,82,204,0.2)'),
      // Vibrant, distinct ANSI palette so colorized output (ls, grep, git…)
      // reads clearly while still feeling at home in the theme.
      black:         isDark ? '#5b6273' : '#24292f',
      red:           isDark ? '#ff6e6e' : '#cf222e',
      green:         isDark ? '#5af78e' : '#1a7f37',
      yellow:        isDark ? '#f4f99d' : '#9a6700',
      blue:          isDark ? '#6ab0ff' : '#0969da',
      magenta:       isDark ? '#ff7ac6' : '#8250df',
      cyan:          isDark ? '#8be9fd' : '#1b7c83',
      white:         isDark ? '#c5cdd9' : '#6e7781',
      brightBlack:   isDark ? '#7b8496' : '#57606a',
      brightRed:     isDark ? '#ff8f8f' : '#a40e26',
      brightGreen:   isDark ? '#76ffa0' : '#2da44e',
      brightYellow:  isDark ? '#ffffa5' : '#bf8700',
      brightBlue:    isDark ? '#88bbff' : '#218bff',
      brightMagenta: isDark ? '#ff9cd6' : '#a475f9',
      brightCyan:    isDark ? '#a4ffff' : '#1b7c83',
      brightWhite:   isDark ? '#ffffff' : '#1e2040',
    }
  }, [settings.terminalFgColor, settings.themeId])

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

    // GPU-accelerated rendering. This is the single biggest perf win for the
    // terminal — the default DOM renderer chokes on heavy output. Fall back
    // silently to the DOM renderer if WebGL is unavailable or its context is lost.
    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => webglAddon.dispose())
      terminal.loadAddon(webglAddon)
    } catch {
      /* WebGL unavailable — DOM renderer stays active */
    }

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

    // Input → SSH. Command tracking + session logging now happen in the main
    // process (see sshManager.sendInput / createShellSession), so the renderer
    // no longer round-trips every keystroke and every output chunk back to main.
    terminal.onData(data => {
      window.api.ssh.input(tab.sessionId!, data)
    })

    // SSH data → terminal
    const unsubData = window.api.ssh.onData(tab.sessionId!, data => {
      terminal.write(data)
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
        .then(() => {
          // Auto-enable ls/grep/ip colors on Linux hosts (uses the detected OS,
          // so it never runs on switches / OLTs / MikroTik).
          const srv = useAppStore.getState().servers.find((s) => s.id === tab.serverId)
          if (settings.terminalAutoColor !== false && srv?.detectedOs && LINUX_OS.has(srv.detectedOs)) {
            window.api.ssh.input(tab.sessionId!, COLOR_PRELUDE)
          }
        })
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

  // Live-apply theme / terminal-color changes to an already-open terminal,
  // so switching themes or picking a new text color updates without reconnecting.
  useEffect(() => {
    const term = terminalRef.current
    if (!term) return
    term.options.theme = getTheme()
    term.refresh(0, term.rows - 1)
  }, [getTheme])

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
