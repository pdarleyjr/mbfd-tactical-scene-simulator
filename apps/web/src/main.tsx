import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import '@fontsource-variable/source-sans-3'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'

registerSW({ immediate: true })

if (import.meta.env.DEV) void import('./testing').then(({ installTestHook }) => installTestHook())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
