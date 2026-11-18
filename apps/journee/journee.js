/* journee.js — Interface de l'app Journée : quiz de première ouverture
   (sans IA : classe → spécialités selon le niveau → horaires), puis
   réglages, devoirs et chronologie recalculés à chaque changement.
   L'état persiste dans lenancker.journee.v1 (le pont sync-bridge
   l'envoie vers PocketBase, attribué au compte connecté). */
(function () {
'use strict';

const Core = window.JourneeCore;
if (!Core) return;
const storage = window.lenanckerStorage;

const LS = 'lenancker.journee.v1';
const $ = (id) => document.getElementById(id);

const KIND = {
  repos: ['b-repos', 'Repos'],
  cours: ['b-cours', 'Cours'],
  rappel: ['b-rappel', 'Rappel'],
  pause: ['b-pause', 'Pause'],
  devoir: ['b-devoir', 'Devoir']
};
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const JOURS_LG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/* --- État --- */
let state = Core.sanitizeState(storage.get(LS) ? JSON.parse(storage.get(LS)) : null);
let todayIdx = -1;

function save() {
  state.savedAtMs = Date.now();
  storage.set(LS, JSON.stringify(state));
}

/* --- Petites aides --- */
function toHHMM(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
}
function todayKey() { return Core.dayKey(Date.now()); }

function currentDayType() {
  todayIdx = (new Date().getDay() + 6) % 7;
  return state.settings.weekdays[todayIdx] === 'libre' ? 'libre' : 'cours';
}

/* --- Quiz de première ouverture --- */
const quiz = { niveau: null, spes: [], step: 1 };

function quizVisible(show) {
  $('quiz').hidden = !show;
  $('app').hidden = show;
  $('hero') && ($('hero').hidden = show);
  if (!show) {
    quiz.niveau = null; quiz.spes = []; quiz.step = 1;
  }
}

function quizGo(step) {
  quiz.step = step;
  const attendues = quiz.niveau ? Core.spesAttendues(quiz.niveau) : 0;
  $('q1').hidden = step !== 1;
  $('q2').hidden = step !== 2;
  $('q3').hidden = step !== 3;
  $('quiz-prev').hidden = step === 1;
  $('quiz-next').textContent = step === 3 ? 'Terminer' : 'Continuer';
  $('quiz-steps').innerHTML = [1, 2, 3].map((n) => '<i class="' + (n <= step ? 'on' : '') + '"></i>').join('');
  if (step === 2 && attendues === 0) { quizGo(3); return; }
  if (step === 2) {
    $('q2-lead').textContent = 'Tes spécialités — coche exactement ' + attendues + (attendues > 1 ? ' spécialités' : ' spécialité') + ' :';
    renderSpes();
  }
  quizNextState();
}

function quizNextState() {
  const b = $('quiz-next');
  const attendues = quiz.niveau ? Core.spesAttendues(quiz.niveau) : 0;
  if (quiz.step === 1) b.disabled = !quiz.niveau;
  else if (quiz.step === 2) b.disabled = quiz.spes.length !== attendues;
  else b.disabled = false;
}

function renderNiveaux() {
  const wrap = $('quiz-niveau');
  wrap.innerHTML = '';
  Core.NIVEAU_ORDRE.forEach((nv) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.niveau = nv;
    b.innerHTML = Core.NIVEAUX[nv].label + '<small>' + (Core.NIVEAUX[nv].spes === 0
      ? 'Pas encore de spécialité : cette étape sera passée.'
      : Core.NIVEAUX[nv].spes + ' spécialités à cocher.') + '</small>';
    b.className = nv === quiz.niveau ? 'sel' : '';
    b.addEventListener('click', () => {
      quiz.niveau = nv;
      quiz.spes = [];
      [...wrap.children].forEach((c) => { c.className = c.dataset.niveau === nv ? 'sel' : ''; });
      quizNextState();
    });
    wrap.appendChild(b);
  });
}

function renderSpes() {
  const wrap = $('quiz-spes');
  wrap.innerHTML = '';
  const attendues = Core.spesAttendues(quiz.niveau);
  Core.SPES.forEach((sp) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = sp.label;
    b.dataset.spid = sp.id;
    b.className = quiz.spes.indexOf(sp.id) >= 0 ? 'sel' : '';
    b.addEventListener('click', () => {
      const i = quiz.spes.indexOf(sp.id);
      if (i >= 0) {
        quiz.spes.splice(i, 1);
        b.className = '';
      } else if (quiz.spes.length < attendues) {
        quiz.spes.push(sp.id);
        b.className = 'sel';
      } else if (window.toast) {
        window.toast('Tu as déjà coché tes ' + attendues + ' spécialités — décoche-en une pour en changer.', 'info');
      }
      $('spes-msg').textContent = quiz.spes.length + ' sur ' + attendues + (quiz.spes.length === attendues ? ' — parfait.' : '');
      quizNextState();
    });
    wrap.appendChild(b);
  });
  $('spes-msg').textContent = quiz.spes.length + ' sur ' + attendues;
}

/* --- Réglages --- */
function renderWeekdays() {
  const wrap = $('weekdays');
  wrap.innerHTML = '';
  state.settings.weekdays.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = JOURS[i];
    b.title = JOURS_LG[i] + (t === 'cours' ? ' — lycée' : ' — libre');
    b.className = t === 'cours' ? 'cours' : '';
    b.addEventListener('click', () => {
      state.settings.weekdays[i] = t === 'cours' ? 'libre' : 'cours';
      save(); render();
    });
    wrap.appendChild(b);
  });
}

/* --- Devoirs --- */
function renderSubjects() {
  const sel = $('t-subject');
  const sujets = Core.sujetsFor(state.profile);
  const current = sel.value;
  sel.innerHTML = '';
  sujets.forEach((s) => {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.label;
    sel.appendChild(o);
  });
  if (current && sujets.some((s) => s.id === current)) sel.value = current;
}

let tcharge = 'exigeant';

function renderTasks() {
  const wrap = $('tasks');
  wrap.innerHTML = '';
  if (!state.tasks.length) {
    wrap.innerHTML = '<p class="muted small">Aucun devoir — le moteur laissera la journée respirer.</p>';
    return;
  }
  state.tasks.forEach((t) => {
    const div = document.createElement('div');
    div.className = 'task' + (t.done ? ' t-done' : '');
    const tag = t.charge === 'exigeant'
      ? '<span class="t-tag tag-exigeant">exigeant</span>'
      : '<span class="t-tag tag-leger">léger</span>';
    div.innerHTML =
      '<div class="t-line1">' + tag +
      '<span class="s-title' + (t.done ? ' done-title' : '') + '"></span>' +
      '<span class="t-min">' + Core.fmtDur(t.minutes) + '</span>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-x="' + t.id + '" title="Supprimer ce devoir">×</button></div>' +
      '<div class="t-sub"><span>' + Core.sujetLabel(state.profile, t.subject) + '</span>' +
      '<button type="button" class="lien" data-done="' + t.id + '">' + (t.done ? 'à refaire' : 'marqué fait') + '</button></div>';
    div.querySelector('.s-title').textContent = t.title || 'Devoir';
    div.querySelector('[data-x]').addEventListener('click', () => {
      state.tasks = state.tasks.filter((x) => x.id !== t.id);
      save(); render();
    });
    div.querySelector('[data-done]').addEventListener('click', () => {
      t.done = !t.done;
      save(); render();
    });
    wrap.appendChild(div);
  });
}

/* --- Chronologie --- */
function renderTL(plan) {
  const wrap = $('tl');
  wrap.innerHTML = '';
  const dk = todayKey();
  const doneDay = (state.done[dk] || {});
  plan.slots.forEach((s) => {
    const k = KIND[s.kind] || KIND.repos;
    const row = document.createElement('div');
    row.className = 'slot' + (doneDay[s.id] ? ' sorted' : '');
    const time = s.to > s.from ? Core.fmtRange(s.from, s.to) : '';
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = Core.fmtHM(s.id === 'coucher' ? s.from : s.from);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<div class="s-what"><span class="badge ' + k[0] + '">' + k[1] + '</span>' +
      '<span class="s-title"></span>' +
      (time ? '<span class="s-time">' + time + '</span>' : '') + '</div>' +
      (s.science ? '<p class="s-why"></p>' : '');
    card.querySelector('.s-title').textContent = s.title;
    if (s.science) card.querySelector('.s-why').textContent = s.science;
    if (s.subject) card.dataset.subject = s.subject;

    const actions = document.createElement('div');
    actions.className = 's-actions';
    if (s.app === 'revision') {
      const a = document.createElement('a');
      a.className = 'mini acc'; a.href = '../revision/index.html';
      a.title = 'Ouvre l’app Révision pour ce créneau';
      a.textContent = 'Ouvrir Révision →';
      actions.appendChild(a);
    } else if (s.app === 'focus') {
      const a = document.createElement('a');
      a.className = 'mini acc'; a.href = '../focus/index.html';
      a.title = 'Ouvre l’app Focus pour ce bloc de travail';
      a.textContent = 'Ouvrir Focus →';
      actions.appendChild(a);
    }
    if (s.kind !== 'repos') {
      const lab = document.createElement('label');
      lab.className = 'chk-slot';
      lab.innerHTML = '<input type="checkbox"> fait';
      const cb = lab.querySelector('input');
      cb.checked = !!doneDay[s.id];
      cb.addEventListener('change', () => {
        const day = state.done[dk] || (state.done[dk] = {});
        if (cb.checked) day[s.id] = true; else delete day[s.id];
        if (!Object.keys(day).length) delete state.done[dk];
        save(); render();
      });
      actions.appendChild(lab);
    }
    if (actions.children.length) card.appendChild(actions);
    row.appendChild(when);
    row.appendChild(card);
    wrap.appendChild(row);
  });
}

/* --- Rendu global --- */
function plan() {
  const t = currentDayType();
  return Core.planDay(state.settings, t, state.tasks, state.profile);
}

function render() {
  const t = currentDayType();
  const sujets = state.profile ? Core.NIVEAUX[state.profile.niveau].label + (state.profile.spes.length ? ' — ' + state.profile.spes.length + ' spécialités' : '') : '';
  $('profil-line').textContent = sujets;
  $('wake').value = toHHMM(state.settings.wake);
  $('bed').value = toHHMM(state.settings.bed);
  $('sc1').value = toHHMM(state.settings.schoolStart);
  $('sc2').value = toHHMM(state.settings.schoolEnd);
  $('seg-cours').classList.toggle('on', t === 'cours');
  $('seg-libre').classList.toggle('on', t === 'libre');
  $('seg-libre').classList.remove('hidden');
  $('today-line').textContent = "Aujourd'hui c'est " + JOURS_LG[todayIdx] + (t === 'cours' ? ' (lycée)' : ' (jour libre)') + '. Touche le type ici ou dans les puces du bas :';
  $('plan-kind').textContent = t === 'cours' ? 'jour de lycée' : 'jour libre';
  renderWeekdays();
  renderSubjects();
  renderTasks();
  const p = plan();
  renderTL(p);
  $('notes').innerHTML = p.notes.map((n) =>
    '<p class="nota' + (n.id === 'debordement' ? ' warn' : '') + '"><span class="dot"></span><span></span></p>'
  ).join('');
  const spans = $('notes').querySelectorAll('.nota span:last-child');
  p.notes.forEach((n, i) => { spans[i].textContent = n.text; });
}

/* --- Câblage --- */
function inputToMin(id, fb) {
  const v = $(id).value;
  const p = v.split(':');
  let n = NaN;
  if (p.length === 2) n = ((+p[0] || 0) * 60 + (+p[1] || 0)) % 1440;
  return isFinite(n) && v ? Math.round(n) : fb;
}

function bindTime(id, key) {
  $(id).addEventListener('change', () => {
    state.settings[key] = inputToMin(id, state.settings[key]);
    save(); render();
  });
}

function openQuiz(prefill) {
  if (prefill && state.profile) {
    quiz.niveau = state.profile.niveau;
    quiz.spes = state.profile.spes.slice();
    $('q-wake').value = toHHMM(state.settings.wake);
    $('q-bed').value = toHHMM(state.settings.bed);
    $('q-sc1').value = toHHMM(state.settings.schoolStart);
    $('q-sc2').value = toHHMM(state.settings.schoolEnd);
  }
  renderNiveaux();
  quizVisible(true);
  quizGo(quiz.niveau && Core.spesAttendues(quiz.niveau) === 0 ? 3 : (quiz.niveau ? 2 : 1));
}

function finishQuiz() {
  state.profile = Core.sanitizeProfile({ niveau: quiz.niveau, spes: quiz.spes });
  if (!state.profile || (Core.spesAttendues(quiz.niveau) !== quiz.spes.length && Core.spesAttendues(quiz.niveau) > 0)) return;
  state.settings = Core.sanitizeSettings({
    wake: inputToMin('q-wake', state.settings.wake),
    bed: inputToMin('q-bed', state.settings.bed),
    schoolStart: inputToMin('q-sc1', state.settings.schoolStart),
    schoolEnd: inputToMin('q-sc2', state.settings.schoolEnd),
    weekdays: state.settings.weekdays
  });
  save();
  quizVisible(false);
  render();
  if (window.toast) window.toast('Journée calée ! Chaque créneau t’explique son pourquoi.', 'ok');
}

function init() {
  $('brand-logo').innerHTML = window.iconSvg('jour');

  bindTime('wake', 'wake');
  bindTime('bed', 'bed');
  bindTime('sc1', 'schoolStart');
  bindTime('sc2', 'schoolEnd');

  $('seg-cours').addEventListener('click', () => {
    state.settings.weekdays[todayIdx] = 'cours'; save(); render();
  });
  $('seg-libre').addEventListener('click', () => {
    state.settings.weekdays[todayIdx] = 'libre'; save(); render();
  });

  $('seg-ex').addEventListener('click', () => {
    tcharge = 'exigeant';
    $('seg-ex').classList.add('on'); $('seg-le').classList.remove('on');
  });
  $('seg-le').addEventListener('click', () => {
    tcharge = 'leger';
    $('seg-le').classList.add('on'); $('seg-ex').classList.remove('on');
  });
  $('seg-ex').classList.add('on');

  $('btn-add-task').addEventListener('click', () => {
    let minutes = Math.round(+$('t-min').value);
    if (!isFinite(minutes) || minutes < 10) minutes = 30;
    if (minutes > 300) minutes = 300;
    const t = Core.sanitizeTask({
      subject: $('t-subject').value,
      charge: tcharge,
      minutes: minutes,
      title: $('t-title').value.trim()
    }, 't' + Date.now().toString(36), state.profile || { niveau: 'premiere', spes: [] });
    state.tasks.push(t);
    $('t-title').value = '';
    save(); render();
  });
  $('t-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-add-task').click(); });

  $('btn-quiz').addEventListener('click', () => openQuiz(true));

  $('quiz-prev').addEventListener('click', () => {
    if (quiz.step === 3) quizGo(Core.spesAttendues(quiz.niveau) > 0 ? 2 : 1);
    else quizGo(1);
  });
  $('quiz-next').addEventListener('click', () => {
    if (quiz.step === 1) {
      quizGo(Core.spesAttendues(quiz.niveau) > 0 ? 2 : 3);
    } else if (quiz.step === 2) {
      quizGo(3);
    } else {
      finishQuiz();
    }
  });

  if (!state.profile) {
    quiz.niveau = null; quiz.spes = [];
    renderNiveaux();
    quizVisible(true);
    quizGo(1);
  } else {
    render();
  }
}

init();
})();
