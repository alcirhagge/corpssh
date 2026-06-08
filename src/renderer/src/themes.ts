export interface ThemeDef {
  id: string
  name: string
  base: 'dark' | 'light'
  // For swatch previews
  bg: string
  surface: string
  accent: string
  text: string
  vars: Record<string, string>
}

export const THEMES: ThemeDef[] = [
  {
    id: 'navy', name: 'Navy', base: 'dark',
    bg: '#13141e', surface: '#1e2137', accent: '#4c74ff', text: '#c8cad8',
    vars: {
      '--bg-app': '#13141e', '--bg-surface': '#191c2a', '--bg-elevated': '#1e2137',
      '--bg-card': '#1e2137', '--bg-input': '#181b28', '--bg-hover': '#21253b',
      '--bg-active': '#272c44', '--border': '#282c43', '--border-subtle': '#1c1f31',
      '--text-primary': '#c8cad8', '--text-secondary': '#7b80a0', '--text-muted': '#42476a',
      '--text-link': '#4c74ff', '--accent': '#4c74ff', '--accent-hover': '#6688ff',
      '--accent-subtle': 'rgba(76,116,255,0.15)',
      '--success': '#30d48a', '--success-subtle': 'rgba(48,212,138,0.12)',
      '--warning': '#f7b731', '--warning-subtle': 'rgba(247,183,49,0.12)',
      '--error': '#ff5757', '--error-subtle': 'rgba(255,87,87,0.12)',
      '--purple': '#a77bff', '--purple-subtle': 'rgba(167,123,255,0.12)',
      '--orange': '#ff8c42',
      '--titlebar-bg': '#0e0f18', '--sidebar-bg': '#191c2a', '--tabbar-bg': '#13141e',
      '--scrollbar-thumb': '#282c43', '--scrollbar-thumb-hover': '#363b58',
      '--terminal-bg': '#0e0f18', '--terminal-fg': '#c8cad8',
      '--terminal-cursor': '#4c74ff', '--terminal-selection': 'rgba(76,116,255,0.3)',
    }
  },
  {
    id: 'noir', name: 'Noir', base: 'dark',
    bg: '#0e0909', surface: '#1c1010', accent: '#e84040', text: '#d8c8c8',
    vars: {
      '--bg-app': '#0e0909', '--bg-surface': '#150c0c', '--bg-elevated': '#1c1010',
      '--bg-card': '#1c1010', '--bg-input': '#130a0a', '--bg-hover': '#211212',
      '--bg-active': '#2a1515', '--border': '#2d1515', '--border-subtle': '#1e0e0e',
      '--text-primary': '#d8c8c8', '--text-secondary': '#9a7070', '--text-muted': '#5a3838',
      '--text-link': '#ff5555', '--accent': '#e84040', '--accent-hover': '#ff5555',
      '--accent-subtle': 'rgba(232,64,64,0.15)',
      '--success': '#40d48a', '--success-subtle': 'rgba(64,212,138,0.12)',
      '--warning': '#f7b731', '--warning-subtle': 'rgba(247,183,49,0.12)',
      '--error': '#ff7070', '--error-subtle': 'rgba(255,112,112,0.12)',
      '--purple': '#c87bff', '--purple-subtle': 'rgba(200,123,255,0.12)',
      '--orange': '#ff7042',
      '--titlebar-bg': '#090606', '--sidebar-bg': '#150c0c', '--tabbar-bg': '#0e0909',
      '--scrollbar-thumb': '#2d1515', '--scrollbar-thumb-hover': '#401d1d',
      '--terminal-bg': '#090606', '--terminal-fg': '#d8c8c8',
      '--terminal-cursor': '#e84040', '--terminal-selection': 'rgba(232,64,64,0.3)',
    }
  },
  {
    id: 'matrix', name: 'Matrix', base: 'dark',
    bg: '#080e08', surface: '#111811', accent: '#00d068', text: '#c0d8c0',
    vars: {
      '--bg-app': '#080e08', '--bg-surface': '#0c130c', '--bg-elevated': '#111811',
      '--bg-card': '#111811', '--bg-input': '#0a1009', '--bg-hover': '#151f15',
      '--bg-active': '#1a271a', '--border': '#1e2e1e', '--border-subtle': '#121a12',
      '--text-primary': '#c0d8c0', '--text-secondary': '#6a9a6a', '--text-muted': '#3a5a3a',
      '--text-link': '#00e878', '--accent': '#00d068', '--accent-hover': '#00f07a',
      '--accent-subtle': 'rgba(0,208,104,0.15)',
      '--success': '#00e878', '--success-subtle': 'rgba(0,232,120,0.12)',
      '--warning': '#e8c040', '--warning-subtle': 'rgba(232,192,64,0.12)',
      '--error': '#ff5555', '--error-subtle': 'rgba(255,85,85,0.12)',
      '--purple': '#78ff78', '--purple-subtle': 'rgba(120,255,120,0.12)',
      '--orange': '#70d050',
      '--titlebar-bg': '#050a05', '--sidebar-bg': '#0c130c', '--tabbar-bg': '#080e08',
      '--scrollbar-thumb': '#1e2e1e', '--scrollbar-thumb-hover': '#2a3e2a',
      '--terminal-bg': '#050a05', '--terminal-fg': '#c0d8c0',
      '--terminal-cursor': '#00e878', '--terminal-selection': 'rgba(0,208,104,0.3)',
    }
  },
  {
    id: 'clean', name: 'Clean', base: 'light',
    bg: '#f0f2f8', surface: '#ffffff', accent: '#2952cc', text: '#1e2040',
    vars: {
      '--bg-app': '#f0f2f8', '--bg-surface': '#ffffff', '--bg-elevated': '#f5f7fc',
      '--bg-card': '#ffffff', '--bg-input': '#f0f2f8', '--bg-hover': '#eaecf4',
      '--bg-active': '#e2e5f0', '--border': '#d4d8ec', '--border-subtle': '#eaecf4',
      '--text-primary': '#1e2040', '--text-secondary': '#606480', '--text-muted': '#9ea3bc',
      '--text-link': '#2952cc', '--accent': '#2952cc', '--accent-hover': '#3d66e8',
      '--accent-subtle': 'rgba(41,82,204,0.1)',
      '--success': '#1db87a', '--success-subtle': 'rgba(29,184,122,0.1)',
      '--warning': '#d49a0a', '--warning-subtle': 'rgba(212,154,10,0.1)',
      '--error': '#e53535', '--error-subtle': 'rgba(229,53,53,0.1)',
      '--purple': '#7c52d9', '--purple-subtle': 'rgba(124,82,217,0.1)',
      '--orange': '#d96e28',
      '--titlebar-bg': '#e8ebf6', '--sidebar-bg': '#eceef8', '--tabbar-bg': '#f0f2f8',
      '--scrollbar-thumb': '#d4d8ec', '--scrollbar-thumb-hover': '#b8bdd8',
      '--terminal-bg': '#ffffff', '--terminal-fg': '#1e2040',
      '--terminal-cursor': '#2952cc', '--terminal-selection': 'rgba(41,82,204,0.2)',
    }
  },
  {
    id: 'warm', name: 'Warm', base: 'light',
    bg: '#f5f0e8', surface: '#fdfaf4', accent: '#c46a00', text: '#2d1a06',
    vars: {
      '--bg-app': '#f5f0e8', '--bg-surface': '#fdfaf4', '--bg-elevated': '#ede6d6',
      '--bg-card': '#fdfaf4', '--bg-input': '#f0ead8', '--bg-hover': '#e8e0cc',
      '--bg-active': '#ddd5c0', '--border': '#c8bfa8', '--border-subtle': '#e0d8c4',
      '--text-primary': '#2d1a06', '--text-secondary': '#7a5c30', '--text-muted': '#a89060',
      '--text-link': '#b85c00', '--accent': '#c46a00', '--accent-hover': '#e07800',
      '--accent-subtle': 'rgba(196,106,0,0.12)',
      '--success': '#2a9a5a', '--success-subtle': 'rgba(42,154,90,0.12)',
      '--warning': '#c87800', '--warning-subtle': 'rgba(200,120,0,0.12)',
      '--error': '#cc3333', '--error-subtle': 'rgba(204,51,51,0.12)',
      '--purple': '#8844aa', '--purple-subtle': 'rgba(136,68,170,0.12)',
      '--orange': '#e06000',
      '--titlebar-bg': '#ece4d2', '--sidebar-bg': '#ede6d6', '--tabbar-bg': '#f5f0e8',
      '--scrollbar-thumb': '#c8bfa8', '--scrollbar-thumb-hover': '#b0a490',
      '--terminal-bg': '#fdfaf4', '--terminal-fg': '#2d1a06',
      '--terminal-cursor': '#c46a00', '--terminal-selection': 'rgba(196,106,0,0.2)',
    }
  },
  {
    id: 'violet', name: 'Violet', base: 'light',
    bg: '#f0ecfa', surface: '#faf8ff', accent: '#6628cc', text: '#1a0a3a',
    vars: {
      '--bg-app': '#f0ecfa', '--bg-surface': '#faf8ff', '--bg-elevated': '#e8e0f8',
      '--bg-card': '#faf8ff', '--bg-input': '#ede8f8', '--bg-hover': '#e4ddf5',
      '--bg-active': '#d8d0ee', '--border': '#c0b4e0', '--border-subtle': '#e4ddf5',
      '--text-primary': '#1a0a3a', '--text-secondary': '#5e4480', '--text-muted': '#9080b0',
      '--text-link': '#6628cc', '--accent': '#6628cc', '--accent-hover': '#7a3ae0',
      '--accent-subtle': 'rgba(102,40,204,0.12)',
      '--success': '#1a9a6a', '--success-subtle': 'rgba(26,154,106,0.12)',
      '--warning': '#b07800', '--warning-subtle': 'rgba(176,120,0,0.12)',
      '--error': '#cc2244', '--error-subtle': 'rgba(204,34,68,0.12)',
      '--purple': '#6628cc', '--purple-subtle': 'rgba(102,40,204,0.12)',
      '--orange': '#c05020',
      '--titlebar-bg': '#e6dffa', '--sidebar-bg': '#e8e0f8', '--tabbar-bg': '#f0ecfa',
      '--scrollbar-thumb': '#c0b4e0', '--scrollbar-thumb-hover': '#a898cc',
      '--terminal-bg': '#faf8ff', '--terminal-fg': '#1a0a3a',
      '--terminal-cursor': '#6628cc', '--terminal-selection': 'rgba(102,40,204,0.2)',
    }
  },
]

export function getThemeBase(themeId: string): 'dark' | 'light' {
  return THEMES.find((t) => t.id === themeId)?.base ?? 'dark'
}

export function applyTheme(themeId: string): void {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]
  document.documentElement.setAttribute('data-theme', themeId)
  document.documentElement.classList.remove('dark', 'light')
  document.documentElement.classList.add(theme.base)

  // Inject a <style> tag appended to <head> so it comes after globals.css in
  // document order. Rules with equal specificity (:root) that appear later win,
  // so this reliably overrides any :root / .dark definition in the stylesheet.
  let el = document.getElementById('cs-theme') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'cs-theme'
    document.head.appendChild(el)
  }
  const vars = Object.entries(theme.vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')
  el.textContent = `:root {\n${vars}\n}`
}
