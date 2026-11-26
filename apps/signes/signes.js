/* Tableau de signes — interface de l'app.
   L'utilisateur écrit f(x), le moteur (core.js) analyse l'expression et
   calcule le tableau (une ligne par facteur, signes exacts, 0 coupé posé
   sur la barre, double barre pour les valeurs interdites) ; ici on
   dessine le SVG, mémorise la dernière saisie et gère les exports
   PNG/SVG/presse-papiers (même schéma que l'app Probabilités).
   Stockage en cascade + toasts partagés du launcher. */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const KEY = 'signes-expr-v1';

  const input = $('fx');
  const errEl = $('err');
  const svg = $('svg');

  if (window.iconSvg) $('brand-logo').innerHTML = window.iconSvg('signes');

  /* Stockage : cascade du launcher (localStorage → sessionStorage → mémoire). */
  function storageGet(k) {
    if (window.lenanckerStorage) return window.lenanckerStorage.get(k);
    try { return window.localStorage.getItem(k); } catch (err) { return null; }
  }
  function storageSet(k, v) {
    if (window.lenanckerStorage) { window.lenanckerStorage.set(k, v); return; }
    try { window.localStorage.setItem(k, v); } catch (err) { /* hors stockage : app utilisable en mémoire */ }
  }
  function notify(msg) {
    if (typeof window.toast === 'function') window.toast(msg);
  }

  /* ---------------- analyse et dessin ---------------- */

  let model = null;

  function trace() {
    const src = input.value;
    const res = SignesCore.analyze(src);
    if (!res.ok) {
      model = null;
      errEl.textContent = res.error;
      errEl.hidden = false;
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.innerHTML = '';
      return;
    }
    errEl.hidden = true;
    model = res;
    const L = SignesCore.computeLayout(res);
    svg.setAttribute('width', L.W);
    svg.setAttribute('height', L.H);
    svg.setAttribute('viewBox', '0 0 ' + L.W + ' ' + L.H);
    svg.innerHTML = SignesCore.svgInner(L);
    try { storageSet(KEY, src); } catch (err) { /* ignore */ }
  }

  /* ---------------- saisie ---------------- */

  $('btnGo').addEventListener('click', trace);
  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); trace(); }
  });
  $('exRow').addEventListener('click', function (ev) {
    const chip = ev.target && ev.target.closest ? ev.target.closest('.chip') : null;
    if (!chip) return;
    input.value = chip.textContent;
    trace();
    input.focus();
  });

  /* ---------------- exports (même schéma que Probabilités) ---------------- */

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function rasterize(scale) {
    return new Promise(function (resolve, reject) {
      if (!model) { reject(new Error('vide')); return; }
      const str = SignesCore.exportSvg(model);
      const svgBlob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = function () {
        try {
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * scale));
          c.height = Math.max(1, Math.round(img.height * scale));
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          c.toBlob(function (b) { b ? resolve(b) : reject(new Error('toBlob')); }, 'image/png');
        } catch (err) { reject(err); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('load')); };
      img.src = url;
    });
  }

  $('btnPNG').addEventListener('click', function () {
    rasterize(300 / 96)
      .then(b => { downloadBlob(b, 'tableau-de-signes.png'); notify('Image PNG exportée en haute définition (≈ 300 dpi).'); })
      .catch(() => notify('Trace d\u2019abord une fonction : rien à exporter pour le moment.'));
  });

  $('btnSVG').addEventListener('click', function () {
    if (!model) { notify('Trace d\u2019abord une fonction : rien à exporter pour le moment.'); return; }
    try {
      const str = SignesCore.exportSvg(model);
      downloadBlob(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }), 'tableau-de-signes.svg');
      notify('Fichier SVG exporté.');
    } catch (err) { notify('L\u2019export SVG a échoué.'); }
  });

  $('btnCopy').addEventListener('click', function () {
    const fail = () => notify('La copie d\u2019image est indisponible ici : utilisez \u00ab Exporter PNG \u00bb.');
    if (!model) { notify('Trace d\u2019abord une fonction : rien à copier pour le moment.'); return; }
    if (!navigator.clipboard || !window.ClipboardItem) { fail(); return; }
    rasterize(2)
      .then(b => navigator.clipboard.write([new window.ClipboardItem({ 'image/png': b })]))
      .then(() => notify('Image copiée dans le presse-papiers.'))
      .catch(fail);
  });

  /* ---------------- démarrage ---------------- */

  let saved = null;
  try { saved = storageGet(KEY); } catch (err) { saved = null; }
  if (saved) input.value = saved;
  if (input.value) trace();
})();
