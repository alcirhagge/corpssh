import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// Apply initial theme before render to avoid flash
const savedTheme = (() => {
  try {
    const data = localStorage.getItem('corpssh-theme')
    return data || 'dark'
  } catch {
    return 'dark'
  }
})()
document.documentElement.classList.add(savedTheme)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
