import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/chat.css'
import './styles/ui.css'
import './styles/pages.css'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ui/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
