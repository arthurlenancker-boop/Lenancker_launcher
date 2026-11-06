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
  const LS_DESKEW = 'lenancker.ocr.deskew';
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
    results: $('results'), empty: $('empty-results'), copyAll: $('copy-all'),
    includeImages: $('include-images'), trimPage: $('trim-page'), cleanHf: $('clean-hf'), deskew: $('deskew'), pdfAll: $('pdf-all'),
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
  if (els.deskew) {
    els.deskew.checked = store.get(LS_DESKEW) !== '0'; // redressement actif par défaut
    els.deskew.addEventListener('change', () => {
      store.set(LS_DESKEW, els.deskew.checked ? '1' : '0');
    });
  }
  document.getElementById('brand-logo').innerHTML = window.iconSvg('scan');

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
      renderQueue(); // des fichiers peuvent être déjà en file : réactive « Lancer l'OCR »
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
      queue.push({ id: ++seq, file, kind, status: 'pending', dataUrl: null, markdown: null, pages: 0, images: {}, imageDims: {}, confScore: null, skew: 0, error: null });
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

  /* ---------- Appel API Mistral OCR ---------- */
  async function callOcr(item, key, attempt) {
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
        return callOcr(item, key, attempt + 1);
      }
      throw Object.assign(new Error(message), { status: res.status });
    }

    const data = await res.json();
    const pages = Array.isArray(data.pages) ? data.pages : [];
    item.markdown = pages.map((p) => p.markdown || '').join('\n\n').trim();
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
          const ext = String(img.id).split('.').pop().toLowerCase();
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          item.images[img.id] = `data:${mime};base64,${img.image_base64}`;
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

  /* Décode un fichier image en bitmap pour le canvas (dims + détourage). */
  async function decodeBitmap(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file); } catch { /* repli <img> */ }
    }
    const url = URL.createObjectURL(file);
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

  /* ---------- Redressement des scans penchés (deskew) ----------
     Estimation sur une copie réduite (600 px côté long) : luminance, seuil
     d'Otsu calculé sur la zone centrale (exclut la table et les coins du
     scanneur), pixels d'encre sous le seuil, puis meilleur angle par profil
     de projection (pdfocr.bestSkewAngle). Retourne null si rien de net. */
  async function estimateSkew(bmp) {
    try {
      const { w: imgW, h: imgH } = bitmapDims(bmp);
      if (!imgW || !imgH) return null;
      const k = Math.min(1, 600 / Math.max(imgW, imgH));
      const w = Math.max(64, Math.round(imgW * k));
      const h = Math.max(64, Math.round(imgH * k));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;

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
     couleur moyenne du pourtour (souvent la table du scanneur). Déterministe :
     l'envoi à l'API et l'export PDF produisent les mêmes pixels aux mêmes
     coordonnées, donc les bbox OCR renvoyées restent alignées dans l'export. */
  async function rotateImage(bmp, angleDeg) {
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
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.translate(size.w / 2, size.h / 2);
    ctx.rotate(-angleDeg * Math.PI / 180); // signe : aplatit un texte qui descend vers la droite
    ctx.drawImage(bmp, -w / 2, -h / 2);
    const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('Rotation du scan impossible.');
    return { blob, width: size.w, height: size.h };
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Lecture du fichier impossible.'));
      r.readAsDataURL(blob);
    });
  }

  /* Lecture d'une image pour l'API : si l'option est active et qu'un angle net
     est détecté, l'image est redressée AVANT l'envoi. Elle devient la
     référence de toute la suite — bbox OCR (calque texte), détourage et
     export PDF tombent tous dans le repère de l'image redressée. */
  async function prepareImage(item) {
    item.skew = 0;
    if (!els.deskew || !els.deskew.checked) return readAsDataURL(item.file);
    let bmp = null;
    try {
      await ensurePdfOcr(); // bestSkewAngle / rotationSize, sans pdf-lib
      bmp = await decodeBitmap(item.file);
      const est = await estimateSkew(bmp);
      if (!est) return readAsDataURL(item.file);
      const { blob } = await rotateImage(bmp, est.angle);
      item.skew = est.angle;
      return blobToDataURL(blob);
    } catch {
      return readAsDataURL(item.file); // redressement impossible : image d'origine
    } finally {
      if (bmp && bmp.close) { try { bmp.close(); } catch { /* déjà fermée */ } }
    }
  }

  /* Prépare la page PDF d'un scan : image de référence (redressée si le scan
     était penché — les blocs OCR sont déjà dans son repère), détourage éventuel. */
  async function buildPdfPageSpec(item) {
    let bytes = null, mime = null, bmp = null;
    try {
      if (item.skew) {
        const raw = await decodeBitmap(item.file);
        let blob = null;
        try {
          blob = (await rotateImage(raw, item.skew)).blob;
        } finally {
          if (raw && raw.close) { try { raw.close(); } catch { /* déjà fermée */ } }
        }
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
    els.progressWrap.classList.remove('hidden');
    renderQueue();

    let done = queue.filter((q) => q.status === 'ok').length;
    const total = done + todo.length;
    const updateProgress = () => {
      els.progressBar.style.width = `${Math.round((done / total) * 100)}%`;
    };
    updateProgress();

    // Pool de workers : CONCURRENCY fichiers analysés en parallèle, le reste en file.
    let cursor = 0;
    const worker = async (startDelay) => {
      if (startDelay) await new Promise((r) => setTimeout(r, startDelay));
      while (cursor < todo.length) {
        const item = todo[cursor++];
        setItemStatus(item, 'working');
        try {
          if (!item.dataUrl) {
            item.dataUrl = item.kind === 'image'
              ? await prepareImage(item)
              : await readAsDataURL(item.file);
          }
          await callOcr(item, key, 1);
          item.status = 'ok';
          item.dataUrl = null; // libère le base64 en mémoire (jusqu'à ~67 Mo par PDF)
          window.toast(`OCR terminé : ${item.file.name}`, 'ok');
          if (Number.isFinite(item.confScore) && item.confScore !== null && item.confScore < 0.7) {
            window.toast(`${item.file.name} : reconnaissance peu fiable (${Math.round(item.confScore * 100)} %) — relis le texte extrait.`, 'warn', 6500);
          }
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
  });

  /* ---------- Résultats ---------- */
  function refreshResultsVisibility() {
    const oks = queue.filter((q) => q.status === 'ok');
    const has = oks.length > 0;
    els.empty.classList.toggle('hidden', has);
    els.copyAll.classList.toggle('hidden', !has);
    if (els.pdfAll) {
      const imageOks = oks.filter((q) => q.kind === 'image').length;
      els.pdfAll.classList.toggle('hidden', imageOks < 1);
      els.pdfAll.textContent = `PDF combiné (${imageOks} feuille${imageOks > 1 ? 's' : ''})`;
      els.pdfAll.title = 'Un seul PDF : chaque scan tel qu\u2019il est, texte invisible sélectionnable, détourage éventuel';
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
      box.title = `Scan incliné de ${String(Math.abs(item.skew)).replace('.', ',')}° — image redressée avant l'analyse (texte, tableaux et calque texte alignés).`;
    }

    const seg = document.createElement('span');
    seg.className = 'seg';
    const btnPreview = document.createElement('button');
    btnPreview.type = 'button'; btnPreview.textContent = 'Aperçu'; btnPreview.className = 'active';
    const btnSource = document.createElement('button');
    btnSource.type = 'button'; btnSource.textContent = 'Markdown';
    seg.append(btnPreview, btnSource);

    const btnCopy = document.createElement('button');
    btnCopy.type = 'button'; btnCopy.className = 'btn btn-sm'; btnCopy.textContent = 'Copier';
    btnCopy.title = 'Copier le Markdown brut';
    btnCopy.addEventListener('click', () => copyText(item.markdown, 'Markdown copié.'));

    const btnHtml = document.createElement('button');
    btnHtml.type = 'button'; btnHtml.className = 'btn btn-ghost btn-sm'; btnHtml.textContent = 'HTML';
    btnHtml.title = 'Copier en HTML riche (coller dans Word / Google Docs avec Ctrl+V)';
    btnHtml.addEventListener('click', () => copyRichHtml(item.markdown, item.images));

    const base = item.file.name.replace(/\.[^.]+$/, '');

    const btnDl = document.createElement('button');
    btnDl.type = 'button'; btnDl.className = 'btn btn-ghost btn-sm'; btnDl.textContent = '.md';
    btnDl.title = 'Télécharger le Markdown (.md)';
    btnDl.addEventListener('click', () => {
      download(`${base}.ocr.md`, item.markdown);
      window.toast('Fichier .md téléchargé.', 'ok');
    });

    const btnDocx = document.createElement('button');
    btnDocx.type = 'button'; btnDocx.className = 'btn btn-ghost btn-sm'; btnDocx.textContent = '.docx';
    btnDocx.title = 'Télécharger un document Word éditable (.docx)';
    btnDocx.addEventListener('click', async () => {
      btnDocx.disabled = true; btnDocx.classList.add('loading');
      try {
        await ensureDocx();
        const blob = await window.Md2Docx.mdToDocxBlob(item.markdown, item.file.name, item.images, item.imageDims);
        downloadBlob(`${base}.ocr.docx`, blob);
        window.toast('Document Word .docx téléchargé — éditable dans Word / LibreOffice.', 'ok');
      } catch (e) {
        window.toast('Export .docx impossible : ' + (e && e.message ? e.message : e), 'err');
      } finally {
        btnDocx.disabled = false; btnDocx.classList.remove('loading');
      }
    });

    /* PDF « texte sélectionnable » : le scan tel quel + calque de texte invisible. */
    const btnPdf = document.createElement('button');
    btnPdf.type = 'button'; btnPdf.className = 'btn btn-ghost btn-sm'; btnPdf.textContent = 'PDF';
    btnPdf.title = 'Télécharger un PDF à texte sélectionnable : la feuille telle qu\u2019elle est, texte invisible par-dessus';
    btnPdf.addEventListener('click', async () => {
      btnPdf.disabled = true; btnPdf.classList.add('loading');
      try {
        if (!item.segments || !item.segments.length) {
          window.toast('Blocs de texte non renvoyés par l\u2019API — le PDF n\u2019aura pas de calque sélectionnable.', 'warn', 6000);
        }
        await ensurePdfLib();
        const spec = await buildPdfPageSpec(item);
        const bytes = await window.PdfOcr.buildSearchablePdf([spec], base);
        downloadBlob(`${base}.ocr.pdf`, new Blob([bytes], { type: 'application/pdf' }));
        window.toast('PDF téléchargé — le texte est sélectionnable dans le document.', 'ok', 5200);
      } catch (e) {
        window.toast('Export PDF impossible : ' + (e && e.message ? e.message : e), 'err', 6000);
      } finally {
        btnPdf.disabled = false; btnPdf.classList.remove('loading');
      }
    });

    head.append(name, pages);
    if (scoreSpan) head.append(scoreSpan);
    if (box) head.append(box);
    head.append(seg, btnCopy, btnHtml, btnDl, btnDocx);
    if (item.kind === 'image') head.append(btnPdf);

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

    btnPreview.addEventListener('click', () => {
      btnPreview.classList.add('active'); btnSource.classList.remove('active');
      preview.classList.remove('hidden'); source.classList.add('hidden');
    });
    btnSource.addEventListener('click', () => {
      btnSource.classList.add('active'); btnPreview.classList.remove('active');
      source.classList.remove('hidden'); preview.classList.add('hidden');
    });

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

  /* Un seul PDF : toutes les feuilles scannées (une page par scan),
     texte invisible sélectionnable, dans l'ordre de la file. */
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
        window.toast(`PDF de ${items.length} feuille(s) téléchargé — texte sélectionnable.`, 'ok', 5200);
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
