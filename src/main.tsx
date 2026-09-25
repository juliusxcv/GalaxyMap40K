import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StyleEditorLauncher } from './ui/styleEditor/StyleEditorLauncher'
import { installStyleSheet } from './theme/styleSheetStore'

// After every CSS import above, so the UI style sheet's rules come last.
installStyleSheet()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Outside .app: the editor is tool chrome, not map UI. */}
    <StyleEditorLauncher />
  </StrictMode>,
)
