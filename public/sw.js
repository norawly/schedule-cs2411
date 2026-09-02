// Кэш обновляется при каждом деплое — меняй VERSION, если нужно принудительно сбросить
const VERSION = 'v3';
const CACHE = 'cs2411-' + VERSION;
const ASSETS = ['./', './index.html', './styles.css', './app.js', './schedule.js',
                './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
                './icons/icon-180.png'].map(p => new URL(p, self.registration.scope).pathname);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// network-first: свежее расписание, офлайн — из кэша
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match(ASSETS[1])))
  );
});
