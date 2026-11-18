'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../apps/journee/core.js');

const PROFILPremiere = {
  niveau: 'premiere',
  spes: ['maths', 'physique-chimie', 'llcer-amc']
};
const DEFAUTS = J.defaultSettings();
const T = (over) => Object.assign({}, {
  id: 't1', subject: 'maths', charge: 'exigeant', minutes: 60, title: 'Exercices', done: false
}, over);

test('le module est requireable sous Node (UMD)', () => {
  assert.ok(J && typeof J.planDay === 'function');
  assert.equal(typeof J.sujetsFor, 'function');
});

/* --- Questionnaire --- */

test('spesAttendues : 0 en seconde, 3 en première, 2 en terminale', () => {
  assert.equal(J.spesAttendues('seconde'), 0);
  assert.equal(J.spesAttendues('premiere'), 3);
  assert.equal(J.spesAttendues('terminale'), 2);
  assert.equal(J.spesAttendues('niveau-inconnu'), 0);
});

test('sanitizeProfile : niveau inconnu → null, spés cataloguées et sans doublon', () => {
  assert.equal(J.sanitizeProfile({ niveau: 'sixième' }), null);
  assert.equal(J.sanitizeProfile(null), null);
  const p = J.sanitizeProfile({ niveau: 'terminale', spes: ['maths', 'maths', 'inexistant', 'svt'] });
  assert.deepEqual(p.spes, ['maths', 'svt']);
});

test('sujetsFor : spés d’abord dans l’ordre du catalogue, tronc commun ensuite, Autre en fin', () => {
  const sujets = J.sujetsFor(PROFILPremiere).map((s) => s.id);
  // llcer-amc, maths et physique-chimie sont dans le catalogue dans cet ordre.
  assert.deepEqual(sujets.slice(0, 3), ['llcer-amc', 'maths', 'physique-chimie']);
  assert.ok(sujets.indexOf('francais') >= 3);
  assert.equal(sujets[sujets.length - 1], 'autre');
});

test('sujetsFor : terminale remplace Français par Philosophie et ajoute le Grand oral', () => {
  const ids = J.sujetsFor({ niveau: 'terminale', spes: ['maths', 'nsi'] }).map((s) => s.id);
  assert.ok(ids.indexOf('philo') >= 0);
  assert.ok(ids.indexOf('grand-oral') >= 0);
  assert.equal(ids.indexOf('francais'), -1);
});

test('sujetsFor : seconde n’a aucune spé et garde le tronc commun', () => {
  const ids = J.sujetsFor({ niveau: 'seconde', spes: [] }).map((s) => s.id);
  assert.equal(ids.filter((i) => i === 'maths').length, 0);
  assert.ok(ids.indexOf('francais') >= 0);
});

test('sujetLabel : libellé lisible même pour un sujet hors liste du profil', () => {
  assert.equal(J.sujetLabel(PROFILPremiere, 'llcer-amc'), 'Anglais monde contemporain');
  assert.equal(J.sujetLabel(PROFILPremiere, 'autre'), 'Autre');
});

/* --- Assainissement --- */

test('sanitizeSettings : bornes 0..1439, coucher différent du lever', () => {
  const s = J.sanitizeSettings({ wake: -30, bed: 2000, schoolStart: 'x', schoolEnd: 100 });
  assert.equal(s.wake, DEFAUTS.wake);
  assert.equal(s.bed, DEFAUTS.bed);
  assert.equal(s.schoolStart, DEFAUTS.schoolStart);
  assert.equal(s.schoolEnd, DEFAUTS.schoolEnd);
  const egal = J.sanitizeSettings({ wake: 600, bed: 600, schoolStart: 510, schoolEnd: 1020 });
  assert.notEqual(egal.bed, egal.wake);
  assert.equal(egal.bed, (600 + 120) % 1440);
});

test('sanitizeSettings : jours de semaine normalisés cours/libre', () => {
  const s = J.sanitizeSettings({ weekdays: ['cours', 'libre', 'nimporte', undefined, 'libre', 'cours', 'cours'] });
  assert.deepEqual(s.weekdays, ['cours', 'libre', 'cours', 'cours', 'libre', 'cours', 'cours']);
});

test('sanitizeSettings : fin des cours avant le début → valeurs par défaut', () => {
  const s = J.sanitizeSettings({ wake: 405, bed: 1170, schoolStart: 1020, schoolEnd: 510 });
  assert.equal(s.schoolStart, DEFAUTS.schoolStart);
  assert.equal(s.schoolEnd, DEFAUTS.schoolEnd);
});

test('sanitizeTask : matière hors liste du profil ramenée à la première proposée', () => {
  const t = J.sanitizeTask({ subject: 'philatelie', charge: 'moyen', minutes: 5, title: '  Réviser  ' }, 't9', PROFILPremiere);
  assert.equal(t.subject, 'llcer-amc');
  assert.equal(t.charge, 'leger');
  assert.equal(t.minutes, 30);
  assert.equal(t.title, 'Réviser');
});

test('sanitizeTask : durée bornée 10..300', () => {
  assert.equal(J.sanitizeTask({ subject: 'maths', minutes: 999 }, 'a', PROFILPremiere).minutes, 300);
  assert.equal(J.sanitizeTask({ subject: 'maths', minutes: 1 }, 'b', PROFILPremiere).minutes, 30);
});

test('sanitizeState : état absent → défauts, profil manquant → questionnaire à refaire', () => {
  const st = J.sanitizeState(null);
  assert.equal(st.profile, null);
  assert.equal(st.tasks.length, 0);
  const st2 = J.sanitizeState({ profile: { niveau: 'premiere', spes: [] }, tasks: [{ subject: 'inexistant', minutes: '40' }] });
  assert.deepEqual(st2.profile.spes, []);
  assert.equal(st2.tasks[0].subject, 'francais');
  assert.equal(st2.tasks[0].minutes, 40);
});

test('sanitizeState : complétions conservées par date valide, plafonnées à 31 dates', () => {
  const done = {};
  for (let i = 1; i <= 40; i++) {
    done['2026-10-' + (i < 10 ? '0' + i : i)] = { 'reveil': true };
  }
  done['nope'] = { x: 1 };
  const st = J.sanitizeState({ profile: PROFILPremiere, done: done });
  assert.ok(Object.keys(st.done).length <= 31);
  assert.equal(st.done['nope'], undefined);
});

test('dayKey : clé locale AAAA-MM-JJ, null si invalide', () => {
  assert.equal(J.dayKey(Date.UTC(2026, 10, 18, 23, 0)), '2026-11-18');
  assert.equal(J.dayKey(NaN), null);
});

/* --- Temps --- */

test('nightMinutes : 6 h 45 → 19 h 30 = 11 h 15 ; coucher après minuit = 6 h', () => {
  assert.equal(J.nightMinutes(DEFAUTS), 675);
  assert.equal(J.nightMinutes({ wake: 420, bed: 60 }), 360);
});

test('fmtHM et fmtDur : formats lisibles', () => {
  assert.equal(J.fmtHM(405), '6 h 45');
  assert.equal(J.fmtHM(120), '2 h');
  assert.equal(J.fmtHM(1170), '19 h 30');
  assert.equal(J.fmtDur(95), '1 h 35');
  assert.equal(J.fmtDur(40), '40 min');
  assert.equal(J.fmtRange(405, 510), '6 h 45 → 8 h 30');
});

test('nuitTexte : message factuel sous / dans / au-dessus de la fourchette', () => {
  assert.ok(J.nuitTexte(420).indexOf('sous la fourchette') >= 0);
  assert.ok(J.nuitTexte(540).indexOf('dans la fourchette') >= 0);
  assert.ok(J.nuitTexte(700).indexOf('au-dessus') >= 0);
});

/* --- Découpage et entrelacement --- */

test('chunksOf : morceaux de 45 max, 100 min → 45 + 45 + 10', () => {
  const cs = J.chunksOf([T({ minutes: 100 })], 45);
  assert.deepEqual(cs.map((c) => c.minutes), [45, 45, 10]);
  assert.ok(cs.every((c) => c.taskId === 't1'));
});

test('chunksOf : tourniquet entre matières A B C A B C', () => {
  const taches = [T({ id: 'a', subject: 'llcer-amc' }), T({ id: 'b', subject: 'physique-chimie' }), T({ id: 'c', subject: 'svt', charge: 'leger' })];
  const cs = J.chunksOf(taches, 45);
  assert.deepEqual(cs.map((c) => c.taskId), ['a', 'b', 'c', 'a', 'b', 'c']);
  assert.deepEqual(cs.slice(0,3).map((c) => c.minutes), [45,45,45]);
  assert.deepEqual(cs.slice(3).map((c) => c.minutes), [15,15,15]);
  // Deux devoirs de la même matière : une seule file, ils restent consécutifs.
  const deux = J.chunksOf([T({ id: 'a', subject: 'maths' }), T({ id: 'b', subject: 'maths' })], 45);
  assert.deepEqual(deux.map((c) => c.taskId), ['a', 'a', 'b', 'b']);
});

test('placeChunks : pausing 10 min entre blocs, jamais avant le premier', () => {
  const w = [{ kind: 'profond', from: 1000, to: 1200 }];
  const out = J.placeChunks([{ taskId: 'a', subject: 'maths', minutes: 45 }, { taskId: 'b', subject: 'svt', minutes: 45 }], w);
  assert.deepEqual(out.placed.map((p) => p.from), [1000, 1055]);
  assert.equal(out.rest.length, 0);
});

test('assignTasks : exigéants avant légers, faits exclus, impasse comptée', () => {
  const w = [{ kind: 'profond', from: 1000, to: 1300 }];
  const taches = [
    T({ id: 'a', subject: 'maths', charge: 'exigeant', minutes: 45 }),
    T({ id: 'b', subject: 'llcer-amc', charge: 'leger', minutes: 30 }),
    T({ id: 'z', subject: 'maths', charge: 'exigeant', minutes: 60, done: true })
  ];
  const res = J.assignTasks(taches, w);
  assert.deepEqual(res.placed.map((p) => p.taskId), ['a', 'b']);
  assert.equal(res.restantes.length, 0);
  const res2 = J.assignTasks([T({ id: 'a', minutes: 300 })], w);
  // 45 + 10 + 45 + 10 + 45 = 155 sur 300 : ~110 min impasses ? 300 - (45+45+45) - ... calcul :
  const plac = res2.placed.reduce((s, p) => s + p.minutes, 0);
  assert.equal(plac, 225);
  assert.equal(res2.restantes[0].minutes, 75);
});

/* --- Plan de journée --- */

test('planDay jour de lycée (6 h 45 / 19 h 30 / 8 h 30-17 h) : créneaux fixes aux bonnes heures', () => {
  const plan = J.planDay(DEFAUTS, 'cours', [], PROFILPremiere);
  const ids = plan.slots.map((s) => s.id);
  assert.deepEqual(ids, ['reveil', 'cartes-matin', 'cours', 'decompression', 'rappel-soir', 'coucher']);
  const by = {};
  plan.slots.forEach((s) => { by[s.id] = s; });
  assert.equal(by.reveil.from, 405);
  assert.equal(by['cartes-matin'].from, 485); // 8 h 05
  assert.equal(by['cartes-matin'].to, 500);   // finit à 8 h 20
  assert.equal(by.cours.from, 510);
  assert.equal(by.cours.to, 1020);
  assert.equal(by.decompression.from, 1020);
  assert.equal(by.decompression.to, 1035);
  assert.equal(by['rappel-soir'].from, 1155); // 19 h 15
  assert.equal(by['rappel-soir'].to, 1170);
  assert.equal(by.coucher.title, 'Au lit à 19 h 30');
});

test('planDay jour de lycée : devoirs placés après la décompression, matières entrelacées', () => {
  const taches = [
    T({ id: 'm', subject: 'maths', charge: 'exigeant', minutes: 60 }),
    T({ id: 'p', subject: 'physique-chimie', charge: 'exigeant', minutes: 60 }),
    T({ id: 'a', subject: 'llcer-amc', charge: 'leger', minutes: 20, title: 'Vocab' })
  ];
  const plan = J.planDay(DEFAUTS, 'cours', taches, PROFILPremiere);
  const dv = plan.slots.filter((s) => s.kind === 'devoir');
  assert.deepEqual(dv.map((d) => d.subject), ['maths', 'physique-chimie']);
  assert.equal(dv[0].from, 1035); // juste après la décompression
  assert.equal(dv[1].from, 1090); // 45 + 10 de pause
  // Le rappel du soir reste devant : rien ne chevauche 19 h 15.
  assert.ok(dv.every((d) => d.to <= 1145));
  assert.deepEqual(plan.restantes.map((r) => r.taskId + ':' + r.minutes), ['m:15', 'p:15', 'a:20']);
  assert.ok(plan.notes.some((n) => n.id === 'debordement'));
});

test('planDay jour libre : fenêtre profonde 8 h 45 → 11 h 15, creux 13 h → 14 h 15', () => {
  const taches = [T({ id: 'm', subject: 'maths', charge: 'exigeant', minutes: 90 })];
  const plan = J.planDay(DEFAUTS, 'libre', taches, PROFILPremiere);
  const by = {};
  plan.slots.forEach((s) => { by[s.id] = s.id && s; });
  const creux = plan.slots.filter((s) => s.id === 'creux').map((s) => s.to);
  assert.deepEqual(creux, [855]);
  const dv = plan.slots.filter((s) => s.kind === 'devoir');
  assert.deepEqual(dv.map((d) => d.minutes || d.to - d.from), [45, 45]);
  assert.equal(dv[0].from, 525); // 8 h 45 = 405 + 120
  assert.equal(dv[1].from, 580);
});

test('planDay sans devoirs : aucune carte devoir, notes sommeil et caféine présentes', () => {
  const plan = J.planDay(DEFAUTS, 'cours', [], PROFILPremiere);
  assert.equal(plan.slots.filter((s) => s.kind === 'devoir').length, 0);
  assert.ok(plan.notes.some((n) => n.id === 'sommeil'));
  assert.ok(plan.notes.some((n) => n.id === 'cafeine'));
});

test('planDay caféine : coupe 8 h avant le coucher, donc 11 h 30 ici', () => {
  const plan = J.planDay(DEFAUTS, 'cours', [], PROFILPremiere);
  const note = plan.notes.filter((n) => n.id === 'cafeine')[0];
  assert.ok(note.text.indexOf('11 h 30') >= 0);
});

test('planDay coucher après minuit : heures absolues correctes, nuit de 6 h', () => {
  const s = J.sanitizeSettings({ wake: 420, bed: 60, schoolStart: 510, schoolEnd: 1020 });
  const taches = [T({ id: 'm', subject: 'maths', charge: 'exigeant', minutes: 60 })];
  const plan = J.planDay(s, 'cours', taches, PROFILPremiere);
  const dv = plan.slots.filter((x) => x.kind === 'devoir');
  assert.ok(dv.length >= 1);
  assert.ok(dv[0].from >= 1035); // fenêtre après les cours, heures absolues > 1440 autorisées en interne
  const rappel = plan.slots.filter((x) => x.id === 'rappel-soir')[0];
  assert.equal(rappel.to, 1500); // 1 h du matin en absolu
  assert.equal(J.fmtHM(rappel.to), '1 h');
  assert.ok(plan.notes.some((n) => n.text.indexOf('6 h') >= 0 || n.text.indexOf('6 h 30') >= 0));
});

test('planDay école à cheval sur le coucher : tout est borné, aucun crash', () => {
  const s = J.sanitizeSettings({ wake: 900, bed: 1100, schoolStart: 1080, schoolEnd: 1180 });
  const plan = J.planDay(s, 'cours', [T({ id: 'm' })], PROFILPremiere);
  assert.ok(plan.slots.every((x) => x.to <= 1100 + 1));
  assert.equal(plan.slots.filter((x) => x.kind === 'devoir').length, 0);
  assert.ok(plan.restantes.length >= 1);
});

test('planDay : un créneau ne déborde jamais sur le rappel du soir ni le coucher', () => {
  const taches = [T({ id: 'm', minutes: 300 }), T({ id: 'n', subject: 'llcer-amc', charge: 'leger', minutes: 300 })];
  const plan = J.planDay(DEFAUTS, 'cours', taches, PROFILPremiere);
  const rappel = plan.slots.filter((x) => x.id === 'rappel-soir')[0];
  plan.slots.filter((x) => x.kind === 'devoir').forEach((d) => {
    assert.ok(d.to <= rappel.from);
  });
});
