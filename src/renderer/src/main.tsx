import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// Apply initial dark class to avoid white flash before App loads settings
document.documentElement.classList.add('dark')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
)
