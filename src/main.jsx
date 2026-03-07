import React from 'react'
import ReactDOM from 'react-dom/client'
import './main.css'
import App from './App.jsx'
import { applyThemeClass } from './hooks/useTheme'

const APP_SETTINGS_KEY = 'app-settings'
try {
  let mode = 'system'
  if (window.utools && window.utools.db) {
    const doc = window.utools.db.get(APP_SETTINGS_KEY)
    mode = doc?.data?.theme?.mode || 'system'
  } else {
    const raw = localStorage.getItem(APP_SETTINGS_KEY)
    if (raw) mode = JSON.parse(raw)?.theme?.mode || 'system'
  }
  applyThemeClass(mode)
} catch {
  applyThemeClass('system')
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
