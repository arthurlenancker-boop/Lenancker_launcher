/* Helpers partagés : toasts, enregistrement du service worker, icônes inline. */
(function () {
  'use strict';

  /* JS présent : les apparitions « Rise » attendent d'entrer dans le champ
     (révélation au défilement SpotiKit) ; sans JS, le CSS anime seul. */
  if ('IntersectionObserver' in window) document.documentElement.classList.add('js-reveal');

  /* --- Icônes SVG inline (stroke courant) --- */
  const ICONS = {
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="8" x2="13" y2="8"/><line x1="7" y1="16" x2="15" y2="16"/></svg>',
    timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/></svg>',
    brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v.55A3.5 3.5 0 0 0 4.5 8.5c0 .74.23 1.43.62 2A3.5 3.5 0 0 0 4 13.5 3.5 3.5 0 0 0 7.5 17H8a2.5 2.5 0 0 0 4 2v-17z"/><path d="M14.5 2A2.5 2.5 0 0 1 17 4.5v.55a3.5 3.5 0 0 1 2.5 3.45c0 .74-.23 1.43-.62 2a3.5 3.5 0 0 1 1.12 3 3.5 3.5 0 0 1-3.5 3.5H16a2.5 2.5 0 0 1-4 2v-17z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2.2" opacity="0.55"/><rect x="13" y="3" width="8" height="8" rx="2.2" opacity="0.55"/><rect x="3" y="13" width="8" height="8" rx="2.2" opacity="0.55"/><rect x="13" y="13" width="8" height="8" rx="2.2"/></svg>',
    arbre: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="2.2"/><circle cx="17.5" cy="6.5" r="2.2"/><circle cx="17.5" cy="17.5" r="2.2"/><path d="M7.1 11.1 15.4 7.3"/><path d="M7.1 12.9 15.4 16.7"/></svg>',
    /* WordCraft : page de document avec lignes de texte. */
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M15 3v5h5"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>',
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
      zone.setAttribute('role', 'status');
      zone.setAttribute('aria-live', 'polite');
      document.body.appendChild(zone);
    }
    return zone;
  }
  /* action (optionnel) : { label, onClick } — affiche un bouton dans le toast
     (ex. « Recharger » quand une mise à jour est prête). */
  window.toast = function (message, kind = 'info', ms = 3800, action) {
    const zone = ensureZone();
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    const msg = document.createElement('span');
    msg.className = 'toast-msg';
    msg.textContent = message;
    el.appendChild(msg);
    if (action && action.label && typeof action.onClick === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        el.remove();
        try { action.onClick(); } catch { /* action propre au contexte */ }
      });
      el.appendChild(btn);
      ms = Math.max(ms, 12000); // reste lisible le temps de cliquer
    }
    zone.appendChild(el);
    setTimeout(() => {
      if (!el.isConnected) return;
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, ms);
  };

  /* --- Reflet du pointeur : la surface d'un élément interactif s'illumine
         précisément là où se trouve la souris. Le JS met à jour deux
         variables (--mx, --my) sur l'élément survolé ; les dégradés et
         leur apparition vivent dans design.css (::after et ::before).
         La position est lissée image par image (interpolation linéaire
         vers la cible) : la lumière glisse au lieu de sauter, ce qui
         fait toute la différence de rendu. Sous « réduire les
         animations », la position suit le pointeur sans lissage.
         Desktop uniquement : pointeur fin capable de survol. --- */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const SPOT = '.app-card:not(.soon), .btn, .dropzone, .dlg-opt, .deck-row, .vboite, .memo-card, .seg button, .segbtn, .chk, .rd, .dlg-remember, .toast-action';
    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
    let el = null, raf = null;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const EASE = 0.30;
    function place(x, y) {
      el.style.setProperty('--mx', `${x.toFixed(2)}px`);
      el.style.setProperty('--my', `${y.toFixed(2)}px`);
    }
    function tick() {
      cx += (tx - cx) * EASE;
      cy += (ty - cy) * EASE;
      place(cx, cy);
      if (Math.abs(tx - cx) < 0.4 && Math.abs(ty - cy) < 0.4) { raf = null; return; }
      raf = window.requestAnimationFrame(tick);
    }
    function stop() {
      if (raf) window.cancelAnimationFrame(raf);
      raf = null; el = null;
    }
    document.addEventListener('pointermove', (e) => {
      /* Page en mode « réduire les animations » : pas de reflet. */
      const t = e.target instanceof Element && !e.target.closest('.fx-reduce')
        ? e.target.closest(SPOT) : null;
      if (t !== el) {
        if (!t) { stop(); return; }
        if (raf) window.cancelAnimationFrame(raf);
        raf = null;
        el = t;
        /* À l'entrée, la lumière naît sous le pointeur. */
        const r = el.getBoundingClientRect();
        cx = tx = e.clientX - r.left;
        cy = ty = e.clientY - r.top;
        place(cx, cy);
      }
      if (!el) return;
      const r = el.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (REDUCED.matches) { cx = tx; cy = ty; place(cx, cy); return; }
      if (!raf) raf = window.requestAnimationFrame(tick);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', stop);
  }

  /* --- Révélation au défilement « Rise » (SpotiKit) : le bloc monte de
         40 px, flou qui se dissipe, et apparaît quand il entre à 12 % dans
         le champ — une seule fois. Les éléments visibles au chargement
         gardent leur cascade de délais (--d). --- */
  (function () {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      }
    }, { threshold: 0.12 });
    const scan = () => {
      document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el));
    };
    scan();
    /* Les apps créent des éléments au fil de l'eau (file OCR, paquets…) :
       on sonde les nouveautés, laissant le navigateur grouper les appels. */
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; scan(); });
    }).observe(document.body, { childList: true, subtree: true });
  })();

  /* --- Info-bulles « SpotiKit » : délégation globale, souris uniquement.
         Comportement observé sur spotikit.com :
         - apparition retardée (500 ms), immédiate si une bulle vient d'être
           montrée dans les 500 dernières ms (mémoire des infobulles
           natives) ;
         - masquage au clic, au défilement, à la touche Échap et au blur
           de la fenêtre ;
         - navigation clavier : un élément qui reçoit le focus clavier
           (:focus-visible) montre sa bulle immédiatement ;
         - entrée nette + ressort, sortie rapide, ancrage au pointeur
           corrigé pour rester dans l'écran.
         Tout attribut title devient data-tip (au chargement, puis au vol
         pour les éléments créés après) : le navigateur n'affiche plus sa
         bulle native, la nôtre la remplace avec le même texte. --- */
  (function () {
    function adopt(node) {
      if (!(node instanceof Element)) return null;
      const tipped = node.closest('[data-tip]');
      if (tipped) return tipped;
      const titled = node.closest('[title]');
      if (titled) {
        titled.dataset.tip = titled.getAttribute('title');
        titled.removeAttribute('title');
        return titled;
      }
      return null;
    }
    document.querySelectorAll('[title]').forEach((el) => {
      el.dataset.tip = el.getAttribute('title');
      el.removeAttribute('title');
    });

    let anchor = null, tip = null, shownFor = null, timer = null, shownAt = 0;
    const DELAY = 500, MEMORY = 500, GAP = 14;

    function hide() {
      clearTimeout(timer);
      timer = null;
      if (!anchor) return;
      const a = anchor, t = tip;
      anchor = null; tip = null; shownFor = null;
      t.classList.add('out');
      setTimeout(() => a.remove(), 140);
    }

    function place(el, x, y) {
      hide();
      const text = el.dataset.tip || '';
      if (!text) return;
      anchor = document.createElement('div');
      anchor.className = 'tooltip-anchor';
      tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.textContent = text;
      anchor.appendChild(tip);
      document.body.appendChild(anchor);
      const w = tip.offsetWidth, h = tip.offsetHeight, m = 10;
      let below = y < 56;
      if (!below && y - GAP - h < 0) below = true;
      const cx = Math.min(Math.max(x, m + w / 2), window.innerWidth - m - w / 2);
      anchor.style.left = `${cx}px`;
      anchor.style.top = below
        ? `${Math.min(y, window.innerHeight - h - GAP)}px`
        : `${y}px`;
      anchor.style.transform = below
        ? `translate(-50%, ${GAP}px)`
        : `translate(-50%, calc(-100% - ${GAP}px))`;
      tip.style.transformOrigin = below ? '50% 0%' : '50% 100%';
      tip.style.setProperty('--tip-y', below ? '4px' : '-4px');
      shownAt = Date.now();
    }

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      document.addEventListener('pointerover', (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        const t = adopt(e.target);
        if (t !== shownFor) {
          clearTimeout(timer);
          if (t) {
            const d = Date.now() - shownAt < MEMORY ? 0 : DELAY;
            timer = setTimeout(() => place(t, e.clientX, e.clientY), d);
          }
          shownFor = t;
        }
      });
      document.addEventListener('pointerout', (e) => {
        const t = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
        const to = e.relatedTarget;
        if (t && t === shownFor && !(to instanceof Node && t.contains(to))) {
          clearTimeout(timer);
          hide();
        }
      });
      document.addEventListener('pointerdown', hide, true);
      window.addEventListener('scroll', hide, { passive: true, capture: true });
      window.addEventListener('blur', hide);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    }
    /* Clavier : la bulle apparaît immédiatement au focus visible. */
    document.addEventListener('focusin', (e) => {
      const t = adopt(e.target);
      if (t && t.matches(':focus-visible')) {
        const r = t.getBoundingClientRect();
        place(t, r.left + r.width / 2, r.bottom);
      }
    });
    document.addEventListener('focusout', hide);
  })();

  /* --- Pilule coulissante des segmentés (SpotiKit : pastille unique qui
         glisse derrière l'onglet actif, en ressort). Couvre les deux
         familles du launcher : .seg > button (.active — Focus, OCR) et
         .segbtn (.on — Probabilités). Les changements de classes sont
         suivis par MutationObserver : aucun JS d'app à modifier. --- */
  (function () {
    const pilled = new Set();
    /* DIAG v5 : jalons + chien de garde (a retirer) */
    let __placeCalls = 0, __rafCalls = 0, __wd = 0;
    setInterval(() => { console.log('SEGWD:' + (__wd++)); }, 100);

    function place(seg) {
      if (__placeCalls < 30) console.log('SEG:place:' + (seg.id || seg.className) + ':' + (__placeCalls));
      __placeCalls++;
      const pill = seg.querySelector(':scope > .seg-pill');
      if (!pill) return;
      const active = seg.querySelector('button.active, .segbtn.on');
      if (!active || !seg.offsetParent) { pill.classList.remove('placed'); return; }
      const left = active.offsetLeft - seg.clientLeft;
      const width = active.offsetWidth;
      if (pill.classList.contains('placed')) {
        pill.style.left = `${left}px`;
        pill.style.width = `${width}px`;
        return;
      }
      /* Première pose : sans glissement — la transition ne vient qu'après. */
      pill.style.transition = 'none';
      pill.style.left = `${left}px`;
      pill.style.width = `${width}px`;
      requestAnimationFrame(() => {
        if (__rafCalls < 30) console.log('SEG:raf:' + (__rafCalls));
        __rafCalls++;
        pill.style.transition = '';
        pill.classList.add('placed');
      });
    }

    function pillify(seg) {
      if (seg.dataset.pilled === '1') return;
      if (!seg.querySelector('button, .segbtn')) return;
      seg.dataset.pilled = '1';
      const pill = document.createElement('span');
      pill.className = 'seg-pill';
      pill.setAttribute('aria-hidden', 'true');
      seg.appendChild(pill);
      seg.classList.add('pilled');
      pilled.add(seg);
      place(seg);
      new MutationObserver(() => place(seg)).observe(seg, {
        attributes: true, attributeFilter: ['class', 'hidden'],
        childList: true, subtree: true,
      });
      console.log('SEG:pillified:' + (seg.id || 'anon'));
    }

    function scan() { document.querySelectorAll('.seg').forEach(pillify); }
    scan();
    console.log('SEG:scan-done');
    /* Segmentés créés après coup (dialogues OCR…) : équipés aussi. */
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; scan(); });
    }).observe(document.body, { childList: true, subtree: true });
    /* Largeurs : les polices chargent, la fenêtre bouge. */
    const replaceAll = () => pilled.forEach(place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { console.log('SEG:fonts-ready'); replaceAll(); });
    let rz = null;
    window.addEventListener('resize', () => {
      clearTimeout(rz);
      rz = setTimeout(replaceAll, 120);
    });
  })();

  /* --- Service worker (PWA) : chemin résolu depuis le script lui-même,
         pour fonctionner aussi depuis apps/<slug>/ --- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const script = document.querySelector('script[src$="common.js"]');
      const swUrl = script ? new URL('../../sw.js', script.src).href : 'sw.js';
      navigator.serviceWorker.register(swUrl)
        .then((reg) => {
          /* Mise à jour prête : une nouvelle version a fini de s’installer
             pendant que l’ancienne contrôle la page (le nouveau SW prend le
             contrôle via skipWaiting, mais les fichiers déjà chargés viennent
             encore de l’ancien cache). On propose le rechargement — jamais
             forcé : une session Focus ou une file OCR ne doit pas sauter. */
          reg.addEventListener('updatefound', () => {
            const w = reg.installing;
            if (!w) return;
            w.addEventListener('statechange', () => {
              if (w.state === 'installed' && navigator.serviceWorker.controller) {
                window.toast('Une mise à jour du launcher est prête — recharge quand tu veux pour en profiter.', 'info', 20000, {
                  label: 'Recharger',
                  onClick: () => window.location.reload(),
                });
              }
            });
          });
        })
        .catch(() => { /* mode dev/file:// */ });
    });
  }
})();
