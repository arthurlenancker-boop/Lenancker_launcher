/* OCR Mistral — logique de l'app.
   Flux : clé API (localStorage) → dépôt fichiers → POST /v1/ocr → Markdown. */
(function () {
  'use strict';

  const API_URL = 'https://api.mistral.ai/v1/ocr';
  const MODELS_URL = 'https://api.mistral.ai/v1/models';
  const MODEL = 'mistral-ocr-latest';
  const LS_KEY = 'lenancker.ocr.apiKey';
  const LS_IMAGES = 'lenancker.ocr.includeImages';
  const MAX_FILE_BYTES = 50 * 1024 * 1024; // limite API Mistral : 50 Mo
  const WARN_FILE_BYTES = 20 * 1024 * 1024;

  const SUPPORTED = {
    'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image', 'image/gif': 'image',
    'application/pdf': 'pdf',
  };
  const EXT_FALLBACK = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
  };

  /* ---------- État ---------- */
  let queue = []; // {id, file, kind, status, dataUrl, markdown, pages, error}
  let seq = 0;
  let running = false;

  /* ---------- Raccourcis DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const els = {
    key: $('api-key'), toggleKey: $('toggle-key'), saveKey: $('save-key'), testKey: $('test-key'),
    deleteKey: $('delete-key'), keyStatus: $('key-status'), keyBadge: $('key-badge'),
    dropzone: $('dropzone'), fileInput: $('file-input'), queueList: $('file-queue'),
    run: $('run-ocr'), clear: $('clear-files'), queueCount: $('queue-count'),
    progressWrap: $('progress-wrap'), progressBar: $('progress-bar'),
    results: $('results'), empty: $('empty-results'), copyAll: $('copy-all'),
    includeImages: $('include-images'),
  };
  if (els.includeImages) {
    els.includeImages.checked = localStorage.getItem(LS_IMAGES) === '1';
    els.includeImages.addEventListener('change', () => {
      localStorage.setItem(LS_IMAGES, els.includeImages.checked ? '1' : '0');
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

  /* Copie en HTML riche (text/html) pour coller directement dans Word / Google Docs. */
  async function copyRichHtml(md, images) {
    const html = mdToRichHtml(md, images);
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
  function getKey() { return (localStorage.getItem(LS_KEY) || '').trim(); }

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
    localStorage.setItem(LS_KEY, v);
    refreshKeyUI();
    setKeyStatus('Clé enregistrée dans ce navigateur.', 'ok');
    window.toast('Clé API enregistrée localement.', 'ok');
  });

  els.deleteKey.addEventListener('click', () => {
    localStorage.removeItem(LS_KEY);
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
        setKeyStatus(`Clé valide — ${n} modèle(s) accessibles.`, 'ok');
        window.toast('Clé API valide.', 'ok');
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
      queue.push({ id: ++seq, file, kind, status: 'pending', dataUrl: null, markdown: null, pages: 0, images: {}, error: null });
      added++;
    }
    if (added) renderQueue();
  }

  function renderQueue() {
    els.queueList.innerHTML = '';
    let pending = 0;
    for (const item of queue) {
      if (item.status === 'pending' || item.status === 'err') pending++;
      const li = document.createElement('li');
      li.className = 'file-item';

      const name = document.createElement('span');
      name.className = 'fname'; name.textContent = item.file.name; name.title = item.file.name;

      const size = document.createElement('span');
      size.className = 'fsize'; size.textContent = fmtSize(item.file.size);

      const status = document.createElement('span');
      status.className = `fstatus ${item.status === 'working' ? 'working' : item.status}`;
      status.textContent = statusLabel(item);

      const remove = document.createElement('button');
      remove.className = 'fremove'; remove.type = 'button'; remove.textContent = '✕';
      remove.title = 'Retirer de la liste';
      remove.disabled = running && item.status === 'working';
      remove.addEventListener('click', () => {
        queue = queue.filter((q) => q.id !== item.id);
        renderQueue();
      });

      li.append(name, size, status, remove);
      els.queueList.appendChild(li);
    }
    els.queueCount.textContent = queue.length ? `${queue.length} fichier(s)` : '';
    els.run.disabled = !pending || running || !getKey();
    els.clear.disabled = !queue.length || running;
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
  /* Enveloppe le LaTeX nu (_ {...} / ^ {...}) de $...$ pour KaTeX,
     sans toucher aux blocs de code ni au contenu déjà en $...$. */
  function wrapBareScripts(text) {
    return text.split(/(\$[^$]+\$)/g).map((seg, i) => {
      if (i % 2 === 1) return seg;
      return seg
        .replace(/(?<!\\)_\{([^}]+)\}/g, '$_{$1}$')
        .replace(/(?<!\\)\^\{([^}]+)\}/g, '$^{$1}$');
    }).join('');
  }

  function prepareMarkdown(md, images) {
    let out = String(md || '');
    // images : data URL à la place de la référence quand on les a reçues
    if (images && Object.keys(images).length) {
      out = out.replace(/!\[([^\]]+)\]\([^)]*\)/g, (m, alt) => (images[alt] ? `![${alt}](${images[alt]})` : m));
    }
    // hors blocs de code ```...``` : LaTeX nu -> $...$
    const parts = out.split(/(```[\s\S]*?```)/g);
    return parts.map((p, i) => (i % 2 === 1 ? p : wrapBareScripts(p))).join('');
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

  function mdToRichHtml(md, images) {
    const div = document.createElement('div');
    div.innerHTML = DOMPurify.sanitize(marked.parse(prepareMarkdown(md, images)));
    if (window.renderMathInElement) window.renderMathInElement(div, KATEX_OPTS);
    return div.innerHTML;
  }

  /* ---------- Appel API Mistral OCR ---------- */
  async function callOcr(item, key, attempt) {
    const includeImages = localStorage.getItem(LS_IMAGES) === '1';
    const document = item.kind === 'pdf'
      ? { type: 'document_url', document_url: item.dataUrl }
      : { type: 'image_url', image_url: item.dataUrl };

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, document, include_image_base64: includeImages }),
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
    if (includeImages) {
      for (const p of pages) {
        for (const img of p.images || []) {
          if (!img.id || !img.image_base64) continue;
          const ext = String(img.id).split('.').pop().toLowerCase();
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          item.images[img.id] = `data:${mime};base64,${img.image_base64}`;
        }
      }
    }
    if (!item.markdown) throw new Error('Réponse vide de l’API OCR.');
  }

  function friendlyError(err) {
    const s = err.status;
    if (s === 401 || s === 403) return 'Clé API invalide ou non autorisée — vérifie-la dans la section « Clé API Mistral ».';
    if (s === 413) return 'Document trop volumineux pour l’API (limite 50 Mo).';
    if (s === 429) return 'Quota ou limite de débit atteinte — réessaie dans un instant.';
    if (s === 400) return `Requête refusée par l’API : ${err.message}`;
    return err.message || 'Erreur inconnue.';
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

    for (const item of todo) {
      setItemStatus(item, 'working');
      try {
        if (!item.dataUrl) item.dataUrl = await readAsDataURL(item.file);
        await callOcr(item, key, 1);
        item.status = 'ok';
        addResultCard(item);
        window.toast(`OCR terminé : ${item.file.name}`, 'ok');
      } catch (err) {
        item.status = 'err';
        item.error = friendlyError(err);
        window.toast(`${item.file.name} — ${item.error}`, 'err', 6000);
      }
      done++;
      updateProgress();
      renderQueue();
    }

    running = false;
    els.run.classList.remove('loading');
    renderQueue();
    refreshResultsVisibility();
  });

  /* ---------- Résultats ---------- */
  function refreshResultsVisibility() {
    const has = queue.some((q) => q.status === 'ok');
    els.empty.classList.toggle('hidden', has);
    els.copyAll.classList.toggle('hidden', !has);
  }

  function addResultCard(item) {
    const card = document.createElement('article');
    card.className = 'glass result-card';

    const head = document.createElement('div');
    head.className = 'result-head';

    const name = document.createElement('span');
    name.className = 'rname'; name.textContent = item.file.name; name.title = item.file.name;

    const pages = document.createElement('span');
    pages.className = 'rpages';
    pages.textContent = item.kind === 'pdf' && item.pages > 1 ? `${item.pages} pages` : '';

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
        const blob = await window.Md2Docx.mdToDocxBlob(item.markdown, item.file.name, item.images);
        downloadBlob(`${base}.ocr.docx`, blob);
        window.toast('Document Word .docx téléchargé — éditable dans Word / LibreOffice.', 'ok');
      } catch (e) {
        window.toast('Export .docx impossible : ' + (e && e.message ? e.message : e), 'err');
      } finally {
        btnDocx.disabled = false; btnDocx.classList.remove('loading');
      }
    });

    head.append(name, pages, seg, btnCopy, btnHtml, btnDl, btnDocx);

    const body = document.createElement('div');
    body.className = 'result-body';

    const preview = document.createElement('div');
    preview.className = 'md-preview';
    preview.innerHTML = mdToRichHtml(item.markdown, item.images);

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
    els.results.appendChild(card);
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

  /* ---------- Init ---------- */
  refreshKeyUI();
  renderQueue();
  refreshResultsVisibility();
})();
