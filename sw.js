/* Service worker du Lenancker Launcher.
   Stratégie : cache-first pour les assets statiques (le launcher doit
   rester utilisable hors-ligne), réseau direct pour l'API Mistral. */
const VERSION = 'lenancker-v1';
const CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/css/design.css',
  'assets/js/apps.js',
  'assets/js/common.js',
  'assets/js/launcher.js',
  'assets/vendor/marked.min.js',
  'assets/vendor/dompurify.min.js',
  'assets/fonts/inter-400.woff2',
  'assets/fonts/inter-500.woff2',
  'assets/fonts/inter-600.woff2',
  'assets/fonts/inter-700.woff2',
  'assets/fonts/inter-800.woff2',
  'assets/fonts/instrument-serif-400.woff2',
  'assets/fonts/instrument-serif-400-italic.woff2',
  'assets/icons/favicon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'apps/ocr/',
  'apps/ocr/index.html',
  'apps/ocr/ocr.css',
  'apps/ocr/ocr.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API Mistral et toute ressource cross-origin : réseau uniquement
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      const fetched = fetch(event.request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
