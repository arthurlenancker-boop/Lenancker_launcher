'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../apps/focus/core.js');

const MIN = 60000;
const T0 = 1700000000000;

function engine(opts) {
  return Core.createEngine(Object.assign({ now: () => clock.t }, opts || {}));
}
const clock = { t: T0 };

test('démarrage : setup → focus, startedAt posé', () => {
  clock.t = T0;
  const e = engine();
  assert.equal(e.state.phase, 'setup');
  assert.equal(e.start(), true);
  assert.equal(e.state.phase, 'focus');
  assert.equal(e.state.startedAt, T0);
});

test('start refuse de démarrer depuis focus ou done', () => {
  clock.t = T0;
  const e = engine();
  e.start();
  assert.equal(e.start(), false);
  e.finish();
  assert.equal(e.start(), false);
});

test('cut termine le segment, cumule le focus et passe en pause', () => {
  clock.t = T0;
  const e = engine();
  e.start();
  clock.t = T0 + 20 * MIN;
  const r = e.cut();
  assert.equal(e.state.phase, 'break');
  assert.equal(r.ms, 20 * MIN);
  assert.equal(e.state.focusMs, 20 * MIN);
  assert.equal(e.state.breaks, 1);
  assert.equal(e.cut(), null);
});

test('cut signale les segments hors bornes en mode flux (jamais bloquant)', () => {
  clock.t = T0;
  const short = engine();
  short.start();
  clock.t = T0 + 5 * MIN;
  assert.deepEqual(short.cut(), { ms: 5 * MIN, short: true, long: false });
  clock.t = T0;
  const long = engine();
  long.start();
  clock.t = T0 + 60 * MIN;
  assert.deepEqual(long.cut(), { ms: 60 * MIN, short: false, long: true });
});

test('reprise après pause : nouveau segment, cumul conservé', () => {
  clock.t = T0;
  const e = engine();
  e.start();
  clock.t = T0 + 10 * MIN;
  e.cut();
  clock.t = T0 + 15 * MIN;
  assert.equal(e.start(), true);
  assert.equal(e.state.segStart, T0 + 15 * MIN);
  clock.t = T0 + 25 * MIN;
  e.cut();
  assert.equal(e.state.focusMs, 20 * MIN);
  assert.equal(e.state.segments.length, 2);
});

test('noteDistraction compte et horodate', () => {
  clock.t = T0;
  const e = engine();
  assert.equal(e.noteDistraction(), 1);
  clock.t = T0 + MIN;
  assert.equal(e.noteDistraction(), 2);
  assert.deepEqual(e.state.distractionTimes, [T0, T0 + MIN]);
});

test('elapsedFocus/elapsedBreak selon la phase', () => {
  clock.t = T0;
  const e = engine();
  assert.equal(e.elapsedFocus(), 0);
  e.start();
  clock.t = T0 + 3 * MIN;
  assert.equal(e.elapsedFocus(), 3 * MIN);
  e.cut();
  clock.t = T0 + 8 * MIN;
  assert.equal(e.elapsedBreak(), 5 * MIN);
  assert.equal(e.elapsedFocus(), 0);
});

test('finish coupe le segment en cours et fige le bilan', () => {
  clock.t = T0;
  const e = engine();
  e.start();
  clock.t = T0 + 12 * MIN;
  const s = e.finish();
  assert.equal(e.state.phase, 'done');
  assert.equal(s.focusMs, 12 * MIN);
  assert.equal(s.points, 12);
  assert.equal(s.avgSegMs, 12 * MIN);
  clock.t = T0 + 999 * MIN;
  assert.equal(e.finish().duration, 12 * MIN);
});

test('summary calcule durée, moyenne et points', () => {
  clock.t = T0;
  const e = engine();
  e.start();
  clock.t = T0 + 10 * MIN;
  e.cut();
  e.start();
  clock.t = T0 + 25 * MIN;
  const s = e.summary();
  assert.equal(s.mode, 'flux');
  assert.equal(s.focusMs, 10 * MIN); // le 2e segment en cours n'est pas encore coupé
  assert.equal(s.segments, 1);
  assert.equal(s.avgSegMs, 10 * MIN);
  assert.equal(s.duration, 25 * MIN);
  assert.equal(s.points, 10);
});

test('pointsFor arrondit au minute, jamais négatif', () => {
  assert.equal(Core.pointsFor(0), 0);
  assert.equal(Core.pointsFor(90 * 1000), 2);
});

test('computeStreak : série consécutive, hier si aujourd\'hui vide', () => {
  const now = new Date('2026-02-10T12:00:00').getTime();
  assert.equal(Core.computeStreak(['2026-02-10', '2026-02-09', '2026-02-07'], now), 2);
  assert.equal(Core.computeStreak(['2026-02-09', '2026-02-08'], now), 2);
  assert.equal(Core.computeStreak([], now), 0);
});

test('last7Days agrège le focus par jour, 7 entrées ordonnées', () => {
  const now = new Date('2026-02-10T12:00:00').getTime();
  const d = (s) => new Date(s + 'T12:00:00').getTime();
  const sessions = [
    { ts: d('2026-02-10'), focusMs: 10 * MIN },
    { ts: d('2026-02-10'), focusMs: 5 * MIN },
    { ts: d('2026-02-07'), focusMs: 20 * MIN },
  ];
  const out = Core.last7Days(sessions, now);
  assert.equal(out.length, 7);
  assert.equal(out[6].key, '2026-02-10');
  assert.equal(out[6].focusMs, 15 * MIN);
  assert.equal(out[3].key, '2026-02-07');
  assert.equal(out[3].focusMs, 20 * MIN);
  assert.equal(out[0].focusMs, 0);
});

test('formatMs : mm:ss puis h:mm:ss', () => {
  assert.equal(Core.formatMs(0), '00:00');
  assert.equal(Core.formatMs(65 * 1000), '01:05');
  assert.equal(Core.formatMs(3661000), '1:01:01');
  assert.equal(Core.formatMs(-5), '00:00');
});
