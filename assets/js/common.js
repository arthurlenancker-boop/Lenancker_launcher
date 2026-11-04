/* Helpers partagés : toasts, enregistrement du service worker, icônes inline. */
(function () {
  'use strict';

  /* --- Icônes SVG inline (stroke courant) --- */
  const ICONS = {
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="8" x2="13" y2="8"/><line x1="7" y1="16" x2="15" y2="16"/></svg>',
    timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/></svg>',
    brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v.55A3.5 3.5 0 0 0 4.5 8.5c0 .74.23 1.43.62 2A3.5 3.5 0 0 0 4 13.5 3.5 3.5 0 0 0 7.5 17H8a2.5 2.5 0 0 0 4 2v-17z"/><path d="M14.5 2A2.5 2.5 0 0 1 17 4.5v.55a3.5 3.5 0 0 1 2.5 3.45c0 .74-.23 1.43-.62 2a3.5 3.5 0 0 1 1.12 3 3.5 3.5 0 0 1-3.5 3.5H16a2.5 2.5 0 0 1-4 2v-17z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2.2" opacity="0.55"/><rect x="13" y="3" width="8" height="8" rx="2.2" opacity="0.55"/><rect x="3" y="13" width="8" height="8" rx="2.2" opacity="0.55"/><rect x="13" y="13" width="8" height="8" rx="2.2"/></svg>',
  };
  window.iconSvg = (name) => ICONS[name] || ICONS.grid;

  /* --- Toasts --- */
  function ensureZone() {
    let zone = document.querySelector('.toast-zone');
    if (!zone) {
      zone = document.createElement('div');
      zone.className = 'toast-zone';
      document.body.appendChild(zone);
    }
    return zone;
  }
  window.toast = function (message, kind = 'info', ms = 3800) {
    const zone = ensureZone();
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    zone.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, ms);
  };

  /* --- Service worker (PWA) : chemin résolu depuis le script lui-même,
         pour fonctionner aussi depuis apps/<slug>/ --- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const script = document.querySelector('script[src$="common.js"]');
      const swUrl = script ? new URL('../../sw.js', script.src).href : 'sw.js';
      navigator.serviceWorker.register(swUrl).catch(() => { /* mode dev/file:// */ });
    });
  }
})();
