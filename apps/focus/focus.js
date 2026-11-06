/* Focus — logique de l'app.
   Fondée sur docs/recherche-focus-tda-tsa.md :
   flux auto-régulé par défaut (Smits 2024), temps toujours visible (CHADD),
   bruit blanc/rose/marron (JAACAP 2024), pauses actives (PLOS ONE 2023),
   body doubling local (Eagle 2024), déroulé visuel + récompense par centre
   d'intérêt (visual schedules, Dachez & Ndobo 2018), tout réglable (TEACCH). */
(function () {
  'use strict';

  const LS = {
    settings: 'lenancker.focus.settings',
    intent: 'lenancker.focus.intent',
    sessions: 'lenancker.focus.sessions',
    days: 'lenancker.focus.days',
  };
  const MIN = 60000;
  const RING_C = 2 * Math.PI * 88;

  const $ = (id) => document.getElementById(id);
  const els = {
    brand: $('brand-logo'),
    presenceSetup: $('presence-setup'), presenceLive: $('presence-live'),
    task: $('task'), ifThen: $('ifthen'), reward: $('reward'),
    modeFlux: $('mode-flux'), modePom: $('mode-pomodoro'), modeHint: $('mode-hint'),
    fluxMin: $('flux-min'), fluxMax: $('flux-max'),
    pomFocus: $('pom-focus'), pomBreak: $('pom-break'), pomCycles: $('pom-cycles'),
    noise: $('noise'), noiseVol: $('noise-vol'), sounds: $('sounds'),
    fidget: $('fidget'), reduceAnim: $('reduce-anim'),
    start: $('start-session'), setupHint: $('setup-hint'),
    setupCard: $('setup-card'), sessionCard: $('session-card'),
    stepFocus: $('step-focus'), stepBreak: $('step-break'), stepDone: $('step-done'),
    ringFill: $('ring-fill'), ringWrap: document.querySelector('.ring-wrap'),
    bigTime: $('big-time'), phaseLabel: $('phase-label'),
    liveTask: $('live-task'), ifThenReminder: $('ifthen-reminder'), fidgetHint: $('fidget-hint'),
    distBadge: $('dist-badge'),
    focusView: $('focus-view'), breakView: $('break-view'),
    cut: $('btn-cut'), dist: $('btn-dist'), resume: $('btn-resume'), finish: $('btn-finish'),
    finishEarly: $('btn-finish-early'),
    breakTitle: $('break-title'), breakIdea: $('break-idea'),
    breakPomHint: $('break-pom-hint'),
    doneCard: $('done-card'), doneStats: $('done-stats'), donePoints: $('done-points'),
    doneRewardLead: $('done-reward-lead'), doneReward: $('done-reward'),
    rewardTimers: $('reward-timers'), rewardTime: $('reward-time'), btnRewardDone: $('btn-reward-done'),
    again: $('btn-again'),
    weekChart: $('week-chart'),
    statTotal: $('stat-total'), statStreak: $('stat-streak'), statSessions: $('stat-sessions'), statPoints: $('stat-points'),
    storageBadge: $('storage-badge'), btnExport: $('btn-export'), btnImport: $('btn-import'),
    importInput: $('import-input'), storageInfo: $('storage-info'),
  };
  els.brand.innerHTML = window.iconSvg('timer');

  /* ---------- Stockage en cascade (implémentation : common.js) ----------
     Le localStorage dépend du contexte de navigation : navigation privée,
     données de site bloquées, ou base du navigateur verrouillée au lancement
     (antivirus, seconde instance — souvent transitoire, cf. METAACCESS).
     On sonde dès l'ouverture plutôt que d'échouer au premier clic, on
     affiche la cause, et on re-sonde quand la fenêtre redevient visible. */
  const storage = {
    get(key) { return window.lenanckerStorage.get(key); },
    set(key, value) {
      if (window.lenanckerStorage.set(key, value)) return true;
      storageRecheck(true); // la panne peut être transitoire : re-sonde tout de suite
      return false;
    },
  };

  let lastStorageRecheck = 0;
  function storageRecheck(force) {
    const now = Date.now();
    if (!force && now - lastStorageRecheck < 10000) return;
    lastStorageRecheck = now;
    const res = window.lenanckerStorage.recheck();
    if (res === 'healed') {
      renderStorageState();
      renderStats();
      window.toast('Stockage local rétabli — réglages, points et série sont de nouveau enregistrés.', 'ok', 5200);
    } else if (res === 'degraded') {
      renderStorageState();
      window.toast('Le stockage local vient de lâcher — l\u2019app continue au niveau trouvé. Exporte tes données pour les garder.', 'warn', 7000);
    } else if (res === 'session') {
      renderStorageState();
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') storageRecheck(false);
  });
  window.addEventListener('focus', () => storageRecheck(false));

  function renderStorageState() {
    const mode = window.lenanckerStorage.mode;
    const bad = mode !== 'local';
    if (els.storageBadge) {
      els.storageBadge.hidden = !bad;
      els.storageBadge.textContent = mode === 'session'
        ? 'stocké dans cet onglet seulement'
        : 'stockage bloqué — exporte tes données';
      els.storageBadge.title = bad
        ? `Stockage durable indisponible${storageCauseText()}`
        : '';
    }
    if (els.storageInfo) {
      els.storageInfo.classList.toggle('hidden', !bad);
      if (bad) {
        els.storageInfo.innerHTML = mode === 'session'
          ? modeSessionInfo.innerHTML
          : modeMemoryInfo.innerHTML;
      }
    }
  }

  const modeSessionInfo = document.createElement('div');
  modeSessionInfo.textContent =
    'Le stockage durable est indisponible dans ce contexte (souvent : navigation privée, données de site ' +
    'bloquées, ou base du navigateur verrouillée par un antivirus ou un second lancement — la fermer puis ' +
    'rouvrir suffit la plupart du temps). Cet onglet garde tout jusqu\u2019à sa fermeture : exporte tes données ci-dessous pour les conserver.';
  const modeMemoryInfo = document.createElement('div');
  modeMemoryInfo.textContent =
    'Aucun stockage du navigateur n\u2019est disponible ici : tout reste en mémoire et sera perdu au rechargement. ' +
    'Vérifie que le navigateur autorise les cookies/le stockage de sites pour cette page, ou relance l\u2019application ' +
    'si la base était verrouillée. Exporte tes données ci-dessous avant de fermer.';

  function storageCauseText() {
    const c = window.lenanckerStorage.cause;
    if (!c) return '.';
    const name = c && c.name ? c.name : 'erreur inconnue';
    return ` — cause détectée : ${name}.`;
  }

  /* ---------- Réglages ---------- */
  const defaults = {
    mode: 'flux', fluxMin: 10, fluxMax: 45,
    pomFocus: 25, pomBreak: 5, pomCycles: 4,
    noise: 'none', noiseVol: 0.35, sounds: 'soft',
    fidget: true, reduceAnim: false, rewardMin: 10,
  };
  let settings = Object.assign({}, defaults);
  try {
    settings = Object.assign(defaults, JSON.parse(storage.get(LS.settings) || '{}'));
  } catch { /* réglages corrompus : valeurs par défaut */ }
  if (![5, 10, 15].includes(settings.rewardMin)) settings.rewardMin = 10;

  function persistSettings() {
    storage.set(LS.settings, JSON.stringify(settings));
  }

  function applySettingsToUI() {
    (settings.mode === 'pomodoro' ? els.modePom : els.modeFlux).classList.add('active');
    (settings.mode === 'pomodoro' ? els.modeFlux : els.modePom).classList.remove('active');
    els.modeFlux.setAttribute('aria-pressed', settings.mode === 'flux');
    els.modePom.setAttribute('aria-pressed', settings.mode === 'pomodoro');
    document.querySelectorAll('.flux-only').forEach((n) => n.classList.toggle('hidden', settings.mode !== 'flux'));
    document.querySelectorAll('.pom-only').forEach((n) => n.classList.toggle('hidden', settings.mode !== 'pomodoro'));
    els.fluxMin.value = settings.fluxMin; els.fluxMax.value = settings.fluxMax;
    els.pomFocus.value = settings.pomFocus; els.pomBreak.value = settings.pomBreak; els.pomCycles.value = settings.pomCycles;
    els.noise.value = settings.noise;
    els.noiseVol.value = settings.noiseVol;
    els.noiseVol.style.setProperty('--v', `${settings.noiseVol * 100}%`);
    els.sounds.value = settings.sounds;
    els.fidget.checked = !!settings.fidget;
    els.reduceAnim.checked = !!settings.reduceAnim;
    document.documentElement.classList.toggle('fx-reduce', !!settings.reduceAnim);
  }
  applySettingsToUI();
  if (!storage.get(LS.settings) && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    settings.reduceAnim = true; applySettingsToUI(); persistSettings();
  }

  let intent = {};
  try { intent = JSON.parse(storage.get(LS.intent) || '{}') || {}; } catch { intent = {}; }
  if (intent.task) els.task.value = intent.task;
  if (intent.ifThen) els.ifThen.value = intent.ifThen;
  if (intent.reward) els.reward.value = intent.reward;

  /* L'intention (tâche, plan si… alors…, récompense) est la partie la plus
     longue à reformuler : on l'enregistre au fil de la frappe, même sans
     session lancée — avant, elle n'était conservée qu'au clic « Commencer ». */
  let intentSaveJob = 0;
  function saveIntentSoon() {
    if (intentSaveJob) clearTimeout(intentSaveJob);
    intentSaveJob = setTimeout(() => {
      intentSaveJob = 0;
      intent = {
        task: els.task.value.trim(),
        ifThen: els.ifThen.value.trim(),
        reward: els.reward.value.trim(),
      };
      storage.set(LS.intent, JSON.stringify(intent));
    }, 400);
  }
  [els.task, els.ifThen, els.reward].forEach((el) => el && el.addEventListener('input', saveIntentSoon));

  function on(el, evt, fn) { el.addEventListener(evt, fn); }
  on(els.modeFlux, 'click', () => { settings.mode = 'flux'; applySettingsToUI(); persistSettings(); });
  on(els.modePom, 'click', () => { settings.mode = 'pomodoro'; applySettingsToUI(); persistSettings(); });
  on(els.fluxMin, 'change', () => { settings.fluxMin = clampInt(els.fluxMin.value, 1, 120, 10); persistSettings(); });
  on(els.fluxMax, 'change', () => { settings.fluxMax = clampInt(els.fluxMax.value, 5, 240, 45); persistSettings(); });
  on(els.pomFocus, 'change', () => { settings.pomFocus = clampInt(els.pomFocus.value, 5, 90, 25); persistSettings(); });
  on(els.pomBreak, 'change', () => { settings.pomBreak = clampInt(els.pomBreak.value, 1, 30, 5); persistSettings(); });
  on(els.pomCycles, 'change', () => { settings.pomCycles = clampInt(els.pomCycles.value, 1, 10, 4); persistSettings(); });
  on(els.noise, 'change', () => {
    settings.noise = els.noise.value; persistSettings();
    if (engine) audio.setNoise(settings.noise, settings.noiseVol); // en session : applique tout de suite
  });
  on(els.noiseVol, 'input', () => {
    settings.noiseVol = Number(els.noiseVol.value); persistSettings();
    els.noiseVol.style.setProperty('--v', `${settings.noiseVol * 100}%`);
    if (engine) audio.setVolume(settings.noiseVol);
  });
  on(els.sounds, 'change', () => { settings.sounds = els.sounds.value; persistSettings(); });
  on(els.fidget, 'change', () => { settings.fidget = els.fidget.checked; persistSettings(); });
  on(els.reduceAnim, 'change', () => {
    settings.reduceAnim = els.reduceAnim.checked; persistSettings();
    document.documentElement.classList.toggle('fx-reduce', settings.reduceAnim);
  });

  function clampInt(v, lo, hi, fallback) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  }

  /* ---------- Audio (WebAudio, sans fichier) ---------- */
  const audio = {
    ctx: null, src: null, gain: null, tickJob: 0, kind: 'none',
    ensure() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    buffer(kind) {
      const ctx = this.ctx;
      const len = 2 * ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      if (kind === 'white') {
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } else if (kind === 'pink') { // filtre Paul Kellet
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        }
      } else { // marron : intégrateur à fuite
        let last = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      }
      return buf;
    },
    setNoise(kind, vol) {
      this.stopNoise();
      this.kind = kind;
      if (!kind || kind === 'none' || !engine) return;
      const ctx = this.ensure();
      this.src = ctx.createBufferSource();
      this.src.buffer = this.buffer(kind);
      this.src.loop = true;
      this.gain = ctx.createGain();
      this.gain.gain.value = vol * 0.3;
      this.src.connect(this.gain).connect(ctx.destination);
      this.src.start();
    },
    setVolume(vol) { if (this.gain) this.gain.gain.value = vol * 0.3; },
    stopNoise() {
      if (this.src) { try { this.src.stop(); } catch { /* déjà stoppée */ } this.src = null; this.gain = null; }
    },
    chime() {
      if (settings.sounds === 'none') return;
      const ctx = this.ensure();
      const notes = [659.25, 987.77]; // mi5, si5 — deux notes brèves et douces
      notes.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const t0 = ctx.currentTime + i * 0.14;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
        o.connect(g).connect(ctx.destination);
        o.start(t0); o.stop(t0 + 0.4);
      });
    },
    tickStart() {
      this.tickStop();
      if (settings.sounds !== 'tick') return;
      this.tickJob = setInterval(() => {
        const ctx = this.ensure();
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 1400;
        g.gain.setValueAtTime(0.014, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.03);
        o.connect(g).connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.04);
      }, 1000);
    },
    tickStop() { if (this.tickJob) { clearInterval(this.tickJob); this.tickJob = 0; } },
    close() { this.stopNoise(); this.tickStop(); },
  };

  /* ---------- Body doubling local (onglets/appareils du même navigateur) ---------- */
  const presence = {
    ch: 'BroadcastChannel' in window ? new BroadcastChannel('lenancker-focus') : null,
    me: Math.random().toString(36).slice(2),
    peers: new Map(), active: false, beat: 0,
    start() {
      if (!this.ch) return;
      this.active = true;
      this.post('join');
      this.beat = setInterval(() => this.post('beat'), 4000);
    },
    stop() {
      if (!this.ch) return;
      if (this.active) this.post('leave');
      if (this.beat) clearInterval(this.beat);
      this.active = false; this.peers.clear(); this.render();
    },
    post(kind) { try { this.ch.postMessage({ id: this.me, kind, ts: Date.now() }); } catch { /* canal fermé */ } },
    listen() {
      if (!this.ch) return;
      this.ch.onmessage = (e) => {
        const m = e.data || {};
        if (m.id === this.me) return;
        const now = Date.now();
        for (const [id, ts] of this.peers) if (now - ts > 12000) this.peers.delete(id);
        if (m.kind === 'leave') this.peers.delete(m.id);
        else this.peers.set(m.id, m.ts);
        this.render();
      };
    },
    count() {
      const now = Date.now();
      for (const [id, ts] of this.peers) if (now - ts > 12000) this.peers.delete(id);
      return this.peers.size;
    },
    render() {
      const n = this.count();
      const label = n > 0 ? `${n + 1} en session` : '';
      els.presenceSetup.hidden = n < 1;
      els.presenceLive.classList.toggle('hidden', n < 1);
      if (n >= 1) {
        els.presenceSetup.textContent = `${n + 1} session(s) en cours`;
        els.presenceLive.textContent = `${n + 1} en session — body doubling`;
      }
    },
  };
  presence.listen();
  addEventListener('pagehide', () => { presence.stop(); audio.close(); });

  /* ---------- Sessions / stats ---------- */
  function loadSessions() {
    try { return JSON.parse(storage.get(LS.sessions) || '[]') || []; } catch { return []; }
  }
  function loadDays() {
    try { return JSON.parse(storage.get(LS.days) || '{}') || {}; } catch { return {}; }
  }

  function renderStats() {
    const sessions = loadSessions();
    const days = loadDays();
    const week = FocusCore.last7Days(sessions, Date.now());
    const totalMs = sessions.reduce((a, s) => a + (s.focusMs || 0), 0);
    const points = FocusCore.pointsFor(totalMs);
    const streak = FocusCore.computeStreak(Object.keys(days), Date.now());
    els.weekChart.innerHTML = '';
    const maxMs = Math.max(...week.map((d) => d.focusMs), 5 * MIN);
    week.forEach((d, i) => {
      const wrap = document.createElement('div');
      wrap.className = `week-day${i === 6 ? ' today' : ''}`;
      const bar = document.createElement('div');
      bar.className = 'week-bar';
      bar.style.height = `${Math.max(3, Math.round((d.focusMs / maxMs) * 100))}%`;
      bar.title = `${Math.round(d.focusMs / MIN)} min`;
      const lab = document.createElement('span');
      lab.className = 'small';
      lab.textContent = d.label;
      wrap.append(bar, lab);
      els.weekChart.appendChild(wrap);
    });
    // lecteurs d'écran : le contenu du graphique, pas seulement son rôle
    const summary = week.map((d) => `${d.key} : ${Math.round(d.focusMs / MIN)} min`).join(', ');
    els.weekChart.setAttribute('aria-label', `Minutes de focus des 7 derniers jours — ${summary}`);

    els.statTotal.textContent = totalMs >= 60 * MIN
      ? `${Math.round(totalMs / MIN / 60 * 10) / 10} h`
      : `${Math.round(totalMs / MIN)} min`;
    els.statStreak.textContent = streak;
    els.statSessions.textContent = sessions.length;
    els.statPoints.textContent = points;
  }

  /* ---------- Export / import (les données te suivent) ----------
     Le localStorage est propre à chaque contexte (fenêtre privée vidée à la
     fermeture, site ≠ localhost ≠ exe). L'export permet de conserver et
     transporter réglages, points, sessions et série. */
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function exportData() {
    const payload = {
      app: 'lenancker-focus',
      v: 1,
      exportedAt: new Date().toISOString(),
      settings,
      intent,
      sessions: loadSessions(),
      days: loadDays(),
    };
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const name = `lenancker-focus-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
    downloadBlob(name, new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    window.toast('Données exportées — garde ce fichier, il restaure tout.', 'ok');
  }

  function sanitizeSettings(inc) {
    const out = Object.assign({}, defaults, settings);
    if (!inc || typeof inc !== 'object') return out;
    if (inc.mode === 'flux' || inc.mode === 'pomodoro') out.mode = inc.mode;
    out.fluxMin = clampInt(inc.fluxMin, 1, 120, out.fluxMin);
    out.fluxMax = clampInt(inc.fluxMax, 5, 240, out.fluxMax);
    out.pomFocus = clampInt(inc.pomFocus, 5, 90, out.pomFocus);
    out.pomBreak = clampInt(inc.pomBreak, 1, 30, out.pomBreak);
    out.pomCycles = clampInt(inc.pomCycles, 1, 10, out.pomCycles);
    if (['none', 'white', 'pink', 'brown'].includes(inc.noise)) out.noise = inc.noise;
    if (Number.isFinite(Number(inc.noiseVol))) out.noiseVol = Math.min(1, Math.max(0, Number(inc.noiseVol)));
    if (['none', 'soft', 'tick'].includes(inc.sounds)) out.sounds = inc.sounds;
    if (typeof inc.fidget === 'boolean') out.fidget = inc.fidget;
    if (typeof inc.reduceAnim === 'boolean') out.reduceAnim = inc.reduceAnim;
    if ([5, 10, 15].includes(Number(inc.rewardMin))) out.rewardMin = Number(inc.rewardMin);
    return out;
  }

  async function importData(file) {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      window.toast('Fichier illisible : ce n\u2019est pas du JSON.', 'err');
      return;
    }
    if (!data || data.app !== 'lenancker-focus' || typeof data !== 'object') {
      window.toast('Fichier inconnu — exporte d\u2019abord tes données depuis l\u2019app Focus.', 'err');
      return;
    }
    // réglages
    settings = sanitizeSettings(data.settings);
    persistSettings();
    applySettingsToUI();
    if (data.intent && typeof data.intent === 'object') {
      intent = {
        task: String(data.intent.task || ''),
        ifThen: String(data.intent.ifThen || ''),
        reward: String(data.intent.reward || ''),
      };
      storage.set(LS.intent, JSON.stringify(intent));
      els.task.value = intent.task; els.ifThen.value = intent.ifThen; els.reward.value = intent.reward;
    }
    // sessions : fusion sans doublon (clé ts)
    if (Array.isArray(data.sessions)) {
      const seen = new Set(loadSessions().map((s) => s.ts));
      const merged = loadSessions();
      for (const s of data.sessions) {
        if (s && Number.isFinite(s.ts) && !seen.has(s.ts)) {
          seen.add(s.ts);
          merged.push({ ts: s.ts, focusMs: Math.max(0, Number(s.focusMs) || 0), distractions: Math.max(0, Math.floor(Number(s.distractions) || 0)), mode: s.mode === 'pomodoro' ? 'pomodoro' : 'flux', segments: Math.max(0, Math.floor(Number(s.segments) || 0)) });
        }
      }
      merged.sort((a, b) => a.ts - b.ts);
      storage.set(LS.sessions, JSON.stringify(merged));
    }
    // série de jours
    if (data.days && typeof data.days === 'object') {
      const days = loadDays();
      for (const k of Object.keys(data.days)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k)) days[k] = true;
      }
      storage.set(LS.days, JSON.stringify(days));
    }
    renderStats();
    window.toast('Données importées : réglages, points et série fusionnés.', 'ok');
  }

  if (els.btnExport) els.btnExport.addEventListener('click', exportData);
  if (els.btnImport) {
    els.btnImport.addEventListener('click', () => els.importInput && els.importInput.click());
    if (els.importInput) {
      els.importInput.addEventListener('change', () => {
        const f = els.importInput.files && els.importInput.files[0];
        if (f) importData(f);
        els.importInput.value = '';
      });
    }
  }

  /* ---------- Machine de session ---------- */
  let engine = null;
  let tick = 0;
  let chimeMaxDone = false;

  const BREAK_IDEAS = [
    'Lève-toi et marche 2 minutes.',
    '10 squats, tranquillement.',
    'Étirements nuque et épaules (30 s chaque côté).',
    'Regarde au loin par la fenêtre 20 s — repos des yeux.',
    'Montées de genoux sur place, 1 minute.',
    'Étire les poignets et les doigts, puis secoue les mains.',
    'Bois un verre d\u2019eau.',
    'Debout : enroule/déroule la colonne, respire 3 fois lentement.',
    'Sauts sur place ou marche rapide 1 minute.',
    'Rien d\u2019obligé : regarde ailleurs, laisse ton cerveau vagabonder 1 min.',
  ];
  let breakIdeaIndex = Math.floor(Math.random() * BREAK_IDEAS.length);

  function setRing(p, cls) {
    els.ringFill.style.strokeDashoffset = String(RING_C * (1 - Math.min(1, Math.max(0, p))));
    els.ringWrap.className = `ring-wrap${cls ? ' ' + cls : ''}`;
  }

  function stepStates(map) {
    els.stepFocus.className = map.focus;
    els.stepBreak.className = map.break;
    els.stepDone.className = map.done;
  }

  function showScreen(which) {
    els.setupCard.classList.toggle('hidden', which !== 'setup');
    els.sessionCard.classList.toggle('hidden', which !== 'session');
    els.doneCard.classList.toggle('hidden', which !== 'done');
  }

  function startSession() {
    intent = {
      task: els.task.value.trim(),
      ifThen: els.ifThen.value.trim(),
      reward: els.reward.value.trim(),
    };
    storage.set(LS.intent, JSON.stringify(intent));

    const durations = settings.mode === 'pomodoro'
      ? { pomFocusMs: settings.pomFocus * MIN, pomBreakMs: settings.pomBreak * MIN, cycles: settings.pomCycles }
      : { fluxMinMs: Math.min(settings.fluxMin, settings.fluxMax) * MIN, fluxMaxMs: Math.max(settings.fluxMin, settings.fluxMax) * MIN };

    engine = FocusCore.createEngine(Object.assign({ mode: settings.mode, now: () => Date.now() }, durations));
    chimeMaxDone = false;
    engine.start();

    els.liveTask.innerHTML = intent.task ? `Sur quoi : <strong>${escapeHtml(intent.task)}</strong>` : '';
    els.ifThenReminder.classList.add('hidden');
    els.fidgetHint.classList.toggle('hidden', !settings.fidget);
    els.distBadge.classList.add('hidden');
    els.focusView.classList.remove('hidden');
    els.breakView.classList.add('hidden');
    els.doneReward.textContent = intent.reward || '';
    els.rewardTimers.classList.toggle('hidden', !intent.reward);
    els.rewardTime.classList.add('hidden');
    els.btnRewardDone.classList.add('hidden');

    stepStates({ focus: 'active', break: '', done: '' });
    showScreen('session');
    window.scrollTo({ top: 0, behavior: settings.reduceAnim ? 'auto' : 'smooth' });
    window.toast('Session démarrée — le flow décide de la pause.', 'ok');

    presence.start();
    audio.ensure();
    if (settings.noise !== 'none') audio.setNoise(settings.noise, settings.noiseVol);
    audio.tickStart();
    if (tick) clearInterval(tick);
    tick = setInterval(tickLoop, 500);
    tickLoop();
  }

  function endFocusSegment(auto) {
    const res = engine.cut();
    if (!res) return;
    audio.stopNoise();
    audio.chime();
    stepStates({ focus: 'done', break: 'active', done: '' });
    els.focusView.classList.add('hidden');
    els.breakView.classList.remove('hidden');
    breakIdeaIndex = (breakIdeaIndex + 1) % BREAK_IDEAS.length;
    els.breakIdea.textContent = BREAK_IDEAS[breakIdeaIndex];
    els.breakTitle.textContent = 'Pause active';
    const minMode = settings.mode === 'pomodoro';
    els.breakPomHint.classList.toggle('hidden', !minMode);
    const doneCycles = engine.state.cyclesDone;
    if (minMode) {
      const remainingRun = doneCycles < engine.o.cycles;
      els.breakPomHint.textContent = remainingRun
        ? `Reprise automatique dans ${settings.pomBreak} min.`
        : 'Objectif de cycles atteint — conclus quand tu veux.';
    } else {
      els.breakTitle.textContent = res.short
        ? `Pause — segment court (${Math.max(1, Math.round(res.ms / 1000))} s)`
        : `Pause — segment de ${Math.round(res.ms / MIN)} min`;
    }
    if (auto) window.toast('Temps écoulé : pause.', 'info');
  }

  function resumeFocus() {
    if (!engine.start()) return;
    audio.chime();
    if (settings.noise !== 'none') audio.setNoise(settings.noise, settings.noiseVol);
    stepStates({ focus: 'active', break: '', done: '' });
    els.breakView.classList.add('hidden');
    els.focusView.classList.remove('hidden');
    els.phaseLabel.textContent = 'focus';
  }

  function noteDistraction() {
    if (!engine || engine.state.phase !== 'focus') return;
    const n = engine.noteDistraction();
    els.distBadge.classList.remove('hidden');
    els.distBadge.textContent = `${n} distraction${n > 1 ? 's' : ''}`;
    if (intent.ifThen) {
      els.ifThenReminder.textContent = `Si… alors… : « ${intent.ifThen} »`;
      els.ifThenReminder.classList.remove('hidden');
    }
  }

  function finishSession() {
    if (!engine) return;
    const s = engine.finish();
    if (tick) clearInterval(tick); tick = 0;
    audio.close();
    presence.stop();
    if (settings.sounds === 'soft') audio.chime();

    const sessions = loadSessions();
    sessions.push({ ts: Date.now(), focusMs: s.focusMs, distractions: s.distractions, mode: s.mode, segments: s.segments });
    storage.set(LS.sessions, JSON.stringify(sessions));
    const days = loadDays();
    days[FocusCore.dayKey(Date.now())] = true;
    storage.set(LS.days, JSON.stringify(days));

    // marque ces données comme persistantes si le navigateur l'accepte
    // (limite l'éviction du stockage des PWA installées)
    if (navigator.storage && navigator.storage.persist) {
      try { navigator.storage.persist(); } catch { /* pas disponible */ }
    }

    stepStates({ focus: 'done', break: 'done', done: 'active' });
    els.donePoints.textContent = `${s.points} point${s.points > 1 ? 's' : ''}`;
    const min = (ms) => FocusCore.formatMs(ms);
    els.doneStats.innerHTML = [
      `<span class="stat-line">Temps de focus : <b>${min(s.focusMs)}</b></span>`,
      `<span class="stat-line">${s.segments} segment${s.segments > 1 ? 's' : ''} (moy. ${min(s.avgSegMs)})</span>`,
      `<span class="stat-line">${s.breaks} pause${s.breaks > 1 ? 's' : ''} active${s.breaks > 1 ? 's' : ''}</span>`,
      `<span class="stat-line">${s.distractions} distraction${s.distractions > 1 ? 's' : ''} notée${s.distractions > 1 ? 's' : ''}</span>`,
      s.points === 0 ? `<span class="stat-line muted">sous la minute : pas encore de point (1 point par minute de focus)</span>` : '',
    ].filter(Boolean).join(' ');
    els.doneRewardLead.textContent = intent.reward ? 'Maintenant, ta récompense :' : 'Une idée de récompense (centre d\u2019intérêt) pour la prochaine fois ?';
    showScreen('done');
    renderStats();
    document.title = 'Focus — Lenancker Launcher';
    window.toast('Session terminée — bilan disponible.', 'ok');
    engine = null;
  }

  /* Minuteur de récompense : durée au choix, douce, sans pression. */
  let rewardJob = 0;
  function applyRewardUI() {
    els.rewardTimers.querySelectorAll('button').forEach((b) => {
      const active = Number(b.dataset.min) === settings.rewardMin;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }
  function startRewardTimer(mins) {
    if (rewardJob) return;
    const total = mins * MIN;
    els.rewardTime.classList.remove('hidden');
    els.btnRewardDone.classList.remove('hidden');
    els.rewardTime.textContent = FocusCore.formatMs(total);
    const t0 = Date.now();
    rewardJob = setInterval(() => {
      const left = total - (Date.now() - t0);
      if (left <= 0) {
        clearInterval(rewardJob); rewardJob = 0;
        els.rewardTime.textContent = '00:00';
        audio.chime();
        return;
      }
      els.rewardTime.textContent = FocusCore.formatMs(left);
    }, 500);
  }
  if (els.rewardTimers) {
    els.rewardTimers.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        const mins = clampInt(b.dataset.min, 1, 60, settings.rewardMin);
        settings.rewardMin = mins;
        persistSettings();
        applyRewardUI();
        startRewardTimer(mins);
      });
    });
  }
  els.btnRewardDone.addEventListener('click', () => {
    if (rewardJob) { clearInterval(rewardJob); rewardJob = 0; }
    els.rewardTime.classList.add('hidden');
    els.btnRewardDone.classList.add('hidden');
  });

  function tickLoop() {
    if (!engine) return;
    const st = engine.state;
    if (st.phase === 'focus') {
      const elapsed = engine.elapsedFocus();
      if (settings.mode === 'flux') {
        els.bigTime.textContent = FocusCore.formatMs(elapsed);
        document.title = `${FocusCore.formatMs(elapsed)} — Focus`;
        const maxMs = engine.o.fluxMaxMs, minMs = engine.o.fluxMinMs;
        setRing(elapsed / maxMs, elapsed > maxMs ? 'in-hint' : '');
        if (elapsed >= minMs && elapsed < maxMs) els.phaseLabel.textContent = 'focus — pause quand tu veux';
        else if (elapsed >= maxMs) {
          els.phaseLabel.textContent = 'pause conseillée (jamais imposée)';
          if (!chimeMaxDone) { chimeMaxDone = true; audio.chime(); }
        } else {
          els.phaseLabel.textContent = 'focus — montée';
          chimeMaxDone = false;
        }
      } else {
        const left = Math.max(0, engine.o.pomFocusMs - elapsed);
        els.bigTime.textContent = FocusCore.formatMs(left);
        document.title = `${FocusCore.formatMs(left)} — Focus`;
        setRing(1 - elapsed / engine.o.pomFocusMs, '');
        els.phaseLabel.textContent = 'focus';
        if (left <= 0) endFocusSegment(true);
      }
    } else if (st.phase === 'break') {
      const elapsed = engine.elapsedBreak();
      els.bigTime.textContent = FocusCore.formatMs(elapsed);
      document.title = 'pause — Focus';
      if (settings.mode === 'pomodoro') {
        const left = Math.max(0, engine.o.pomBreakMs - elapsed);
        els.bigTime.textContent = FocusCore.formatMs(left);
        setRing(1 - elapsed / engine.o.pomBreakMs, 'in-break');
        if (left <= 0) {
          if (engine.state.cyclesDone < engine.o.cycles) resumeFocus();
          else els.breakPomHint.textContent = 'Pause terminée — conclus quand tu veux.';
        }
      } else {
        setRing(Math.min(1, elapsed / (engine.o.fluxMinMs || MIN)), 'in-break');
        els.phaseLabel.textContent = 'pause active';
      }
    }
  }

  /* ---------- Événements ---------- */
  els.start.addEventListener('click', startSession);
  els.cut.addEventListener('click', () => endFocusSegment(false));
  els.dist.addEventListener('click', noteDistraction);
  els.resume.addEventListener('click', resumeFocus);
  els.finish.addEventListener('click', finishSession);
  els.finishEarly.addEventListener('click', finishSession);
  els.again.addEventListener('click', () => {
    document.title = 'Focus — Lenancker Launcher';
    showScreen('setup');
  });

  /* ---------- Raccourcis clavier (session en cours) ----------
     Espace = action principale (pause quand le flow casse / reprendre),
     D = noter une distraction. Jamais pendant la saisie d'un champ. */
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    const t = e.target;
    // si le focus est sur un contrôle, Espace/D doit rester à ce contrôle (a11y)
    if (t && t.closest && t.closest('input, textarea, select, button, a, [contenteditable], [role="button"]')) return;
    if (!engine) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (engine.state.phase === 'focus') endFocusSegment(false);
      else if (engine.state.phase === 'break') resumeFocus();
    } else if (e.key === 'd' || e.key === 'D') {
      if (engine.state.phase === 'focus') noteDistraction();
    }
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- Init ---------- */
  renderStats();
  presence.render();
  renderStorageState();
  applyRewardUI();
  if (window.lenanckerStorage.mode !== 'local') {
    window.toast(window.lenanckerStorage.mode === 'session'
      ? 'Stockage durable indisponible dans ce contexte — cet onglet garde tout jusqu\u2019à sa fermeture.'
      : 'Aucun stockage disponible ici — tout sera perdu au rechargement : exporte tes données.', 'warn', 9000);
  }
})();
