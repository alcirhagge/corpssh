import { useEffect, useRef, useState, useCallback, memo } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../../store/appStore'
import type { Tab } from '../../types'
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react'

// One hit from the buffer scan: absolute line (incl. scrollback), column where
// the match starts, and the full line text (for the sidebar snippet).
interface SearchMatch {
  line: number
  col: number
  text: string
}

const SEARCH_PANEL_WIDTH = 288

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

function TerminalPane({ tab, isActive, isPageVisible, onReconnect, onClose }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const webglRef = useRef<WebglAddon | null>(null)
  const settings = useAppStore((s) => s.settings)
  const updateTab = useAppStore((s) => s.updateTab)
  const terminalFocusNonce = useAppStore((s) => s.terminalFocusNonce)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const activeRowRef = useRef<HTMLButtonElement>(null)
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
    terminal.open(container)

    // WebGL is attached lazily, only while this pane is the active/visible one
    // (see the isActive effect below). Each WebGL addon holds a GPU context and
    // browsers cap those at ~16 — broadcasting a snippet to a whole group would
    // otherwise spawn N contexts and thrash. Background panes fall back to the
    // DOM renderer (cheap, only repaints on write).

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Copy: Ctrl+C with selection, Ctrl+Shift+C
    // Paste: block \x16 from going to SSH — the paste DOM event handles the actual paste
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      // Ctrl/Cmd+F → toggle find bar (xterm would otherwise send ^F to the PTY)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        setShowSearch((v) => !v)
        return false
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && terminal.hasSelection()) {
        window.api.clipboard.writeText(terminal.getSelection())
        return false
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        window.api.clipboard.writeText(terminal.getSelection())
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
      window.api.clipboard.writeText(sel)
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

    // Right-click = paste, always, in a single click. The selection was already
    // copied on mouseup (copy-on-select), so we just clear it and paste — no need
    // for the old two-step "first click copies+clears, second click pastes".
    container.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      if (terminal.hasSelection()) terminal.clearSelection()
      const text = window.api.clipboard.readText()
      if (text) terminal.paste(text)
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
      // Skip when the pane is collapsed to 0 (would push cols=0/rows=0 to the PTY
      // and corrupt the remote display). Visibility-hidden panes keep their size,
      // so background broadcast sessions still get a correct fit.
      if (!container.clientWidth || !container.clientHeight) return
      fitAddon.fit()
      const dims = fitAddon.proposeDimensions()
      if (dims && dims.cols > 0 && dims.rows > 0 && tab.sessionId)
        window.api.ssh.resize(tab.sessionId, dims.cols, dims.rows)
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
          // Snippet broadcast: run the queued command once the shell is live, then clear it
          if (tab.pendingCommand) {
            window.api.ssh.input(tab.sessionId!, tab.pendingCommand + '\n')
            updateTab(tab.id, { pendingCommand: undefined })
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
      webglRef.current?.dispose()
      webglRef.current = null
      terminal.dispose()
      terminalRef.current = null
    }
  }, [tab.sessionId])

  // Attach WebGL only while active/visible; dispose it when this pane goes to the
  // background so we never hold more than a couple of GPU contexts at once.
  useEffect(() => {
    const term = terminalRef.current
    if (!term) return
    if (isActive && isPageVisible) {
      if (!webglRef.current) {
        try {
          const w = new WebglAddon()
          w.onContextLoss(() => { w.dispose(); if (webglRef.current === w) webglRef.current = null })
          term.loadAddon(w)
          webglRef.current = w
          term.refresh(0, term.rows - 1)
        } catch {
          /* WebGL unavailable — DOM renderer stays active */
        }
      }
    } else if (webglRef.current) {
      webglRef.current.dispose()
      webglRef.current = null
    }
  }, [isActive, isPageVisible, tab.sessionId])

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

  // Refocus on demand (e.g. after inserting a snippet, the picker stole focus)
  useEffect(() => {
    if (terminalFocusNonce === 0 || !isActive || !isPageVisible) return
    requestAnimationFrame(() => terminalRef.current?.focus())
  }, [terminalFocusNonce])

  // Scan the whole buffer (scrollback included) for every occurrence of the
  // query. We do this by hand instead of leaning on the search addon because we
  // want the full hit list to drive the sidebar — and because the addon's
  // decoration overlay blanked the WebGL viewport on some GPUs.
  const runScan = useCallback((query: string): SearchMatch[] => {
    const term = terminalRef.current
    if (!term || !query) return []
    const buf = term.buffer.active
    const needle = query.toLowerCase()
    const out: SearchMatch[] = []
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i)
      if (!line) continue
      const text = line.translateToString(true)
      const hay = text.toLowerCase()
      let from = hay.indexOf(needle)
      while (from !== -1) {
        out.push({ line: i, col: from, text })
        from = hay.indexOf(needle, from + needle.length)
        if (out.length > 2000) return out // safety cap on pathological queries
      }
    }
    return out
  }, [])

  // Move the viewport to a hit, select it so it reads as the active match.
  const jumpTo = useCallback((idx: number) => {
    const term = terminalRef.current
    const m = matches[idx]
    if (!term || !m) return
    setActiveIdx(idx)
    term.scrollToLine(Math.max(0, m.line - Math.floor(term.rows / 2)))
    term.select(m.col, m.line, searchQuery.length)
  }, [matches, searchQuery])

  const step = (dir: 1 | -1) => {
    if (matches.length === 0) return
    jumpTo((activeIdx + dir + matches.length) % matches.length)
  }

  // Debounced live scan as you type. Jumps to the first hit; the terminal keeps
  // all its content (no decorations, no clears) so nothing ever blanks out.
  useEffect(() => {
    if (!showSearch) return
    if (!searchQuery) { setMatches([]); setActiveIdx(0); return }
    const t = setTimeout(() => {
      const found = runScan(searchQuery)
      setMatches(found)
      setActiveIdx(0)
      const term = terminalRef.current
      if (found.length && term) {
        term.scrollToLine(Math.max(0, found[0].line - Math.floor(term.rows / 2)))
        term.select(found[0].col, found[0].line, searchQuery.length)
      } else {
        term?.clearSelection()
      }
    }, 130)
    return () => clearTimeout(t)
  }, [searchQuery, showSearch, runScan])

  // Reset when the bar closes
  useEffect(() => {
    if (showSearch) return
    setMatches([])
    setActiveIdx(0)
    terminalRef.current?.clearSelection()
  }, [showSearch])

  // Refit the terminal whenever the side panel opens/closes so columns reflow
  // into the freed/occupied width instead of being clipped behind the panel.
  useEffect(() => {
    if (!isActive || !isPageVisible) return
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      const term = terminalRef.current
      const dims = fitAddonRef.current?.proposeDimensions()
      if (dims && dims.cols > 0 && dims.rows > 0 && tab.sessionId)
        window.api.ssh.resize(tab.sessionId, dims.cols, dims.rows)
      term?.refresh(0, (term?.rows ?? 1) - 1)
    })
  }, [showSearch, isActive, isPageVisible, tab.sessionId])

  // Keep the active sidebar row in view as you step through hits
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

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
            top: 8, right: showSearch ? SEARCH_PANEL_WIDTH + 8 : 8,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', boxShadow: '0 4px 12px rgba(0,0,0,0.25)'
          }}
        >
          copied {copyNotice.chars} {copyNotice.chars === 1 ? 'char' : 'chars'} to clipboard
        </div>
      )}
      {showSearch && (
        <div
          className="absolute top-0 right-0 bottom-0 z-10 flex flex-col cs-glass-strong animate-slide-right"
          style={{
            width: SEARCH_PANEL_WIDTH,
            background: 'var(--bg-surface)',
            borderLeft: '1px solid var(--glass-border, var(--border))',
            boxShadow: '-8px 0 24px rgba(0,0,0,0.28)',
          }}
        >
          {/* Search header */}
          <div className="px-3 pt-3 pb-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <div
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') step(e.shiftKey ? -1 : 1)
                  if (e.key === 'Escape') { setShowSearch(false); terminalRef.current?.focus() }
                }}
                placeholder="Find in terminal…"
                className="text-xs flex-1 min-w-0"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', padding: 0 }}
              />
              <button
                onClick={() => { setShowSearch(false); terminalRef.current?.focus() }}
                className="flex items-center justify-center rounded"
                style={{ color: 'var(--text-muted)', width: 18, height: 18, flexShrink: 0 }}
              >
                <X size={13} />
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 px-0.5">
              <span
                className="text-xs tabular-nums"
                style={{ color: searchQuery && matches.length === 0 ? 'var(--warning, #f7b731)' : 'var(--text-muted)' }}
              >
                {!searchQuery ? 'Type to search'
                  : matches.length === 0 ? 'No matches'
                  : `${activeIdx + 1} of ${matches.length}`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => step(-1)}
                  disabled={matches.length === 0}
                  className="flex items-center justify-center rounded-md"
                  style={{ width: 22, height: 22, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', opacity: matches.length === 0 ? 0.4 : 1 }}
                  title="Previous (Shift+Enter)"
                ><ChevronUp size={14} /></button>
                <button
                  onClick={() => step(1)}
                  disabled={matches.length === 0}
                  className="flex items-center justify-center rounded-md"
                  style={{ width: 22, height: 22, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', opacity: matches.length === 0 ? 0.4 : 1 }}
                  title="Next (Enter)"
                ><ChevronDown size={14} /></button>
              </div>
            </div>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto py-1">
            {matches.map((m, i) => {
              const start = Math.max(0, m.col - 16)
              const before = (start > 0 ? '…' : '') + m.text.slice(start, m.col)
              const hit = m.text.slice(m.col, m.col + searchQuery.length)
              const after = m.text.slice(m.col + searchQuery.length, m.col + searchQuery.length + 60)
              const isActive = i === activeIdx
              return (
                <button
                  key={`${m.line}-${m.col}-${i}`}
                  ref={isActive ? activeRowRef : undefined}
                  onClick={() => jumpTo(i)}
                  className="w-full text-left flex items-start gap-2 px-3 py-1.5 transition-colors"
                  style={{
                    background: isActive ? 'var(--bg-active, rgba(76,116,255,0.16))' : 'transparent',
                    borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <span
                    className="text-sm tabular-nums select-none mt-px"
                    style={{ color: 'var(--text-faint, var(--text-muted))', minWidth: 30, textAlign: 'right' }}
                  >{m.line + 1}</span>
                  <span
                    className="text-sm font-mono leading-snug break-all"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {before}
                    <mark style={{ background: '#f7b731', color: '#1a1300', borderRadius: 2, padding: '0 1px' }}>{hit}</mark>
                    {after}
                  </span>
                </button>
              )
            })}
            {searchQuery && matches.length === 0 && (
              <div className="px-3 py-6 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                No matches in this buffer
              </div>
            )}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          right: showSearch ? SEARCH_PANEL_WIDTH : 0,
          overflow: 'hidden',
          transition: 'right 180ms cubic-bezier(0.16,1,0.3,1)',
        }}
        tabIndex={0}
      />
    </div>
  )
}

// App passes fresh inline callbacks (onReconnect/onClose) every render, so the
// default shallow memo would never hit. Compare only the props that actually
// change what this pane shows — callback identity is irrelevant to rendering.
export default memo(TerminalPane, (a, b) =>
  a.isActive === b.isActive &&
  a.isPageVisible === b.isPageVisible &&
  a.tab.id === b.tab.id &&
  a.tab.sessionId === b.tab.sessionId &&
  a.tab.status === b.tab.status &&
  a.tab.mode === b.tab.mode &&
  a.tab.pendingCommand === b.tab.pendingCommand
)
