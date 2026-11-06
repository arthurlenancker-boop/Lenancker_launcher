/* core.js — Cœur logique de l'app Révision (cartes mémos), découplé du DOM
   pour être testable sous Node (même convention que FocusCore).
   Ordonnancement SM-2 modifié (Wozniak 1990 ; variante Anki à quatre boutons),
   file de session, séries de jours, fusion d'import — tout pur.
   UMD : window.RevisionCore dans le navigateur, module.exports sous Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RevisionCore = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const MIN = 60000;
  const DAY = 86400000;
  const MAX_INTERVAL = 365; // jours : jamais plus d'un an sans rappel (Cepeda)
  const MIN_EASE = 1.3;     // plancher de facilité (Anki)
  const MAX_EASE = 3.5;
  const RETRY_MIN = 10;      // « Encore » : la carte revient ~10 minutes plus tard
  const MATURE_DAYS = 21;    // « mûre » : intervalle ≥ 3 semaines

  const round2 = (x) => Math.round(x * 100) / 100;
  const clampNum = (v, lo, hi, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };

  /* ---------- SM-2 modifié ---------- */

  function newCardState(now) {
    return { ease: 2.5, interval: 0, lapses: 0, reps: 0, due: now, lastReview: 0 };
  }

  function newCard(deckId, front, back, now, id) {
    return Object.assign({
      id: id || uid(now),
      deckId: String(deckId || ''),
      front: String(front || ''),
      back: String(back || ''),
      created: now,
    }, newCardState(now));
  }

  /* Note un rappel. kind : 'again' | 'hard' | 'good' | 'easy'.
     Pur : retourne une nouvelle carte, l'originale est inchangée. */
  function grade(card, kind, now) {
    const st = {
      id: card.id,
      deckId: card.deckId,
      front: card.front,
      back: card.back,
      created: card.created,
      ease: card.ease,
      interval: card.interval,
      lapses: card.lapses,
      reps: card.reps + 1,
      due: card.due,
      lastReview: now,
    };
    if (kind === 'again') {
      st.lapses = card.lapses + 1;
      st.ease = round2(Math.max(MIN_EASE, card.ease - 0.2));
      st.interval = 0;
      st.due = now + RETRY_MIN * MIN;
      return st;
    }
    let iv;
    if (!card.interval) {
      // premiers vrais pas : 1-2-4 jours selon difficulté déclarée
      iv = kind === 'hard' ? 1 : kind === 'good' ? 2 : 4;
    } else {
      const mult = kind === 'hard' ? 1.2 : kind === 'easy' ? card.ease * 1.3 : card.ease;
      iv = Math.max(1, Math.round(card.interval * mult));
    }
    if (kind === 'hard') st.ease = round2(Math.max(MIN_EASE, card.ease - 0.15));
    if (kind === 'easy') st.ease = round2(Math.min(MAX_EASE, card.ease + 0.15));
    st.interval = Math.min(MAX_INTERVAL, iv);
    st.due = now + st.interval * DAY;
    return st;
  }

  /* ---------- File de session ----------
     Révisions dues d'abord (les plus anciennes en retard prio), puis les
     nouvelles dans la limite quotidienne (ordre de création). Les cartes
     « Encore » en cours de session sont réinjectées par l'interface. */
  function buildQueue(cards, now, opts) {
    const o = Object.assign({ newLimit: 20 }, opts || {});
    const due = [];
    const fresh = [];
    for (const c of cards || []) {
      if (!c) continue;
      if (!c.interval) {
        if (c.reps === 0) fresh.push(c);
        else if (c.due <= now) due.push(c); // reprise « Encore » d'une session précédente
      } else if (c.due <= now) due.push(c);
    }
    due.sort((a, b) => a.due - b.due || (a.created - b.created));
    fresh.sort((a, b) => a.created - b.created);
    return due.concat(fresh.slice(0, Math.max(0, o.newLimit)));
  }

  function statsFor(cards, now) {
    let total = 0, due = 0, fresh = 0, mature = 0;
    for (const c of cards || []) {
      if (!c) continue;
      total++;
      const isNew = c.reps === 0 && !c.interval;
      const relearnDue = !c.interval && c.reps > 0 && c.due <= now;
      if (relearnDue || (c.interval && c.due <= now)) due++;
      if (isNew) fresh++;
      if (c.interval >= MATURE_DAYS) mature++;
    }
    return { total, due, fresh, mature };
  }

  /* ---------- Jours et série (même méthode que Focus) ---------- */

  function dayKey(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function computeStreak(keys, nowTs) {
    const set = new Set(keys || []);
    const d = new Date(nowTs);
    d.setHours(0, 0, 0, 0);
    if (!set.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
    let n = 0;
    let guard = 0;
    while (guard++ < 366 && set.has(dayKey(d.getTime()))) {
      n += 1;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  /* ---------- Normalisation et fusion d'import ---------- */

  function uid(now) {
    const t = (now == null ? Date.now() : now).toString(36);
    return `c${t}${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeCard(raw, now, deckId) {
    const c = raw || {};
    const base = now == null ? 0 : now;
    return {
      id: String(c.id || uid()),
      deckId: String(c.deckId || deckId || ''),
      front: String(c.front || ''),
      back: String(c.back || ''),
      created: Number(c.created) || base,
      ease: clampNum(c.ease, MIN_EASE, MAX_EASE, 2.5),
      interval: Math.min(MAX_INTERVAL, Math.max(0, Math.floor(Number(c.interval) || 0))),
      lapses: Math.max(0, Math.floor(Number(c.lapses) || 0)),
      reps: Math.max(0, Math.floor(Number(c.reps) || 0)),
      due: Number(c.due) || base,
      lastReview: Number(c.lastReview) || 0,
    };
  }

  function normalizeDeck(raw, now) {
    const d = raw || {};
    const base = now == null ? 0 : now;
    return {
      id: String(d.id || uid()),
      name: String(d.name || 'Paquet'),
      desc: String(d.desc || ''),
      created: Number(d.created) || base,
    };
  }

  /* Fusionne un export dans l'état courant : paquets par id (les métadonnées
     importées restent), cartes par id (la version la plus récemment révisée
     gagne — jamais de doublon), jours par clé (max des compteurs). */
  function mergeData(cur, inc, now) {
    const out = { decks: [], cards: [], days: {} };
    const decks = new Map();
    const cards = new Map();

    for (const d of (cur && cur.decks) || []) decks.set(d.id, d);
    for (const d of (inc && inc.decks) || []) if (d && d.id) decks.set(d.id, d);

    for (const c of (cur && cur.cards) || []) if (c && c.id) cards.set(c.id, c);
    for (const c of (inc && inc.cards) || []) {
      if (!c || !c.id) continue;
      const old = cards.get(c.id);
      if (!old || (Number(c.lastReview) || 0) >= (Number(old.lastReview) || 0)) {
        cards.set(c.id, normalizeCard(c, now, c.deckId));
      }
    }

    out.decks = Array.from(decks.values());
    out.cards = Array.from(cards.values());
    const days = Object.assign({}, (cur && cur.days) || {});
    for (const k of Object.keys((inc && inc.days) || {})) {
      days[k] = Math.max(Number(days[k]) || 0, Number((inc.days || {})[k]) || 0);
    }
    out.days = days;
    return out;
  }

  /* Prépare un état initial sain à partir d'un JSON potentiellement corrompu. */
  function normalizeData(raw, now) {
    const base = now == null ? 0 : now;
    const r = raw || {};
    return {
      decks: (Array.isArray(r.decks) ? r.decks : []).map((d) => normalizeDeck(d, base)),
      cards: (Array.isArray(r.cards) ? r.cards : []).map((c) => normalizeCard(c, base, c && c.deckId)),
      days: r.days && typeof r.days === 'object' ? r.days : {},
    };
  }

  return {
    MIN, DAY, RETRY_MIN, MAX_INTERVAL,
    uid, newCard, newCardState, grade,
    buildQueue, statsFor,
    dayKey, computeStreak,
    normalizeCard, normalizeDeck, normalizeData, mergeData,
  };
});
