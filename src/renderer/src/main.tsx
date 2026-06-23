import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Self-hosted fonts (no external Google Fonts fetch): instant first paint,
// works offline, and keeps an SSH tool from phoning home on startup. Only the
// weights actually used by the UI (Inter) and terminal (JetBrains Mono).
import '@fontsource/inter/300.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './styles/globals.css'

// Apply initial dark class to avoid white flash before App loads settings
document.documentElement.classList.add('dark')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
)
