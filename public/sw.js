// Service worker do Prumo: guarda o app para abrir sem internet (PWA).
// Navegação: rede primeiro (pega atualizações), cai no cache se estiver offline.
// Arquivos com hash (assets/*): cache primeiro. APIs de outros domínios: sempre rede.
const VERSAO = 'prumo-v1';
const BASE = ['./', './index.html', './manifest.webmanifest', './icons/prumo.svg', './icons/icon-192.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(BASE)).catch(() => undefined));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(VERSAO).then((c) => c.put('./index.html', copia));
          return r;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (achou) =>
        achou ||
        fetch(req).then((r) => {
          if (r.ok) {
            const copia = r.clone();
            caches.open(VERSAO).then((c) => c.put(req, copia));
          }
          return r;
        }),
    ),
  );
});
