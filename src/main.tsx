import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { SarafiRouter } from './app/router.tsx'

const savedLanguage = window.localStorage.getItem('sarafi-language')
const requestedLanguage = new URLSearchParams(window.location.search).get('lang')
const initialLanguage = requestedLanguage === 'en' || requestedLanguage === 'fa-AF' || requestedLanguage === 'ps-AF'
  ? requestedLanguage
  : savedLanguage === 'fa-AF' || savedLanguage === 'ps-AF'
    ? savedLanguage
    : 'en'
document.documentElement.lang = initialLanguage
document.documentElement.dir = initialLanguage === 'en' ? 'ltr' : 'rtl'
document.getElementById('sarafi-manifest')?.setAttribute(
  'href',
  initialLanguage === 'en' ? '/manifest.webmanifest' : `/manifest.${initialLanguage}.webmanifest`,
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SarafiRouter />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let reloadingForUpdate = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return
    reloadingForUpdate = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      const announceUpdate = () => window.dispatchEvent(new Event('sarafi:update-available'))
      if (registration.waiting && navigator.serviceWorker.controller) announceUpdate()
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) announceUpdate()
        })
      })
    })
  })
}
