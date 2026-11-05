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

  /* --- Stockage en cascade : localStorage → sessionStorage → mémoire ---
     Le localStorage peut être indisponible dans certains contextes :
     navigation privée, données de site bloquées, leveldb verrouillé par un
     antivirus ou une seconde instance au moment du lancement, quota…
     On sonde au démarrage plutôt qu'attendre le premier clic qui échoue,
     on garde l'app pleinement utilisable au niveau trouvé, et on re-sonde
     aux regains d'activité : une panne leveldb est souvent transitoire. */
  const lenanckerMemory = new Map();
  let lenanckerLastErr = null;
  function lenanckerProbe(store) {
    try {
      const k = '__lenancker.probe__';
      store.setItem(k, '1');
      store.removeItem(k);
      return true;
    } catch (e) {
      lenanckerLastErr = e;
      return false;
    }
  }
  function promoteMirrorTo(store) {
    try {
      for (const [k, v] of lenanckerMemory) {
        try { store.setItem(k, v); } catch { /* promotion au mieux */ }
      }
    } catch { /* promotion au mieux */ }
  }
  window.lenanckerStorage = {
    mode: 'local', // 'local' | 'session' | 'memory'
    cause: null,

    init() {
      lenanckerLastErr = null;
      if (lenanckerProbe(window.localStorage)) { this.mode = 'local'; this.cause = null; }
      else if (lenanckerProbe(window.sessionStorage)) { this.mode = 'session'; this.cause = lenanckerLastErr; }
      else { this.mode = 'memory'; this.cause = lenanckerLastErr; }
      return this.mode;
    },

    backing() {
      if (this.mode === 'local') return window.localStorage;
      if (this.mode === 'session') return window.sessionStorage;
      return null;
    },

    get(key) {
      const b = this.backing();
      if (b) {
        try {
          // toute lecture réussie alimente le miroir : il devient, à tout
          // instant, l'état le plus complet connu de la page
          const v = b.getItem(key);
          if (v !== null) { lenanckerMemory.set(key, v); return v; }
        } catch { /* panneau illisible : miroir */ }
      }
      return lenanckerMemory.has(key) ? lenanckerMemory.get(key) : null;
    },

    set(key, value) {
      lenanckerMemory.set(key, String(value)); // miroir : survit aux changements de niveau
      const b = this.backing();
      if (!b) return false;
      try { b.setItem(key, value); return true; }
      catch { return false; }
    },

    remove(key) {
      lenanckerMemory.delete(key);
      const b = this.backing();
      if (!b) return;
      try { b.removeItem(key); } catch { /* rien à faire */ }
    },

    /* Re-sonde. Le miroir a suivi toutes les lectures et écritures de la
       page : le promouvoir vers le niveau retrouvé réconcile sans perte
       dans le scénario courant (leveldb verrouillé puis relâché). */
    recheck() {
      // le niveau courant vient-il de baisser ?
      if (this.mode === 'local' && !lenanckerProbe(window.localStorage)) {
        const why = lenanckerLastErr;
        if (lenanckerProbe(window.sessionStorage)) {
          this.mode = 'session'; this.cause = why;
          promoteMirrorTo(window.sessionStorage);
          return 'degraded';
        }
        this.mode = 'memory'; this.cause = why;
        return 'degraded';
      }
      // un niveau supérieur redevient-il utilisable ?
      if (this.mode !== 'local' && lenanckerProbe(window.localStorage)) {
        this.mode = 'local'; this.cause = null;
        promoteMirrorTo(window.localStorage);
        return 'healed';
      }
      if (this.mode === 'memory' && lenanckerProbe(window.sessionStorage)) {
        this.mode = 'session'; this.cause = lenanckerLastErr;
        promoteMirrorTo(window.sessionStorage);
        return 'session';
      }
      return this.mode;
    },
  };
  window.lenanckerStorage.init();

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
