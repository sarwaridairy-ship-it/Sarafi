const CACHE_NAME = 'sarafi-shell-v2'
const SHELL = ['/']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))))
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const requestUrl = new URL(event.request.url)
  const isNavigation = event.request.mode === 'navigate'
  const isFinancialOrAuth = requestUrl.pathname.startsWith('/rest/') || requestUrl.pathname.startsWith('/auth/') || requestUrl.pathname.startsWith('/functions/') || requestUrl.pathname.includes('supabase')
  if (isNavigation || isFinancialOrAuth) {
    event.respondWith(fetch(event.request))
    return
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
})
