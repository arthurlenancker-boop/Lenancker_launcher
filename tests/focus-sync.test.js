/* Tests des fonctions de synchronisation du noyau Focus (pures,
   Node). Le pont sync-bridge.js repose sur elles : sanitize, tri,
   filtrage, fusion par union et règle du plus frais. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../apps/focus/core.js');

const S = (ts, focusMs, extra) => Object.assign(
  { ts, focusMs, distractions: 0, mode: 'flux', segments: 1 },
  extra || {}
);

test('buildSyncDoc : document complet et normalisé', () => {
  const d = Core.buildSyncDoc(
    {
      settings: { autostart: true },
      intent: { task: 'Réviser' },
      sessions: [S(2000, 900000)],
      days: { '2026-11-18': true }
    },
    1234
  );
  assert.equal(d.v, 1);
  assert.deepEqual(d.settings, { autostart: true });
  assert.equal(d.intent.task, 'Réviser');
  assert.equal(d.sessions.length, 1);
  assert.deepEqual(d.days, { '2026-11-18': true });
  assert.equal(d.savedAtMs, 1234);
});

test('buildSyncDoc : entrées vides donnent un document sûr', () => {
  const d = Core.buildSyncDoc(null, 0);
  assert.deepEqual(d.settings, {});
  assert.deepEqual(d.intent, { task: '', ifThen: '', reward: '' });
  assert.deepEqual(d.sessions, []);
  assert.deepEqual(d.days, {});
  assert.equal(d.savedAtMs, 0);
});

test('normalizeSyncDoc : null devient un document vide valide', () => {
  const d = Core.normalizeSyncDoc(null);
  assert.equal(d.v, 1);
  assert.deepEqual(d.sessions, []);
  assert.deepEqual(d.days, {});
  assert.equal(d.savedAtMs, 0);
});

test('sanitizeSyncSession : rejette ts invalide, borne les champs', () => {
  assert.equal(Core.sanitizeSyncSession(null), null);
  assert.equal(Core.sanitizeSyncSession({ ts: 'abc' }), null);
  assert.equal(Core.sanitizeSyncSession({ ts: -5, focusMs: 10 }), null);
  const c = Core.sanitizeSyncSession(
    S(500, 250, { distractions: 2.7, mode: 'autre', segments: 1.9 })
  );
  assert.equal(c.focusMs, 250);
  assert.equal(c.distractions, 2);
  assert.equal(c.mode, 'flux'); // mode inconnu retombe sur flux
  assert.equal(c.segments, 1);
});

test('normalizeSyncDoc : trie les sessions et exclut les ts invalides', () => {
  const d = Core.normalizeSyncDoc({
    sessions: [S(3000, 1), { ts: 'x' }, S(1000, 2), S(2000, 3)],
  });
  assert.deepEqual(d.sessions.map((s) => s.ts), [1000, 2000, 3000]);
});

test('normalizeSyncDoc : garde les clés de jours YYYY-MM-DD', () => {
  const d = Core.normalizeSyncDoc({
    days: { '2026-11-18': true, '18-11-2026': true, 'pasune cle': true }
  });
  assert.deepEqual(Object.keys(d.days), ['2026-11-18']);
});

test('normalizeSyncDoc : settings non objet rejetés', () => {
  const d = Core.normalizeSyncDoc({ settings: 'chaine' });
  assert.deepEqual(d.settings, {});
});

test('mergeSyncDocs : union des sessions sans doublon de ts', () => {
  const a = Core.buildSyncDoc({ sessions: [S(1000, 1), S(2000, 2)] }, 100);
  const b = Core.buildSyncDoc(
    { sessions: [S(2000, 99), S(3000, 3)] },
    200
  );
  const m = Core.mergeSyncDocs(a, b);
  assert.deepEqual(m.sessions.map((s) => s.ts), [1000, 2000, 3000]);
  // à ts égal, la session locale est conservée
  assert.equal(m.sessions.find((s) => s.ts === 2000).focusMs, 2);
});

test('mergeSyncDocs : union des jours', () => {
  const a = Core.buildSyncDoc({ days: { '2026-11-17': true } }, 100);
  const b = Core.buildSyncDoc({ days: { '2026-11-18': true } }, 200);
  const m = Core.mergeSyncDocs(a, b);
  assert.deepEqual(m.days, { '2026-11-17': true, '2026-11-18': true });
});

test('mergeSyncDocs : réglages pris du côté le plus frais', () => {
  const ancien = Core.buildSyncDoc(
    { settings: { autostart: false }, intent: { task: 'ancien' } },
    100
  );
  const recent = Core.buildSyncDoc(
    { settings: { autostart: true }, intent: { task: 'recent' } },
    200
  );
  const m = Core.mergeSyncDocs(ancien, recent);
  assert.deepEqual(m.settings, { autostart: true });
  assert.equal(m.intent.task, 'recent');
  // ordre inverse : c'est alors le local le plus frais
  const m2 = Core.mergeSyncDocs(recent, ancien);
  assert.deepEqual(m2.settings, { autostart: true });
  assert.equal(m2.intent.task, 'recent');
});

test('mergeSyncDocs : à égalité le local gagne', () => {
  const a = Core.buildSyncDoc({ settings: { son: 'local' } }, 500);
  const b = Core.buildSyncDoc({ settings: { son: 'distant' } }, 500);
  const m = Core.mergeSyncDocs(a, b);
  assert.deepEqual(m.settings, { son: 'local' });
});

test('mergeSyncDocs : savedAtMs final = maximum des deux', () => {
  const a = Core.buildSyncDoc({}, 300);
  const b = Core.buildSyncDoc({}, 900);
  assert.equal(Core.mergeSyncDocs(a, b).savedAtMs, 900);
  assert.equal(Core.mergeSyncDocs(b, a).savedAtMs, 900);
});
