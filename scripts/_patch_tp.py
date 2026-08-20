def sub(path, old, new, count=1):
    s = open(path, encoding='utf-8').read()
    assert old in s, (path, old[:70])
    s = s.replace(old, new, count)
    open(path, 'w', encoding='utf-8', newline='\n').write(s)

p = 'src/renderer/src/components/Terminal/TerminalPane.tsx'

sub(p, """import type { Tab } from '../../types'
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react'""",
"""import type { Tab } from '../../types'
import { Search, X, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { attachShellIntegration, SHELL_INTEGRATION_SCRIPT, type ShellIntegration } from '../../../../shared/shellIntegration'""")

sub(p, """// Leading space keeps it out of history (HISTCONTROL=ignorespace); the trailing
// `clear` wipes the echoed aliases so the session opens on a clean prompt.
const COLOR_PRELUDE =
  " alias ls='ls --color=auto' 2>/dev/null; alias grep='grep --color=auto' 2>/dev/null;" +
  " command ip -c -V >/dev/null 2>&1 && alias ip='ip -c'; clear\\n"
""",
"""// Leading space keeps it out of history (HISTCONTROL=ignorespace). Setup text
// always ends with a `clear` (see buildSetup) so the echoed lines vanish and the
// session opens on a clean prompt.
const COLOR_ALIASES =
  " alias ls='ls --color=auto' 2>/dev/null; alias grep='grep --color=auto' 2>/dev/null;" +
  " command ip -c -V >/dev/null 2>&1 && alias ip='ip -c'\\n"
const CLEAR_LINE = ' clear\\n'

// Decide what to inject once the shell is live. Colors and the shell-integration
// snippet both key off the DETECTED OS (so they never run on switches / OLTs /
// MikroTik); the host form can force integration on/off per host.
function buildSetup(): string {
  const st = useAppStore.getState()
  const srv = st.servers.find((s) => s.id === useAppStore.getState().activeSetupServerId)
  void srv
  return ''
}
void buildSetup
""")

# Simpler: drop the placeholder above and implement buildSetup properly with explicit args.
sub(p, """function buildSetup(): string {
  const st = useAppStore.getState()
  const srv = st.servers.find((s) => s.id === useAppStore.getState().activeSetupServerId)
  void srv
  return ''
}
void buildSetup
""",
"""function buildSetup(serverId: string): { text: string; integration: boolean } {
  const st = useAppStore.getState()
  const srv = st.servers.find((s) => s.id === serverId)
  const isLinux = !!srv?.detectedOs && LINUX_OS.has(srv.detectedOs)
  const colors = st.settings.terminalAutoColor !== false && isLinux
  const pref = srv?.shellIntegration ?? 'auto'
  const integration = st.settings.terminalShellIntegration !== false &&
    (pref === 'on' || (pref === 'auto' && isLinux))
  let text = ''
  if (colors) text += COLOR_ALIASES
  if (integration) text += SHELL_INTEGRATION_SCRIPT  // ends with its own clear
  else if (colors) text += CLEAR_LINE
  return { text, integration }
}
""")

# refs + state
sub(p, """  const [showHistory, setShowHistory] = useState(false)
  const [rtt, setRtt] = useState<number | null>(null)
""", """  const [showHistory, setShowHistory] = useState(false)
  const [rtt, setRtt] = useState<number | null>(null)
  // Shell integration (OSC 133/7): live once the remote bash runs our snippet.
  const siRef = useRef<ShellIntegration | null>(null)
  const [siActive, setSiActive] = useState(false)
  const tabIdRef = useRef(tab.id)
  tabIdRef.current = tab.id
""")

# attach after terminal.open
sub(p, """    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Copy: Ctrl+C with selection, Ctrl+Shift+C""",
"""    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // ── Shell integration marks → cwd in the tab, exit-code gutter, prompt list.
    // A thin bar at the left edge of each command's line: green = exit 0, red
    // otherwise. Decorations ride on markers, so they scroll with the buffer
    // and vanish when the line leaves the scrollback. Capped to keep memory flat.
    const gutter: Array<{ dispose(): void }> = []
    const si = attachShellIntegration(terminal, {
      onActivate: () => {
        setSiActive(true)
        useAppStore.getState().updateTab(tabIdRef.current, { shellIntegrated: true })
      },
      onCwd: (cwd) => useAppStore.getState().updateTab(tabIdRef.current, { cwd }),
      onCommand: (c) => {
        const buf = terminal.buffer.active
        const offset = c.commandLine - (buf.baseY + buf.cursorY)
        let marker: ReturnType<XTerm['registerMarker']> | undefined
        try { marker = terminal.registerMarker(offset) } catch { marker = undefined }
        if (!marker || marker.isDisposed) return
        const deco = terminal.registerDecoration({ marker, x: 0, width: 1, layer: 'top' })
        if (!deco) { marker.dispose(); return }
        const color = c.exitCode === 0 || c.exitCode === null ? 'rgba(48,212,138,0.85)' : 'rgba(255,87,87,0.9)'
        deco.onRender((el) => {
          el.style.width = '3px'
          el.style.left = '0'
          el.style.borderRadius = '2px'
          el.style.background = color
          el.style.pointerEvents = 'none'
          el.title = c.exitCode === null ? c.command : `exit ${c.exitCode} — ${c.command}`
        })
        gutter.push(deco)
        if (gutter.length > 300) gutter.shift()?.dispose()
      }
    })
    siRef.current = si

    // Copy: Ctrl+C with selection, Ctrl+Shift+C""")

# key bindings: Ctrl+Up/Down between prompts, Ctrl+Shift+O copy last output
sub(p, """      // Ctrl/Cmd+F → toggle find bar (xterm would otherwise send ^F to the PTY)""",
"""      // ── Shell-integration shortcuts (only once marks are flowing, so on hosts
      // without it the keys still reach the remote untouched).
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && si.prompts.length) {
        e.preventDefault()
        const prompts = si.prompts.filter((l) => l < terminal.buffer.active.length)
        if (!prompts.length) return false
        const top = terminal.buffer.active.viewportY
        // Up: nearest prompt strictly above the viewport top; Down: nearest below.
        let target: number | undefined
        if (e.key === 'ArrowUp') { for (const l of prompts) { if (l < top) target = l; else break } }
        else { target = prompts.find((l) => l > top) }
        if (target !== undefined) terminal.scrollToLine(target)
        return false
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'o' || e.key === 'O') && si.commands.length) {
        e.preventDefault()
        const last = si.commands[si.commands.length - 1]
        const from = last.outputLine !== null ? last.outputLine + (last.outputLine === last.commandLine ? 1 : 0) : last.commandLine + 1
        const buf = terminal.buffer.active
        const lines: string[] = []
        for (let y = from; y < last.endLine && y < buf.length; y++) {
          const ln = buf.getLine(y)
          if (ln) lines.push(ln.translateToString(true))
        }
        const text = lines.join('\\n').replace(/\\n+$/, '')
        if (text) { window.api.clipboard.writeText(text); setCopyNotice({ chars: text.length, key: Date.now() }) }
        return false
      }
      // Ctrl/Cmd+F → toggle find bar (xterm would otherwise send ^F to the PTY)""")

# cleanup
sub(p, """      webglRef.current?.dispose()
      webglRef.current = null
      canvasRef.current?.dispose()
      canvasRef.current = null
      terminal.dispose()
      terminalRef.current = null
    }
  }, [])""", """      webglRef.current?.dispose()
      webglRef.current = null
      canvasRef.current?.dispose()
      canvasRef.current = null
      for (const d of gutter) d.dispose()
      si.dispose()
      siRef.current = null
      terminal.dispose()
      terminalRef.current = null
    }
  }, [])""")

# Effect B: reset SI on new transport + inject setup
sub(p, """    setIsDisconnected(false)  // a fresh transport clears any "session closed" overlay
""", """    setIsDisconnected(false)  // a fresh transport clears any "session closed" overlay
    // New transport, new remote shell: forget the old shell's marks/cwd.
    siRef.current?.reset()
    setSiActive(false)
    updateTab(tab.id, { cwd: undefined, shellIntegrated: false })
""")
sub(p, """          // Auto-enable ls/grep/ip colors on Linux hosts (uses the detected OS,
          // so it never runs on switches / OLTs / MikroTik).
          const srv = useAppStore.getState().servers.find((s) => s.id === tab.serverId)
          if (settings.terminalAutoColor !== false && srv?.detectedOs && LINUX_OS.has(srv.detectedOs)) {
            window.api.ssh.input(tab.sessionId!, COLOR_PRELUDE)
          }""", """          // Setup text (color aliases + shell-integration snippet) keyed off the
          // detected OS, so it never runs on switches / OLTs / MikroTik. Sent via
          // `inject`, not `input`: it is not a typed command (no history entry,
          // and the logger drops the echoed script).
          const setup = buildSetup(tab.serverId)
          if (setup.text) window.api.ssh.inject(tab.sessionId!, setup.text)""")

# badge next to the RTT pill
sub(p, """      {isActive && rtt !== null && (
        <div
          className="absolute z-20 px-2 py-0.5 rounded-md text-xs font-medium tabular-nums pointer-events-none flex items-center gap-1"
          style={{
            bottom: 6, left: 6, fontSize: 10,""", """      {isActive && siActive && (
        <div
          className="absolute z-20 px-2 py-0.5 rounded-md text-xs font-medium pointer-events-none flex items-center gap-1"
          style={{
            bottom: 6, left: rtt !== null ? 78 : 6, fontSize: 10,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            color: 'var(--accent)'
          }}
          title="Shell integration active — real command history, exit codes, cwd. Ctrl+↑/↓ jump between prompts · Ctrl+Shift+O copy last output"
        >
          <Zap size={9} />
          shell
        </div>
      )}
      {isActive && rtt !== null && (
        <div
          className="absolute z-20 px-2 py-0.5 rounded-md text-xs font-medium tabular-nums pointer-events-none flex items-center gap-1"
          style={{
            bottom: 6, left: 6, fontSize: 10, minWidth: 66, justifyContent: 'center',""")

# history palette: exit code dot
sub(p, """                <span className="flex-1 truncate font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                  {it.cmd}
                </span>""", """                {typeof it.exit === 'number' && (
                  <span
                    className="flex-shrink-0 rounded-full"
                    style={{ width: 6, height: 6, background: it.exit === 0 ? 'var(--success)' : 'var(--error)' }}
                    title={`last exit ${it.exit}`}
                  />
                )}
                <span className="flex-1 truncate font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                  {it.cmd}
                </span>""")
sub(p, "interface HistEntry { cmd: string; ts: number; count: number }", "interface HistEntry { cmd: string; ts: number; count: number; exit?: number }")

# TabBar: cwd next to server name
p = 'src/renderer/src/components/Terminal/TabBar.tsx'
sub(p, """      <span style={{
        fontSize: 13,
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        whiteSpace: 'nowrap'
      }}>
        {tab.serverName}
      </span>
""", """      <span style={{
        fontSize: 13,
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        whiteSpace: 'nowrap'
      }}>
        {tab.serverName}
      </span>
      {/* Remote cwd from the shell integration — last path segment, full path on hover. */}
      {tab.cwd && tab.status === 'connected' && (
        <span
          className="font-mono"
          style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={tab.cwd}
        >
          {shortCwd(tab.cwd)}
        </span>
      )}
""")
sub(p, """export default function TabBar({""", """// "/home/alcir/projects/corpssh" → "corpssh"; "/" stays "/"; "~" for a bare home.
function shortCwd(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  if (!parts.length) return '/'
  if (parts.length === 2 && parts[0] === 'home') return '~'
  if (parts.length === 1 && parts[0] === 'root') return '~'
  return parts[parts.length - 1]
}

export default function TabBar({""")

# SFTPBrowser: open at the terminal's cwd; button to jump there
p = 'src/renderer/src/components/SFTP/SFTPBrowser.tsx'
sub(p, """  useEffect(() => {
    // Open the server pane at the user's home dir (writable) instead of '/'
    if (tab.sessionId) {
      window.api.sftp.home(tab.sessionId)
        .then((h) => loadRemote(h || '/'))
        .catch(() => loadRemote('/'))
    }""", """  useEffect(() => {
    // Open the server pane where the terminal is (shell integration cwd) when
    // known, else at the user's home dir (writable) instead of '/'
    if (tab.sessionId) {
      if (tab.cwd) loadRemote(tab.cwd)
      else window.api.sftp.home(tab.sessionId)
        .then((h) => loadRemote(h || '/'))
        .catch(() => loadRemote('/'))
    }""")
sub(p, """          canGoParent={remotePath !== '/'}
          onRefresh={() => loadRemote(remotePath)}
          currentPath={remotePath}
          onOpenFile={editRemoteFile}""", """          canGoParent={remotePath !== '/'}
          onRefresh={() => loadRemote(remotePath)}
          currentPath={remotePath}
          terminalCwd={tab.cwd}
          onOpenFile={editRemoteFile}""")
sub(p, """  /** Remote full paths currently open for editing (shows a live badge). */
  editingPaths?: Set<string>
}) {""", """  /** Remote full paths currently open for editing (shows a live badge). */
  editingPaths?: Set<string>
  /** The terminal's current directory (shell integration) — one-click jump. */
  terminalCwd?: string
}) {""")
sub(p, """  onRefresh, currentPath,
  onOpenFile, onDropFiles, editingPaths
}: {""", """  onRefresh, currentPath,
  onOpenFile, onDropFiles, editingPaths, terminalCwd
}: {""")
sub(p, """        <button
          onClick={onRefresh}
          className="flex items-center justify-center w-6 h-6 rounded"
          style={{ color: 'var(--text-secondary)', background: 'transparent' }}
          title="Refresh"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>""", """        <button
          onClick={onRefresh}
          className="flex items-center justify-center w-6 h-6 rounded"
          style={{ color: 'var(--text-secondary)', background: 'transparent' }}
          title="Refresh"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
        {terminalCwd && terminalCwd !== currentPath && (
          <button
            onClick={() => onNavigate(terminalCwd)}
            className="flex items-center justify-center w-6 h-6 rounded"
            style={{ color: 'var(--accent)', background: 'transparent' }}
            title={`Go to terminal directory: ${terminalCwd}`}
          >
            <Terminal size={11} />
          </button>
        )}""")
sub(p, "import { Folder, File, RefreshCw, ArrowLeft, ArrowRight, FolderOpen, AlertCircle } from 'lucide-react'",
    "import { Folder, File, RefreshCw, ArrowLeft, ArrowRight, FolderOpen, AlertCircle, Terminal } from 'lucide-react'")
print('ok')
