import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './themes/tokens.css'
import './themes/fonts.css'
import './themes/chat.css'
import './themes/ui.css'
import './themes/shell.css'
import './themes/state.css'
import './themes/rules.css'
import './themes/settings.css'
import './themes/assistant.css'
import './themes/pages.css'
import.meta.glob('./themes/skins/*/*.css', { eager: true })
import.meta.glob('./themes/motion/*.css', { eager: true })
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ui/ErrorBoundary.jsx'
import './core/utils/logger.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
