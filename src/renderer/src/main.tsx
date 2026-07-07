import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import PanelApp from './components/PanelApp'
import './styles.css'

// ?dsgnPanel=1 → this instance is the floating prop-panel island (a separate
// WebContentsView stacked above the native preview). It renders ONLY the panel.
const isPanel = new URLSearchParams(location.search).has('dsgnPanel')
if (isPanel) document.documentElement.classList.add('panel-host')

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isPanel ? <PanelApp /> : <App />}</React.StrictMode>
)
