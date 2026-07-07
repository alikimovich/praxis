import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import PanelApp from './components/PanelApp'
import './styles.css'

// ?dsgnPanel=1 → this instance is the floating prop-panel island (a separate
// WebContentsView stacked above the native preview). It renders ONLY the panel.
const isPanel = new URLSearchParams(location.search).has('dsgnPanel')
if (isPanel) document.documentElement.classList.add('panel-host')
// macOS: the window is a vibrancy surface; CSS keeps only the rail transparent.
if (!isPanel && navigator.platform.startsWith('Mac')) {
  document.documentElement.classList.add('mac-vibrancy')
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isPanel ? <PanelApp /> : <App />}</React.StrictMode>
)
