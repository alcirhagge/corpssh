import { create } from 'zustand'
import type { Server, Group, SSHKey, Credential, Tab, AppSettings, Theme, NavPage, LogEntry } from '../types'

interface AppState {
  servers: Server[]
  groups: Group[]
  keys: SSHKey[]
  credentials: Credential[]
  settings: AppSettings
  tabs: Tab[]
  activeTabId: string | null
  theme: Theme
  activePage: NavPage
  rightPanel: null | { mode: 'new'; groupId?: string } | { mode: 'edit'; server: Server }
  logs: LogEntry[]
  isLoading: boolean

  setServers: (s: Server[]) => void
  setGroups: (g: Group[]) => void
  setKeys: (k: SSHKey[]) => void
  setCredentials: (c: Credential[]) => void
  setSettings: (s: AppSettings) => void
  setTheme: (t: Theme) => void
  setActivePage: (p: NavPage) => void
  setRightPanel: (p: AppState['rightPanel']) => void

  addTab: (t: Tab) => void
  updateTab: (id: string, u: Partial<Tab>) => void
  removeTab: (id: string) => void
  setActiveTab: (id: string | null) => void

  upsertServer: (s: Server) => void
  removeServer: (id: string) => void
  upsertGroup: (g: Group) => void
  removeGroup: (id: string) => void
  upsertKey: (k: SSHKey) => void
  removeKey: (id: string) => void

  upsertCredential: (c: Credential) => void
  removeCredential: (id: string) => void

  addLog: (e: LogEntry) => void
  setLogs: (e: LogEntry[]) => void
  clearLogs: () => void

  setLoading: (v: boolean) => void
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
  bellStyle: 'none'
}

export const useAppStore = create<AppState>((set) => ({
  servers: [],
  groups: [],
  keys: [],
  credentials: [],
  settings: defaultSettings,
  tabs: [],
  activeTabId: null,
  theme: 'dark',
  activePage: 'hosts',
  rightPanel: null,
  logs: [],
  isLoading: false,

  setServers: (servers) => set({ servers }),
  setGroups: (groups) => set({ groups }),
  setKeys: (keys) => set({ keys }),
  setCredentials: (credentials) => set({ credentials }),
  setSettings: (settings) => set({ settings }),
  setTheme: (theme) => set({ theme }),
  setActivePage: (activePage) => set({ activePage }),
  setRightPanel: (rightPanel) => set({ rightPanel }),

  addTab: (tab) => set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id })),
  updateTab: (id, u) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...u } : t)) })),
  removeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      const activeTabId =
        s.activeTabId === id ? (tabs.length > 0 ? tabs[tabs.length - 1].id : null) : s.activeTabId
      return { tabs, activeTabId }
    }),
  setActiveTab: (id) => set({ activeTabId: id }),

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

  addLog: (entry) => set((s) => ({ logs: [entry, ...s.logs].slice(0, 1000) })),
  setLogs: (logs) => set({ logs }),
  clearLogs: () => set({ logs: [] }),

  setLoading: (v) => set({ isLoading: v })
}))
