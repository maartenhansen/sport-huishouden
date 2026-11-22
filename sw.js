// Service worker: zorgt dat de app ook zonder internet opent.
// Strategie: eerst het netwerk (altijd de nieuwste versie), anders de opgeslagen kopie.
const CACHE = 'sport-huishouden-v4';
const FILES = [
  './', './index.html', './styles.css', './config.js', './sync.js', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Pushmelding ontvangen (het dagoverzicht van de server)
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Sport & Huishouden', {
    body: data.body || '',
    tag: data.tag || 'dagoverzicht',   // een nieuwe melding vervangt de vorige
    renotify: true,
    icon: 'icons/icon-192.png',
    data: { url: data.url || './' },
  }));
});

// Tikken op de melding: app openen (of naar voren halen als ze al open is)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) if ('focus' in client) return client.focus();
      return self.clients.openWindow(e.notification.data && e.notification.data.url ? e.notification.data.url : './');
    })
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
