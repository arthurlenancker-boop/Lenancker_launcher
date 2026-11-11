/* OCR Mistral — logique de l'app.
   Flux : clé API (localStorage) → dépôt fichiers → POST /v1/ocr → Markdown. */
(function () {
  'use strict';

  const API_URL = 'https://api.mistral.ai/v1/ocr';
  const MODELS_URL = 'https://api.mistral.ai/v1/models';
  const MODEL = 'mistral-ocr-latest';
  const LS_KEY = 'lenancker.ocr.apiKey';
  const LS_IMAGES = 'lenancker.ocr.includeImages';
  const LS_TRIM = 'lenancker.ocr.trimPage';
  const LS_HF = 'lenancker.ocr.cleanHf';
  const LS_MODE = 'lenancker.ocr.mode';
  const LS_ANNOTS_MODE = 'lenancker.ocr.annots.mode';       // 'separate' | 'printed' | 'mixed'
  const LS_ANNOTS_REMEMBER = 'lenancker.ocr.annots.remember'; // '1' = choix mémorisé, plus de question
  const MAX_FILE_BYTES = 50 * 1024 * 1024; // limite API Mistral : 50 Mo
  const WARN_FILE_BYTES = 20 * 1024 * 1024;

  const SUPPORTED = {
    'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image', 'image/gif': 'image',
    'image/avif': 'image',
    'application/pdf': 'document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  };
  const EXT_FALLBACK = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    avif: 'image/avif', pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };

  /* ---------- État ---------- */
  let queue = []; // {id, file, kind, status, dataUrl, markdown, pages, segments, rects, dpi, error}
  let seq = 0;
  let running = false;
  const CONCURRENCY = 2;  // requêtes OCR en parallèle
  const STAGGER_MS = 500; // décalage entre démarrages (limite de débit API)

  /* ---------- Raccourcis DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const els = {
    key: $('api-key'), toggleKey: $('toggle-key'), saveKey: $('save-key'), testKey: $('test-key'),
    deleteKey: $('delete-key'), keyStatus: $('key-status'), keyBadge: $('key-badge'),
    dropzone: $('dropzone'), fileInput: $('file-input'), queueList: $('file-queue'),
    run: $('run-ocr'), clear: $('clear-files'), queueCount: $('queue-count'),
    progressWrap: $('progress-wrap'), progressBar: $('progress-bar'),
    progressLabel: $('progress-label'), progressCount: $('progress-count'),
    results: $('results'), empty: $('empty-results'), copyAll: $('copy-all'),
    includeImages: $('include-images'), trimPage: $('trim-page'), cleanHf: $('clean-hf'),
    modeOcr: $('mode-ocr'), modeIa: $('mode-ia'), modeHint: $('mode-hint'), pdfAll: $('pdf-all'),
    annotRow: $('annot-row'), annotPrefs: $('annot-prefs'),
  };
  // Préférences persistées via la cascade de stockage (voir common.js) :
  // indisponible dans certains contextes, sans casser l'app.
  const store = window.lenanckerStorage;

  if (els.includeImages) {
    els.includeImages.checked = store.get(LS_IMAGES) === '1';
    els.includeImages.addEventListener('change', () => {
      store.set(LS_IMAGES, els.includeImages.checked ? '1' : '0');
    });
  }
  if (els.trimPage) {
    els.trimPage.checked = store.get(LS_TRIM) !== '0'; // détourage actif par défaut
    els.trimPage.addEventListener('change', () => {
      store.set(LS_TRIM, els.trimPage.checked ? '1' : '0');
    });
  }
  if (els.cleanHf) {
    els.cleanHf.checked = store.get(LS_HF) !== '0'; // en-têtes/pieds de page écartés par défaut
    els.cleanHf.addEventListener('change', () => {
      store.set(LS_HF, els.cleanHf.checked ? '1' : '0');
    });
  }
  /* Mode d'analyse : OCR fidèle (reconnaissance seule), ou Recréé par IA —
     pas de reconnaissance préalable : le document original part seul à un
     modèle vision qui le reconstruit de zéro, fond intouchable, artefacts
     du scan ignorés. */
  function getMode() { return store.get(LS_MODE) === 'ia' ? 'ia' : 'ocr'; }
  function applyModeUI() {
    const ia = getMode() === 'ia';
    els.modeOcr.classList.toggle('active', !ia);
    els.modeIa.classList.toggle('active', ia);
    els.modeOcr.setAttribute('aria-pressed', String(!ia));
    els.modeIa.setAttribute('aria-pressed', String(ia));
    if (els.modeHint) {
      els.modeHint.textContent = ia
        ? 'Chaque image (ou chaque page du PDF) part seule à un modèle Mistral à vision, sans OCR préalable : il recrée de zéro le document en Markdown — contenu identique mot pour mot, rien inventé ni corrigé — en ignorant les artefacts du scan (texte penché, table derrière la feuille, cadrage décentré) et en reconstruisant proprement ordre de lecture, tableaux, césures et titres. La case « Inclure les figures » remet les images d\u2019origine à leur place (appel OCR discret en parallèle) — la chaîne imprimé→scan repart à l\u2019envers. Le stylo est repéré avant la reconstruction : son traitement t\u2019est demandé une fois, puis mémorisé. Les .docx/.pptx, déjà numériques, restent extraits directement.'
        : 'Fidèle au document : le texte sort tel que reconnu, rien n\u2019est modifié.';
    }
    if (els.annotRow) els.annotRow.classList.toggle('hidden', !ia);
  }
  if (els.modeOcr && els.modeIa) {
    els.modeOcr.addEventListener('click', () => { store.set(LS_MODE, 'ocr'); applyModeUI(); });
    els.modeIa.addEventListener('click', () => { store.set(LS_MODE, 'ia'); applyModeUI(); });
  }
  applyModeUI();
  document.getElementById('brand-logo').innerHTML = window.iconSvg('scan');

  /* ---------- Annotations manuscrites (documents annotés) ----------
     Un scan de cours annoté au stylo contient deux textes : l'imprimé du
     manuel et les notes de la main. En mode IA, un repérage à bas prix
     (les premières images au modèle vision, réponse JSON minimale) les
     distingue AVANT la reconstruction ; si l'écriture manuscrite y est,
     le traitement voulu est demandé une fois (dialogue), puis mémorisé
     via la cascade de stockage — les documents suivants l'appliquent en
     silence, sans plus jamais interrompre. Modifiable à tout moment depuis
     la ligne de préférences sous le mode d'analyse. */
  const ANNOT_MODES = {
    separate: 'séparer (texte imprimé, puis section Annotations)',
    printed: 'ignorer (texte imprimé seul)',
    mixed: 'tout transcrire, à sa place',
  };
  const ANNOT_BADGES = {
    separate: 'manuscrit séparé',
    printed: 'manuscrit ignoré',
    mixed: 'manuscrit inclus',
  };
  function getAnnotPref() {
    const m = store.get(LS_ANNOTS_MODE);
    return {
      mode: (m === 'printed' || m === 'mixed') ? m : 'separate',
      remember: store.get(LS_ANNOTS_REMEMBER) === '1',
      stored: !!m,
    };
  }
  function refreshAnnotRow() {
    if (!els.annotPrefs) return;
    const pref = getAnnotPref();
    els.annotPrefs.textContent = `${ANNOT_MODES[pref.mode]}${pref.remember ? ' · mémorisé' : ''} — modifier`;
    els.annotPrefs.title = 'Traitement appliqué quand la reconstruction IA repère de l\u2019écriture manuscrite dans un document (choix mémorisable au moment du repérage).';
  }
  if (els.annotPrefs) {
    refreshAnnotRow();
    els.annotPrefs.addEventListener('click', async () => {
      const res = await openAnnotDialog({ manual: true });
      if (res) {
        store.set(LS_ANNOTS_MODE, res.mode);
        store.set(LS_ANNOTS_REMEMBER, res.remember ? '1' : '0');
        refreshAnnotRow();
        window.toast(`Annotations manuscrites : ${ANNOT_MODES[res.mode]}, ${res.remember ? 'mémorisé — plus de question' : 'redemandé à chaque repérage'}.`, 'ok');
      }
    });
  }

  marked.setOptions({ gfm: true, breaks: true });

  /* ---------- Utilitaires ---------- */
  const fmtSize = (b) => b < 1024 ? `${b} o` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} Ko` : `${(b / 1024 / 1024).toFixed(1)} Mo`;

  function fileKind(file) {
    if (SUPPORTED[file.type]) return SUPPORTED[file.type];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    return SUPPORTED[EXT_FALLBACK[ext]] || null;
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Lecture du fichier impossible.'));
      r.readAsDataURL(file);
    });
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      window.toast(okMsg || 'Copié dans le presse-papiers.', 'ok');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); window.toast(okMsg || 'Copié dans le presse-papiers.', 'ok'); }
      catch { window.toast('Copie impossible dans ce navigateur.', 'err'); }
      ta.remove();
    }
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function download(filename, text) {
    downloadBlob(filename, new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  }

  /* ---------- Chargement à la demande ----------
     KaTeX (~280 Ko) et docx (~330 Ko) ne sont téléchargés/interprétés que
     si le document en a réellement besoin (maths présentes, export .docx).
     Le service worker sert ensuite ces fichiers depuis son cache (hors-ligne OK). */
  const scriptCache = new Map();
  const styleCache = new Map();

  function loadScript(src) {
    if (scriptCache.has(src)) return scriptCache.get(src);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptCache.delete(src);
        s.remove();
        reject(new Error(`Chargement impossible : ${src}`));
      };
      document.head.appendChild(s);
    });
    scriptCache.set(src, p);
    return p;
  }

  function loadStyle(href) {
    if (styleCache.has(href)) return styleCache.get(href);
    const p = new Promise((resolve, reject) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.onload = () => resolve();
      l.onerror = () => {
        styleCache.delete(href);
        l.remove();
        reject(new Error(`Chargement impossible : ${href}`));
      };
      document.head.appendChild(l);
    });
    styleCache.set(href, p);
    return p;
  }

  /* Contenu « vraiment math » d'une paire $...$ : commande LaTeX, exposant,
     indice, accolade, signe égal, coefficient collé (2x), opération (a + b)
     ou variable isolée (x). Les devises — « 50 $ et 60 $ » — restent du texte :
     sans ce filtre, KaTeX les rendait comme des maths et déformait la phrase. */
  function isMathInner(inner) {
    const s = String(inner || '').trim();
    if (!s || s.length > 80) return false;
    if (/[\\^_{}=≈≤≥≠]/.test(s)) return true;
    if (/[0-9][a-zA-Z]/.test(s)) return true;
    if (/[0-9a-zA-Z)\]]\s*[+−–×÷*/]\s*[0-9a-zA-Z([]/.test(s)) return true;
    return s.length === 1 && /[a-zA-Z]/.test(s);
  }

  /* true si le texte contient des maths (délimiteurs LaTeX). */
  function hasMath(text) {
    const s = String(text || '');
    if (s.includes('\\(') || s.includes('\\[')) return true;
    const re = /\$([^$\n]+)\$/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      if (isMathInner(m[1])) return true;
      re.lastIndex = m.index + 1; // le $ qui ouvrait était une devise : re-paire depuis lui
    }
    return false;
  }

  let katexPromise = null;
  function ensureKatex() {
    if (!katexPromise) {
      katexPromise = Promise.all([
        loadStyle('../../assets/vendor/katex/katex.min.css'),
        loadScript('../../assets/vendor/katex/katex.min.js').then(() =>
          loadScript('../../assets/vendor/katex/katex-auto-render.min.js')
        ),
      ]).catch((e) => { katexPromise = null; throw e; });
    }
    return katexPromise;
  }

  let docxPromise = null;
  function ensureDocx() {
    if (!docxPromise) {
      docxPromise = loadScript('../../assets/vendor/docx.min.js')
        .then(() => loadScript('md2docx.js')) // md2docx capture window.docx : charger docx d'abord
        .catch((e) => { docxPromise = null; throw e; });
    }
    return docxPromise;
  }

  let pdfOcrPromise = null;
  function ensurePdfOcr() {
    if (!pdfOcrPromise) {
      pdfOcrPromise = loadScript('pdfocr.js').catch((e) => { pdfOcrPromise = null; throw e; });
    }
    return pdfOcrPromise;
  }

  let pdfLibPromise = null;
  function ensurePdfLib() {
    if (!pdfLibPromise) {
      pdfLibPromise = loadScript('../../assets/vendor/pdf-lib.min.js')
        .then(() => ensurePdfOcr())
        .catch((e) => { pdfLibPromise = null; throw e; });
    }
    return pdfLibPromise;
  }

  /* Copie en HTML riche (text/html) pour coller directement dans Word / Google Docs. */
  async function copyRichHtml(md, images) {
    const html = await renderPreviewHtml(md, images);
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([md], { type: 'text/plain' }),
        })]);
        window.toast('HTML riche copié — colle dans Word avec Ctrl+V.', 'ok');
        return;
      } catch { /* repli : copie Markdown */ }
    }
    await copyText(md, 'Copié en Markdown (presse-papiers HTML indisponible ici).');
  }

  /* ---------- Clé API ---------- */
  function getKey() { return (store.get(LS_KEY) || '').trim(); }

  function refreshKeyUI() {
    const has = !!getKey();
    els.keyBadge.textContent = has ? 'enregistrée localement' : 'non configurée';
    els.keyBadge.classList.toggle('soon-badge', !has);
    if (has && !els.key.value) els.key.value = getKey();
  }

  function setKeyStatus(msg, kind) {
    els.keyStatus.textContent = msg;
    els.keyStatus.style.color = kind === 'ok' ? 'var(--ok)' : kind === 'err' ? 'var(--err)' : 'var(--ink-dim)';
  }

  els.saveKey.addEventListener('click', () => {
    const v = els.key.value.trim();
    if (!v) { setKeyStatus('Colle d’abord ta clé API.', 'err'); return; }
    if (store.set(LS_KEY, v)) {
      refreshKeyUI();
      renderQueue(); // des fichiers peuvent être déjà en file : réactive « Lancer l'analyse »
      setKeyStatus('Clé enregistrée dans ce navigateur.', 'ok');
      window.toast('Clé API enregistrée localement.', 'ok');
    } else {
      setKeyStatus('Stockage indisponible — la clé ne survivra pas à la fermeture.', 'err');
      window.toast('Stockage indisponible (navigateur ?) : la clé ne sera pas conservée après fermeture.', 'warn', 7000);
    }
  });

  els.deleteKey.addEventListener('click', () => {
    store.remove(LS_KEY);
    els.key.value = '';
    refreshKeyUI();
    setKeyStatus('Clé oubliée.', 'warn');
    window.toast('La clé API a été supprimée de ce navigateur.', 'warn');
  });

  els.toggleKey.addEventListener('click', () => {
    const show = els.key.type === 'password';
    els.key.type = show ? 'text' : 'password';
    els.toggleKey.textContent = show ? 'Masquer' : 'Voir';
  });

  els.testKey.addEventListener('click', async () => {
    const key = els.key.value.trim() || getKey();
    if (!key) { setKeyStatus('Aucune clé à tester.', 'err'); return; }
    els.testKey.classList.add('loading'); els.testKey.disabled = true;
    setKeyStatus('Test en cours…');
    try {
      const res = await fetch(MODELS_URL, { headers: { Authorization: `Bearer ${key}` } });
      if (res.ok) {
        const data = await res.json();
        const n = Array.isArray(data.data) ? data.data.length : 0;
        if (key !== getKey()) { // la clé tapée vient d'être validée : on l'enregistre
          store.set(LS_KEY, key);
          refreshKeyUI();
          renderQueue();
        }
        setKeyStatus(`Clé valide et enregistrée — ${n} modèle(s) accessibles.`, 'ok');
        window.toast('Clé API valide et enregistrée.', 'ok');
      } else {
        setKeyStatus(`Échec du test (HTTP ${res.status}).`, 'err');
        window.toast(`Test de la clé : HTTP ${res.status}`, 'err');
      }
    } catch {
      setKeyStatus('API injoignable (réseau ?)', 'err');
    } finally {
      els.testKey.classList.remove('loading'); els.testKey.disabled = false;
    }
  });

  /* ---------- File queue ---------- */
  function addFiles(fileList) {
    let added = 0;
    for (const file of fileList) {
      const kind = fileKind(file);
      if (!kind) {
        window.toast(`Format non supporté : ${file.name}`, 'warn');
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        window.toast(`${file.name} dépasse 50 Mo (limite API).`, 'err');
        continue;
      }
      if (file.size > WARN_FILE_BYTES) {
        window.toast(`${file.name} est volumineux (${fmtSize(file.size)}) : l’OCR peut prendre du temps.`, 'warn', 5200);
      }
      queue.push({ id: ++seq, file, kind, status: 'pending', dataUrl: null, markdown: null, pages: 0, images: {}, imageDims: {}, confScore: null, skew: 0, recreated: false, annotMode: null, error: null });
      added++;
    }
    if (added) renderQueue();
  }

  function renderQueue() {
    els.queueList.innerHTML = '';
    let pending = 0;
    for (const [index, item] of queue.entries()) {
      if (item.status === 'pending' || item.status === 'err') pending++;
      const li = document.createElement('li');
      li.className = 'file-item';
      if (item.status === 'err' && item.error) li.title = item.error;
      else if (item.status === 'ok' && item.pages > 1) li.title = `${item.pages} page(s) traitée(s)`;

      const name = document.createElement('span');
      name.className = 'fname'; name.textContent = item.file.name; name.title = item.file.name;

      const size = document.createElement('span');
      size.className = 'fsize'; size.textContent = fmtSize(item.file.size);

      const status = document.createElement('span');
      status.className = `fstatus ${item.status === 'working' ? 'working' : item.status}`;
      status.textContent = statusLabel(item);

      const move = (dir, label, glyph) => {
        const b = document.createElement('button');
        b.className = 'fmove'; b.type = 'button'; b.textContent = glyph;
        b.title = label;
        const other = index + dir;
        b.disabled = running || other < 0 || other >= queue.length;
        b.addEventListener('click', () => moveItem(item, dir));
        return b;
      };

      const remove = document.createElement('button');
      remove.className = 'fremove'; remove.type = 'button'; remove.textContent = '✕';
      remove.title = 'Retirer de la liste';
      remove.disabled = running && item.status === 'working';
      remove.addEventListener('click', () => {
        queue = queue.filter((q) => q.id !== item.id);
        renderQueue();
      });

      li.append(name, size, status, move(-1, 'Monter dans la file', '↑'), move(1, 'Descendre dans la file', '↓'), remove);
      els.queueList.appendChild(li);
    }
    els.queueCount.textContent = queue.length ? `${queue.length} fichier(s)` : '';
    els.run.disabled = !pending || running || !getKey();
    els.clear.disabled = !queue.length || running;
  }

  /* L'ordre de la file commande l'analyse, le PDF combiné et la copie globale.
     Les cartes de résultats suivent donc le même ordre. */
  function moveItem(item, dir) {
    const i = queue.indexOf(item);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= queue.length) return;
    [queue[i], queue[j]] = [queue[j], queue[i]];
    renderQueue();
    syncResultsOrder();
  }

  function syncResultsOrder() {
    const cards = Array.from(els.results.children);
    if (!cards.length) return;
    const byId = new Map(cards.map((c) => [c.dataset.qid, c]));
    for (const item of queue) {
      const c = byId.get(String(item.id));
      if (c) els.results.appendChild(c);
    }
    // cartes orphelines (fichier retiré de la file) : gardées, en fin
    for (const c of cards) {
      if (!queue.some((q) => String(q.id) === c.dataset.qid)) els.results.appendChild(c);
    }
  }

  function statusLabel(item) {
    switch (item.status) {
      case 'pending': return 'en attente';
      case 'working': return 'analyse…';
      case 'ok': return 'terminé';
      case 'err': return 'erreur';
      default: return item.status;
    }
  }

  function setItemStatus(item, status) {
    item.status = status;
    renderQueue();
  }

  /* Drag & drop */
  ['dragenter', 'dragover'].forEach((evt) =>
    els.dropzone.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      els.dropzone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    els.dropzone.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (evt === 'dragleave' && els.dropzone.contains(e.relatedTarget)) return;
      els.dropzone.classList.remove('dragover');
    })
  );
  els.dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });
  els.dropzone.addEventListener('click', () => els.fileInput.click());
  els.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
  });
  els.fileInput.addEventListener('change', () => {
    addFiles(els.fileInput.files);
    els.fileInput.value = '';
  });
  // Empêche le navigateur d'ouvrir le fichier lâché hors de la zone
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  els.clear.addEventListener('click', () => { queue = []; renderQueue(); });

  /* ---------- Préparation du Markdown ---------- */
  /* Enveloppe le LaTeX nu de $...$ pour KaTeX : _{...} et ^{...}, plus les
     indices et exposants simples (x_1, f^2). Sans toucher aux blocs ```...```,
     au code inline `...` ni au contenu déjà en $...$. */
  function wrapBareScripts(text) {
    return text.split(/(```[\s\S]*?```|\$[^$]+\$|`[^`\n]*`)/g).map((seg, i) => {
      if (i % 2 === 1) return seg;
      return seg
        .replace(/(?<!\\)\^\{([^}]+)\}/g, '$^{$1}$')
        .replace(/(?<!\\)_\{([^}]+)\}/g, '$_{$1}$')
        // x^2, u_1 : un seul caractère chiffre/minuscule après ^ ou _ — pas
        // les identifiants type MOT_A ou LOG_LEVEL
        .replace(/(?<!\\)([\w)\]])\^([0-9a-z])(?![0-9a-zA-Z^(])/g, '$1$^{$2}$')
        .replace(/(?<!\\)([\w)\]])_([0-9a-z])(?![0-9a-zA-Z^(])/g, '$1$_{$2}$');
    }).join('');
  }

  /* ---------- Réparation des tableaux markdown ----------
     L'OCR renvoie parfois des tables aux rangées décalées : cellules manquantes
     (rangée plus courte que l'en-tête) ou séparateur plus court que l'en-tête
     — marked refuse alors de rendre la table. On comble ce qui manque (cellules
     vides), on réécrit le séparateur à la largeur de l'en-tête. Rangées plus
     longues, blocs sans séparateur, tables saines : inchangés au byte près. */
  function repairTables(md) {
    const lines = String(md || '').split('\n');
    const out = lines.slice();
    const SEP_RE = /^\s*\|?[\s:\-|]*-[\s:\-|]*\|?\s*$/;
    const cellsOf = (line) => {
      let s = line.trim();
      if (s.startsWith('|')) s = s.slice(1);
      if (s.endsWith('|')) s = s.slice(0, -1);
      return s.split(/(?<!\\)\|/);
    };
    let i = 0;
    while (i < lines.length) {
      const head = lines[i].trim();
      if (head.startsWith('|') && head !== '|' && i + 1 < lines.length && SEP_RE.test(lines[i + 1])) {
        const n = cellsOf(lines[i]).length; // l'en-tête fixe la largeur de la table
        if (cellsOf(lines[i + 1]).length !== n) out[i + 1] = '|' + ' --- |'.repeat(n);
        let j = i + 2;
        while (j < lines.length && lines[j].trim().startsWith('|') && !SEP_RE.test(lines[j])) {
          const cells = cellsOf(lines[j]);
          if (cells.length < n) {
            while (cells.length < n) cells.push(' ');
            out[j] = `| ${cells.map((c) => c.trim()).join(' | ')} |`;
          }
          j++;
        }
        i = j;
        continue;
      }
      i++;
    }
    return out.join('\n');
  }

  function prepareMarkdown(md, images) {
    let out = String(md || '');
    // images : data URL à la place de la référence quand on les a reçues
    if (images && Object.keys(images).length) {
      out = out.replace(/!\[([^\]]+)\]\([^)]*\)/g, (m, alt) => (images[alt] ? `![${alt}](${images[alt]})` : m));
    }
    // LaTeX nu -> $...$, hors zones protégées (blocs de code, code inline, déjà-math)
    return wrapBareScripts(out);
  }

  const KATEX_OPTS = {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
      { left: '$', right: '$', display: false },
    ],
    trust: false,
    strict: false,
  };

  /* HTML préparé (aperçu / copie riche) : charge KaTeX au besoin.
     Si KaTeX est indisponible (hors-ligne sans cache), le texte s'affiche quand même. */
  async function renderPreviewHtml(md, images) {
    const prep = prepareMarkdown(md, images);
    if (hasMath(prep)) {
      try { await ensureKatex(); } catch { /* aperçu sans maths mises en forme */ }
    }
    const div = document.createElement('div');
    div.innerHTML = DOMPurify.sanitize(marked.parse(prep));
    if (hasMath(prep) && window.renderMathInElement) window.renderMathInElement(div, KATEX_OPTS);
    return div.innerHTML;
  }

  /* ---------- PDF du document recréé (mise en page, impression) ----------
     La chaîne à l'envers se termine en papier numérique : le texte recréé et
     ses figures soudées composés en pages A4 propres — titres, tableaux,
     maths mises en forme — que la fenêtre d'impression du navigateur rend
     en PDF (« Enregistrer au format PDF » du dialogue, ou impression papier.
     Les figures sont des data-URL : aucune ressource réseau à attendre). */
  function printDocHtml(inner) {
    const katexCss = new URL('../../assets/vendor/katex/katex.min.css', location.href);
    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Document recréé — Lenancker Launcher</title>
<link rel="stylesheet" href="${katexCss}">
<style>
  @page { size: A4; margin: 2cm 1.8cm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 11pt/1.55 "Segoe UI", system-ui, -apple-system, sans-serif; color: #111; background: #fff; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1em 0 .35em; font-weight: 600; page-break-after: avoid; page-break-inside: avoid; }
  h1 { font-size: 1.55em; } h2 { font-size: 1.3em; } h3 { font-size: 1.12em; } h4 { font-size: 1em; }
  p { margin: .45em 0; orphans: 2; widows: 2; }
  ul, ol { margin: .45em 0 .45em 1.4em; padding: 0; }
  li { margin: .15em 0; }
  table { border-collapse: collapse; width: 100%; margin: .7em 0; page-break-inside: avoid; }
  th, td { border: .5pt solid #555; padding: .3em .5em; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 600; }
  img { max-width: 100%; height: auto; margin: .5em auto; display: block; page-break-inside: avoid; }
  blockquote { margin: .6em 0; padding: .1em .9em; border-left: 2.5pt solid #999; color: #333; }
  pre { background: #f5f5f5; border: .5pt solid #ddd; padding: .5em; overflow: hidden; white-space: pre-wrap; page-break-inside: avoid; }
  code { font-family: Consolas, monospace; font-size: .92em; }
  pre code { background: none; }
  hr { border: none; border-top: .5pt solid #bbb; margin: .9em 0; }
  .katex { font-size: 1.05em; }
</style>
</head>
<body>${inner}</body>
</html>`;
  }

  async function printRecreated(item) {
    const inner = await renderPreviewHtml(item.markdown, item.images);
    const w = window.open('', '_blank', 'width=880,height=1100');
    if (!w) {
      window.toast('Fenêtre d\u2019impression bloquée — autorise les fenêtres surgissantes puis réessaie.', 'warn', 7000);
      return;
    }
    w.document.open();
    w.document.write(printDocHtml(inner));
    w.document.close();
    const fire = () => setTimeout(() => { try { w.focus(); w.print(); } catch { /* le dialogue reste accessible à la main */ } }, 200);
    if (w.document.readyState === 'complete') fire();
    else w.addEventListener('load', fire, { once: true });
  }

  /* ---------- Appel API Mistral OCR ---------- */
  async function callOcr(item, key, attempt, plain) {
    const includeImages = store.get(LS_IMAGES) === '1';
    const document = item.kind === 'image'
      ? { type: 'image_url', image_url: item.dataUrl }
      : { type: 'document_url', document_url: item.dataUrl };

    const body = {
      model: MODEL,
      document,
      include_image_base64: includeImages,
      include_blocks: true, // bbox des blocs (px de l'image) pour le PDF à texte sélectionnable
      // qualité : score de reconnaissance renvoyé pour chaque page
      confidence_scores_granularity: 'page',
    };
    if (!plain) {
      // tables bien formées en markdown (paramètre des modèles récents ;
      // si le modèle courant ne le connaît pas, on retente une fois sans lui)
      body.table_format = 'markdown';
    }
    if (els.cleanHf && els.cleanHf.checked) {
      // textes répétitifs de page (numéros, mentions) sortis du markdown
      body.extract_header = true;
      body.extract_footer = true;
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        if (err && (err.message || err.detail)) message = err.message || err.detail;
      } catch { /* garde le statut HTTP */ }
      if ((res.status >= 500 || res.status === 429) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 * attempt + 1000));
        return callOcr(item, key, attempt + 1, plain);
      }
      // modèle courant qui refuserait table_format : une seule retente, sans lui
      if (res.status === 400 && !plain && /table[_ ]?format/i.test(message)) {
        return callOcr(item, key, attempt, true);
      }
      throw Object.assign(new Error(message), { status: res.status });
    }

    const data = await res.json();
    const pages = Array.isArray(data.pages) ? data.pages : [];
    item.markdown = repairTables(pages.map((p) => p.markdown || '').join('\n\n').trim());
    item.pages = data.usage_info?.pages_processed ?? pages.length;
    item.images = {};
    item.imageDims = {};
    for (const p of pages) {
      for (const img of p.images || []) {
        if (!img.id) continue;
        // bbox de l'image → rapport largeur/hauteur réel pour l'export .docx
        const w = Number(img.bottom_right_x) - Number(img.top_left_x);
        const h = Number(img.bottom_right_y) - Number(img.top_left_y);
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
          item.imageDims[img.id] = { w, h };
        }
        if (includeImages && img.image_base64) {
          const b64 = String(img.image_base64);
          if (b64.startsWith('data:')) {
            // l'API renvoie déjà une URL data: complète (préfixe inclus) —
            // ne jamais re-préfixer : un double préfixe rend l'image illisible
            item.images[img.id] = b64;
          } else {
            const ext = String(img.id).split('.').pop().toLowerCase();
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
            item.images[img.id] = `data:${mime};base64,${b64}`;
          }
        }
      }
    }
    // fiabilité : moyenne renvoyée par l'API, la page la moins sûre gouverne
    const scores = pages
      .map((p) => Number(p.confidence_scores && p.confidence_scores.average_page_confidence_score))
      .filter(Number.isFinite);
    item.confScore = scores.length ? Math.min(...scores) : null;
    if (!item.markdown) throw new Error('Réponse vide de l’API OCR.');

    // Blocs OCR (bbox en px de l'image) pour le calque texte du PDF exportable
    if (item.kind === 'image' && pages[0]) {
      const blocks = collectOcrBlocks(pages[0]);
      item.segments = blocks.segments;
      item.rects = blocks.rects;
      item.dpi = Number(pages[0].dimensions?.dpi) || null;
    }
  }

  function friendlyError(err) {
    const s = err.status;
    if (s === 401 || s === 403) return 'Clé API invalide ou non autorisée — vérifie-la dans la section « Clé API Mistral ».';
    if (s === 413) return 'Document trop volumineux pour l’API (limite 50 Mo).';
    if (s === 429) return 'Quota ou limite de débit atteinte — réessaie dans un instant.';
    if (s === 400) return `Requête refusée par l’API : ${err.message}`;
    return err.message || 'Erreur inconnue.';
  }

  /* ---------- La chaîne à l'envers : figures du document original ----------
     Un document numérique imprimé puis scanné redevient numérique : le texte
     est recréé par la vision, mais les figures ne se « retapent » pas —
     l'OCR les moissonne EN PARALLÈLE de la reconstruction (seule sa réponse
     embarque les images du document, avec leurs proportions), et elles sont
     soudées aux repères figure-N dans l'ordre d'apparition. Optionnel (case
     « Inclure les images »), non bloquant : moisson manquée → repères texte. */
  async function harvestFigures(item, key, attempt = 1) {
    const document = item.kind === 'image'
      ? { type: 'image_url', image_url: item.dataUrl || await prepareImage(item) }
      : { type: 'document_url', document_url: item.dataUrl || await readAsDataURL(item.file) };
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, document, include_image_base64: true }),
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        if (err && (err.message || err.detail)) message = err.message || err.detail;
      } catch { /* garde le statut HTTP */ }
      if ((res.status >= 500 || res.status === 429) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 * attempt + 1000));
        return harvestFigures(item, key, attempt + 1);
      }
      throw Object.assign(new Error(message), { status: res.status });
    }
    const data = await res.json();
    const figs = [];
    for (const p of Array.isArray(data.pages) ? data.pages : []) {
      for (const img of p.images || []) {
        if (!img.id || !img.image_base64) continue;
        const b64 = String(img.image_base64);
        // l'API renvoie déjà une URL data: complète — ne jamais re-préfixer
        const dataUrl = b64.startsWith('data:') ? b64 : (() => {
          const ext = String(img.id).split('.').pop().toLowerCase();
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          return `data:${mime};base64,${b64}`;
        })();
        const w = Number(img.bottom_right_x) - Number(img.top_left_x);
        const h = Number(img.bottom_right_y) - Number(img.top_left_y);
        figs.push({
          dataUrl,
          w: Number.isFinite(w) && w > 0 ? w : null,
          h: Number.isFinite(h) && h > 0 ? h : null,
        });
      }
    }
    return figs;
  }

  /* Soudure : le k-ième repère de figure rencontré dans le texte reçoit la
     k-ième figure moissonnée, renuméroté figure-k (clé unique). On ne suit
     PAS le numéro du modèle : au-delà de 8 pages, chaque tranche repart à
     figure-1 — l'ordre d'apparition, lui, ne trompe jamais. Alt et url
     réécrits identiques : la substitution aperçu/.docx (par alt) s'aligne.
     Pas assez de figures : les derniers repères restent en texte ; trop :
     l'excédent reste de côté. */
  function graftFigures(md, figs, item) {
    const list = Array.isArray(figs) ? figs.filter(Boolean) : [];
    if (!list.length) return String(md || '');
    let i = 0;
    return String(md || '').replace(/!\[([^\]]*)\]\(\s*figure-(?:\d+)\s*\)/g, (whole) => {
      const fig = list[i];
      if (!fig) return whole;
      const k = i + 1;
      i += 1;
      const key = `figure-${k}`;
      item.images[key] = fig.dataUrl;
      if (fig.w && fig.h) item.imageDims[key] = { w: fig.w, h: fig.h };
      return `![${key}](${key})`;
    });
  }

  /* ---------- Reconstruction IA (vision, même clé Mistral) ----------
     Pas une transcription, un nettoyage ni un correcteur : le modèle vision
     recrée le document ORIGINAL de zéro — ce qu'il était avant d'être
     photographié/scanné. Le scan lui-même n'existe pas : texte penché, table
     autour de la feuille, cadrage décentré sont des artefacts à ignorer,
     jamais des informations à copier. Le fond reste intouchable (mot pour
     mot, rien inventé, [illisible] pour l'incertain), température 0 ;
     l'intelligence porte sur la remise en forme : ordre de lecture,
     tableaux, césures, hiérarchie des titres. */
  const CHAT_URL = 'https://api.mistral.ai/v1/chat/completions';
  const VISION_SYSTEM = [
    "Tu es reconstituteur de documents du Lenancker Launcher. On te montre un ou plusieurs clichés (photo, scan) d'un même document : tu recrées le DOCUMENT ORIGINAL, propre, comme il existait avant d'être photographié — jamais la photo du document.",
    "Ta tâche unique : reconstruire de zéro, en Markdown, le document que montrent les images, comme quelqu'un qui le retaperait fidèlement à l'identique — c'est la recopie intégrale du fond, pas un résumé, pas une correction, pas une création.",
    "Le scan n'existe pas : ignore tout artefact du cliché et ne le mentionne jamais — texte ou image penchés, inclinés, photographiés de biais ou en perspective ; table ou fond visible autour de la feuille ; feuille décentrée, coupée ou de travers dans le cadre ; ombres, reflets, courbure, pliures, coins, marges biscornues. Lis et restitue comme si la page était parfaitement droite, seule, face à toi : un mot photographié de travers se recopie droit, sans jamais noter l'angle, le cadrage ni l'arrière-plan.",
    "Interdits absolus — toute violation est un échec : parler du scan, de la photo ou de leur qualité ; répondre au document, l'expliquer, le commenter, le prolonger ou le corriger, même s'il paraît faux ou incomplet ; ajouter, inventer, deviner, traduire, reformuler, résumer ; corriger l'orthographe ou la langue du document (une coquille d'origine est recopiée telle quelle) ; omettre la moindre ligne (titres, texte, listes, tableaux, encadrés, formules, légendes).",
    "Fond identique : chiffres, unités, dates, pourcentages, noms propres et formules recopiés à l'IDENTIQUE, jamais arrondis ni convertis ; mot ou groupe de mots illisible → écrire [illisible] à sa place, ne DEVINE jamais.",
    "Intelligence de reconstruction — tu recrées le document, pas les coordonnées de la photo : ordre de lecture logique du document original (colonnes, encadrés : dans l'ordre où l'original les présentait) ; un tableau — même photographié de travers, en perspective, mal cadré ou n'importe où sur la page — devient un vrai tableau Markdown aligné, en-têtes déduits, à sa place dans le flux ; les mots coupés en fin de ligne par le retour à la ligne du document sont recollés en un seul mot ; la hiérarchie des titres (#, ##, ###) est déduite de la mise en page réelle du document, pas de la taille apparente dans le cliché.",
    "Mise en forme : Markdown propre (listes, tableaux alignés) ; typographie française (accents sur les majuscules, guillemets « », apostrophe typographique).",
    "Mathématiques en LaTeX fidèle : $…$ en ligne, $$…$$ en bloc (indices, exposants, \\frac{}{}, racines) — la formule du document, jamais « simplifiée ». Chimie : indices et exposants exacts ($MnO_2$, $^{14}C$).",
    "Figures, schémas, photos, captures : remplacés par ![figure](figure-N) numérotés dans l'ordre d'apparition — jamais décrits ni interprétés ; leur légende écrite est recopiée.",
    "Si les images sont des pages successives d'un même document, la reconstruction est un document continu — pas de mention de pages, pas de titres répétés.",
    "Réponse : uniquement le Markdown du document recréé — aucune introduction, aucune conclusion, aucune balise autour.",
  ].join('\n');

  /* Variantes « documents annotés » : elles ne créent rien, elles ne font que
     donner une destination à l'encre manuscrite — la copie reste la règle
     commune (rien d'inventé, [illisible] plutôt qu'une devinette). */
  const ANNOT_PRINTED = [
    'Document annoté : ce document mêle texte imprimé et écriture manuscrite (stylo, crayon : notes en marge, mots ajoutés, corrections, numéros, gribouillis).',
    'Ta recréation ne reproduit QUE le texte imprimé d\u2019origine. Tout le manuscrit est ignoré, sans exception — n\u2019en transcris pas un mot, où qu\u2019il soit : au-dessus du titre, dans les marges, entre les lignes, tout en bas de page. Une phrase manuscrite peut ressembler à un en-tête ou un pied de page de l\u2019ouvrage — elle n\u2019en est pas un : ne la recopie pas. Les soulignements et surlignages à la main ne sont pas reproduits non plus. Une ligne imprimée barrée ou corrigée à la main reste recopiée telle qu\u2019elle a été imprimée.',
  ].join('\n');
  const ANNOT_SEPARATE = [
    'Document annoté : ce document mêle texte imprimé et écriture manuscrite à la main. Réponse en DEUX parties, dans cet ordre, séparées par une seule ligne « --- » :',
    'PARTIE 1 : le titre « ## Texte imprimé », puis la recréation fidèle du seul imprimé, selon toutes les règles ci-dessus. Le manuscrit n\u2019y figure JAMAIS, où qu\u2019il soit. Une note manuscrite ressemble parfois à un titre, un en-tête de document ou une liste numérotée — si elle est écrite à la main (graphisme irrégulier, encre différente), c\u2019est du manuscrit : partie 2.',
    'PARTIE 2 : le titre « ## Annotations manuscrites », puis chaque annotation recopiée fidèlement entre « », groupée par emplacement en sous-titres gras — seulement les emplacements qui contiennent quelque chose, dans l\u2019ordre de haut en bas de la page :',
    '**Haut de page** : au-dessus du premier élément imprimé (titre compris), AVANT tout texte imprimé.',
    '**Marge** : dans les marges latérales, à gauche ou à droite des lignes de texte — jamais au-dessus ni au-dessous de l\u2019ensemble du texte.',
    '**Entre les lignes** : dans le corps du texte (mots ajoutés, corrections).',
    '**Bas de page** : en dessous de la dernière ligne de texte imprimé, en zone basse de la page, APRÈS tout le texte.',
    'Un bloc d\u2019écriture continu — plusieurs lignes de la même main, voisines — forme UNE seule annotation : recopiée d\u2019un tenant, sur une seule ligne ; les retours à la ligne du manuscrit deviennent des espaces.',
    'Pour une annotation en **Marge** ou **Entre les lignes**, précède-la de la référence des lignes imprimées qui lui font face : « (l. 4-9) » en utilisant la numérotation imprimée quand le document en comporte une (numéros 5, 10, 15…), sinon une estimation sobre en comptant les lignes du texte imprimé — la ligne 1 est la première ligne de texte après le titre. Pour **Haut de page** et **Bas de page**, pas de référence de ligne.',
    'Un passage imprimé souligné ou surligné à la main : une ligne « Souligné : « … » » avec le passage recopié, dans l\u2019emplacement qui convient. Une correction manuscrite qui remplace un mot imprimé : « Corrigé : « mot imprimé » → « mot manuscrit » ». Ne signale l\u2019un ou l\u2019autre QUE s\u2019il en existe un VISIBLEMENT sur la page ; au moindre doute sur son existence, n\u2019écris rien du tout.',
    'Copie uniquement — aucune interprétation, aucune reformulation de ce que dit le manuscrit. Un mot manuscrit illisible devient [illisible], jamais deviné.',
  ].join('\n');
  const ANNOT_MIXED = [
    'Document annoté : transcris TOUT ce qui est écrit sur la page — imprimé et manuscrit — dans l\u2019ordre de lecture exact, sans rien omettre.',
    'Chaque passage manuscrit est rendu entre « » immédiatement suivi de la mention [manuscrit] ; l\u2019illisible manuscrit devient [illisible]. Le reste suit toutes les règles ci-dessus.',
  ].join('\n');

  /* Option « Écarter en-têtes et pieds de page » (case à côté du bouton
     d'analyse) : la reconstruction a son équivalent — les mentions qui
     reviennent à l'identique sur chaque page sont du mobilier d'édition,
     pas du contenu. Les légendes et titres réels du document restent. */
  const HF_DROP = 'En-têtes et pieds de page répétitifs du document (numérotation des pages, mentions de collection ou d\u2019ouvrage qui reviennent à l\u2019identique sur chaque page) : ne les recrée PAS — ils ne sont pas du contenu. Tout ce qui porte une information propre au document (titre de partie, légende, source) est recréé normalement.';

  function visionSystemFor(annot, dropHf) {
    let sys = VISION_SYSTEM;
    if (dropHf) sys += '\n\n' + HF_DROP;
    if (annot === 'printed') sys += '\n\n' + ANNOT_PRINTED;
    else if (annot === 'separate') sys += '\n\n' + ANNOT_SEPARATE;
    else if (annot === 'mixed') sys += '\n\n' + ANNOT_MIXED;
    return sys;
  }

  /* Repérage du manuscrit : petit aller-retour vision sur les premières
     images, réponse attendue en JSON compact. Le doute (stylo présent ou
     non, où, quoi) se lève avant la reconstruction — jamais au milieu. */
  const DETECT_SYSTEM = [
    'Tu prépares une reconstruction documentaire. On te montre une ou plusieurs images d\u2019un même document.',
    'Réponds UNIQUEMENT par un objet JSON compact sur une seule ligne — aucun texte autour, aucune balise de code :',
    '{"handwriting": true, "printed": true, "summary": "…", "notes": [{"zone": "haut", "texte": "…"}], "souligne": false}',
    'handwriting : true si de l\u2019écriture manuscrite (stylo, crayon, marqueur) est présente, même partielle — notes en marge, mots ajoutés entre les lignes, corrections, titres ou numéros écrits à la main ; false sinon.',
    'printed : true si du texte imprimé est présent (police d\u2019imprimerie régulière, livre, polycopié).',
    'summary : une phrase brève en français disant où est le manuscrit et de quoi il s\u2019agit (ex. « notes au stylo en marge gauche et en bas de page, passages soulignés ») ; chaîne vide si aucun manuscrit.',
    'notes : la liste des éléments manuscrits DISTINCTS de la page, chacun recopié au mieux comme une seule zone de texte continu — jamais interprété ni reformulé, mot illisible rendu [illisible] ; au plus 12 notes, chaque texte de 160 caractères au plus ; zone, sans ambiguïté : "haut" = au-dessus du PREMIER élément imprimé (titre compris) / haut de page, "marge" = dans les marges LATÉRALES, à gauche ou à droite des lignes de texte — jamais au-dessus ni au-dessous de l\u2019ensemble du texte, "interligne" = dans le corps du texte imprimé, "bas" = en dessous de la DERNIÈRE ligne de texte imprimé, en zone basse de la page. Liste vide [] si aucun manuscrit.',
    'souligne : true si un passage imprimé est souligné ou surligné à la main.',
  ].join('\n');

  function parseDetect(out) {
    try {
      const m = String(out).match(/\{[\s\S]*\}/); // tolère les balises de code autour du JSON
      if (!m) return null;
      const j = JSON.parse(m[0]);
      if (typeof j !== 'object' || j === null) return null;
      const summary = typeof j.summary === 'string' ? j.summary.trim().replace(/\s+/g, ' ').slice(0, 180) : '';
      const ZONES = { haut: 'Haut de page', marge: 'Marge', interligne: 'Entre les lignes', bas: 'Bas de page' };
      const notes = [];
      for (const n of (Array.isArray(j.notes) ? j.notes : []).slice(0, 12)) {
        if (!n || typeof n !== 'object') continue;
        const txt = (typeof n.texte === 'string' ? n.texte : (typeof n.text === 'string' ? n.text : '')).trim().replace(/\s+/g, ' ').slice(0, 160);
        if (!txt) continue;
        notes.push({ zone: ZONES[String(n.zone || '').trim().toLowerCase()] || ZONES.marge, texte: txt });
      }
      return {
        handwriting: j.handwriting === true || notes.length > 0,
        printed: j.printed !== false,
        summary: summary || (notes.length ? 'écriture manuscrite repérée sur le document' : ''),
        notes,
        souligne: j.souligne === true,
      };
    } catch {
      return null;
    }
  }
  /* —— Réconciliation « documents annotés » ——
     Deux lectures de la MÊME image (le repérage, puis la reconstruction) ne
     dérivent jamais l'une de l'autre en sens : leurs différences sont de la
     reconnaissance de caractères. Le repérage livre donc un inventaire
     (zone + meilleure lecture) qui sert de filet :
     – les lignes de « Texte imprimé » qui recoupent une note repérée en
       sont retirées (fuite du stylo dans l'imprimé) ;
     – chaque note repérée absente de la section Annotations y est ajoutée,
     sous son emplacement, telle que le repérage l'a lue ;
     – la section « Annotations manuscrites » est reconstruite si le modèle
     l'a oubliée. Rien n'y entre qui n'ait été lu sur la page. */
  const normWords = (s) => String(s || '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 4); // mots courts : bruit de langue

  /* part de mots (≥4 lettres) de `note` présents dans `txt` */
  function containment(txt, note) {
    const big = new Set(normWords(txt));
    const small = normWords(note);
    if (!small.length) return 1;
    return small.filter((w) => big.has(w)).length / small.length;
  }

  const ANNOT_HEADING = '## Annotations manuscrites';

  function reconcileAnnots(out, annot, notes) {
    if (annot !== 'separate' && annot !== 'printed') return String(out || '');
    const list = (Array.isArray(notes) ? notes : []).filter((n) => n && n.texte);
    if (!list.length) return String(out || '');
    const text = String(out || '');
    const hx = text.indexOf(ANNOT_HEADING);

    // 1. « Texte imprimé » : en retirer toute ligne courte qui recoupe une note repérée
    const part1 = (hx >= 0 ? text.slice(0, hx) : text)
      .split('\n').filter((line) => {
        const t = line.trim();
        if (t.length < 4 || t.length > 220) return true; // ligne longue = texte imprimé
        return !list.some((n) => containment(t, n.texte) >= 0.72);
      }).join('\n');

    if (annot === 'printed') return part1.replace(/\n{3,}/g, '\n\n').trim();

    // 2. « Séparer » : garantir la section Annotations et chaque note repérée ;
    //    une note manquante est ajoutée sous son emplacement, telle que le
    //    repérage l'a lue sur la page
    let sec = hx >= 0 ? text.slice(hx)
      : (part1.replace(/\n*$/, '') + '\n\n---\n\n' + ANNOT_HEADING + '\n');
    for (const n of list) {
      if (containment(sec, n.texte) >= 0.6) continue; // déjà transcrite, à un OCR près
      const zhead = `**${n.zone}**`;
      const entry = `« ${n.texte} »`;
      const zi = sec.indexOf(zhead);
      if (zi >= 0) sec = sec.slice(0, zi + zhead.length) + '\n' + entry + sec.slice(zi + zhead.length);
      else sec = sec.replace(/\n*$/, '') + '\n\n' + zhead + '\n' + entry;
    }

    // 3. remise en place : une note transcrite sous un MAUVAIS emplacement
    //    (le modèle la met en « Entre les lignes » alors qu'elle est en bas de
    //    page, etc.) y est déplacée — entrées ligne à ligne, jamais les blocs
    //    longs du modèle
    const blocks = sec.split(/\n(?=\*\*)/);
    for (const n of list) {
      const zi = blocks.findIndex((b) => b.startsWith(`**${n.zone}**`));
      const zb = zi >= 0 ? blocks[zi] : null;
      if (zb && containment(zb, n.texte) >= 0.6) continue; // déjà au bon endroit
      const moves = [];
      for (let bi = 0; bi < blocks.length; bi++) {
        if (bi === zi) continue;
        blocks[bi] = blocks[bi].split('\n').filter((line) => {
          const t = line.trim();
          if (t.length < 4 || t.length > 220 || /^\*\*[^*]+\*\*$/.test(t)) return true; // titres et texte long : intouchables
          if (containment(t, n.texte) >= 0.72) { moves.push(t); return false; }
          return true;
        }).join('\n');
      }
      if (moves.length) {
        if (zi >= 0) {
          const lines = blocks[zi].split('\n');
          lines.splice(1, 0, ...moves); // juste sous le titre de l'emplacement
          blocks[zi] = lines.join('\n');
        } else {
          blocks.push(`**${n.zone}**\n${moves.join('\n')}`);
        }
      }
    }
    sec = blocks.join('\n');
    const res = hx >= 0 ? part1 + sec : sec;
    return res.replace(/\n{3,}/g, '\n\n').trim();
  }

  const VISION_MODEL_PREFS = ['pixtral-12b-2409', 'mistral-small-latest', 'pixtral-large-latest', 'mistral-medium-latest', 'ministral-14b-latest'];
  /* Documents annotés : le manuscrit est le cas difficile. Essais réels : un
     petit modèle laisse fuir les notes manuscrites du haut dans « Texte
     imprimé » ou range la note du bas dans « Haut de page », quand les gros
     modèles suivent la séparation — les gros passent donc en tête dès qu'un
     document est traité en mode annoté. */
  const VISION_ANNOT_PREFS = ['mistral-medium-latest', 'mistral-large-latest', 'pixtral-large-latest', 'mistral-small-latest', 'ministral-14b-latest'];
  const VISION_MAX_PAGES = 15;    // garde-fou volume/temps ; au-delà, toast avertit
  const VISION_CHUNK = 8;         // limite usuelle des modèles vision (images par requête)
  const VISION_LONG_EDGE = 1600;  // côté long d'une page rastérisée

  let pdfJsPromise = null;
  function ensurePdfJs() {
    if (!pdfJsPromise) {
      pdfJsPromise = loadScript('../../assets/vendor/pdfjs/pdf.min.js').then(() => {
        const lib = globalThis.pdfjsLib || window.pdfjsLib;
        if (!lib) throw new Error('pdfjs indisponible');
        lib.GlobalWorkerOptions.workerSrc = '../../assets/vendor/pdfjs/pdf.worker.min.js';
        return lib;
      }).catch((e) => { pdfJsPromise = null; throw e; });
    }
    return pdfJsPromise;
  }

  /* Pages d'un PDF -> data-URL JPEG (fond blanc, côté long ~1600 px). */
  async function pdfPagesToImages(item) {
    const pdfjsLib = await ensurePdfJs();
    const bytes = new Uint8Array(await item.file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const n = Math.min(pdf.numPages, VISION_MAX_PAGES);
    const urls = [];
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, VISION_LONG_EDGE / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // le JPEG n'a pas de transparence
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      urls.push(canvas.toDataURL('image/jpeg', 0.85));
      page.cleanup();
    }
    if (pdf.numPages > n) {
      window.toast(`${item.file.name} : reconstruction limitée aux ${n} premières pages.`, 'warn', 6500);
    }
    return urls;
  }

  /* Le document tel que le voit le modèle : l'image traitée (redressée), ou
     les pages PDF rastérisées. */
  function isPdfFile(item) {
    return (item.file.type || '').includes('pdf') || /\.pdf$/i.test(item.file.name);
  }

  /* Seuls les clichés se « reconstruisent » : photo, scan, PDF de scan. Les
     .docx/.pptx sont des documents numériques — la reconstruction IA n'y a
     rien à ignorer, ils restent extraits directement par l'OCR. */
  function isReconstructible(item) {
    return item.kind === 'image' || isPdfFile(item);
  }

  async function documentVisionImages(item) {
    if (item.kind === 'image') return [item.dataUrl || await prepareImage(item)];
    if (!isPdfFile(item)) throw new Error('reconstruction IA disponible pour les images et les PDF uniquement');
    return pdfPagesToImages(item);
  }

  /* Modèles vision réellement accessibles à la clé (liste /v1/models),
     préférences d'abord : le pic de reconstruction documentaire d'abord. */
  function pickVisionModel(ids) {
    const list = (Array.isArray(ids) ? ids : []).map((m) => String(m || ''));
    for (const id of VISION_MODEL_PREFS) if (list.includes(id)) return id;
    return list.find((id) => /pixtral|small|medium/i.test(id) && !/ocr|embed|moderation|code|nemo|ministral-8b/i.test(id)) || null;
  }

  let visionOrderCache = null;   // ordre des modèles vision de la liste standard
  let visionAnnotOrderCache = null; // ordre dédié aux documents annotés
  let visionModelCache = null;   // dernier modèle qui a réussi (passe en tête tant qu'il sert)

  async function ensureVisionOrder(key, prefs) {
    const list = prefs || VISION_MODEL_PREFS;
    const forAnnots = list === VISION_ANNOT_PREFS;
    if (forAnnots ? visionAnnotOrderCache : visionOrderCache) return forAnnots ? visionAnnotOrderCache : visionOrderCache;
    const res = await fetch(MODELS_URL, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw Object.assign(new Error(`liste des modèles inaccessible (HTTP ${res.status})`), { status: res.status });
    const data = await res.json().catch(() => null);
    const ids = ((data && data.data) || []).map((m) => m.id);
    const ordered = list.filter((id) => ids.includes(id));
    const order = ordered.length ? ordered : [pickVisionModel(ids)].filter(Boolean);
    if (!order.length) throw new Error('aucun modèle de vision accessible pour cette clé');
    if (forAnnots) visionAnnotOrderCache = order;
    else visionOrderCache = order;
    return order;
  }

  /* Ordre d'essai effectif : le modèle qui a déjà réussi passe en tête,
     sauf pour les documents annotés dont l'ordre dédié ne doit pas être
     court-circuité par un petit modèle repéré en détection. */
  function visionModelOrder(prefs) {
    const order = (prefs === VISION_ANNOT_PREFS ? visionAnnotOrderCache : visionOrderCache) || [];
    const pinApplies = visionModelCache && (!prefs || prefs.includes(visionModelCache));
    return pinApplies
      ? [visionModelCache, ...order.filter((m) => m !== visionModelCache)]
      : order;
  }

  async function askVision(model, images, key, attempt, opts) {
    const a = attempt || 1;
    const o = opts || {};
    const system = o.system || VISION_SYSTEM;
    const userText = o.userText
      || (images.length === 1
        ? 'Transcris fidèlement ce document.'
        : 'Transcris fidèlement ces pages du même document, dans l\u2019ordre, en une transcription continue.');
    const parts = [{
      type: 'text',
      text: userText,
    }];
    for (const u of images) parts.push({ type: 'image_url', image_url: u });
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: parts },
        ],
        temperature: 0,
      }),
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        if (err && (err.message || err.detail)) message = err.message || err.detail;
      } catch { /* garde le statut HTTP */ }
      if ((res.status >= 500 || res.status === 429) && a < 2) {
        await new Promise((r) => setTimeout(r, 1500 * a));
        return askVision(model, images, key, a + 1, opts);
      }
      throw Object.assign(new Error(message), { status: res.status });
    }
    const data = await res.json();
    const out = (((data.choices || [])[0] || {}).message?.content || '').trim();
    if (!out) throw new Error('réponse vide du modèle');
    return out;
  }

  /* ---------- Dialogue « éléments présents » (documents annotés) ----------
     Ouvert automatiquement quand il y a doute (du manuscrit est repéré et
     aucun choix n'est mémorisé), ou à tout moment depuis la ligne de
     préférences. Rend { mode, remember }, ou null si fermé sans choisir.
     « Mémoriser » persiste le choix dans la cascade de stockage : les
     documents suivants n'interrogent plus jamais. Deux dialogues ne
     s'affichent jamais en même temps (l'OCR analyse des fichiers en
     parallèle) : chacun attend le tour du précédent. */
  let annotDialogChain = Promise.resolve();
  function openAnnotDialog(cfg) {
    const run = annotDialogChain.then(() => new Promise((resolve) => {
      openAnnotDialogNow(cfg || {}, resolve);
    }));
    annotDialogChain = run.then(() => undefined, () => undefined); // la chaîne survit à tout
    return run;
  }

  function openAnnotDialogNow(cfg, resolve) {
    const pref = getAnnotPref();
    const wrap = document.createElement('div');
    wrap.className = 'dlg-wrap';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'annot-dlg-title');

    const dlg = document.createElement('div');
    dlg.className = 'glass dlg';

    const title = document.createElement('h3');
    title.id = 'annot-dlg-title';
    title.textContent = cfg.manual ? 'Annotations manuscrites — préférences' : 'Écriture manuscrite repérée';

    const intro = document.createElement('p');
    intro.textContent = cfg.manual
      ? 'Quand la reconstruction IA repère de l\u2019écriture manuscrite dans un document (notes au stylo, corrections, soulignements), elle peut être traitée de trois façons :'
      : `« ${cfg.fileName || 'ce document'} » semble annoté à la main${cfg.summary ? ` : ${cfg.summary}` : ''}. Que faut-il en faire pendant la reconstruction ?`;

    const choices = [
      { value: 'separate', label: 'Séparer', desc: 'Le texte imprimé d\u2019abord, puis une section « Annotations manuscrites » groupée par emplacement (haut de page, marge, bas de page) avec les lignes du texte concernées.' },
      { value: 'printed', label: 'Texte imprimé seul', desc: 'Le manuscrit est ignoré en entier : aucune note, aucun mot ajouté, aucune correction recopiés — le document est recréé comme si la page était propre.' },
      { value: 'mixed', label: 'Tout transcrire', desc: 'Imprimé et manuscrit mélangés, à l\u2019ordre de lecture du document ; les passages manuscrits sont rendus entre « » suivis de la mention [manuscrit].' },
    ];
    const list = document.createElement('div');
    list.className = 'dlg-opts';
    const radios = [];
    for (const c of choices) {
      const lab = document.createElement('label');
      lab.className = 'dlg-opt';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'annot-mode';
      input.value = c.value;
      input.checked = (pref.stored ? pref.mode : 'separate') === c.value;
      const box = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = c.label;
      const s = document.createElement('span');
      s.textContent = c.desc;
      box.append(b, s);
      lab.append(input, box);
      list.appendChild(lab);
      radios.push(input);
    }

    const rememberLab = document.createElement('label');
    rememberLab.className = 'dlg-remember';
    const rcb = document.createElement('input');
    rcb.type = 'checkbox';
    rcb.checked = cfg.manual ? pref.remember : !!pref.stored && pref.remember;
    const rtxt = document.createElement('span');
    rtxt.textContent = 'Mémoriser ce choix — ne plus me demander pour les prochains documents';
    rememberLab.append(rcb, rtxt);

    const actions = document.createElement('div');
    actions.className = 'dlg-actions';

    const close = (result) => {
      wrap.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
    };

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'btn btn-ghost';
    btnCancel.textContent = 'Annuler';
    btnCancel.addEventListener('click', () => close(null));

    const btnOk = document.createElement('button');
    btnOk.type = 'button';
    btnOk.className = 'btn btn-primary';
    btnOk.textContent = cfg.manual ? 'Enregistrer' : 'Analyser avec ce réglage';
    btnOk.addEventListener('click', () => {
      const sel = radios.find((r) => r.checked);
      close(sel ? { mode: sel.value, remember: rcb.checked } : null);
    });

    actions.append(btnCancel, btnOk);
    dlg.append(title, intro, list, rememberLab, actions);
    wrap.appendChild(dlg);
    document.body.appendChild(wrap);

    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(null); }); // clic sur le fond : sortie prudente
    (radios.find((r) => r.checked) || radios[0]).focus();
  }

  /* Repérage du stylo : la première tranche d'images suffit la plupart du
     temps (la photo annotée est une seule page). Tout échec (réseau, quota,
     JSON illisible, modèle sans vision) dégrade silencieusement vers la
     reconstruction classique — jamais une file bloquée sur une question. */
  async function detectHandwriting(images, key) {
    if (!images.length) return null;
    try {
      /* Repérage sur l'ordre « annoté » (gros d'abord) : son inventaire du
         manuscrit nourrit le résumé du dialogue ET le filet de réconciliation —
         la lecture du stylo y doit être la meilleure (essais réels : sur la
         même page, l'inventaire du petit modèle saute les notes du haut). */
      await ensureVisionOrder(key, VISION_ANNOT_PREFS);
      const order = visionModelOrder(VISION_ANNOT_PREFS);
      for (const model of order.slice(0, 2)) {
        try {
          const out = await askVision(model, images, key, 1, {
            system: DETECT_SYSTEM,
            userText: 'Analyse ce document et réponds par le seul JSON demandé.',
          });
          const det = parseDetect(out);
          if (det) return det;
        } catch (e) {
          // 400/404/415/422 : modèle absent de la clé ou images refusées → essayer le suivant
          if (e && (e.status === 400 || e.status === 404 || e.status === 415 || e.status === 422)) continue;
          return null;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  /* Décision pour ce document — le repérage court TOUJOURS (il fournit aussi
     l'inventaire des notes qui sert de filet à la réconciliation), mais la
     question n'est posée que si aucun choix n'est mémorisé.
     Rend 'separate' | 'printed' | 'mixed', null si aucun manuscrit repéré,
     ou 'canceled' si le dialogue a été fermé sans choix. */
  async function resolveAnnotMode(item, images, key) {
    const pref = getAnnotPref();
    try {
      setProgressLabel(`Repérage des annotations : ${item.file.name}`);
      const det = await detectHandwriting(images.slice(0, VISION_CHUNK), key);
      item.detNotes = (det && Array.isArray(det.notes)) ? det.notes : [];
      if (!det || !det.handwriting) return null;
      if (pref.stored && pref.remember) return pref.mode; // mémorisé : appliqué en silence
      const choice = await openAnnotDialog({ fileName: item.file.name, summary: det.summary });
      if (!choice) return 'canceled';
      store.set(LS_ANNOTS_MODE, choice.mode);
      store.set(LS_ANNOTS_REMEMBER, choice.remember ? '1' : '0');
      refreshAnnotRow();
      return choice.mode;
    } catch {
      item.detNotes = [];
      return null; // repérage impossible : reconstruction classique, fidèle à tout
    }
  }

  async function iaReconstruct(item, key) {
    const images = await documentVisionImages(item);
    if (!images.length) throw new Error('aucune page à reconstruire');
    if (item.kind !== 'image') item.pages = images.length; // PDF rastérisé : badge « N pages » de la carte

    /* Documents annotés : le traitement du manuscrit est réglé avant de
       reconstruire (mémorisé, ou demandé au premier repérage), et commande
       l'ordre des modèles — les gros d'abord pour ces documents-là. */
    const annot = await resolveAnnotMode(item, images, key);
    if (annot === 'canceled') throw new Error('reconstruction interrompue : traitement des annotations non choisi — règle-le dans « Annotations manuscrites » puis relance');
    item.annotMode = (annot === 'separate' || annot === 'printed' || annot === 'mixed') ? annot : null;
    const system = visionSystemFor(item.annotMode, !!(els.cleanHf && els.cleanHf.checked));
    const annotPrefs = item.annotMode ? VISION_ANNOT_PREFS : null;

    await ensureVisionOrder(key, annotPrefs);
    const order = visionModelOrder(annotPrefs);

    /* L'inventaire du repérage accompagne la demande : une note difficile à
       lire n'est plus jamais omise — le modèle reconstruit, le repérage oriente. */
    let userText = images.length === 1
      ? 'Recrée de zéro ce document : le document original, propre, sans aucune trace du scan.'
      : 'Recrée de zéro ces pages du même document, dans l\u2019ordre, en un seul document continu — l\u2019original, propre, sans aucune trace du scan.';
    if (item.annotMode && item.detNotes && item.detNotes.length) {
      const inv = item.detNotes.slice(0, 12).map((n) => `« ${n.texte} » (${n.zone})`).join(' ; ');
      userText += ` Éléments manuscrits repérés sur les premières images (lecture approximative du repérage) : s\u2019ils sont visibles, ne les omets pas — recopie ta propre lecture, sans rien inventer. Inventaire : ${inv}.`;
    }

    /* Les pages en tranches (limite usuelle de 8 images par requête). */
    const chunks = [];
    for (let i = 0; i < images.length; i += VISION_CHUNK) chunks.push(images.slice(i, i + VISION_CHUNK));

    let lastErr = null;
    let out = '';
    for (const model of order.slice(0, 3)) { // au plus 3 modèles essayés (clés restreintes)
      try {
        out = '';
        for (const chunk of chunks) out += (out ? '\n\n' : '') + await askVision(model, chunk, key, 1, { system, userText });
        visionModelCache = model;
        break;
      } catch (e) {
        // 400/404/415/422 : modèle absent de la clé ou images refusées → modèle suivant
        if (e && (e.status === 400 || e.status === 404 || e.status === 415 || e.status === 422)) { lastErr = e; continue; }
        throw e;
      }
    }
    if (!out) throw lastErr || new Error('reconstruction impossible');
    return reconcileAnnots(out, item.annotMode, item.detNotes); // filet : fuites retirées, notes manquantes ajoutées
  }

  /* ---------- PDF « texte sélectionnable » (image du scan + calque invisible) ---------- */
  /* Récupère les blocs OCR avec leurs bbox (px de l'image, origine haut-gauche).
     Modèle récent : pages[].blocks (top_left_x… bottom_right_y, content, ordre de lecture).
     Anciens modèles : pages[].bbox avec segments imbriqués (bbox [MinX, MaxX, MinY, MaxY]). */
  function collectOcrBlocks(page) {
    const segments = []; // {x0, y0, x1, y1, text} — texte du calque
    const rects = [];    // bbox de tous les blocs — garde-fou du détourage
    const dims = {
      w: Number(page.dimensions?.width) || null,
      h: Number(page.dimensions?.height) || null,
    };
    const toPx = (b) => {
      let [x0, x1, y0, y1] = b.map(Number);
      if (![x0, x1, y0, y1].every(Number.isFinite)) return null;
      const maxV = Math.max(x0, x1, y0, y1);
      if (maxV <= 1.05 && dims.w && dims.h) { // fractions normalisées [0..1]
        x0 *= dims.w; x1 *= dims.w; y0 *= dims.h; y1 *= dims.h;
      }
      return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1) };
    };

    if (Array.isArray(page.blocks)) {
      for (const blk of page.blocks) {
        if (!blk) continue;
        const r = toPx([blk.top_left_x, blk.bottom_right_x, blk.top_left_y, blk.bottom_right_y]);
        if (!r) continue;
        rects.push(r);
        if (blk.content) segments.push({ ...r, text: blk.content });
      }
    } else if (Array.isArray(page.bbox)) {
      for (const el of page.bbox) {
        if (!el || !Array.isArray(el.bbox)) continue;
        const r = toPx(el.bbox);
        if (!r) continue;
        rects.push(r);
        const segs = Array.isArray(el.segments) ? el.segments : [];
        if (segs.length) {
          for (const s of segs) {
            if (!s || !s.text) continue;
            const sr = Array.isArray(s.bbox) ? toPx(s.bbox) : r;
            if (sr) segments.push({ ...sr, text: s.text });
          }
        } else if (el.text) {
          segments.push({ ...r, text: el.text });
        }
      }
    }
    return { segments, rects };
  }

  /* Décode une image en bitmap pour le canvas (dims + prétraitements).
     Accepte aussi bien un File (fichier d'origine) qu'un Blob (canvas JPEG). */
  async function decodeBitmap(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob); } catch { /* repli <img> */ }
    }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Image illisible.'));
        img.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    }
    return img;
  }

  const bitmapDims = (bmp) => ({ w: bmp.naturalWidth || bmp.width, h: bmp.naturalHeight || bmp.height });

  /* Détourage du scan : détecte la page claire sur fond plus sombre (la table autour
     de la feuille scannée). Ne coupe jamais une zone contenant un bloc OCR. */
  async function detectPageTrim(item, bmp) {
    try {
      const { w: imgW, h: imgH } = bitmapDims(bmp);
      if (!imgW || !imgH) return null;
      const k = Math.min(1, 1400 / Math.max(imgW, imgH)); // travaille sur une version réduite
      const w = Math.max(4, Math.round(imgW * k));
      const h = Math.max(4, Math.round(imgH * k));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;

      const row = new Float32Array(h);
      const colFull = new Float32Array(w);
      for (let y = 0; y < h; y++) {
        let s = 0;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const v = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
          s += v; colFull[x] += v;
        }
        row[y] = s / w;
      }
      for (let x = 0; x < w; x++) colFull[x] /= h;

      const ins = window.PdfOcr.insetsFromProfiles(row, colFull, w, h);
      if (!ins) return null;

      // colonnes re-mesurées dans la bande verticale de la page (hors bandes table haut/bas)
      const bandTop = ins.top, bandBottom = ins.bottom;
      if (h - bandTop - bandBottom < 2) return null;
      const col = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let y = bandTop; y < h - bandBottom; y++) {
          const i = (y * w + x) * 4;
          s += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
        }
        col[x] = s / (h - bandTop - bandBottom);
      }
      const ins2 = window.PdfOcr.insetsFromProfiles(row, col, w, h);
      if (!ins2) return null;

      const box = {
        left: Math.floor(ins2.left / k),
        top: Math.floor(ins.top / k),
        right: Math.floor(ins2.right / k),
        bottom: Math.floor(ins.bottom / k),
      };

      // garde-fou : ne jamais couper un bloc OCR détecté (texte, figure, tableau)
      const rects = item.rects || [];
      if (rects.length) {
        const padX = Math.max(2, Math.round(imgW * 0.006));
        const padY = Math.max(2, Math.round(imgH * 0.006));
        box.left = Math.min(box.left, Math.max(0, Math.floor(Math.min(...rects.map((r) => r.x0)) - padX)));
        box.top = Math.min(box.top, Math.max(0, Math.floor(Math.min(...rects.map((r) => r.y0)) - padY)));
        box.right = Math.min(box.right, Math.max(0, Math.floor(imgW - Math.max(...rects.map((r) => r.x1)) - padX)));
        box.bottom = Math.min(box.bottom, Math.max(0, Math.floor(imgH - Math.max(...rects.map((r) => r.y1)) - padY)));
      }

      // marges déjà minimes : scan propre, rien à détourer
      if ((box.left + box.right) / imgW < 0.01 && (box.top + box.bottom) / imgH < 0.01) return null;
      return box;
    } catch {
      return null; // détourage impossible : PDF plein cadre sur l'image originale
    }
  }

  /* Octets intégrables dans le PDF : JPEG/PNG d'origine (sans recompression),
     autres formats (WEBP, GIF…) convertis en PNG via canvas. */
  async function toEmbeddableBytes(file, bmp) {
    const type = (file.type || '').toLowerCase();
    if (type === 'image/jpeg' || type === 'image/jpg') {
      return { bytes: new Uint8Array(await file.arrayBuffer()), mime: 'image/jpeg' };
    }
    if (type === 'image/png') {
      return { bytes: new Uint8Array(await file.arrayBuffer()), mime: 'image/png' };
    }
    const { w, h } = bitmapDims(bmp);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0);
    const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Conversion PNG impossible.');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/png' };
  }

  /* ---------- Analyse d'image (pour redressement + éclairage) ----------
     Une seule copie réduite (600 px côté long) sert aux deux estimations :
     angle d'inclinaison (profil de projection sur l'encre) et hétérogénéité
     d'éclairage (luminance moyenne par ligne/colonne). */
  function analyzeImage(bmp) {
    const { w: imgW, h: imgH } = bitmapDims(bmp);
    if (!imgW || !imgH) return null;
    const k = Math.min(1, 600 / Math.max(imgW, imgH));
    const w = Math.max(64, Math.round(imgW * k));
    const h = Math.max(64, Math.round(imgH * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, w, h };
  }

  /* Angle d'inclinaison : seuil d'Otsu sur la zone centrale (exclut la table
     et les coins du scanneur), pixels d'encre sous le seuil, meilleur angle
     par profil de projection (pdfocr.bestSkewAngle). null si rien de net. */
  function estimateSkewFromAnalysis(an) {
    try {
      if (!an) return null;
      const { data, w, h } = an;

      // zone centrale : le peigne de lignes, sans bords de table ni coins
      const x0 = Math.floor(w * 0.12), x1 = Math.ceil(w * 0.88);
      const y0 = Math.floor(h * 0.08), y1 = Math.ceil(h * 0.92);

      // seuil d'Otsu sur la luminance de la zone centrale
      const hist = new Uint32Array(256);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          hist[(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0]++;
          count++;
        }
      }
      if (!count) return null;
      let sum = 0;
      for (let t = 0; t < 256; t++) sum += t * hist[t];
      let sumB = 0, wB = 0, thr = 0, bestVar = -1;
      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (!wB) continue;
        const wF = count - wB;
        if (!wF) break;
        sumB += t * hist[t];
        const mB = sumB / wB, mF = (sum - sumB) / wF;
        const v = wB * wF * (mB - mF) * (mB - mF);
        if (v > bestVar) { bestVar = v; thr = t; }
      }
      if (thr >= 254) return null; // pas de séparation nette : image très sombre ou vide

      // pixels d'encre sous le seuil (sous-échantillonnés s'ils sont trop nombreux)
      let inkCount = 0;
      for (let t = 0; t <= thr; t++) inkCount += hist[t];
      if (inkCount < 256) return null;
      const stride = Math.max(1, Math.ceil(inkCount / 90000));
      const xs = [], ys = [];
      let seen = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          if (((data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0) > thr) continue;
          if (seen++ % stride) continue;
          xs.push(x); ys.push(y);
        }
      }
      return window.PdfOcr.bestSkewAngle(Float32Array.from(xs), Float32Array.from(ys), w, h);
    } catch {
      return null; // estimation impossible : pas de redressement
    }
  }

  /* Rotation d'image sans perte de contenu : canevas agrandi pour contenir
     l'image tournée entière (pdfocr.rotationSize), coins remplis avec la
     couleur moyenne du pourtour (souvent la table du scanneur). Synchrone et
     déterministe — l'envoi à l'API et l'export PDF obtiennent les mêmes
     pixels aux mêmes coordonnées, donc les bbox OCR restent alignées. */
  function rotateToCanvas(bmp, angleDeg) {
    const { w, h } = bitmapDims(bmp);
    const size = window.PdfOcr.rotationSize(w, h, angleDeg);

    const cvS = document.createElement('canvas');
    cvS.width = w; cvS.height = h;
    const ctxS = cvS.getContext('2d', { willReadFrequently: true });
    ctxS.drawImage(bmp, 0, 0);
    let br = 0, bg = 0, bb = 0, bn = 0;
    const stripMean = (sx, sy, sw, sh) => {
      const d = ctxS.getImageData(sx, sy, sw, sh).data;
      for (let i = 0; i < d.length; i += 4) { br += d[i]; bg += d[i + 1]; bb += d[i + 2]; bn++; }
    };
    stripMean(0, 0, w, 2); stripMean(0, Math.max(0, h - 2), w, 2);
    stripMean(0, 0, 2, h); stripMean(Math.max(0, w - 2), 0, 2, h);
    const fill = bn ? `rgb(${Math.round(br / bn)},${Math.round(bg / bn)},${Math.round(bb / bn)})` : '#0a0a0a';

    const cv = document.createElement('canvas');
    cv.width = size.w; cv.height = size.h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high'; // texte tranchant après rotation
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.translate(size.w / 2, size.h / 2);
    ctx.rotate(-angleDeg * Math.PI / 180); // signe : aplatit un texte qui descend vers la droite
    ctx.drawImage(bmp, -w / 2, -h / 2);
    return cv;
  }

  function canvasToJpeg(cv, quality) {
    return new Promise((resolve, reject) => {
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error('Traitement de l’image impossible.'))), 'image/jpeg', quality == null ? 0.95 : quality);
    });
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Lecture du fichier impossible.'));
      r.readAsDataURL(blob);
    });
  }

  /* Lecture d'une image pour l'API : redressement systématique et silencieux
     des scans penchés (signalé sur la carte : « redressé X° »). L'image
     traitée devient la référence de toute la suite — bbox OCR (calque
     texte), détourage et export PDF tombent tous dans son repère. */
  async function prepareImage(item) {
    item.skew = 0;
    let bmp = null;
    try {
      await ensurePdfOcr(); // bestSkewAngle / rotationSize, sans pdf-lib
      bmp = await decodeBitmap(item.file);
      const est = estimateSkewFromAnalysis(analyzeImage(bmp));
      if (!est) return readAsDataURL(item.file);
      const blob = await canvasToJpeg(rotateToCanvas(bmp, est.angle));
      item.skew = est.angle;
      return blobToDataURL(blob);
    } catch {
      return readAsDataURL(item.file); // prétraitement impossible : image d'origine
    } finally {
      if (bmp && bmp.close) { try { bmp.close(); } catch { /* déjà fermée */ } }
    }
  }

  /* Prépare la page PDF d'un scan : image de référence (redressée à l'analyse
     quand le scan était penché — les blocs OCR sont déjà dans son repère). */
  async function buildPdfPageSpec(item) {
    let bytes = null, mime = null, bmp = null;
    try {
      if (item.skew) {
        const raw = await decodeBitmap(item.file);
        let cv = null;
        try {
          cv = rotateToCanvas(raw, item.skew);
        } finally {
          if (raw && raw.close) { try { raw.close(); } catch { /* déjà fermée */ } }
        }
        const blob = await canvasToJpeg(cv);
        bytes = new Uint8Array(await blob.arrayBuffer());
        mime = 'image/jpeg';
        bmp = await decodeBitmap(blob); // mêmes géométrie et coordonnées que l'image envoyée à l'API
      } else {
        bmp = await decodeBitmap(item.file);
      }
      const { w, h } = bitmapDims(bmp);
      let trim = null;
      if (els.trimPage && els.trimPage.checked) trim = await detectPageTrim(item, bmp);
      if (!bytes) ({ bytes, mime } = await toEmbeddableBytes(item.file, bmp));
      return { bytes, mime, widthPx: w, heightPx: h, dpi: item.dpi || null, trim, segments: item.segments || [] };
    } finally {
      if (bmp && bmp.close) { try { bmp.close(); } catch { /* déjà fermée */ } }
    }
  }

  /* ---------- Progression du scan ----------
     Barre à deux états : « running » (remplissage dégradé, comète sur le
     bord d'avancement, reflet balayant la piste) puis « done » (dégradé
     vert, chiffres validés) ; fondu puis masquée deux secondes plus tard. */
  let progressTimer = null;

  function setProgress(done, total) {
    const safeTotal = Math.max(1, total);
    const pct = Math.round((done / safeTotal) * 100);
    els.progressBar.style.width = `${pct}%`;
    els.progressWrap.setAttribute('aria-valuenow', String(pct));
    els.progressWrap.setAttribute('aria-valuetext',
      `${done} sur ${safeTotal} document${safeTotal > 1 ? 's' : ''} analysé${done > 1 ? 's' : ''}`);
    if (els.progressCount) {
      els.progressCount.textContent = `${done}/${safeTotal} document${safeTotal > 1 ? 's' : ''}`;
    }
  }

  function setProgressLabel(txt) {
    if (els.progressLabel) els.progressLabel.textContent = txt;
  }

  function startProgress(total) {
    clearTimeout(progressTimer);
    els.progressWrap.classList.remove('hidden', 'done', 'fade');
    els.progressWrap.classList.add('running');
    els.progressBar.style.width = '0%';
    setProgress(0, total);
    setProgressLabel('Analyse en cours…');
  }

  function finishProgress() {
    const okN = queue.filter((q) => q.status === 'ok').length;
    const errN = queue.filter((q) => q.status === 'err').length;
    els.progressWrap.classList.remove('running');
    els.progressWrap.classList.add('done');
    setProgressLabel(errN
      ? `Terminé — ${okN} document${okN > 1 ? 's' : ''} analysé${okN > 1 ? 's' : ''}, ${errN} en échec`
      : `Analyse terminée — ${okN} document${okN > 1 ? 's' : ''} traité${okN > 1 ? 's' : ''}`);
    progressTimer = setTimeout(() => {
      els.progressWrap.classList.add('fade');
      progressTimer = setTimeout(() => {
        els.progressWrap.classList.add('hidden');
        els.progressWrap.classList.remove('fade', 'done');
        els.progressBar.style.width = '0%';
      }, 450);
    }, 2400);
  }

  /* ---------- Lancement ---------- */
  els.run.addEventListener('click', async () => {
    const key = getKey();
    if (!key) {
      window.toast('Enregistre d’abord ta clé API Mistral.', 'err');
      els.key.focus();
      return;
    }
    const todo = queue.filter((q) => q.status === 'pending' || q.status === 'err');
    if (!todo.length) return;

    running = true;
    els.run.classList.add('loading');
    startProgress(todo.length);
    renderQueue();

    let done = queue.filter((q) => q.status === 'ok').length;
    const total = done + todo.length;
    const updateProgress = () => {
      setProgress(done, total);
    };
    updateProgress();

    // Pool de workers : CONCURRENCY fichiers analysés en parallèle, le reste en file.
    let cursor = 0;
    const worker = async (startDelay) => {
      if (startDelay) await new Promise((r) => setTimeout(r, startDelay));
      while (cursor < todo.length) {
        const item = todo[cursor++];
        setItemStatus(item, 'working');
        setProgressLabel(`Analyse : ${item.file.name}`);
        try {
          const recre = getMode() === 'ia' && isReconstructible(item);
          const takeFigs = recre && !!(els.includeImages && els.includeImages.checked);
          if (!item.dataUrl && (item.kind === 'image' || !recre || takeFigs)) {
            item.dataUrl = item.kind === 'image'
              ? await prepareImage(item)
              : await readAsDataURL(item.file);
          }
          if (recre) {
            /* Mode Recréé par IA : pas d'OCR préalable pour le texte — le
               modèle vision relit les images et recrée le document de zéro ;
               les artefacts du scan (penché, table, cadrage) ne traversent
               pas. Figures : « Inclure les images » cochée → la chaîne se
               remet à l'endroit : l'OCR moissonne les figures d'origine en
               parallèle de la reconstruction et elles sont soudées à leurs
               repères. Moisson ratée : repères texte, jamais bloquant. */
            setProgressLabel(`Reconstruction IA : ${item.file.name}`);
            const [md, figs] = await Promise.all([
              iaReconstruct(item, key),
              takeFigs
                ? harvestFigures(item, key).catch((e) => {
                    window.toast(`Figures non récupérées pour ${item.file.name} — repères texte conservés (${e && e.message ? e.message : e}).`, 'warn', 7000);
                    return null;
                  })
                : Promise.resolve(null),
            ]);
            item.markdown = repairTables(takeFigs ? graftFigures(md, figs, item) : md);
            item.recreated = true;
            item.status = 'ok';
            window.toast(`Document reconstruit : ${item.file.name}`, 'ok');
          } else {
            await callOcr(item, key, 1);
            item.status = 'ok';
            if (getMode() === 'ia') {
              // .docx/.pptx : documents numériques — rien à reconstruire, extraction directe
              window.toast(`${item.file.name} : document numérique — contenu extrait directement, sans reconstruction IA.`, 'info', 7000);
            } else {
              window.toast(`OCR terminé : ${item.file.name}`, 'ok');
            }
            if (Number.isFinite(item.confScore) && item.confScore !== null && item.confScore < 0.7) {
              window.toast(`${item.file.name} : reconnaissance peu fiable (${Math.round(item.confScore * 100)} %) — relis le texte extrait.`, 'warn', 6500);
            }
          }
          item.dataUrl = null; // libère le base64 en mémoire (après la lecture vision)
        } catch (err) {
          item.status = 'err';
          item.error = friendlyError(err);
          window.toast(`${item.file.name} — ${item.error}`, 'err', 6000);
        }
        done++;
        updateProgress();
        renderQueue();
        if (item.status === 'ok') {
          try { await addResultCard(item); } catch { /* aperçu raté : le markdown reste copiable */ }
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, todo.length) }, (_, i) => worker(i * STAGGER_MS))
    );

    running = false;
    els.run.classList.remove('loading');
    renderQueue();
    refreshResultsVisibility();
    finishProgress();
  });

  /* ---------- Résultats ---------- */
  function refreshResultsVisibility() {
    const oks = queue.filter((q) => q.status === 'ok');
    const has = oks.length > 0;
    els.empty.classList.toggle('hidden', has);
    els.copyAll.classList.toggle('hidden', !has);
    if (els.pdfAll) {
      const imageOks = oks.filter((q) => q.kind === 'image');
      const segAny = imageOks.some((q) => (q.segments || []).length > 0);
      els.pdfAll.classList.toggle('hidden', imageOks.length < 1);
      els.pdfAll.textContent = `PDF combiné (${imageOks.length} feuille${imageOks.length > 1 ? 's' : ''})`;
      els.pdfAll.title = segAny
        ? 'Un seul PDF : chaque scan tel qu\u2019il est, texte invisible sélectionnable, détourage éventuel'
        : 'Un seul PDF : les feuilles telles quelles (documents recréés par l\u2019IA — sans calque de texte), détourage éventuel';
    }
  }

  async function addResultCard(item) {
    const card = document.createElement('article');
    card.className = 'glass result-card';

    const head = document.createElement('div');
    head.className = 'result-head';

    const name = document.createElement('span');
    name.className = 'rname'; name.textContent = item.file.name; name.title = item.file.name;

    const pages = document.createElement('span');
    pages.className = 'rpages';
    pages.textContent = item.kind !== 'image' && item.pages > 1 ? `${item.pages} pages` : '';

    // fiabilité de reconnaissance telle que renvoyée par l'API
    let scoreSpan = null;
    if (Number.isFinite(item.confScore) && item.confScore !== null && item.confScore >= 0) {
      const pct = Math.round(item.confScore * 100);
      scoreSpan = document.createElement('span');
      scoreSpan.className = `rscore ${pct >= 85 ? 'ok' : pct >= 70 ? 'warn' : 'err'}`;
      scoreSpan.textContent = `${pct} % fiable`;
      scoreSpan.title = pct >= 70
        ? 'Fiabilité de la page la moins sûre du document (score renvoyé par l\u2019API Mistral)'
        : 'Page la moins sûre du document (score de reconnaissance renvoyé par l\u2019API Mistral) : relis ce texte';
    }

    const box = item.kind === 'image' && item.skew ? document.createElement('span') : null;
    if (box) {
      box.className = 'rpages';
      box.textContent = `redressé ${String(Math.abs(item.skew)).replace('.', ',')}°`;
      box.title = "Scan penché détecté et redressé avant l'analyse — caractères, tableaux et calque texte alignés sur l'image corrigée.";
    }

    // traitement appliqué au manuscrit repéré (reconstruction IA)
    const annotSpan = item.annotMode ? document.createElement('span') : null;
    if (annotSpan) {
      annotSpan.className = 'rscore annot';
      annotSpan.textContent = ANNOT_BADGES[item.annotMode];
      annotSpan.title = 'Traitement des annotations manuscrites appliqué pendant la reconstruction (modifiable dans « Annotations manuscrites », en haut de page).';
    }

    const seg = document.createElement('span');
    seg.className = 'seg';
    const btnPreview = document.createElement('button');
    btnPreview.type = 'button'; btnPreview.textContent = 'Aperçu'; btnPreview.className = 'active';
    const btnSource = document.createElement('button');
    btnSource.type = 'button'; btnSource.textContent = 'Markdown';
    seg.append(btnPreview, btnSource);

    /* Texte affiché : la reconnaissance OCR, ou le document recréé par l'IA
       selon le mode — il n'y a qu'une version par document désormais. */
    const current = item.markdown;

    const btnCopy = document.createElement('button');
    btnCopy.type = 'button'; btnCopy.className = 'btn btn-sm'; btnCopy.textContent = 'Copier';
    btnCopy.title = 'Copier le texte affiché';
    btnCopy.addEventListener('click', () => copyText(current, 'Copié.'));

    const btnHtml = document.createElement('button');
    btnHtml.type = 'button'; btnHtml.className = 'btn btn-ghost btn-sm'; btnHtml.textContent = 'HTML';
    btnHtml.title = 'Copier la version affichée en HTML riche (coller dans Word / Google Docs avec Ctrl+V)';
    btnHtml.addEventListener('click', () => copyRichHtml(current, item.images));

    const base = item.file.name.replace(/\.[^.]+$/, '');

    const btnDl = document.createElement('button');
    btnDl.type = 'button'; btnDl.className = 'btn btn-ghost btn-sm'; btnDl.textContent = '.md';
    btnDl.title = `Télécharger le texte en .md${item.recreated ? ' — le document recréé' : ''}`;
    btnDl.addEventListener('click', () => {
      download(`${base}${item.recreated ? '' : '.ocr'}.md`, current);
      window.toast('Fichier .md téléchargé.', 'ok');
    });

    const btnDocx = document.createElement('button');
    btnDocx.type = 'button'; btnDocx.className = 'btn btn-ghost btn-sm'; btnDocx.textContent = '.docx';
    btnDocx.title = 'Télécharger un document Word éditable (.docx) de la version affichée';
    btnDocx.addEventListener('click', async () => {
      btnDocx.disabled = true; btnDocx.classList.add('loading');
      try {
        await ensureDocx();
        const blob = await window.Md2Docx.mdToDocxBlob(current, item.file.name, item.images, item.imageDims);
        downloadBlob(`${base}${item.recreated ? '' : '.ocr'}.docx`, blob);
        window.toast('Document Word .docx téléchargé — éditable dans Word / LibreOffice.', 'ok');
      } catch (e) {
        window.toast('Export .docx impossible : ' + (e && e.message ? e.message : e), 'err');
      } finally {
        btnDocx.disabled = false; btnDocx.classList.remove('loading');
      }
    });

    /* PDF « texte sélectionnable » : le scan tel quel + calque de texte invisible.
       Document recréé par l'IA : pas de blocs OCR — la feuille seule, sans calque. */
    const btnPdf = document.createElement('button');
    btnPdf.type = 'button'; btnPdf.className = 'btn btn-ghost btn-sm'; btnPdf.textContent = 'PDF';
    btnPdf.title = item.recreated
      ? 'Télécharger un PDF de la feuille telle quelle (le document recréé ne fournit pas de calque de texte)'
      : 'Télécharger un PDF à texte sélectionnable : la feuille telle qu\u2019elle est, texte invisible par-dessus';
    btnPdf.addEventListener('click', async () => {
      btnPdf.disabled = true; btnPdf.classList.add('loading');
      try {
        const searchable = !!(item.segments && item.segments.length);
        if (!searchable) {
          window.toast(item.recreated
            ? 'Reconstruction IA : le PDF garde la feuille telle quelle, sans calque de texte.'
            : 'Blocs de texte non renvoyés par l\u2019API — le PDF n\u2019aura pas de calque sélectionnable.', 'warn', 6000);
        }
        await ensurePdfLib();
        const spec = await buildPdfPageSpec(item);
        const bytes = await window.PdfOcr.buildSearchablePdf([spec], base);
        downloadBlob(`${base}${item.recreated ? '' : '.ocr'}.pdf`, new Blob([bytes], { type: 'application/pdf' }));
        window.toast(searchable ? 'PDF téléchargé — le texte est sélectionnable dans le document.' : 'PDF téléchargé.', 'ok', 5200);
      } catch (e) {
        window.toast('Export PDF impossible : ' + (e && e.message ? e.message : e), 'err', 6000);
      } finally {
        btnPdf.disabled = false; btnPdf.classList.remove('loading');
      }
    });

    head.append(name, pages);
    if (scoreSpan) head.append(scoreSpan);
    if (box) head.append(box);
    if (annotSpan) head.append(annotSpan);
    head.append(seg, btnCopy, btnHtml, btnDl, btnDocx);
    if (item.kind === 'image') head.append(btnPdf);
    /* Document recréé : le PDF qui va au bout de la chaîne à l'envers —
       texte recréé + figures, composés en A4 à l'impression. */
    if (item.recreated && item.markdown) {
      const btnPrint = document.createElement('button');
      btnPrint.type = 'button'; btnPrint.className = 'btn btn-ghost btn-sm'; btnPrint.textContent = 'PDF recréé';
      btnPrint.title = 'Imprimer le document recréé mis en page A4 (texte, tableaux, figures, maths) — « Enregistrer au format PDF » dans le dialogue, ou impression papier';
      btnPrint.addEventListener('click', () => printRecreated(item));
      head.append(btnPrint);
    }

    const body = document.createElement('div');
    body.className = 'result-body';

    const preview = document.createElement('div');
    preview.className = 'md-preview';
    preview.innerHTML = await renderPreviewHtml(item.markdown, item.images);

    const source = document.createElement('textarea');
    source.className = 'md-source hidden';
    source.value = item.markdown;
    source.readOnly = true;
    source.spellcheck = false;

    const showTab = (which) => {
      btnPreview.classList.toggle('active', which === 'preview');
      btnSource.classList.toggle('active', which === 'source');
      if (which === 'source') {
        source.value = item.markdown;
        source.classList.remove('hidden'); preview.classList.add('hidden');
      } else {
        (async () => {
          preview.innerHTML = await renderPreviewHtml(item.markdown, item.images);
          preview.classList.remove('hidden'); source.classList.add('hidden');
        })();
      }
    };
    btnPreview.addEventListener('click', () => showTab('preview'));
    btnSource.addEventListener('click', () => showTab('source'));

    body.append(preview, source);
    card.append(head, body);

    // Insère la carte dans l'ordre de la file (l'OCR parallèle termine hors ordre).
    card.dataset.qid = String(item.id);
    let before = null;
    for (const existing of els.results.children) {
      if (Number(existing.dataset.qid || 0) > item.id) { before = existing; break; }
    }
    if (before) els.results.insertBefore(card, before);
    else els.results.appendChild(card);

    refreshResultsVisibility();
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  els.copyAll.addEventListener('click', () => {
    const all = queue
      .filter((q) => q.status === 'ok' && q.markdown)
      .map((q) => `# ${q.file.name}\n\n${q.markdown}`)
      .join('\n\n---\n\n');
    if (all) copyText(all, 'Tout le Markdown a été copié.');
  });

  /* Un seul PDF : toutes les feuilles scannées (une page par scan), dans
     l'ordre de la file — calque de texte quand l'OCR l'a fourni. */
  if (els.pdfAll) {
    els.pdfAll.addEventListener('click', async () => {
      const items = queue.filter((q) => q.status === 'ok' && q.kind === 'image');
      if (!items.length) return;
      els.pdfAll.disabled = true; els.pdfAll.classList.add('loading');
      try {
        await ensurePdfLib();
        const specs = [];
        for (const item of items) specs.push(await buildPdfPageSpec(item)); // séquentiel : canvas coûteux
        const bytes = await window.PdfOcr.buildSearchablePdf(specs);
        const name = `scans-ocr-${items.length}-feuille${items.length > 1 ? 's' : ''}.pdf`;
        downloadBlob(name, new Blob([bytes], { type: 'application/pdf' }));
        const segAny = items.some((q) => (q.segments || []).length > 0);
        window.toast(`PDF de ${items.length} feuille(s) téléchargé${segAny ? ' — texte sélectionnable' : ''}.`, 'ok', 5200);
      } catch (e) {
        window.toast('Export PDF impossible : ' + (e && e.message ? e.message : e), 'err', 6000);
      } finally {
        els.pdfAll.disabled = false; els.pdfAll.classList.remove('loading');
      }
    });
  }

  /* ---------- Init ---------- */
  refreshKeyUI();
  renderQueue();
  refreshResultsVisibility();
})();
