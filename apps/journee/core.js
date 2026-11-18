/* core.js — Moteur chronobiologique et questionnaire de l'app Journée,
   découplé du DOM pour être testable sous Node (même convention UMD
   que ArbreCore).

   Le questionnaire de première ouverture est purement déterministe,
   sans IA : au lycée général, Seconde ne choisit pas de spécialité,
   Première en choisit exactement trois, Terminale exactement deux.
   Les horaires saisis (lever, coucher, début et fin des cours)
   pilotent ensuite toute la journée :

   - inertie du sommeil (~45 min au réveil) : rien d'exigeant ;
   - cartes du matin : bref rappel actif (app Révision) ;
   - après les cours : pause active de décompression ;
   - blocs de devoirs de 45 min maximum, exigéants en premier,
     matières entrelacées (interleaving), pause de 10 min ;
   - créneau de rappel du soir juste avant le coucher : la nuit
     consolide ce qui a été récupéré de mémoire ;
   - coupe de la caféine 8 h avant le coucher ;
   - durée de nuit affichée face à la fourchette 8-10 h recommandée
     à l'adolescence, sans jamais juger les horaires choisis. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JourneeCore = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
'use strict';
return (function () {

  const VERSION = 1;
  const DAY = 1440;

  const INERTIE = 45;        // minutes de montée de vigilance au réveil
  const CARTES_MATIN = 15;   // durée de la séance de cartes du matin
  const CARTES_AVANT_ECOLE = 10; // la séance finit 10 min avant les cours
  const DECOMP = 15;         // pause active après les cours
  const RAPPEL_SOIR = 15;    // séance de rappel avant le coucher
  const MARGE_SOIR = 25;     // les devoirs s'arrêtent avant la séance du soir
  const BLOC_MAX = 45;      // durée maximale d'un bloc de devoir
  const PAUSE_BLOC = 10;    // pause entre deux blocs
  const PROFOND_DEBUT = 120; // jour libre : fenêtre profonde 2 h après le lever
  const PROFOND_FIN = 270;   // et jusqu'à 4 h 30 après le lever
  const CREUX_DEBUT = 780;   // 13 h 00 : creux post-déjeuner
  const CREUX_FIN = 855;     // 14 h 15
  const CAFEINE_OFF = 480;   // 8 h avant le coucher

  /* --- Questionnaire : niveaux du lycée général (pour l'instant) et
     catalogue des spécialités. Le tronc commun complète les sujets
     de devoirs proposés selon le niveau. --- */

  const NIVEAUX = {
    seconde:  { label: 'Seconde générale', spes: 0 },
    premiere: { label: 'Première générale', spes: 3 },
    terminale: { label: 'Terminale générale', spes: 2 }
  };
  const NIVEAU_ORDRE = ['seconde', 'premiere', 'terminale'];

  const SPES = [
    { id: 'arts', label: 'Arts' },
    { id: 'bio-eco', label: 'Biologie-écologie' },
    { id: 'llcer-amc', label: 'Anglais monde contemporain' },
    { id: 'llcer', label: 'Langues, littératures et cultures étrangères (autre langue)' },
    { id: 'histoire-geo', label: 'Histoire-géographie, géopolitique et sciences politiques' },
    { id: 'hlp', label: 'Humanités, littérature et philosophie' },
    { id: 'lca', label: 'Littératures et cultures de l’Antiquité' },
    { id: 'maths', label: 'Mathématiques' },
    { id: 'nsi', label: 'Numérique et sciences informatiques' },
    { id: 'physique-chimie', label: 'Physique-chimie' },
    { id: 'ses', label: 'Sciences économiques et sociales' },
    { id: 'si', label: 'Sciences de l’ingénieur' },
    { id: 'svt', label: 'SVT — Sciences de la vie et de la Terre' }
  ];

  const TRONC = {
    seconde: [
      { id: 'francais', label: 'Français' },
      { id: 'lva', label: 'LVA anglais' },
      { id: 'ens-sci', label: 'Enseignement scientifique' }
    ],
    premiere: [
      { id: 'francais', label: 'Français' },
      { id: 'lva', label: 'LVA anglais' },
      { id: 'ens-sci', label: 'Enseignement scientifique' },
      { id: 'histoire-geo-tc', label: 'Histoire-géographie' }
    ],
    terminale: [
      { id: 'philo', label: 'Philosophie' },
      { id: 'lva', label: 'LVA anglais' },
      { id: 'histoire-geo-tc', label: 'Histoire-géographie' },
      { id: 'grand-oral', label: 'Grand oral' }
    ]
  };

  /* Profil saisi au questionnaire : { niveau: 'premiere', spes: [...] } */
  function sanitizeProfile(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const niveau = NIVEAUX[src.niveau] ? src.niveau : null;
    if (!niveau) return null;
    const valides = new Set(SPES.map((s) => s.id));
    const vus = new Set();
    const spes = [];
    (Array.isArray(src.spes) ? src.spes : []).forEach((id) => {
      if (typeof id === 'string' && valides.has(id) && !vus.has(id)) {
        vus.add(id);
        spes.push(id);
      }
    });
    return { niveau: niveau, spes: spes };
  }

  /* Nombre de spécialités attendu pour un niveau (validation du quiz). */
  function spesAttendues(niveau) {
    return NIVEAUX[niveau] ? NIVEAUX[niveau].spes : 0;
  }

  /* Sujets proposés pour les devoirs : spés choisies d'abord (dans
     l'ordre du catalogue), puis tronc commun du niveau, puis Autre. */
  function sujetsFor(profile) {
    const p = sanitizeProfile(profile) || { niveau: 'premiere', spes: [] };
    const out = [];
    const vus = new Set();
    SPES.forEach((sp) => {
      if (p.spes.indexOf(sp.id) >= 0) { out.push(sp); vus.add(sp.id); }
    });
    (TRONC[p.niveau] || []).forEach((s) => { out.push(s); vus.add(s.id); });
    out.push({ id: 'autre', label: 'Autre' });
    return out;
  }

  function sujetLabel(profile, id) {
    const sujets = sujetsFor(profile);
    for (const s of sujets) if (s.id === id) return s.label;
    const sp = SPES.filter((s) => s.id === id)[0];
    return sp ? sp.label : 'Autre';
  }

  /* --- Assainissement des réglages --- */

  function clampMin(v, fb) {
    const n = Math.round(Number(v));
    if (!isFinite(n) || n < 0 || n >= DAY) return fb;
    return n;
  }

  function defaultSettings() {
    return {
      v: 1,
      wake: 405,        // 6 h 45
      bed: 1170,        // 19 h 30
      schoolStart: 510, // 8 h 30
      schoolEnd: 1020, // 17 h 00
      weekdays: ['cours','cours','cours','cours','cours','libre','libre'] // lundi → dimanche
    };
  }

  function sanitizeSettings(raw) {
    const d = defaultSettings();
    const out = { v: 1 };
    const src = (raw && typeof raw === 'object') ? raw : {};
    out.wake = clampMin(src.wake, d.wake);
    out.bed = clampMin(src.bed, d.bed);
    if (out.bed === out.wake) out.bed = (out.wake + 120) % DAY;
    out.schoolStart = clampMin(src.schoolStart, d.schoolStart);
    out.schoolEnd = clampMin(src.schoolEnd, d.schoolEnd);
    if (out.schoolEnd <= out.schoolStart) {
      out.schoolStart = d.schoolStart;
      out.schoolEnd = d.schoolEnd;
    }
    const wdIn = Array.isArray(src.weekdays) ? src.weekdays : [];
    out.weekdays = [];
    for (let i = 0; i < 7; i++) {
      out.weekdays.push(wdIn[i] === 'libre' ? 'libre' : wdIn[i] === 'cours' ? 'cours' : d.weekdays[i]);
    }
    return out;
  }

  function sanitizeTask(raw, id, profile) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const sujets = sujetsFor(profile);
    const ids = new Set(sujets.map((s) => s.id));
    let subject = typeof src.subject === 'string' ? src.subject : '';
    if (!ids.has(subject)) subject = sujets.length ? sujets[0].id : 'autre';
    const charge = src.charge === 'exigeant' ? 'exigeant' : 'leger';
    let minutes = Math.round(Number(src.minutes));
    if (!isFinite(minutes) || minutes < 10) minutes = 30;
    if (minutes > 300) minutes = 300;
    const title = String(src.title == null ? '' : src.title).replace(/\s+/g, ' ').trim().slice(0, 120);
    return { id: id, subject: subject, charge: charge, minutes: minutes, title: title, done: !!src.done };
  }

  function defaultState() {
    return { v: 1, profile: null, settings: defaultSettings(), tasks: [], done: {}, savedAtMs: 0 };
  }

  function dayKey(ms) {
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function sanitizeState(raw) {
    const out = defaultState();
    if (!raw || typeof raw !== 'object') return out;
    out.profile = sanitizeProfile(raw.profile);
    const defaut = out.profile || { niveau: 'premiere', spes: [] };
    out.settings = sanitizeSettings(raw.settings);
    const srcTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    out.tasks = srcTasks.map((t, i) => {
      const id = (t && typeof t.id === 'string' && t.id) ? t.id : 't' + (i + 1);
      return sanitizeTask(t, String(id).slice(0, 64), defaut);
    });
    out.done = {};
    if (raw.done && typeof raw.done === 'object') {
      for (const k of Object.keys(raw.done)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
        const v = raw.done[k];
        if (v && typeof v === 'object') {
          const day = {};
          for (const s of Object.keys(v)) {
            if (typeof s === 'string' && s.length <= 64 && v[s]) day[s] = true;
          }
          if (Object.keys(day).length) out.done[k] = day;
        }
      }
      const keys = Object.keys(out.done).sort();
      while (keys.length > 31) delete out.done[keys.shift()];
    }
    const ms = Number(raw.savedAtMs);
    out.savedAtMs = isFinite(ms) && ms > 0 ? ms : 0;
    return out;
  }

  /* --- Temps --- */

  function bedAbs(s) { return s.bed <= s.wake ? s.bed + DAY : s.bed; }
  function nightMinutes(s) { return (s.wake - s.bed + DAY) % DAY; }

  function fmtHM(min) {
    const m = ((Math.round(min) % DAY) + DAY) % DAY;
    const h = Math.floor(m / 60), mm = m % 60;
    return mm ? h + ' h ' + (mm < 10 ? '0' + mm : mm) : h + ' h';
  }

  function fmtRange(a, b) { return fmtHM(a) + ' → ' + fmtHM(b); }

  function fmtDur(min) {
    min = Math.max(0, Math.round(min));
    const h = Math.floor(min / 60), m = min % 60;
    if (h && m) return h + ' h ' + (m < 10 ? '0' + m : m);
    if (h) return h + ' h';
    return m + ' min';
  }

  function nuitTexte(min) {
    const base = 'Nuit de ' + fmtDur(min);
    if (min < 480) return base + ' — sous la fourchette 8-10 h recommandée à ton âge : c’est le réglage qui pèse le plus sur la mémorisation.';
    if (min > 600) return base + ' — au-dessus de la fourchette 8-10 h recommandée (aucun souci si ça te convient).';
    return base + ' — dans la fourchette 8-10 h recommandée à ton âge.';
  }

  /* --- Découpage et entrelacement des devoirs --- */

  function chunksOf(tasks, maxMin) {
    // Une file de morceaux par matière (ordre d'apparition), 45 min max,
    // puis tourniquet entre matières : A B C A B C… (interleaving).
    const perSubject = [];
    const idx = new Map();
    for (const t of tasks) {
      let q = idx.get(t.subject);
      if (q === undefined) { q = perSubject.length; idx.set(t.subject, q); perSubject.push([]); }
      let rest = t.minutes;
      while (rest > 0) {
        const m = Math.min(maxMin, rest);
        perSubject[q].push({ taskId: t.id, subject: t.subject, minutes: m });
        rest -= m;
      }
    }
    const out = [];
    let more = true;
    while (more) {
      more = false;
      for (const q of perSubject) {
        if (q.length) { out.push(q.shift()); more = true; }
      }
    }
    return out;
  }

  function placeChunks(chunks, windows) {
    const placed = [];
    const rest = [];
    let wi = 0;
    let cur = windows.length ? windows[0].from : 0;
    let first = true;
    for (const ch of chunks) {
      while (wi < windows.length && cur + ch.minutes > windows[wi].to) {
        wi++;
        if (wi < windows.length) { cur = windows[wi].from; first = true; }
      }
      if (wi >= windows.length) { rest.push(ch); continue; }
      const from = first ? cur : cur + PAUSE_BLOC;
      placed.push(Object.assign({}, ch, { from: from, to: from + ch.minutes, window: windows[wi].kind }));
      cur = from + ch.minutes;
      first = false;
    }
    return { placed: placed, rest: rest };
  }

  function assignTasks(tasks, windows) {
    const open = (tasks || []).filter((t) => !t.done);
    const exig = open.filter((t) => t.charge === 'exigeant');
    const leg = open.filter((t) => t.charge !== 'exigeant');
    const chunks = chunksOf(exig, BLOC_MAX).concat(chunksOf(leg, BLOC_MAX));
    const out = placeChunks(chunks, windows);
    const map = new Map();
    for (const ch of out.rest) {
      map.set(ch.taskId, (map.get(ch.taskId) || 0) + ch.minutes);
    }
    const restantes = [];
    for (const pair of map) restantes.push({ taskId: pair[0], minutes: pair[1] });
    return { placed: out.placed, restantes: restantes };
  }

  /* --- Plan de journée --- */

  function planDay(settings, dayType, tasks, profile) {
    const s = sanitizeSettings(settings);
    const b = bedAbs(s);
    const t0 = s.wake;
    const libre = dayType === 'libre';
    const plan = { kind: libre ? 'libre' : 'cours', wake: t0, bed: b, slots: [], notes: [], restantes: [] };
    const fixed = [];
    const windows = [];
    const soir = b - RAPPEL_SOIR;
    const finDevoirs = b - MARGE_SOIR;

    fixed.push({
      id: 'reveil', kind: 'repos',
      from: t0, to: Math.min(t0 + INERTIE, b),
      title: 'Réveil — routine tranquille, pas de révision exigeante',
      science: 'Inertie du sommeil : la vigilance met environ 45 min à monter.'
    });

    if (libre) {
      const cFrom = t0 + INERTIE;
      if (cFrom + CARTES_MATIN <= finDevoirs) {
        fixed.push({
          id: 'cartes-matin', kind: 'rappel', app: 'revision',
          from: cFrom, to: cFrom + CARTES_MATIN,
          title: 'Cartes du matin (Révision)',
          science: 'Rappel actif : récupérer de mémoire consolide mieux que relire.'
        });
      }
      const pFrom = t0 + PROFOND_DEBUT;
      const pTo = Math.min(t0 + PROFOND_FIN, finDevoirs);
      if (pTo > pFrom) {
        windows.push({ kind: 'profond', from: pFrom, to: pTo });
      }
      const creuxFrom = Math.max(t0 + INERTIE + CARTES_MATIN, CREUX_DEBUT);
      const creuxTo = Math.min(CREUX_FIN, finDevoirs);
      if (creuxTo > creuxFrom) {
        fixed.push({
          id: 'creux', kind: 'pause', from: creuxFrom, to: creuxTo,
          title: 'Creux de l’après-midi — pause active dehors',
          science: 'Creux post-déjeuner du rythme circadien : bouger relance l’attention.'
        });
        if (creuxTo < finDevoirs) {
          windows.push({ kind: 'routine', from: creuxTo, to: finDevoirs });
        }
      } else if (pTo > 0 && pTo < finDevoirs) {
        windows.push({ kind: 'routine', from: Math.max(creuxFrom, pTo), to: finDevoirs });
      }
    } else {
      // Cartes avant l'école (série finie 10 min avant les cours)
      const cFrom = Math.max(t0 + INERTIE, s.schoolStart - (CARTES_AVANT_ECOLE + CARTES_MATIN));
      const cTo = s.schoolStart - CARTES_AVANT_ECOLE;
      if (cTo > cFrom) {
        fixed.push({
          id: 'cartes-matin', kind: 'rappel', app: 'revision',
          from: cFrom, to: cTo,
          title: 'Cartes du matin (Révision)',
          science: 'Rappel actif : récupérer de mémoire consolide mieux que relire.'
        });
      }
      const scFrom = Math.max(s.schoolStart, t0 + INERTIE);
      const scTo = Math.min(s.schoolEnd, finDevoirs);
      if (scTo > scFrom) {
        fixed.push({ id: 'cours', kind: 'cours', from: scFrom, to: scTo, title: 'Au lycée', science: 'Note les points clés du jour : ils alimenteront tes cartes du soir.' });
        const dFrom = scTo;
        const dTo = Math.min(scTo + DECOMP, finDevoirs);
        if (dTo > dFrom) {
          fixed.push({
            id: 'decompression', kind: 'pause', from: dFrom, to: dTo,
            title: 'Décompression — marche, encas, pas d’écran',
            science: 'Pause active : 10 à 15 min de mouvement relancent l’attention.'
          });
          if (dTo < finDevoirs) {
            windows.push({ kind: 'profond', from: dTo, to: finDevoirs });
          }
        }
      }
    }

    if (soir >= t0) {
      fixed.push({
        id: 'rappel-soir', kind: 'rappel', app: 'revision',
        from: soir, to: b,
        title: 'Rappel du soir (Révision) — cartes du jour',
        science: 'Rien de nouveau avant le coucher : le sommeil consolide ce qui a été rappelé de mémoire.'
      });
    }
    fixed.push({
      id: 'coucher', kind: 'repos', from: b, to: b,
      title: 'Au lit à ' + fmtHM(b),
      science: 'Le sommeil est la phase active de consolidation de la mémoire.'
    });

    /* Placement des devoirs : même sans fenêtre disponible, les minutes
       non planifiées remontent dans plan.restantes. */
    const placed = [];
    const res = assignTasks(tasks, windows);
    placed.push.apply(placed, res.placed);
    plan.restantes = res.restantes;
    const byId = new Map();
    for (const t of (tasks || [])) byId.set(t.id, t);
    const devoirSlots = placed.map((p, i) => {
      const task = byId.get(p.taskId);
      const label = sujetLabel(profile, p.subject);
      const nom = (task && task.title) ? task.title : '';
      return {
        id: 'devoir-' + i, kind: 'devoir', app: 'focus',
        taskId: p.taskId, subject: p.subject,
        from: p.from, to: p.to,
        title: label + (nom ? ' — ' + nom : ''),
        science: 'Bloc de 45 min max, une seule matière à la fois ; les matières sont entrelacées.'
      };
    });

    plan.slots = fixed.concat(devoirSlots).sort((a, b2) => a.from - b2.from);

    const cut = b - CAFEINE_OFF;
    if (cut >= t0) {
      plan.notes.push({ id: 'cafeine', text: 'Caféine : plus rien après ' + fmtHM(cut) + ' (demi-vie ~5-6 h, elle retarde l’endormissement).' });
    }
    const nuit = nightMinutes(s);
    plan.notes.push({ id: 'sommeil', text: nuitTexte(nuit) });
    if (plan.restantes.length) {
      const tot = plan.restantes.reduce((a, r) => a + r.minutes, 0);
      plan.notes.push({
        id: 'debordement',
        text: 'Il reste ' + fmtDur(tot) + ' de devoirs sans place ce jour — allège, décale au lendemain, ou décale le coucher.'
      });
    }
    return plan;
  }

  return {
    VERSION: VERSION,
    NIVEAUX: NIVEAUX,
    NIVEAU_ORDRE: NIVEAU_ORDRE,
    SPES: SPES,
    TRONC: TRONC,
    spesAttendues: spesAttendues,
    sujetsFor: sujetsFor,
    sujetLabel: sujetLabel,
    sanitizeProfile: sanitizeProfile,
    defaultSettings: defaultSettings,
    sanitizeSettings: sanitizeSettings,
    sanitizeTask: sanitizeTask,
    defaultState: defaultState,
    sanitizeState: sanitizeState,
    dayKey: dayKey,
    bedAbs: bedAbs,
    nightMinutes: nightMinutes,
    fmtHM: fmtHM,
    fmtRange: fmtRange,
    fmtDur: fmtDur,
    nuitTexte: nuitTexte,
    chunksOf: chunksOf,
    placeChunks: placeChunks,
    assignTasks: assignTasks,
    planDay: planDay
  };

})();
});
