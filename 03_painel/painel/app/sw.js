// Cache do app: página e bibliotecas ficam salvas; dados tentam a rede primeiro (offline usa a última cópia)
const CACHE = 'painel-b3-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'invest.js', 'invest-store.js', 'invest-sim.js', 'invest-corretora.js', 'invest-assistente.js', 'invest-tour.js',
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Outra origem fora do SHELL (ex.: cotacoes da brapi) passa direto: nunca fica presa no cache
  const noShell = SHELL.some((s) => new URL(s, self.registration.scope).href === url.href);
  if (url.origin !== self.location.origin && !noShell) return;
  const fresh = url.pathname.includes('/dados/') || e.request.mode === 'navigate';
  e.respondWith(fresh
    ? fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
        .catch(() => caches.match(e.request))
    : caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return r;
      })));
});
