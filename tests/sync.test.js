/* Tests du module de synchronisation (assets/js/sync.js).
   Le module expose ses fonctions pures via module.exports sous Node ;
   les fonctions réseau et stockage sont testées par leurs gardes
   (entrées vides) sans jamais émettre de requête. */
const test = require('node:test');
const assert = require('node:assert');
const sync = require('../assets/js/sync.js');

/* ---------- normalizeServer ---------- */

test('normalizeServer : ajoute https:// par défaut', () => {
  assert.strictEqual(sync.normalizeServer('pcarthur-1.tailda0234.ts.net'), 'https://pcarthur-1.tailda0234.ts.net');
});

test('normalizeServer : conserve une adresse https explicite', () => {
  assert.strictEqual(sync.normalizeServer('https://mon-serveur.exemple.fr'), 'https://mon-serveur.exemple.fr');
});

test('normalizeServer : force https quand http est saisi', () => {
  assert.strictEqual(sync.normalizeServer('http://mon-serveur.exemple.fr'), 'https://mon-serveur.exemple.fr');
});

test('normalizeServer : retire les slashs finaux', () => {
  assert.strictEqual(sync.normalizeServer('https://s.exemple.fr/'), 'https://s.exemple.fr');
  assert.strictEqual(sync.normalizeServer('https://s.exemple.fr//'), 'https://s.exemple.fr');
});

test('normalizeServer : trim des espaces', () => {
  assert.strictEqual(sync.normalizeServer('  https://s.exemple.fr  '), 'https://s.exemple.fr');
});

test('normalizeServer : vide ou absente', () => {
  assert.strictEqual(sync.normalizeServer(''), '');
  assert.strictEqual(sync.normalizeServer(null), '');
  assert.strictEqual(sync.normalizeServer(undefined), '');
});

/* ---------- joinEndpoint ---------- */

test('joinEndpoint : serveur + chemin', () => {
  assert.strictEqual(sync.joinEndpoint('https://s.exemple.fr', '/api/health'), 'https://s.exemple.fr/api/health');
});

test('joinEndpoint : normalise le serveur et ajoute le slash manquant', () => {
  assert.strictEqual(sync.joinEndpoint('s.exemple.fr/', 'api/health'), 'https://s.exemple.fr/api/health');
});

test('joinEndpoint : serveur vide', () => {
  assert.strictEqual(sync.joinEndpoint('', '/api/health'), '');
  assert.strictEqual(sync.joinEndpoint(null, '/api/health'), '');
});

/* ---------- validateConfig ---------- */

test('validateConfig : configuration complète valide, serveur normalisé', () => {
  const out = sync.validateConfig({
    server: 'pcarthur-1.tailda0234.ts.net/',
    email: ' arthur@example.fr ',
    token: 'abc123'
  });
  assert.deepStrictEqual(out, {
    server: 'https://pcarthur-1.tailda0234.ts.net',
    email: 'arthur@example.fr',
    token: 'abc123'
  });
});

test('validateConfig : champs inconnus ignorés (le mot de passe ne peut pas y figurer)', () => {
  const out = sync.validateConfig({
    server: 'https://s.exemple.fr', email: 'a@b.fr', token: 't',
    password: 'secret', note: 'x'
  });
  assert.ok(!('password' in out));
  assert.ok(!('note' in out));
});

test('validateConfig : rejette les configurations incomplètes', () => {
  assert.strictEqual(sync.validateConfig(null), null);
  assert.strictEqual(sync.validateConfig({}), null);
  assert.strictEqual(sync.validateConfig({ server: 'https://s.fr' }), null);
  assert.strictEqual(sync.validateConfig({ server: 'https://s.fr', email: 'a@b.fr' }), null);
  assert.strictEqual(sync.validateConfig({ server: 'https://s.fr', email: '', token: 't' }), null);
  assert.strictEqual(sync.validateConfig({ email: 'a@b.fr', token: 't' }), null);
  assert.strictEqual(sync.validateConfig('pas un objet'), null);
});

/* ---------- gardes des fonctions réseau ---------- */

test('testServer : garde sans adresse', async () => {
  const out = await sync.testServer('');
  assert.strictEqual(out.ok, false);
  assert.ok(out.error.length > 0);
});

test('connect : gardes sans serveur, e-mail ou mot de passe', async () => {
  assert.strictEqual((await sync.connect('', 'a@b.fr', 'x')).ok, false);
  assert.strictEqual((await sync.connect('https://s.fr', '', 'x')).ok, false);
  assert.strictEqual((await sync.connect('https://s.fr', 'a@b.fr', '')).ok, false);
});

/* ---------- constantes ---------- */

test('STORAGE_KEY et DEFAULT_SERVER exposés', () => {
  assert.strictEqual(sync.STORAGE_KEY, 'lenancker.sync.v1');
  assert.strictEqual(sync.DEFAULT_SERVER.slice(0, 8), 'https://');
});
