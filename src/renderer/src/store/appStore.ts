import { create } from 'zustand'
import type { Server, Group, SSHKey, Credential, Snippet, Tab, AppSettings, Theme, NavPage, LogEntry } from '../types'

// Terminal split layouts. '1' = single pane (classic). '2v' = side by side,
// '2h' = stacked, '2x2' = four-up grid. Only the "normal" terminal strip splits;
// the script-broadcast strip stays single.
export type PaneLayout = '1' | '2v' | '2h' | '2x2'
export const PANE_SLOTS: Record<PaneLayout, number> = { '1': 1, '2v': 2, '2h': 2, '2x2': 4 }

interface AppState {
  servers: Server[]
  groups: Group[]
  keys: SSHKey[]
  credentials: Credential[]
  snippets: Snippet[]
  settings: AppSettings
  tabs: Tab[]
  activeTabId: string | null
  /** Terminal split layout for the normal strip. */
  paneLayout: PaneLayout
  /** Tab ids occupying the grid slots (in order). activeTabId is the focused one. */
  panes: string[]
  theme: Theme
  activePage: NavPage
  rightPanel: null | { mode: 'new'; groupId?: string } | { mode: 'edit'; server: Server }
  logs: LogEntry[]
  isLoading: boolean
  /** bump to ask the active TerminalPane to refocus (e.g. after a snippet insert) */
  terminalFocusNonce: number
  /** When true, the focused terminal mirrors keystrokes to every connected
   *  terminal session in the same strip (live multi-host broadcast). */
  broadcastInput: boolean
  cloudRecovery: { access_token: string; refresh_token: string; type: string | null } | null

  setServers: (s: Server[]) => void
  setGroups: (g: Group[]) => void
  setKeys: (k: SSHKey[]) => void
  setCredentials: (c: Credential[]) => void
  setSnippets: (s: Snippet[]) => void
  setSettings: (s: AppSettings) => void
  setTheme: (t: Theme) => void
  setActivePage: (p: NavPage) => void
  setRightPanel: (p: AppState['rightPanel']) => void

  addTab: (t: Tab) => void
  updateTab: (id: string, u: Partial<Tab>) => void
  removeTab: (id: string) => void
  setActiveTab: (id: string | null) => void
  setPaneLayout: (l: PaneLayout) => void
  /** Focus a tab; in split mode, drop it into the focused slot if not shown yet. */
  activateTab: (id: string) => void
  /** Swap two grid slots (Alt+drag rearrange). */
  swapPanes: (i: number, j: number) => void

  upsertServer: (s: Server) => void
  removeServer: (id: string) => void
  upsertGroup: (g: Group) => void
  removeGroup: (id: string) => void
  upsertKey: (k: SSHKey) => void
  removeKey: (id: string) => void

  upsertCredential: (c: Credential) => void
  removeCredential: (id: string) => void

  upsertSnippet: (s: Snippet) => void
  removeSnippet: (id: string) => void

  addLog: (e: LogEntry) => void
  setLogs: (e: LogEntry[]) => void
  clearLogs: () => void

  setLoading: (v: boolean) => void
  setCloudRecovery: (p: AppState['cloudRecovery']) => void
  focusTerminal: () => void
  setBroadcastInput: (v: boolean) => void
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  themeId: 'navy',
  uiFontSize: 14,
  fontSize: 14,
  fontFamily: 'JetBrains Mono, Cascadia Code, monospace',
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 5000,
  bellStyle: 'none',
  terminalAutoColor: true
}

export const useAppStore = create<AppState>((set) => ({
  servers: [],
  groups: [],
  keys: [],
  credentials: [],
  snippets: [],
  settings: defaultSettings,
  tabs: [],
  activeTabId: null,
  paneLayout: '1',
  panes: [],
  theme: 'dark',
  activePage: 'hosts',
  rightPanel: null,
  logs: [],
  isLoading: false,
  terminalFocusNonce: 0,
  broadcastInput: false,
  cloudRecovery: null,

  setServers: (servers) => set({ servers }),
  setGroups: (groups) => set({ groups }),
  setKeys: (keys) => set({ keys }),
  setCredentials: (credentials) => set({ credentials }),
  setSnippets: (snippets) => set({ snippets }),
  setSettings: (settings) => set({ settings }),
  setTheme: (theme) => set({ theme }),
  setActivePage: (activePage) => set({ activePage }),
  setRightPanel: (rightPanel) => set({ rightPanel }),

  addTab: (tab) =>
    set((s) => {
      const tabs = [...s.tabs, tab]
      if (s.paneLayout === '1') return { tabs, activeTabId: tab.id }
      // Split: fill the next empty slot, else replace the focused one.
      const count = PANE_SLOTS[s.paneLayout]
      const panes = s.panes.slice()
      if (panes.length < count) panes.push(tab.id)
      else panes[Math.max(0, panes.indexOf(s.activeTabId ?? ''))] = tab.id
      return { tabs, activeTabId: tab.id, panes }
    }),
  updateTab: (id, u) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...u } : t)) })),
  removeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      const panes = s.panes.filter((p) => p !== id)
      // Collapse back to single when the grid empties out.
      const paneLayout: PaneLayout = panes.length === 0 ? '1' : s.paneLayout
      const activeTabId =
        s.activeTabId === id
          ? (panes[panes.length - 1] ?? (tabs.length > 0 ? tabs[tabs.length - 1].id : null))
          : s.activeTabId
      return { tabs, panes, paneLayout, activeTabId }
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  setPaneLayout: (paneLayout) =>
    set((s) => {
      const count = PANE_SLOTS[paneLayout]
      // Candidate tabs for the grid: normal-strip terminals, focused one first,
      // then whatever was already shown, then the rest by tab order.
      const normal = s.tabs.filter((t) => (t.kind ?? 'normal') === 'normal')
      const order: string[] = []
      const push = (id: string | null): void => {
        if (id && !order.includes(id) && normal.some((t) => t.id === id)) order.push(id)
      }
      push(s.activeTabId)
      s.panes.forEach(push)
      normal.forEach((t) => push(t.id))
      const panes = order.slice(0, count)
      const activeTabId = panes.includes(s.activeTabId ?? '') ? s.activeTabId : (panes[0] ?? s.activeTabId)
      return { paneLayout, panes, activeTabId }
    }),
  activateTab: (id) =>
    set((s) => {
      if (s.paneLayout === '1' || s.panes.includes(id)) return { activeTabId: id }
      const panes = s.panes.slice()
      panes[Math.max(0, panes.indexOf(s.activeTabId ?? ''))] = id
      return { activeTabId: id, panes }
    }),
  swapPanes: (i, j) =>
    set((s) => {
      if (i === j) return {}
      const panes = s.panes.slice()
      const tmp = panes[i]
      panes[i] = panes[j]
      panes[j] = tmp
      // Moving into an empty slot leaves a hole — compact it away.
      return { panes: panes.filter((p) => p != null) }
    }),

  upsertServer: (server) =>
    set((s) => ({
      servers:
        s.servers.find((x) => x.id === server.id)
          ? s.servers.map((x) => (x.id === server.id ? server : x))
          : [...s.servers, server]
    })),
  removeServer: (id) => set((s) => ({ servers: s.servers.filter((x) => x.id !== id) })),

  upsertGroup: (group) =>
    set((s) => ({
      groups:
        s.groups.find((x) => x.id === group.id)
          ? s.groups.map((x) => (x.id === group.id ? group : x))
          : [...s.groups, group]
    })),
  removeGroup: (id) => set((s) => ({ groups: s.groups.filter((x) => x.id !== id) })),

  upsertKey: (key) =>
    set((s) => ({
      keys:
        s.keys.find((x) => x.id === key.id)
          ? s.keys.map((x) => (x.id === key.id ? key : x))
          : [...s.keys, key]
    })),
  removeKey: (id) => set((s) => ({ keys: s.keys.filter((x) => x.id !== id) })),

  upsertCredential: (cred) =>
    set((s) => ({
      credentials:
        s.credentials.find((x) => x.id === cred.id)
          ? s.credentials.map((x) => (x.id === cred.id ? cred : x))
          : [...s.credentials, cred]
    })),
  removeCredential: (id) =>
    set((s) => ({
      credentials: s.credentials.filter((x) => x.id !== id),
      // mirror the main-process detach so referencing hosts fall back to own auth
      servers: s.servers.map((x) => (x.credentialId === id ? { ...x, credentialId: undefined } : x))
    })),

  upsertSnippet: (snippet) =>
    set((s) => ({
      snippets:
        s.snippets.find((x) => x.id === snippet.id)
          ? s.snippets.map((x) => (x.id === snippet.id ? snippet : x))
          : [...s.snippets, snippet]
    })),
  removeSnippet: (id) => set((s) => ({ snippets: s.snippets.filter((x) => x.id !== id) })),

  addLog: (entry) => set((s) => ({ logs: [entry, ...s.logs].slice(0, 1000) })),
  setLogs: (logs) => set({ logs }),
  clearLogs: () => set({ logs: [] }),

  setLoading: (v) => set({ isLoading: v }),
  setCloudRecovery: (cloudRecovery) => set({ cloudRecovery }),
  focusTerminal: () => set((s) => ({ terminalFocusNonce: s.terminalFocusNonce + 1 })),
  setBroadcastInput: (broadcastInput) => set({ broadcastInput })
}))
