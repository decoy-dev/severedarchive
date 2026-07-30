import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { displacementMapUrl } from './generated/displacementMap'

document.getElementById('liquid-refraction-map')?.setAttribute('href', displacementMapUrl)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
