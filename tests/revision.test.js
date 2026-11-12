'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../apps/revision/core.js');

const MIN = 60000;
const DAY = 86400000;
const T0 = 1700000000000;

function card(opts) {
  return Object.assign({
    id: 'c1', deckId: 'd1', front: 'Q', back: 'R',
    created: T0, ease: 2.5, interval: 0, lapses: 0, reps: 0,
    due: T0, lastReview: 0, method: 'sm2', box: 1,
  }, opts || {});
}

test('newCard crée une carte SM-2 saine', () => {
  const c = Core.newCard('d1', 'Q', 'R', T0, 'id1');
  assert.equal(c.id, 'id1');
  assert.equal(c.method, 'sm2');
  assert.equal(c.box, 1);
  assert.equal(c.reps, 0);
  assert.equal(c.due, T0);
  const l = Core.newCard('d1', 'Q', 'R', T0, 'id2', 'leitner');
  assert.equal(l.method, 'leitner');
});

test('grade est pur : la carte originale est inchangée', () => {
  const c = card();
  const g = Core.grade(c, 'good', T0);
  assert.equal(c.reps, 0);
  assert.equal(c.interval, 0);
  assert.equal(g.reps, 1);
  assert.notEqual(g, c);
});

test('premiers pas SM-2 : 1-2-4 jours selon la note', () => {
  assert.equal(Core.grade(card(), 'hard', T0).interval, 1);
  assert.equal(Core.grade(card(), 'good', T0).interval, 2);
  assert.equal(Core.grade(card(), 'easy', T0).interval, 4);
});

test('again : retour ~10 min, ease -0,2, interval 0, lapse +1', () => {
  const g = Core.grade(card({ interval: 10, reps: 5, lapses: 1 }), 'again', T0);
  assert.equal(g.interval, 0);
  assert.equal(g.lapses, 2);
  assert.equal(g.ease, 2.3);
  assert.equal(g.due, T0 + Core.RETRY_MIN * MIN);
});

test('intervalles suivants : good multiplie par ease', () => {
  const g = Core.grade(card({ interval: 10, reps: 3 }), 'good', T0);
  assert.equal(g.interval, 25); // 10 * 2.5
  assert.equal(g.due, T0 + 25 * DAY);
});

test('ease plafonné à 3,5 et plancher 1,3', () => {
  assert.equal(Core.grade(card({ interval: 5, ease: 3.45 }), 'easy', T0).ease, 3.5);
  assert.equal(Core.grade(card({ interval: 5, ease: 1.35 }), 'hard', T0).ease, 1.3);
});

test('intervalle plafonné à 365 jours', () => {
  const g = Core.grade(card({ interval: 300, ease: 3.5, reps: 30 }), 'easy', T0);
  assert.equal(g.interval, Core.MAX_INTERVAL);
});

test('buildQueue : dues d\'abord (plus en retard prio), puis nouvelles plafonnées', () => {
  const now = T0 + 10 * DAY;
  const dueOld = card({ id: 'old', due: now - 5 * DAY, interval: 3, reps: 2 });
  const dueNew = card({ id: 'newdue', due: now - 1 * DAY, interval: 3, reps: 2 });
  const fresh = [0, 1, 2].map((i) => card({ id: 'f' + i, created: T0 + i }));
  const q = Core.buildQueue([dueNew, fresh[2], dueOld, fresh[0], fresh[1]], now, { newLimit: 2 });
  assert.deepEqual(q.map((c) => c.id), ['old', 'newdue', 'f0', 'f1']);
});

test('buildQueue : reprise d\'une carte « Encore » laissée en retard', () => {
  const now = T0 + 30 * MIN;
  const relearn = card({ id: 'r', reps: 1, interval: 0, due: now - 5 * MIN });
  const notYet = card({ id: 'n', reps: 1, interval: 0, due: now + 5 * MIN });
  const q = Core.buildQueue([notYet, relearn], now);
  assert.deepEqual(q.map((c) => c.id), ['r']);
});

test('statsFor distingue nouvelles, dues et mûres (SM-2)', () => {
  const now = T0;
  const cards = [
    card({ id: 'fresh' }),
    card({ id: 'due', interval: 2, reps: 1, due: now - 1 }),
    card({ id: 'future', interval: 2, reps: 1, due: now + DAY }),
    card({ id: 'mature', interval: 30, reps: 5, due: now + DAY }),
  ];
  const s = Core.statsFor(cards, now);
  assert.deepEqual(s, { total: 4, due: 1, fresh: 1, mature: 1 });
});

test('computeStreak compte les jours consécutifs, hier si aujourd\'hui vide', () => {
  const now = new Date('2026-02-10T12:00:00').getTime();
  const keys = ['2026-02-10', '2026-02-09', '2026-02-07'];
  assert.equal(Core.computeStreak(keys, now), 2);
  assert.equal(Core.computeStreak(['2026-02-09', '2026-02-08'], now), 2);
  assert.equal(Core.computeStreak([], now), 0);
});

test('normalizeCard répare les données corrompues', () => {
  const c = Core.normalizeCard({ id: 7, ease: 99, interval: -3, box: 42, reps: 1.7, method: 'x' }, T0);
  assert.equal(c.id, '7');
  assert.equal(c.ease, 3.5);
  assert.equal(c.interval, 0);
  assert.equal(c.box, 5);
  assert.equal(c.reps, 1);
  assert.equal(c.method, 'sm2');
});

test('mergeData : la carte la plus récemment révisée gagne, jamais de doublon', () => {
  const cur = { decks: [{ id: 'd1', name: 'A' }], cards: [card({ id: 'c1', lastReview: 100, reps: 3 })], days: { '2026-01-01': 5 } };
  const inc = { decks: [{ id: 'd2', name: 'B' }], cards: [card({ id: 'c1', lastReview: 50, reps: 1 }), card({ id: 'c2', lastReview: 200 })], days: { '2026-01-01': 2, '2026-01-02': 3 } };
  const m = Core.mergeData(cur, inc, T0);
  assert.deepEqual(m.decks.map((d) => d.id).sort(), ['d1', 'd2']);
  const ids = m.cards.map((c) => c.id).sort();
  assert.deepEqual(ids, ['c1', 'c2']);
  assert.equal(m.cards.find((c) => c.id === 'c1').reps, 3);
  assert.deepEqual(m.days, { '2026-01-01': 5, '2026-01-02': 3 });
});

/* ---------- Leitner ---------- */

test('leitnerGrade : réussie monte d\'une boîte, ratée retourne en 1', () => {
  const up = Core.leitnerGrade(card({ method: 'leitner', box: 2 }), true, T0);
  assert.equal(up.box, 3);
  assert.equal(up.due, T0 + 7 * DAY);
  const down = Core.leitnerGrade(card({ method: 'leitner', box: 4 }), false, T0);
  assert.equal(down.box, 1);
  assert.equal(down.due, T0 + 1 * DAY);
  const top = Core.leitnerGrade(card({ method: 'leitner', box: 5 }), true, T0);
  assert.equal(top.box, 5);
  assert.equal(top.due, 0);
});

test('leitnerQueue : échéances d\'abord (plus en retard prio), jamais vues plafonnées', () => {
  const now = T0 + 20 * DAY;
  const due = card({ id: 'due', method: 'leitner', box: 2, lastReview: T0, due: now - DAY });
  const seen = card({ id: 'seen', method: 'leitner', box: 3, lastReview: T0, due: now + DAY });
  const fresh = [0, 1, 2].map((i) => card({ id: 'f' + i, method: 'leitner', created: T0 + i }));
  const q = Core.leitnerQueue([seen, fresh[2], due, fresh[0], fresh[1]], now, { newLimit: 2 });
  assert.equal(q[0].id, 'due');
  assert.equal(q.filter((c) => !c.lastReview).length, 2);
  assert.ok(!q.some((c) => c.id === 'seen'));
});

test('leitnerQueue ciblée : toutes les cartes vues de la boîte, hors échéance comprise', () => {
  const now = T0 + 20 * DAY;
  const seen = card({ id: 'seen', method: 'leitner', box: 3, lastReview: T0, due: now + DAY });
  const other = card({ id: 'other', method: 'leitner', box: 2, lastReview: T0, due: now - DAY });
  const q = Core.leitnerQueue([seen, other], now, { box: 3 });
  assert.deepEqual(q.map((c) => c.id), ['seen']);
});

test('leitnerStats : répartition, échéances, pourcentage acquis', () => {
  const now = T0;
  const cards = [
    card({ id: 'a', method: 'leitner', box: 1, lastReview: T0, due: now - 1 }),
    card({ id: 'b', method: 'leitner', box: 3, lastReview: T0, due: now + DAY }),
    card({ id: 'c', method: 'leitner', box: 5, lastReview: T0 }),
    card({ id: 'fresh', method: 'leitner', box: 1 }),
  ];
  const s = Core.leitnerStats(cards, now);
  assert.deepEqual(s.boxes, [2, 0, 1, 0, 1]);
  assert.equal(s.due, 1);
  assert.equal(s.fresh, 1);
  assert.equal(s.acquired, 1);
  assert.equal(s.pct, 25);
});

test('ponts SM-2 <-> Leitner sans perdre la progression', () => {
  assert.equal(Core.leitnerBoxForInterval(0), 1);
  assert.equal(Core.leitnerBoxForInterval(2), 2);
  assert.equal(Core.leitnerBoxForInterval(5), 3);
  assert.equal(Core.leitnerBoxForInterval(14), 4);
  assert.equal(Core.leitnerBoxForInterval(21), 5);
  const l = Core.cardToLeitner(card({ interval: 5, reps: 2, lastReview: T0 }), T0);
  assert.equal(l.box, 3);
  assert.equal(l.method, 'leitner');
  assert.equal(l.lastReview, T0);
  const back = Core.cardToSM2(l, T0);
  assert.equal(back.method, 'sm2');
  assert.equal(back.interval, 7);
  assert.ok(back.due > T0);
  const neverSeen = Core.cardToLeitner(card(), T0);
  assert.equal(neverSeen.lastReview, 0);
  assert.equal(neverSeen.due, 0);
});
