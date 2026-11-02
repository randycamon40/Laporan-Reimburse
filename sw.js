// sw.js - Reimburse PWA - FAST UPDATE STRATEGY
const CACHE_NAME = 'reimburse-v3';
const CORE_ASSETS = [
  '/',
  '/index.html'
];

// INSTALL - langsung skip waiting biar update cepat
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch(() => {});
    })
  );
});

// ACTIVATE - hapus cache lama + claim client langsung
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// FETCH - NETWORK FIRST untuk HTML/navigasi (update cepat), STALE-WHILE-REVALIDATE untuk aset lain
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Jangan cache request chrome-extension, dll
  if (!req.url.startsWith('http')) return;

  // 1. Navigasi / HTML -> NETWORK FIRST
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      (async () => {
        try {
          const netRes = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, netRes.clone());
          return netRes;
        } catch (err) {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(req) || await cache.match('/') || await cache.match('/index.html');
          return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // 2. CDN / Font / Aset lain -> STALE-WHILE-REVALIDATE (cepat + tetap update)
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      
      const fetchPromise = fetch(req).then((netRes) => {
        // hanya cache yang valid
        if (netRes && netRes.status === 200) {
          cache.put(req, netRes.clone());
        }
        return netRes;
      }).catch(() => null);

      // jika ada cache, kembalikan cache dulu, sambil update di background
      // jika tidak ada, tunggu network
      return cached || (await fetchPromise) || new Response(null, { status: 404 });
    })()
  );
});

// Biar bisa dipanggil dari app: navigator.serviceWorker.controller.postMessage({type:'SKIP_WAITING'})
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
