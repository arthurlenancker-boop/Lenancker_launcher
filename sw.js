/* Service worker du Lenancker Launcher.
   Stratégie : cache-first pour les assets statiques (le launcher doit
   rester utilisable hors-ligne), réseau direct pour l'API Mistral. */
const VERSION = 'lenancker-v19';
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
  'assets/vendor/docx.min.js',
  'assets/vendor/pdf-lib.min.js',
  'assets/vendor/pdfjs/pdf.min.js',
  'assets/vendor/pdfjs/pdf.worker.min.js',
  'assets/vendor/katex/katex.min.js',
  'assets/vendor/katex/katex.min.css',
  'assets/vendor/katex/katex-auto-render.min.js',
  'assets/vendor/katex/fonts/KaTeX_AMS-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2',
  'assets/vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2',
  'assets/vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Main-Bold.woff2',
  'assets/vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2',
  'assets/vendor/katex/fonts/KaTeX_Main-Italic.woff2',
  'assets/vendor/katex/fonts/KaTeX_Main-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  'assets/vendor/katex/fonts/KaTeX_Math-Italic.woff2',
  'assets/vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2',
  'assets/vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2',
  'assets/vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Script-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Size2-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Size3-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Size4-Regular.woff2',
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
  'apps/ocr/md2docx.js',
  'apps/ocr/pdfocr.js',
  'apps/focus/index.html',
  'apps/focus/focus.css',
  'apps/focus/core.js',
  'apps/focus/focus.js',
  'apps/revision/',
  'apps/revision/index.html',
  'apps/revision/revision.css',
  'apps/revision/core.js',
  'apps/revision/revision.js',
  'docs/recherche-focus-tda-tsa.md',
  'docs/recherche-revision-memoisation.md',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      /* Pré-cache tolérant : chaque asset est mis en cache individuellement.
         Un fichier injoignable à l’installation (réseau en berne) ne casse
         plus tout le hors-ligne : le reste est servi depuis le cache, et le
         manquant sera mis en cache au premier accès réussi, par le fetch
         handler ci-dessous. */
      .then((cache) => Promise.allSettled(CORE.map((url) => cache.add(url))))
      .then((results) => {
        const missed = results.filter((r) => r.status === 'rejected').length;
        if (missed) console.warn('[sw] ' + missed + " fichier(s) non mis en cache à l’installation — récupérés au premier accès.");
      })
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
