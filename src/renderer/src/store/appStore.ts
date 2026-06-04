import { create } from 'zustand'
import type { Server, Group, SSHKey, Tab, AppSettings, Theme } from '../types'

interface AppState {
  // Data
  servers: Server[]
  groups: Group[]
  keys: SSHKey[]
  settings: AppSettings
  tabs: Tab[]
  activeTabId: string | null
  theme: Theme

  // Loading
  isLoading: boolean

  // Actions
  setServers: (servers: Server[]) => void
  setGroups: (groups: Group[]) => void
  setKeys: (keys: SSHKey[]) => void
  setSettings: (settings: AppSettings) => void
  setTheme: (theme: Theme) => void

  addTab: (tab: Tab) => void
  updateTab: (id: string, updates: Partial<Tab>) => void
  removeTab: (id: string) => void
  setActiveTab: (id: string | null) => void

  upsertServer: (server: Server) => void
  removeServer: (id: string) => void

  upsertGroup: (group: Group) => void
  removeGroup: (id: string) => void

  upsertKey: (key: SSHKey) => void
  removeKey: (id: string) => void

  setLoading: (v: boolean) => void
}

const defaultSettings: AppSettings = {
  theme: 'dark',
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
  settings: defaultSettings,
  tabs: [],
  activeTabId: null,
  theme: 'dark',
  isLoading: false,

  setServers: (servers) => set({ servers }),
  setGroups: (groups) => set({ groups }),
  setKeys: (keys) => set({ keys }),
  setSettings: (settings) => set({ settings }),
  setTheme: (theme) => set({ theme }),

  addTab: (tab) =>
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id
    })),

  updateTab: (id, updates) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t))
    })),

  removeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((t) => t.id !== id)
      const activeTabId =
        state.activeTabId === id
          ? tabs.length > 0
            ? tabs[tabs.length - 1].id
            : null
          : state.activeTabId
      return { tabs, activeTabId }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  upsertServer: (server) =>
    set((state) => {
      const idx = state.servers.findIndex((s) => s.id === server.id)
      const servers =
        idx >= 0
          ? state.servers.map((s) => (s.id === server.id ? server : s))
          : [...state.servers, server]
      return { servers }
    }),

  removeServer: (id) =>
    set((state) => ({ servers: state.servers.filter((s) => s.id !== id) })),

  upsertGroup: (group) =>
    set((state) => {
      const idx = state.groups.findIndex((g) => g.id === group.id)
      const groups =
        idx >= 0
          ? state.groups.map((g) => (g.id === group.id ? group : g))
          : [...state.groups, group]
      return { groups }
    }),

  removeGroup: (id) =>
    set((state) => ({ groups: state.groups.filter((g) => g.id !== id) })),

  upsertKey: (key) =>
    set((state) => {
      const idx = state.keys.findIndex((k) => k.id === key.id)
      const keys =
        idx >= 0
          ? state.keys.map((k) => (k.id === key.id ? key : k))
          : [...state.keys, key]
      return { keys }
    }),

  removeKey: (id) =>
    set((state) => ({ keys: state.keys.filter((k) => k.id !== id) })),

  setLoading: (v) => set({ isLoading: v })
}))
