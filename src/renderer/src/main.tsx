import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import PanelApp from './components/PanelApp'
import './styles.css'

// ?dsgnPanel=1 → this instance is the floating prop-panel island (a separate
// WebContentsView stacked above the native preview). It renders ONLY the panel.
const isPanel = new URLSearchParams(location.search).has('dsgnPanel')
if (isPanel) document.documentElement.classList.add('panel-host')

// macOS: the main window is created with under-page vibrancy (main/index.ts) —
// stamp <html> so styles.css clears the shell backgrounds and the material
// shows through. The prop-panel island keeps its own transparent rules.
if (!isPanel && navigator.platform.startsWith('Mac')) {
  document.documentElement.classList.add('vibrancy')
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isPanel ? <PanelApp /> : <App />}</React.StrictMode>
)
