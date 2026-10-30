import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import '@fontsource-variable/source-sans-3'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { EntryScreen } from './ui/EntryScreen'
import { routeFromLocation } from './lib/route'

registerSW({ immediate: true })

if (import.meta.env.DEV) void import('./testing').then(({ installTestHook }) => installTestHook())

// The site address opens the start screen; only an explicit /s/<id> address opens a simulation.
const route = routeFromLocation(location.pathname, location.search)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {route.kind === 'entry' ? <EntryScreen /> : <App route={route} />}
  </StrictMode>,
)
