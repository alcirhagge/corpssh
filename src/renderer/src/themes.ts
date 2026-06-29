// ─────────────────────────────────────────────────────────────────────────────
// Theme system — glassmorphism edition.
//
// Each theme is declared as a compact *seed* and expanded into the full set of
// CSS custom properties by `expand()`. Surfaces are translucent (rgba) so the
// aurora background painted behind the whole app (see globals.css) bleeds
// through every panel, sidebar, card and modal — that's what makes the active
// theme feel present everywhere instead of "only the terminal".
// ─────────────────────────────────────────────────────────────────────────────

export interface ThemeDef {
  id: string
  name: string
  base: 'dark' | 'light'
  // Swatch preview colors
  bg: string
  surface: string
  accent: string
  text: string
  vars: Record<string, string>
}

interface ThemeSeed {
  id: string
  name: string
  base: 'dark' | 'light'
  appBase: string                 // solid color painted behind the aurora
  aurora: [string, string, string]// three translucent aurora blobs
  accent: string
  accentHover: string
  text: [string, string, string]  // primary, secondary, muted
  surfaceTint: string             // "r, g, b" the frosted glass is tinted with
  success: string
  warning: string
  error: string
  purple: string
  orange: string
  terminalBg: string
  terminalFg: string
  // swatch helpers
  swatchSurface: string
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

function expand(s: ThemeSeed): Record<string, string> {
  const dark = s.base === 'dark'
  const tint = s.surfaceTint
  const accentRgb = hexToRgb(s.accent)

  // Surface alpha levels (frosted glass over the aurora)
  const a = dark
    ? { titlebar: 0.74, sidebar: 0.60, tabbar: 0.56, surface: 0.62, elevated: 0.80, card: 0.58, input: 0.64 }
    : { titlebar: 0.66, sidebar: 0.58, tabbar: 0.52, surface: 0.64, elevated: 0.80, card: 0.62, input: 0.72 }

  // Hover / active / border overlays — light surfaces use dark overlays and vice-versa
  const ov = dark
    ? { hover: 'rgba(255,255,255,0.055)', active: 'rgba(255,255,255,0.10)', border: 'rgba(255,255,255,0.10)', borderSubtle: 'rgba(255,255,255,0.055)', thumb: 'rgba(255,255,255,0.13)', thumbHover: 'rgba(255,255,255,0.22)' }
    : { hover: 'rgba(0,0,0,0.04)', active: 'rgba(0,0,0,0.07)', border: 'rgba(0,0,0,0.10)', borderSubtle: 'rgba(0,0,0,0.05)', thumb: 'rgba(0,0,0,0.14)', thumbHover: 'rgba(0,0,0,0.24)' }

  const subtleA = dark ? 0.16 : 0.12
  const sub = (hex: string, alpha = 0.14) => `rgba(${hexToRgb(hex)}, ${alpha})`

  return {
    '--bg-app': 'transparent',
    '--bg-app-base': s.appBase,
    '--aurora-1': s.aurora[0],
    '--aurora-2': s.aurora[1],
    '--aurora-3': s.aurora[2],

    '--bg-surface': `rgba(${tint}, ${a.surface})`,
    '--bg-elevated': `rgba(${tint}, ${a.elevated})`,
    // Fully opaque surface for floating menus/popovers so text behind never bleeds through.
    '--bg-menu': `rgb(${tint})`,
    '--bg-card': `rgba(${tint}, ${a.card})`,
    '--bg-input': `rgba(${tint}, ${a.input})`,
    '--bg-hover': ov.hover,
    '--bg-active': ov.active,
    '--border': ov.border,
    '--border-subtle': ov.borderSubtle,

    '--titlebar-bg': `rgba(${tint}, ${a.titlebar})`,
    '--sidebar-bg': `rgba(${tint}, ${a.sidebar})`,
    '--tabbar-bg': `rgba(${tint}, ${a.tabbar})`,

    '--text-primary': s.text[0],
    '--text-secondary': s.text[1],
    '--text-muted': s.text[2],
    '--text-link': s.accent,

    '--accent': s.accent,
    '--accent-hover': s.accentHover,
    '--accent-rgb': accentRgb,
    '--accent-subtle': `rgba(${accentRgb}, ${subtleA})`,

    '--success': s.success, '--success-subtle': sub(s.success),
    '--warning': s.warning, '--warning-subtle': sub(s.warning),
    '--error': s.error, '--error-subtle': sub(s.error),
    '--purple': s.purple, '--purple-subtle': sub(s.purple),
    '--orange': s.orange,

    '--scrollbar-track': 'transparent',
    '--scrollbar-thumb': ov.thumb,
    '--scrollbar-thumb-hover': ov.thumbHover,

    // Glassmorphism primitives consumed by globals.css + components
    '--glass-blur': 'blur(20px) saturate(150%)',
    '--glass-blur-strong': 'blur(34px) saturate(160%)',
    '--glass-border': dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)',
    '--glass-highlight': dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.40)',
    '--glass-shadow': dark ? '0 8px 32px rgba(0,0,0,0.42)' : '0 8px 32px rgba(60,70,120,0.16)',

    // Terminal — kept opaque for readability + WebGL perf; user can override fg.
    '--terminal-bg': s.terminalBg,
    '--terminal-fg': s.terminalFg,
    '--terminal-cursor': s.accent,
    '--terminal-selection': `rgba(${accentRgb}, 0.3)`,
  }
}

const SEEDS: ThemeSeed[] = [
  {
    id: 'navy', name: 'Navy', base: 'dark',
    appBase: '#070810',
    aurora: ['rgba(76,116,255,0.16)', 'rgba(120,90,255,0.13)', 'rgba(40,90,200,0.12)'],
    accent: '#4c74ff', accentHover: '#6688ff',
    text: ['#d2d4e4', '#8388a8', '#4a4f74'],
    surfaceTint: '26, 30, 52',
    success: '#30d48a', warning: '#f7b731', error: '#ff5757', purple: '#a77bff', orange: '#ff8c42',
    terminalBg: '#0a0b12', terminalFg: '#aeb9ea',
    swatchSurface: '#1e2137',
  },
  {
    id: 'noir', name: 'Noir', base: 'dark',
    appBase: '#090505',
    aurora: ['rgba(232,64,64,0.16)', 'rgba(180,40,60,0.13)', 'rgba(120,20,20,0.12)'],
    accent: '#e84040', accentHover: '#ff5555',
    text: ['#e0d2d2', '#a87a7a', '#6a4444'],
    surfaceTint: '40, 22, 22',
    success: '#40d48a', warning: '#f7b731', error: '#ff7070', purple: '#c87bff', orange: '#ff7042',
    terminalBg: '#0a0606', terminalFg: '#ecb4b4',
    swatchSurface: '#1c1010',
  },
  {
    id: 'matrix', name: 'Matrix', base: 'dark',
    appBase: '#050805',
    aurora: ['rgba(0,208,104,0.15)', 'rgba(40,200,120,0.12)', 'rgba(0,120,60,0.12)'],
    accent: '#00d068', accentHover: '#00f07a',
    text: ['#c4dcc4', '#6fa66f', '#3d5f3d'],
    surfaceTint: '18, 34, 18',
    success: '#00e878', warning: '#e8c040', error: '#ff5555', purple: '#78ff78', orange: '#70d050',
    terminalBg: '#050a05', terminalFg: '#74e88a',
    swatchSurface: '#111811',
  },
  {
    id: 'clean', name: 'Clean', base: 'light',
    appBase: '#eef1f9',
    aurora: ['rgba(41,82,204,0.24)', 'rgba(120,90,230,0.20)', 'rgba(80,140,255,0.22)'],
    accent: '#2952cc', accentHover: '#3d66e8',
    text: ['#1e2040', '#5a6080', '#9398b6'],
    surfaceTint: '255, 255, 255',
    success: '#1db87a', warning: '#d49a0a', error: '#e53535', purple: '#7c52d9', orange: '#d96e28',
    terminalBg: '#ffffff', terminalFg: '#1e2040',
    swatchSurface: '#ffffff',
  },
  {
    id: 'warm', name: 'Warm', base: 'light',
    appBase: '#f6f1e8',
    aurora: ['rgba(196,106,0,0.24)', 'rgba(220,150,40,0.20)', 'rgba(180,80,20,0.18)'],
    accent: '#c46a00', accentHover: '#e07800',
    text: ['#2d1a06', '#7a5c30', '#a89060'],
    surfaceTint: '255, 252, 246',
    success: '#2a9a5a', warning: '#c87800', error: '#cc3333', purple: '#8844aa', orange: '#e06000',
    terminalBg: '#fdfaf4', terminalFg: '#2d1a06',
    swatchSurface: '#fdfaf4',
  },
  {
    id: 'violet', name: 'Violet', base: 'light',
    appBase: '#f1ecfa',
    aurora: ['rgba(102,40,204,0.24)', 'rgba(150,80,230,0.20)', 'rgba(80,40,180,0.20)'],
    accent: '#6628cc', accentHover: '#7a3ae0',
    text: ['#1a0a3a', '#5e4480', '#9080b0'],
    surfaceTint: '252, 250, 255',
    success: '#1a9a6a', warning: '#b07800', error: '#cc2244', purple: '#6628cc', orange: '#c05020',
    terminalBg: '#faf8ff', terminalFg: '#1a0a3a',
    swatchSurface: '#faf8ff',
  },
]

export const THEMES: ThemeDef[] = SEEDS.map((s) => ({
  id: s.id,
  name: s.name,
  base: s.base,
  bg: s.appBase,
  surface: s.swatchSurface,
  accent: s.accent,
  text: s.text[0],
  vars: expand(s),
}))

export function getThemeBase(themeId: string): 'dark' | 'light' {
  return THEMES.find((t) => t.id === themeId)?.base ?? 'dark'
}

export function applyTheme(themeId: string): void {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]
  const root = document.documentElement
  root.setAttribute('data-theme', themeId)
  root.classList.remove('dark', 'light')
  root.classList.add(theme.base)

  // Remove any stale <style> from the previous (style-tag) implementation so it
  // can't linger in <head> and override the inline vars after a hot reload.
  document.getElementById('cs-theme')?.remove()

  // Apply the variables as INLINE styles on <html>. Inline styles win over any
  // stylesheet rule, so the active theme always beats the globals.css defaults
  // (and we sidestep dev-only HMR <style> reordering that could let the navy
  // `.dark { --accent }` override the selected theme).
  for (const [k, v] of Object.entries(theme.vars)) {
    root.style.setProperty(k, v)
  }
}
