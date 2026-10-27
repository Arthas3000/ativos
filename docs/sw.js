// Cache do app. Tudo da mesma origem (HTML, JS, JSON, manifest) tenta a rede primeiro e só usa a cópia salva se estiver offline,
// para que correções cheguem a quem já instalou e o HTML novo nunca rode com JS velho. Cache primeiro só para o d3 da CDN e os ícones.
const CACHE = 'painel-b3-v3';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'invest.js', 'invest-store.js', 'invest-sim.js', 'invest-corretora.js', 'invest-assistente.js', 'invest-tour.js',
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js'];

// 'reload' ignora o cache HTTP do navegador na instalação, senão a versão nova guardaria arquivos velhos
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE)
  .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
  .then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

const ehIcone = (url) => /\/icon-(192|512)\.png$/.test(url.pathname);

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const mesmaOrigem = url.origin === self.location.origin;
  // Outra origem fora do SHELL (ex.: cotacoes da brapi) passa direto: nunca fica presa no cache
  const noShell = SHELL.some((s) => new URL(s, self.registration.scope).href === url.href);
  if (!mesmaOrigem && !noShell) return;

  const guardar = (r) => {
    if (r && r.ok) { const copy = r.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy))); }
    return r;
  };

  if (!mesmaOrigem || ehIcone(url)) {
    // d3 da CDN e ícones: cache primeiro
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then(guardar)));
    return;
  }

  // Mesma origem: rede primeiro (revalidando o cache HTTP), cópia salva só se a rede falhar
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(guardar).catch(() =>
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit || (e.request.mode === 'navigate' ? caches.match('./') : undefined) || Response.error())));
});
