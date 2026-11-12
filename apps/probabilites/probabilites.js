/* Arbre de probabilité — interface de l'app.
   Assistant pas à pas : l'utilisateur décrit l'arbre (expérience, événements
   et contraires, feuilles ou développements) et saisit LUI-MÊME toutes les
   valeurs — probabilités, résultats des chemins, total. L'outil ne fait
   AUCUN calcul : il dessine (mise en page « tidy tree », feuille alignée
   à droite, barre ou accent pour le contraire) et exporte en PNG/SVG.
   Stockage en cascade + toasts partagés du launcher. */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = ArbreCore.escHtml;
  const KEY = 'arbre-proba-v1';

  const panel = $('panel');
  const inner = $('canvasInner');
  const svg = $('svg');

  if (window.iconSvg) $('brand-logo').innerHTML = window.iconSvg('arbre');

  /* Stockage : cascade du launcher (localStorage → sessionStorage → mémoire),
     avec repli localStorage direct si common.js est absent. */
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

  /* ---------------- état, sauvegarde ---------------- */

  function sanitize(s) {
    const d = ArbreCore.defaultState();
    if (!s || typeof s !== 'object') return d;
    const o = {};
    o.v = 1;
    o.experiment = (typeof s.experiment === 'string') ? s.experiment.slice(0, 60) : '';
    o.orientation = s.orientation === 'v' ? 'v' : 'h';
    o.notation = s.notation === 'hat' ? 'hat' : 'bar';
    o.showTotal = !!s.showTotal;
    o.total = (typeof s.total === 'string') ? s.total.slice(0, 24) : '';
    o.levels = [];
    if (Array.isArray(s.levels)) {
      for (const Lv of s.levels.slice(0, ArbreCore.MAX_LEVELS)) {
        if (!Lv || typeof Lv !== 'object') continue;
        o.levels.push({
          event: (typeof Lv.event === 'string') ? Lv.event.slice(0, 20) : '',
          complement: (typeof Lv.complement === 'string') ? Lv.complement.slice(0, 20) : ''
        });
      }
    }
    if (!o.levels.length) o.levels = d.levels;
    const idOk = k => /^R(-\d+)+$/.test(k);
    o.branches = {};
    if (s.branches && typeof s.branches === 'object') {
      for (const k of Object.keys(s.branches)) {
        if (!idOk(k)) continue;
        const n = parseInt(s.branches[k], 10);
        if (n >= 2 && n <= ArbreCore.MAX_BRANCHES) o.branches[k] = n;
      }
    }
    const cleanMap = (m, len) => {
      const r = {};
      if (m && typeof m === 'object') {
        for (const k of Object.keys(m)) {
          if (idOk(k) && typeof m[k] === 'string') r[k] = m[k].slice(0, len);
        }
      }
      return r;
    };
    o.probs = cleanMap(s.probs, 24);
    o.results = cleanMap(s.results, 24);
    o.labels = cleanMap(s.labels, 20);
    o.choices = {};
    if (s.choices && typeof s.choices === 'object') {
      for (const k of Object.keys(s.choices)) {
        if (idOk(k) && s.choices[k] === 'leaf') o.choices[k] = 'leaf';
      }
    }
    return o;
  }

  function loadState() {
    try {
      const raw = storageGet(KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch (err) { /* stockage indisponible : on repart à zéro */ }
    return ArbreCore.defaultState();
  }

  let state = loadState();

  function save() {
    try { storageSet(KEY, JSON.stringify(state)); } catch (err) { /* ignore */ }
  }
  let saveT = null;
  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 350); }
  window.addEventListener('beforeunload', save);

  /* ---------------- étiquettes mathématiques (panneau) ---------------- */

  function labHtml(nid) {
    const i = ArbreCore.nodeInfo(state, nid);
    const t = esc(i.base);
    if (i.auto) {
      return state.notation === 'bar'
        ? '<span class="ov">' + t + '</span>'
        : '<span>' + t + '&#770;</span>';
    }
    return '<span>' + t + '</span>';
  }
  function plHtml(cid) {
    const par = ArbreCore.parentOf(cid);
    if (par === 'R') return 'Vers ' + labHtml(cid);
    return labHtml(par) + ' &#8594; ' + labHtml(cid);
  }

  // Lignes de saisie des branches d'un nœud : probabilité de chacune,
  // et nom libre pour les branches supplémentaires (index ≥ 2).
  function branchRows(nid, ph) {
    const count = ArbreCore.branchCount(state, nid);
    let h = '';
    for (let s = 0; s < count; s++) {
      const cid = nid + '-' + s;
      const target = labHtml(cid);
      const lbl = (nid === 'R') ? ('Vers ' + target) : (labHtml(nid) + ' \u2192 ' + target);
      h += '<label class="prow"><span class="pl" data-child="' + cid + '">' + lbl + '</span>' +
        '<input class="input pinput" id="prob-' + cid + '" type="text" maxlength="24" placeholder="' + ph + '" value="' + esc(state.probs[cid] || '') + '"></label>';
      if (s >= 2) {
        h += '<label class="prow"><span class="pl">Nom de la branche ' + (s + 1) + '</span>' +
          '<input class="input pinput" id="lab-' + cid + '" type="text" maxlength="20" placeholder="ex. C" value="' + esc(state.labels[cid] || '') + '"></label>';
      }
    }
    return h;
  }

  function branchSelectHtml(nid) {
    const cur = ArbreCore.branchCount(state, nid);
    let opts = '';
    for (let n = 2; n <= ArbreCore.MAX_BRANCHES; n++) {
      opts += '<option value="' + n + '"' + (n === cur ? ' selected' : '') + '>' + n + ' branches</option>';
    }
    return '<label class="fld"><span class="lbl">Nombre de branches depuis ' + labHtml(nid) + '</span>' +
      '<select class="input" id="br-' + nid + '">' + opts + '</select></label>';
  }
  function plainLabel(nid) {
    const i = ArbreCore.nodeInfo(state, nid);
    return i.base + (i.auto ? (state.notation === 'bar' ? ' barre' : ' chapeau') : '');
  }
  function refreshMathLabels() {
    panel.querySelectorAll('.pl').forEach(el => { el.innerHTML = plHtml(el.dataset.child); });
    panel.querySelectorAll('.nlab').forEach(el => { el.innerHTML = labHtml(el.dataset.node); });
  }

  /* ---------------- rendu du panneau (assistant) ---------------- */

  function howtoCard() {
    return '<section class="card howto">' +
      '<h2 class="cardtitle">Mode d\u2019emploi</h2>' +
      '<ol>' +
        '<li>Nommez l\u2019exp\u00e9rience, puis le premier \u00e9v\u00e9nement (ex. G) et son contraire ; saisissez les probabilit\u00e9s \u00e0 la main.</li>' +
        '<li>Cliquez sur \u00ab Ajouter un niveau \u00bb : pour chaque branche, choisissez \u00ab Feuille \u00bb ou \u00ab D\u00e9velopper \u00bb (nouvel \u00e9v\u00e9nement et son contraire).</li>' +
        '<li>R\u00e9p\u00e9tez jusqu\u2019\u00e0 4 niveaux. Toute \u00e9tape reste modifiable \u00e0 tout moment.</li>' +
        '<li>\u00c9crivez le r\u00e9sultat de chaque chemin dans les cases du sch\u00e9ma \u2014 l\u2019outil ne calcule rien.</li>' +
      '</ol>' +
      '<p class="note">Format libre pour les valeurs : \u00ab 0,3 \u00bb, \u00ab 3/10 \u00bb, \u00ab 30 % \u00bb\u2026 rien n\u2019est v\u00e9rifi\u00e9 ni transform\u00e9.</p>' +
    '</section>';
  }

  function card1() {
    const l0 = state.levels[0] || { event: '', complement: '' };
    return '<section class="card">' +
      '<h2 class="cardtitle"><span class="chip">1</span> Exp\u00e9rience et premier \u00e9v\u00e9nement</h2>' +
      '<label class="fld"><span class="lbl">Nom de l\u2019exp\u00e9rience (titre du sch\u00e9ma)</span>' +
        '<input class="input" id="f-exp" type="text" maxlength="60" placeholder="ex. Tirage d\u2019une boule" value="' + esc(state.experiment) + '"></label>' +
      '<div class="two">' +
        '<label class="fld"><span class="lbl">Premier \u00e9v\u00e9nement</span>' +
          '<input class="input" id="lev0-event" type="text" maxlength="20" placeholder="ex. G" value="' + esc(l0.event) + '"></label>' +
        '<label class="fld"><span class="lbl">Son contraire</span>' +
          '<input class="input" id="lev0-complement" type="text" maxlength="20" placeholder="vide = barre auto" value="' + esc(l0.complement || '') + '"></label>' +
      '</div>' +
      '<p class="note">Contraire laiss\u00e9 vide : not\u00e9 automatiquement avec la barre (ou l\u2019accent, selon les options du sch\u00e9ma).</p>' +
      '<div class="sub">Branches issues de la racine</div>' +
      branchSelectHtml('R') +
      '<div class="sub">Probabilit\u00e9s des branches</div>' +
      branchRows('R', 'ex. 0,3') +
    '</section>';
  }

  function levelCard(d, L) {
    const lvl = state.levels[d] || { event: '', complement: '' };
    const nodes = L.nodesByDepth[d] || [];
    let rows = '';
    for (const n of nodes) {
      const isLeaf = state.choices[n.id] === 'leaf';
      rows += '<div class="chooser">' +
        '<span class="nlab" data-node="' + n.id + '">' + labHtml(n.id) + '</span>' +
        '<label class="rd"><input type="radio" name="ch-' + n.id + '" value="leaf"' + (isLeaf ? ' checked' : '') + '> Feuille</label>' +
        '<label class="rd"><input type="radio" name="ch-' + n.id + '" value="develop"' + (!isLeaf ? ' checked' : '') + '> D\u00e9velopper</label>' +
      '</div>';
    }
    if (!nodes.length) {
      rows = '<p class="radio-note">Aucune branche d\u00e9velopp\u00e9e au niveau ' + d + ' : ce niveau n\u2019ajoute rien pour l\u2019instant.</p>';
    }

    const dev = nodes.filter(n => state.choices[n.id] !== 'leaf');
    let prows = '';
    if (dev.length) {
      prows = '<div class="sub">Probabilit\u00e9s des nouvelles branches</div>';
      for (const p of dev) {
        prows += branchSelectHtml(p.id);
        prows += branchRows(p.id, 'ex. 0,6');
      }
    } else if (nodes.length) {
      prows = '<p class="radio-note">Toutes les branches du niveau ' + d + ' sont des feuilles : aucune nouvelle branche.</p>';
    }

    const last = (d === state.levels.length - 1);
    return '<section class="card">' +
      '<h2 class="cardtitle"><span class="chip">' + (d + 1) + '</span> Niveau ' + (d + 1) + '</h2>' +
      '<div class="sub">Que devient chaque branche du niveau ' + d + ' ?</div>' + rows +
      '<div class="sub">\u00c9v\u00e9nement du niveau ' + (d + 1) + '</div>' +
      '<div class="two">' +
        '<label class="fld"><span class="lbl">\u00c9v\u00e9nement</span>' +
          '<input class="input" id="lev' + d + '-event" type="text" maxlength="20" placeholder="ex. A" value="' + esc(lvl.event || '') + '"></label>' +
        '<label class="fld"><span class="lbl">Son contraire</span>' +
          '<input class="input" id="lev' + d + '-complement" type="text" maxlength="20" placeholder="vide = barre auto" value="' + esc(lvl.complement || '') + '"></label>' +
      '</div>' +
      prows +
      (last ? '<div class="right"><button type="button" class="btn btn-ghost btn-sm" data-act="dellev" data-d="' + d + '">Supprimer ce niveau</button></div>' : '') +
    '</section>';
  }

  function addWrap() {
    const maxed = state.levels.length >= ArbreCore.MAX_LEVELS;
    return '<div class="addwrap">' +
      '<button type="button" id="btnAdd" class="btn btn-sm w-full"' + (maxed ? ' disabled' : '') + '>+ Ajouter un niveau</button>' +
      '<p class="note">' + (maxed ? 'Nombre maximum atteint : 4 niveaux.' : 'Jusqu\u2019\u00e0 4 niveaux. Les \u00e9tapes pr\u00e9c\u00e9dentes restent modifiables.') + '</p>' +
    '</div>';
  }

  function resultsCard() {
    return '<section class="card">' +
      '<h2 class="cardtitle"><span class="chip">4</span> R\u00e9sultats des chemins</h2>' +
      '<p class="radio-note">Chaque feuille du sch\u00e9ma poss\u00e8de, \u00e0 sa droite, une case libre pour le r\u00e9sultat du chemin (ex. \u00ab 0,12 \u00bb ou \u00ab 12 % \u00bb). La case \u00ab Total des issues \u00bb s\u2019affiche ou se masque dans la barre d\u2019outils. Aucune valeur n\u2019est v\u00e9rifi\u00e9e ni calcul\u00e9e.</p>' +
    '</section>';
  }

  function renderPanel() {
    const L = ArbreCore.computeLayout(state);
    let h = '<div class="paneltitle">Construction pas \u00e0 pas</div>';
    h += howtoCard();
    h += card1();
    for (let d = 1; d < state.levels.length; d++) h += levelCard(d, L);
    h += addWrap();
    h += resultsCard();
    panel.innerHTML = h;
  }

  /* ---------------- rendu du schéma ---------------- */

  function makeResInput(nid, x, y, w, h, val) {
    const el = document.createElement('input');
    el.type = 'text';
    el.className = 'res-input';
    el.maxLength = 24;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.value = val || '';
    el.placeholder = '\u2014';
    el.setAttribute('aria-label', nid === '__total__' ? 'Total des issues' : 'R\u00e9sultat du chemin');
    el.addEventListener('input', () => {
      if (nid === '__total__') state.total = el.value;
      else state.results[nid] = el.value;
      saveSoon();
    });
    inner.appendChild(el);
  }

  function renderDiagram() {
    const L = ArbreCore.computeLayout(state);
    svg.setAttribute('width', L.W);
    svg.setAttribute('height', L.H);
    svg.setAttribute('viewBox', '0 0 ' + L.W + ' ' + L.H);
    svg.innerHTML = ArbreCore.svgInner(L, false);
    inner.style.width = L.W + 'px';
    inner.style.height = L.H + 'px';
    inner.querySelectorAll('input').forEach(el => el.remove());
    for (const inp of L.inputs) makeResInput(inp.nid, inp.x, inp.y, inp.w, inp.h, inp.value);
    if (L.total) makeResInput('__total__', L.total.x, L.total.y, L.total.w, L.total.h, L.total.value);
  }

  function updateToolbar() {
    $('seg-h').classList.toggle('on', state.orientation !== 'v');
    $('seg-v').classList.toggle('on', state.orientation === 'v');
    $('seg-bar').classList.toggle('on', state.notation !== 'hat');
    $('seg-hat').classList.toggle('on', state.notation === 'hat');
    $('chkTotal').checked = !!state.showTotal;
  }

  function renderAll() {
    renderPanel();
    renderDiagram();
    updateToolbar();
  }

  /* ---------------- actions sur la structure ---------------- */

  function pruneUnder(nid) {
    const pre = nid + '-';
    for (const m of [state.probs, state.results, state.labels]) {
      for (const k of Object.keys(m)) if (k.indexOf(pre) === 0) delete m[k];
    }
    for (const k of Object.keys(state.choices)) if (k.indexOf(pre) === 0) delete state.choices[k];
  }
  function losableUnder(nid) {
    const pre = nid + '-';
    return Object.keys(state.probs).some(k => k.indexOf(pre) === 0 && state.probs[k]) ||
           Object.keys(state.results).some(k => k.indexOf(pre) === 0 && state.results[k]) ||
           Object.keys(state.labels).some(k => k.indexOf(pre) === 0 && state.labels[k]);
  }
  function valuesBeyondDepth(dep) {
    const f = m => Object.keys(m).some(k => ArbreCore.depthOf(k) > dep && m[k]);
    return f(state.probs) || f(state.results);
  }
  function pruneFromDepth(dep) {
    for (const m of [state.probs, state.results, state.labels]) {
      for (const k of Object.keys(m)) if (ArbreCore.depthOf(k) > dep) delete m[k];
    }
    for (const k of Object.keys(state.choices)) if (ArbreCore.depthOf(k) >= dep) delete state.choices[k];
  }
  function hasAnyValue() {
    if (state.experiment || state.total) return true;
    for (const m of [state.probs, state.results]) {
      for (const k of Object.keys(m)) if (m[k]) return true;
    }
    return false;
  }

  function addLevel() {
    if (state.levels.length >= ArbreCore.MAX_LEVELS) return;
    const letters = ['A', 'B', 'C'];
    state.levels.push({ event: letters[state.levels.length - 1] || 'E', complement: '' });
    renderAll();
    save();
  }

  function setBranchCount(nid, n) {
    const val = Math.min(ArbreCore.MAX_BRANCHES, Math.max(2, parseInt(n, 10) || 2));
    const old = ArbreCore.branchCount(state, nid);
    if (val === old) { renderAll(); return; }
    if (val < old) {
      let losing = false;
      for (let s = val; s < old; s++) {
        const cid = nid + '-' + s;
        losing = losing || losableUnder(cid) || !!state.probs[cid] || !!state.labels[cid];
      }
      if (losing && !window.confirm('R\u00e9duire \u00e0 ' + val + ' branches depuis ce n\u0153ud ? Les branches en trop et leurs valeurs seront supprim\u00e9es.')) {
        renderAll(); return;
      }
      for (let s = val; s < old; s++) {
        const cid = nid + '-' + s;
        pruneUnder(cid);
        delete state.probs[cid];
        delete state.labels[cid];
        delete state.choices[cid];
      }
    }
    state.branches[nid] = val;
    renderAll();
    save();
  }

  function deleteLevel(d) {
    if (d < 1 || d >= state.levels.length) return;
    const hadData = valuesBeyondDepth(d);
    if (hadData && !window.confirm('Supprimer le niveau ' + (d + 1) + ' (et les suivants) ? Les valeurs d\u00e9j\u00e0 saisies pour ces niveaux seront effac\u00e9es.')) return;
    pruneFromDepth(d);
    state.levels.splice(d);
    renderAll();
    save();
  }

  /* ---------------- écouteurs du panneau ---------------- */

  panel.addEventListener('input', function (ev) {
    const t = ev.target;
    if (!t || t.tagName !== 'INPUT' || t.type === 'radio' || t.type === 'checkbox') return;
    if (t.id === 'f-exp') {
      state.experiment = t.value; renderDiagram(); saveSoon(); return;
    }
    const m = /^lev(\d+)-(event|complement)$/.exec(t.id);
    if (m) {
      const lvl = state.levels[+m[1]];
      if (!lvl) return;
      lvl[m[2]] = t.value;
      renderDiagram(); refreshMathLabels(); saveSoon(); return;
    }
    if (t.id.indexOf('lab-') === 0) {
      const cid = t.id.slice(4);
      if (t.value) state.labels[cid] = t.value; else delete state.labels[cid];
      renderDiagram(); refreshMathLabels(); saveSoon(); return;
    }
    if (t.id.indexOf('prob-') === 0) {
      state.probs[t.id.slice(5)] = t.value;
      renderDiagram(); saveSoon();
    }
  });

  panel.addEventListener('change', function (ev) {
    const t = ev.target;
    if (!t) return;
    if (t.tagName === 'SELECT' && t.id.indexOf('br-') === 0) {
      setBranchCount(t.id.slice(3), t.value);
      return;
    }
    if (t.type !== 'radio') return;
    const nid = t.name && t.name.indexOf('ch-') === 0 ? t.name.slice(3) : null;
    if (!nid) return;
    if (t.value === 'leaf') {
      if (!losableUnder(nid) ||
          window.confirm('\u00ab ' + plainLabel(nid) + ' \u00bb deviendra une feuille : les branches et les valeurs situ\u00e9es en dessous seront supprim\u00e9es. Continuer ?')) {
        pruneUnder(nid);
        state.choices[nid] = 'leaf';
        renderAll(); save();
      } else {
        renderAll(); // annulation : réaffichage de l'état réel
      }
    } else {
      delete state.choices[nid];
      renderAll(); save();
    }
  });

  panel.addEventListener('click', function (ev) {
    const btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!btn) return;
    if (btn.id === 'btnAdd') { addLevel(); return; }
    if (btn.dataset && btn.dataset.act === 'dellev') { deleteLevel(+btn.dataset.d); return; }
  });

  /* ---------------- barre d'outils ---------------- */

  function setOrientation(v) { state.orientation = v; renderDiagram(); updateToolbar(); save(); }
  function setNotation(v) { state.notation = v; renderDiagram(); refreshMathLabels(); updateToolbar(); save(); }
  $('seg-h').addEventListener('click', () => setOrientation('h'));
  $('seg-v').addEventListener('click', () => setOrientation('v'));
  $('seg-bar').addEventListener('click', () => setNotation('bar'));
  $('seg-hat').addEventListener('click', () => setNotation('hat'));
  $('chkTotal').addEventListener('change', function () { state.showTotal = this.checked; renderDiagram(); save(); });

  /* ---------------- exports ---------------- */

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
      const str = ArbreCore.exportSvg(state);
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
      .then(b => { downloadBlob(b, 'arbre-probabilites.png'); notify('Image PNG export\u00e9e en haute d\u00e9finition (\u2248 300 dpi).'); })
      .catch(() => notify('L\u2019export PNG a \u00e9chou\u00e9 dans ce navigateur.'));
  });

  $('btnSVG').addEventListener('click', function () {
    try {
      const str = ArbreCore.exportSvg(state);
      downloadBlob(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }), 'arbre-probabilites.svg');
      notify('Fichier SVG export\u00e9.');
    } catch (err) { notify('L\u2019export SVG a \u00e9chou\u00e9.'); }
  });

  $('btnCopy').addEventListener('click', function () {
    const fail = () => notify('La copie d\u2019image est indisponible ici : utilisez \u00ab Exporter PNG \u00bb.');
    if (!navigator.clipboard || !window.ClipboardItem) { fail(); return; }
    rasterize(2)
      .then(b => navigator.clipboard.write([new window.ClipboardItem({ 'image/png': b })]))
      .then(() => notify('Image copi\u00e9e dans le presse-papiers.'))
      .catch(fail);
  });

  /* ---------------- modèle / nouveau schéma ---------------- */

  $('btnTemplate').addEventListener('click', function () {
    const hasVals = Object.keys(state.probs).some(k => state.probs[k]) ||
                    Object.keys(state.results).some(k => state.results[k]) ||
                    !!state.total;
    if (hasVals && !window.confirm('Effacer toutes les valeurs saisies (probabilit\u00e9s, r\u00e9sultats, total) et conserver la structure et les noms ?')) return;
    state.probs = {};
    state.results = {};
    state.total = '';
    renderAll();
    save();
    notify('Mod\u00e8le r\u00e9utilis\u00e9 : structure et noms conserv\u00e9s, valeurs effac\u00e9es.');
  });

  $('btnReset').addEventListener('click', function () {
    if (state.levels.length > 1 || hasAnyValue()) {
      if (!window.confirm('Repartir d\u2019un sch\u00e9ma vierge ? Toute la saisie actuelle sera perdue.')) return;
    }
    const keep = {
      orientation: state.orientation,
      notation: state.notation,
      showTotal: state.showTotal
    };
    state = Object.assign(ArbreCore.defaultState(), keep);
    renderAll();
    save();
    notify('Nouveau sch\u00e9ma vierge.');
  });

  /* ---------------- démarrage ---------------- */
  updateToolbar();
  renderAll();
})();
