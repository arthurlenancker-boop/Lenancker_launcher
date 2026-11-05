/* focus-core.js — Cœur logique de l'app Focus, découplé du DOM pour être
   testable sous Node. Machine à états : setup → focus ⇄ break → done.
   Le temps est injecté (`now`) pour permettre les tests déterministes.
   UMD : window.FocusCore dans le navigateur, module.exports sous Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FocusCore = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const MIN = 60000;

  /* ---------- Machine à états ----------
     Aucune transition n'est forcée : la recherche montre que les pauses
     auto-régulées surpassent les minuteurs rigides sur la motivation
     (Smits et al. 2024/2025). Le pomodoro n'est qu'un des modes. */
  function createEngine(opts) {
    const o = Object.assign({
      now: () => Date.now(),
      mode: 'flux',              // 'flux' | 'pomodoro'
      fluxMinMs: 10 * MIN,       // conseil : segment minimum (jamais bloquant)
      fluxMaxMs: 45 * MIN,       // conseil : segment maximum (jamais bloquant)
      pomFocusMs: 25 * MIN,
      pomBreakMs: 5 * MIN,
      cycles: 4,
    }, opts || {});
    const now = () => o.now();

    const state = {
      phase: 'setup',            // setup | focus | break | done
      mode: o.mode,
      startedAt: null,
      segStart: null,            // début du segment focus en cours
      breakStart: null,
      segments: [],               // [{start, end, ms}]
      focusMs: 0,                 // cumul terminé
      breaks: 0,
      distractions: 0,
      distractionTimes: [],
      cyclesDone: 0,
      endedAt: null,
    };

    function start() {
      if (state.phase !== 'setup' && state.phase !== 'break') return false;
      if (state.startedAt === null) state.startedAt = now();
      state.segStart = now();
      state.breakStart = null;
      state.phase = 'focus';
      return true;
    }

    /* Termine le segment de focus et passe en pause.
       Retour { ms, short, long } : short/long = segment hors bornes conseillées
       (information pour le bilan, jamais une sanction). */
    function cut() {
      if (state.phase !== 'focus' || state.segStart === null) return null;
      const end = now();
      const ms = end - state.segStart;
      state.segments.push({ start: state.segStart, end, ms });
      state.focusMs += ms;
      state.segStart = null;
      state.breakStart = end;
      state.phase = 'break';
      state.breaks += 1;
      state.cyclesDone += 1;
      return {
        ms,
        short: state.mode === 'flux' && ms < o.fluxMinMs,
        long: state.mode === 'flux' && ms > o.fluxMaxMs,
      };
    }

    function noteDistraction() {
      state.distractions += 1;
      state.distractionTimes.push(now());
      return state.distractions;
    }

    /* Temps du segment en cours (sans l'ajouter au cumul). */
    function elapsedFocus() {
      return state.phase === 'focus' && state.segStart !== null ? now() - state.segStart : 0;
    }

    function elapsedBreak() {
      return state.phase === 'break' && state.breakStart !== null ? now() - state.breakStart : 0;
    }

    function summary() {
      return {
        mode: state.mode,
        focusMs: state.focusMs,
        segments: state.segments.length,
        avgSegMs: state.segments.length ? Math.round(state.focusMs / state.segments.length) : 0,
        breaks: state.breaks,
        distractions: state.distractions,
        duration: (state.endedAt || now()) - state.startedAt,
        shortSegs: state.segments.filter((s) => s.ms < o.fluxMinMs).length,
        longSegs: state.segments.filter((s) => s.ms > o.fluxMaxMs).length,
        points: pointsFor(state.focusMs),
      };
    }

    function finish() {
      if (state.phase === 'done') return summary();
      if (state.phase === 'focus') cut();
      state.phase = 'done';
      state.endedAt = now();
      return summary();
    }

    return {
      o, state,
      start, cut, noteDistraction, finish,
      elapsedFocus, elapsedBreak, summary,
    };
  }

  function pointsFor(focusMs) {
    return Math.max(0, Math.round(focusMs / MIN));
  }

  /* ---------- Série de jours (streak) ---------- */
  function dayKey(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /* Série consécutive se terminant aujourd'hui (ou hier si aujourd'hui
     n'a pas encore de session — la série reste « en cours »). */
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

  /* ---------- Agrégats pour les stats ---------- */
  function last7Days(sessions, nowTs) {
    const out = [];
    const today = new Date(nowTs);
    today.setHours(0, 0, 0, 0);
    const byDay = new Map();
    for (const s of sessions || []) {
      const k = dayKey(s.ts);
      byDay.set(k, (byDay.get(k) || 0) + (s.focusMs || 0));
    }
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const k = dayKey(d.getTime());
      out.push({
        key: k,
        label: ['D', 'L', 'M', 'M', 'J', 'V', 'S'][d.getDay()],
        focusMs: byDay.get(k) || 0,
      });
    }
    return out;
  }

  function formatMs(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
  }

  return { createEngine, pointsFor, dayKey, computeStreak, last7Days, formatMs, MIN };
});
