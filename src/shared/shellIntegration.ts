// ─── Shell integration (OSC 133 / OSC 7) ────────────────────────────────────
// Shared by the renderer's xterm and the main-process headless emulator (the
// session logger). Two halves:
//
//   1. SHELL_INTEGRATION_SCRIPT — a compact bash snippet injected into the
//      remote shell right after it opens (Linux hosts only, never network gear).
//      It makes the shell emit the open FinalTerm/iTerm2/VS Code marks:
//        OSC 133;A   prompt starts          OSC 133;B   prompt ends / user input starts
//        OSC 133;C   command output starts  OSC 133;D;N command finished, exit code N
//        OSC 7;file://host/path             current working directory
//      No `trap DEBUG`: C comes from PS0 (bash >= 4.4), D/A/7 from PROMPT_COMMAND.
//      On older bash (no PS0) C is missing and the command text falls back to the
//      rest of the prompt line.
//
//   2. attachShellIntegration() — registers OSC handlers on any xterm-like
//      terminal and reconstructs {command, exitCode, lines} from the marks plus
//      the buffer contents, so the app knows the command the shell ACTUALLY ran
//      (after readline editing, history expansion, tab completion), not what
//      was typed.

// Leading space on every line keeps it out of bash history (HISTCONTROL
// ignorespace/ignoreboth, the Debian/Ubuntu default). Guarded by $BASH_VERSION
// so a non-bash login shell ignores everything but the harmless `clear`.
// Kept well under the 4 KiB tty canonical line buffer.
export const SHELL_INTEGRATION_SCRIPT = [
  ` if [ -n "$BASH_VERSION" ] && [ -z "$__cs_on" ]; then __cs_on=1; __cs_n=0`,
  ` __cs_pc(){ local e=$?; [ "$__cs_n" = 1 ] && printf '\\033]133;D;%s\\a' "$e"; __cs_n=1; printf '\\033]7;file://%s%s\\a\\033]133;A\\a' "$HOSTNAME" "$PWD"; if [ "$PS1" != "$__cs_ps1" ]; then __cs_ps1="\${PS1}\\[\\033]133;B\\a\\]"; PS1="$__cs_ps1"; fi; return $e; }`,
  ` PS0='\\[\\033]133;C\\a\\]'"$PS0"`,
  ` if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then PROMPT_COMMAND=(__cs_pc "\${PROMPT_COMMAND[@]}"); else PROMPT_COMMAND="__cs_pc\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"; fi`,
  ` fi; clear`,
  ''
].join('\n')

export interface TrackedCommand {
  /** The command text as the shell received it (after readline edits). */
  command: string
  /** Exit status reported by the shell, or null when the mark carried none. */
  exitCode: number | null
  /** Absolute buffer line (scrollback included) where the prompt starts. */
  promptLine: number
  /** Line where the command text starts (OSC 133;B). */
  commandLine: number
  /** First line of the command's output (OSC 133;C), null on bash < 4.4. */
  outputLine: number | null
  /** Line where the NEXT prompt starts (where OSC 133;D was seen). */
  endLine: number
}

export interface ShellIntegrationEvents {
  /** First time any integration mark is seen on this terminal. */
  onActivate?: () => void
  /** The shell reported its working directory (OSC 7). */
  onCwd?: (cwd: string, host: string) => void
  /** A new prompt started (OSC 133;A). */
  onPrompt?: (line: number) => void
  /** A command finished (OSC 133;D). Empty commands (bare Enter) are skipped. */
  onCommand?: (cmd: TrackedCommand) => void
}

// Structural subset of xterm's Terminal that both @xterm/xterm and
// @xterm/headless satisfy — keeps this file free of either dependency.
interface MarkerLike { readonly line: number; readonly isDisposed: boolean; dispose(): void }
interface LineLike { readonly isWrapped: boolean; translateToString(trimRight?: boolean, start?: number, end?: number): string }
export interface TerminalLike {
  readonly parser: { registerOscHandler(ident: number, cb: (data: string) => boolean): { dispose(): void } }
  registerMarker(cursorYOffset?: number): MarkerLike | undefined
  readonly buffer: { readonly active: { readonly cursorX: number; readonly cursorY: number; readonly baseY: number; getLine(y: number): LineLike | undefined } }
}

export interface ShellIntegration {
  /** True once a mark has been received (the script is running on the remote). */
  readonly active: boolean
  /** Finished commands, oldest first (capped). */
  readonly commands: readonly TrackedCommand[]
  /** Prompt start lines, oldest first (capped) — for Ctrl+Up/Down navigation. */
  readonly prompts: readonly number[]
  /** Forget everything (e.g. the transport was swapped on reconnect). */
  reset(): void
  dispose(): void
}

const MAX_TRACKED = 500

// Read the text between two buffer positions. Soft-wrapped continuation lines
// are joined without a separator (they are one logical line); hard line breaks
// (multi-line commands, heredocs) are kept as '\n'.
function textBetween(term: TerminalLike, fromLine: number, fromCol: number, toLine: number, toCol: number | null): string {
  const buf = term.buffer.active
  let out = ''
  for (let y = fromLine; y <= toLine; y++) {
    const line = buf.getLine(y)
    if (!line) continue
    const start = y === fromLine ? fromCol : 0
    const end = y === toLine && toCol !== null ? toCol : undefined
    const piece = line.translateToString(true, start, end)
    if (y > fromLine) out += line.isWrapped ? '' : '\n'
    out += piece
  }
  return out.trim()
}

function parseCwd(data: string): { cwd: string; host: string } | null {
  // "file://host/path" (host may be empty); some shells URL-encode the path.
  const m = /^file:\/\/([^/]*)(\/.*)$/.exec(data)
  if (!m) return null
  let cwd = m[2]
  try { cwd = decodeURIComponent(cwd) } catch { /* keep raw */ }
  return { cwd, host: m[1] }
}

export function attachShellIntegration(term: TerminalLike, ev: ShellIntegrationEvents): ShellIntegration {
  let active = false
  const commands: TrackedCommand[] = []
  const prompts: number[] = []

  // Marks of the command currently being assembled.
  let promptMark: MarkerLike | undefined
  let cmdMark: MarkerLike | undefined
  let cmdCol = 0
  let outMark: MarkerLike | undefined
  let outCol = 0
  // Once this shell has emitted a C mark we know it supports PS0, so a D with no
  // C means nothing ran (Ctrl+C at the prompt, bare Enter) — not a command.
  let sawC = false

  const line = (m: MarkerLike | undefined): number | null => (m && !m.isDisposed ? m.line : null)
  const cursorLine = (): number => term.buffer.active.baseY + term.buffer.active.cursorY

  const activate = (): void => {
    if (active) return
    active = true
    ev.onActivate?.()
  }

  const dropMarks = (): void => {
    promptMark?.dispose(); cmdMark?.dispose(); outMark?.dispose()
    promptMark = cmdMark = outMark = undefined
  }

  const finish = (exitCode: number | null): void => {
    const cLine = line(cmdMark)
    if (cLine === null) { dropMarks(); return }  // D without B — nothing to record (bare Enter, or scrolled away)
    const oLine = line(outMark)
    if (oLine === null && sawC) { dropMarks(); return }  // nothing executed (e.g. ^C at prompt)
    const endLine = cursorLine()
    // Command text = what sits between B and C. Without C (old bash), take the
    // rest of the B line — good enough for single-line commands.
    const command = oLine !== null
      ? textBetween(term, cLine, cmdCol, oLine, outCol)
      : textBetween(term, cLine, cmdCol, cLine, null)
    if (!command || command.endsWith('^C')) { dropMarks(); return }  // readline's ^C echo, never a command
    const rec: TrackedCommand = {
      command, exitCode,
      promptLine: line(promptMark) ?? cLine,
      commandLine: cLine,
      outputLine: oLine,
      endLine
    }
    dropMarks()
    commands.push(rec)
    if (commands.length > MAX_TRACKED) commands.shift()
    ev.onCommand?.(rec)
  }

  const h133 = term.parser.registerOscHandler(133, (data) => {
    activate()
    const kind = data[0]
    switch (kind) {
      case 'A': {
        // A new prompt. If a command was pending with no D (shell killed, or the
        // mark got lost), drop it rather than mis-attributing the next output.
        dropMarks()
        promptMark = term.registerMarker(0)
        const l = cursorLine()
        if (prompts[prompts.length - 1] !== l) {
          prompts.push(l)
          if (prompts.length > MAX_TRACKED) prompts.shift()
        }
        ev.onPrompt?.(l)
        break
      }
      case 'B':
        cmdMark?.dispose()
        cmdMark = term.registerMarker(0)
        cmdCol = term.buffer.active.cursorX
        break
      case 'C':
        sawC = true
        outMark?.dispose()
        outMark = term.registerMarker(0)
        outCol = term.buffer.active.cursorX
        break
      case 'D': {
        const code = data.length > 2 ? parseInt(data.slice(2), 10) : NaN
        finish(Number.isFinite(code) ? code : null)
        break
      }
      default:
        break
    }
    return true  // consumed — never let it fall through as unknown OSC
  })

  const h7 = term.parser.registerOscHandler(7, (data) => {
    const p = parseCwd(data)
    if (p) { activate(); ev.onCwd?.(p.cwd, p.host) }
    return true
  })

  return {
    get active() { return active },
    commands,
    prompts,
    reset() {
      active = false
      sawC = false
      commands.length = 0
      prompts.length = 0
      dropMarks()
    },
    dispose() {
      h133.dispose(); h7.dispose(); dropMarks()
    }
  }
}
