/* Révision — logique de l'app (cartes mémos).
   Fondée sur docs/recherche-revision-memoisation.md : répétition espacée
   SM-2 modifié (Wozniak ; variante Anki), test actif (Roediger & Karpicke),
   difficultés désirables (Bjork : on ne révèle pas trop vite), régularité
   douce (Cepeda). Stockage en cascade + export/import comme Focus. */
(function () {
  'use strict';

  const LS_DATA = 'lenancker.revision.data';
  const LS_SETTINGS = 'lenancker.revision.settings';
  const DAILY_NEW = 20; // nouvelles cartes par session (réglable plus tard si besoin)

  const $ = (id) => document.getElementById(id);
  const els = {
    brand: $('brand-logo'),
    dueBadge: $('due-badge'),
    decksPanel: $('decks-panel'), deckPanel: $('deck-panel'), sessionPanel: $('session-panel'),
    deckName: $('deck-name'), deckStats: $('deck-stats'),
    newDeckName: $('new-deck-name'), createDeck: $('create-deck'), decksList: $('decks-list'),
    study: $('study'), backDecks: $('back-decks'), deleteDeck: $('delete-deck'),
    cardFront: $('card-front'), cardBack: $('card-back'), saveCard: $('save-card'),
    cardEditorHint: $('card-editor-hint'), cardsList: $('cards-list'),
    sessionCount: $('session-count'), sessionBar: $('session-bar'),
    memoStage: $('memo-stage'), memoCard: $('memo-card'), memoFront: $('memo-front'), memoBack: $('memo-back'),
    memoHint: $('memo-hint'), reveal: $('reveal'), endSession: $('end-session'),
    gradeActions: $('grade-actions'), sessionActions: $('session-actions'),
    sessionDone: $('session-done'), doneStats: $('done-stats'), backToDeck: $('back-to-deck'),
    weekChart: $('week-chart'),
    statTotal: $('stat-total'), statDue: $('stat-due'), statStreak: $('stat-streak'), statMature: $('stat-mature'),
    storageBadge: $('storage-badge'), storageHelp: $('storage-help'),
    btnExport: $('btn-export'), btnImport: $('btn-import'), importInput: $('import-input'),
  };
  els.brand.innerHTML = window.iconSvg('brain');

  /* ---------- Stockage en cascade (common.js) + persistance iOS/Android ---------- */
  const storage = window.lenanckerStorage;
  let persistAsked = false;
  function persist() {
    const ok = storage.set(LS_DATA, JSON.stringify(data));
    if (!ok) {
      window.toast('Stockage indisponible — exporte tes paquets pour les garder.', 'warn', 6000);
      renderStorageState();
      return;
    }
    if (!persistAsked && navigator.storage && navigator.storage.persist) {
      persistAsked = true;
      try { navigator.storage.persist(); } catch { /* pas disponible */ }
    }
  }

  function safeParse(v, fallback) {
    try { return JSON.parse(v) || fallback; } catch { return fallback; }
  }

  /* ---------- Données ---------- */
  let data = RevisionCore.normalizeData(safeParse(storage.get(LS_DATA), null), Date.now());
  let openDeckId = null;
  let session = null; // {deckId, queue:[cards], total, results:{again,hard,good,easy}}
  let editingCardId = null;

  const deckCards = (deckId) => data.cards.filter((c) => c.deckId === deckId);

  /* ---------- Rendu ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function showScreens(which) {
    els.decksPanel.classList.toggle('hidden', which !== 'decks');
    els.deckPanel.classList.toggle('hidden', which !== 'deck');
    els.sessionPanel.classList.toggle('hidden', which !== 'session');
  }

  function renderDecks() {
    els.decksList.innerHTML = '';
    for (const deck of data.decks) {
      const cards = deckCards(deck.id);
      const st = RevisionCore.statsFor(cards, Date.now());
      const row = document.createElement('div');
      row.className = 'deck-row';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      const name = document.createElement('span');
      name.className = 'dname'; name.textContent = deck.name;
      const meta = document.createElement('span');
      meta.className = 'dmeta';
      const total = document.createElement('span');
      total.className = 'badge'; total.textContent = `${st.total} carte${st.total > 1 ? 's' : ''}`;
      meta.append(total);
      if (st.due || st.fresh) {
        const due = document.createElement('span');
        due.className = 'badge soon-badge';
        due.textContent = `${st.due + Math.min(st.fresh, DAILY_NEW)} à réviser`;
        meta.append(due);
      }
      row.append(name, meta);
      const open = () => { openDeckId = deck.id; renderDeck(); showScreens('deck'); };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
      els.decksList.appendChild(row);
    }
    if (!data.decks.length) {
      const empty = document.createElement('p');
      empty.className = 'muted small';
      empty.textContent = 'Aucun paquet pour le moment — crée-en un ci-dessus, puis ajoute des cartes recto/verso.';
      els.decksList.appendChild(empty);
    }
  }

  function renderDeck() {
    const deck = data.decks.find((d) => d.id === openDeckId);
    if (!deck) { showScreens('decks'); return; }
    els.deckName.textContent = deck.name;
    const cards = deckCards(deck.id);
    const st = RevisionCore.statsFor(cards, Date.now());
    els.deckStats.hidden = false;
    els.deckStats.textContent = `${st.total} carte${st.total > 1 ? 's' : ''} · ${st.due} due${st.due > 1 ? 's' : ''} · ${st.fresh} nouvelle${st.fresh > 1 ? 's' : ''}`;
    els.study.disabled = !cards.length;
    els.study.textContent = st.due ? 'Réviser aujourd\u2019hui' : 'Réviser (nouvelles cartes)';

    els.cardsList.innerHTML = '';
    cards.sort((a, b) => a.created - b.created).forEach((card) => {
      const row = document.createElement('div');
      row.className = 'card-row';
      const front = document.createElement('div');
      front.className = 'cface';
      front.innerHTML = `<small>Recto</small>${esc(card.front)}`;
      const back = document.createElement('div');
      back.className = 'cface';
      back.innerHTML = `<small>Verso</small>${esc(card.back)}`;
      const actions = document.createElement('div');
      actions.className = 'cactions';
      const edit = document.createElement('button');
      edit.type = 'button'; edit.textContent = '✎'; edit.title = 'Modifier';
      edit.addEventListener('click', () => startEditCard(card.id));
      const del = document.createElement('button');
      del.type = 'button'; del.textContent = '✕'; del.title = 'Retirer la carte'; del.className = 'danger';
      del.addEventListener('click', () => {
        if (!confirm('Retirer cette carte du paquet ?')) return;
        data.cards = data.cards.filter((c) => c.id !== card.id);
        persist(); renderDeck(); renderDecks(); renderStats();
      });
      actions.append(edit, del);
      row.append(front, back, actions);
      if (card.interval && card.interval >= 21) {
        const maturity = document.createElement('span');
        maturity.className = 'cmaturity';
        maturity.textContent = `mûre — prochaine révision ${fmtDue(card.due)}`;
        row.append(maturity);
      }
      els.cardsList.appendChild(row);
    });
    if (!cards.length) {
      const empty = document.createElement('p');
      empty.className = 'muted small';
      empty.textContent = 'Pas encore de carte — écris un recto et un verso ci-dessus.';
      els.cardsList.appendChild(empty);
    }
  }

  function fmtDue(ts) {
    const days = Math.ceil((ts - Date.now()) / RevisionCore.DAY);
    if (days <= 0) return 'aujourd\u2019hui';
    if (days === 1) return 'demain';
    if (days < 30) return `dans ${days} jours`;
    return `dans ${Math.round(days / 30)} mois`;
  }

  /* ---------- Paquet et cartes ---------- */
  els.createDeck.addEventListener('click', () => {
    const name = els.newDeckName.value.trim();
    if (!name) { els.newDeckName.focus(); return; }
    const now = Date.now();
    data.decks.push(RevisionCore.normalizeDeck({ id: RevisionCore.uid(now), name, created: now }, now));
    els.newDeckName.value = '';
    persist(); renderDecks();
    window.toast('Paquet créé — ajoute tes cartes.', 'ok');
  });
  els.newDeckName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.createDeck.click();
  });

  els.backDecks.addEventListener('click', () => { openDeckId = null; renderDecks(); showScreens('decks'); });

  els.deleteDeck.addEventListener('click', () => {
    const deck = data.decks.find((d) => d.id === openDeckId);
    if (!deck) return;
    const n = deckCards(deck.id).length;
    if (!confirm(`Supprimer le paquet « ${deck.name} » et ses ${n} carte(s) ?`)) return;
    data.decks = data.decks.filter((d) => d.id !== deck.id);
    data.cards = data.cards.filter((c) => c.deckId !== deck.id);
    openDeckId = null;
    persist(); renderDecks(); renderStats(); showScreens('decks');
    window.toast('Paquet supprimé.', 'warn');
  });

  els.saveCard.addEventListener('click', () => {
    if (!openDeckId) return;
    const front = els.cardFront.value.trim();
    const back = els.cardBack.value.trim();
    if (!front || !back) {
      window.toast('La carte a besoin d\u2019un recto ET d\u2019un verso.', 'warn');
      return;
    }
    const now = Date.now();
    if (editingCardId) {
      const card = data.cards.find((c) => c.id === editingCardId);
      if (card) { card.front = front; card.back = back; }
      editingCardId = null;
      els.cardEditorHint.textContent = 'Une carte = une seule idée précise.';
      els.saveCard.textContent = 'Ajouter la carte';
      window.toast('Carte modifiée.', 'ok');
    } else {
      data.cards.push(RevisionCore.newCard(openDeckId, front, back, now));
      window.toast('Carte ajoutée.', 'ok');
    }
    els.cardFront.value = ''; els.cardBack.value = '';
    persist(); renderDeck(); renderDecks(); renderStats();
  });

  function startEditCard(cardId) {
    const card = data.cards.find((c) => c.id === cardId);
    if (!card) return;
    editingCardId = cardId;
    els.cardFront.value = card.front;
    els.cardBack.value = card.back;
    els.saveCard.textContent = 'Enregistrer la carte';
    els.cardEditorHint.textContent = 'Modification en cours — enregistre pour valider.';
    els.cardFront.focus();
  }

  /* ---------- Session ---------- */
  els.study.addEventListener('click', () => {
    const cards = deckCards(openDeckId);
    const queue = RevisionCore.buildQueue(cards, Date.now(), { newLimit: DAILY_NEW });
    if (!queue.length) {
      window.toast('Rien à réviser dans ce paquet — reviens plus tard.', 'info');
      return;
    }
    session = { deckId: openDeckId, queue, total: queue.length, revealed: false, results: { again: 0, hard: 0, good: 0, easy: 0 } };
    showScreens('session');
    showCurrentCard();
  });

  function showCurrentCard() {
    const card = session && session.queue[0];
    if (!card) return endOfSession();
    session.revealed = false;
    els.sessionDone.classList.add('hidden');
    els.gradeActions.classList.add('hidden');
    els.sessionActions.classList.remove('hidden');
    els.memoCard.classList.remove('revealed');
    els.memoFront.textContent = card.front;
    els.memoBack.textContent = card.back;
    els.memoHint.classList.remove('hidden');
    els.sessionCount.textContent = `à réviser : ${session.queue.length}`;
    const pct = Math.max(0, Math.min(100, Math.round(((session.total - session.queue.length) / session.total) * 100)));
    els.sessionBar.style.width = `${pct}%`;
  }

  function revealCurrent() {
    if (!session || session.revealed) return;
    session.revealed = true;
    els.memoCard.classList.add('revealed');
    els.memoHint.classList.add('hidden');
    els.sessionActions.classList.add('hidden');
    els.gradeActions.classList.remove('hidden');
  }

  els.memoCard.addEventListener('click', () => {
    if (session && !session.revealed) revealCurrent();
  });

  els.reveal.addEventListener('click', revealCurrent);

  els.gradeActions.querySelectorAll('button[data-grade]').forEach((btn) => {
    btn.addEventListener('click', () => {
      gradeCurrent(btn.dataset.grade);
      btn.blur(); // rend les raccourcis 1-4 de nouveau actifs
    });
  });

  function gradeCurrent(kind) {
    if (!session || !session.queue.length) return;
    const card = session.queue[0];
    const now = Date.now();
    const updated = RevisionCore.grade(card, kind, now);
    session.queue.shift();
    if (kind === 'again') session.queue.push(updated); // revient dans ~10 minutes (SM-2)
    session.results[kind] += 1;
    const i = data.cards.findIndex((c) => c.id === card.id);
    if (i >= 0) data.cards[i] = updated;
    bumpDay(now);
    persist();
    showCurrentCard();
  }

  function bumpDay(now) {
    const k = RevisionCore.dayKey(now);
    data.days[k] = (Number(data.days[k]) || 0) + 1;
  }

  function endOfSession() {
    els.sessionBar.style.width = '100%';
    els.sessionCount.textContent = '—';
    els.gradeActions.classList.add('hidden');
    els.sessionActions.classList.add('hidden');
    els.memoStage.classList.add('hidden');
    els.sessionDone.classList.remove('hidden');
    const r = session.results;
    const lines = [
      `Encore : <b>${r.again}</b>`,
      `Difficile : <b>${r.hard}</b>`,
      `Moyen : <b>${r.good}</b>`,
      `Facile : <b>${r.easy}</b>`,
      session.total ? `Cartes vues : <b>${session.total}</b>` : '',
    ].filter(Boolean);
    els.doneStats.innerHTML = lines.map((l) => `<span class="stat-line">${l}</span>`).join(' ');
    session = null;
    persist(); renderStats(); renderDecks(); renderDeck();
    window.toast('Session terminée — la régularité bat le volume : reviens demain.', 'ok', 5500);
  }

  els.endSession.addEventListener('click', () => {
    session = null;
    els.memoStage.classList.remove('hidden');
    renderDeck();
    showScreens('deck'); // rester dans le paquet
  });

  els.backToDeck.addEventListener('click', () => {
    els.memoStage.classList.remove('hidden');
    renderDeck();
    showScreens('deck');
  });

  /* ---------- Raccourcis clavier ---------- */
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, button, a, [contenteditable]')) return;
    if (!session) return;
    if (e.key === ' ') { e.preventDefault(); if (!session.revealed) revealCurrent(); return; }
    const grades = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
    if (grades[e.key] && session.revealed) gradeCurrent(grades[e.key]);
    else if (e.key === 'Escape') els.endSession.click();
  });

  /* ---------- Stats & série ---------- */
  function renderStats() {
    const now = Date.now();
    const all = data.cards;
    const st = RevisionCore.statsFor(all, now);
    const dueTotal = st.due + Math.min(st.fresh, DAILY_NEW);
    els.statTotal.textContent = st.total;
    els.statDue.textContent = st.due;
    els.statMature.textContent = st.mature;
    els.statStreak.textContent = RevisionCore.computeStreak(Object.keys(data.days), now);
    els.dueBadge.hidden = !dueTotal;
    if (dueTotal) els.dueBadge.textContent = `${dueTotal} à réviser aujourd\u2019hui`;

    // 7 derniers jours : nb de révisions
    els.weekChart.innerHTML = '';
    const values = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      values.push({ key: RevisionCore.dayKey(d.getTime()), label: ['D', 'L', 'M', 'M', 'J', 'V', 'S'][d.getDay()], v: Number(data.days[RevisionCore.dayKey(d.getTime())]) || 0, today: i === 0 });
    }
    const vmax = Math.max(5, ...values.map((x) => x.v));
    for (const day of values) {
      const wrap = document.createElement('div');
      wrap.className = `week-day${day.today ? ' today' : ''}`;
      const bar = document.createElement('div');
      bar.className = 'week-bar';
      bar.style.height = `${Math.max(3, Math.round((day.v / vmax) * 100))}%`;
      bar.title = `${day.v} carte(s)`;
      const lab = document.createElement('span'); lab.className = 'small'; lab.textContent = day.label;
      wrap.append(bar, lab);
      els.weekChart.appendChild(wrap);
    }
    els.weekChart.setAttribute('aria-label', `Cartes révisées les 7 derniers jours — ${values.map((d2) => `${d2.key} : ${d2.v}`).join(', ')}`);
  }

  /* ---------- Export / import ---------- */
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  els.btnExport.addEventListener('click', () => {
    const payload = { app: 'lenancker-revision', v: 1, exportedAt: new Date().toISOString(), data };
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    downloadBlob(`lenancker-revision-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`,
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    window.toast('Paquets, cartes et série exportés.', 'ok');
  });

  els.btnImport.addEventListener('click', () => els.importInput.click());
  els.importInput.addEventListener('change', async () => {
    const f = els.importInput.files && els.importInput.files[0];
    els.importInput.value = '';
    if (!f) return;
    let payload;
    try { payload = JSON.parse(await f.text()); }
    catch { window.toast('Fichier illisible : ce n\u2019est pas du JSON.', 'err'); return; }
    if (!payload || payload.app !== 'lenancker-revision' || !payload.data) {
      window.toast('Fichier inconnu — exporte d\u2019abord depuis cette app.', 'err');
      return;
    }
    data = RevisionCore.mergeData(data, RevisionCore.normalizeData(payload.data, Date.now()), Date.now());
    persist();
    renderDecks(); renderStats();
    if (openDeckId) renderDeck();
    window.toast('Données importées et fusionnées sans doublon.', 'ok');
  });

  /* ---------- État du stockage (comme Focus) ---------- */
  function renderStorageState() {
    const mode = window.lenanckerStorage.mode;
    const bad = mode !== 'local';
    els.storageBadge.hidden = !bad;
    if (bad) {
      els.storageBadge.textContent = mode === 'session' ? 'stocké dans cet onglet seulement' : 'stockage bloqué — exporte tes paquets';
    }
    els.storageHelp.classList.toggle('hidden', false);
  }

  /* ---------- Init ---------- */
  renderDecks();
  renderStats();
  renderStorageState();
  if (window.lenanckerStorage.mode !== 'local') {
    window.toast('Stockage durable indisponible ici — exporte tes paquets pour les garder.', 'warn', 8000);
  }
})();
