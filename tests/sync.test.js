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

/* ---------- pbDateToMs (dates PocketBase) ---------- */

test('pbDateToMs : convertit une date PocketBase « AAAA-MM-JJ HH:MM:SS.mmmZ »', () => {
  assert.strictEqual(sync.pbDateToMs('2026-11-17 18:30:00.000Z'), Date.parse('2026-11-17T18:30:00.000Z'));
});

test('pbDateToMs : accepte une date ISO déjà normalisée', () => {
  assert.strictEqual(sync.pbDateToMs('2026-11-17T18:30:00.000Z'), Date.parse('2026-11-17T18:30:00.000Z'));
});

test('pbDateToMs : valeurs absentes ou illisibles → 0', () => {
  assert.strictEqual(sync.pbDateToMs(''), 0);
  assert.strictEqual(sync.pbDateToMs(null), 0);
  assert.strictEqual(sync.pbDateToMs(undefined), 0);
  assert.strictEqual(sync.pbDateToMs('pas une date'), 0);
});

/* ---------- decideSync ---------- */

test('decideSync : « pull » quand le serveur est plus récent que le dernier échange', () => {
  assert.strictEqual(sync.decideSync(1000, 2000), 'pull');
  assert.strictEqual(sync.decideSync(0, 1), 'pull');
});

test('decideSync : « none » quand rien de neuf côté serveur', () => {
  assert.strictEqual(sync.decideSync(2000, 2000), 'none');
  assert.strictEqual(sync.decideSync(3000, 2000), 'none');
});

test('decideSync : valeurs absentes traitées comme 0', () => {
  assert.strictEqual(sync.decideSync(undefined, 100), 'pull');
  assert.strictEqual(sync.decideSync(undefined, undefined), 'none');
  assert.strictEqual(sync.decideSync('abc', 'abc'), 'none');
});

/* ---------- interpretStatus ---------- */

test('interpretStatus : 401 → session expirée, 404 → collection absente, 200 → ok', () => {
  assert.strictEqual(sync.interpretStatus(401, null, 'lecture').authExpired, true);
  assert.strictEqual(sync.interpretStatus(404, null, 'lecture').missingCollection, true);
  assert.strictEqual(sync.interpretStatus(403, null, 'lecture').ok, false);
  assert.strictEqual(sync.interpretStatus(500, null, 'lecture').ok, false);
  assert.strictEqual(sync.interpretStatus(200, { items: [] }, 'lecture').ok, true);
});

/* ---------- métadonnées et gardes des nouveaux appels réseau ---------- */

test('loadMeta/saveMeta : sans localStorage (Node), gardes sûres', () => {
  assert.strictEqual(sync.loadMeta('revision'), null);
  assert.strictEqual(sync.saveMeta('revision', { syncedAtMs: 123 }), false);
  assert.strictEqual(sync.saveMeta('revision', null), false);
});

test('pullRecord/pushRecord : aucune requête sans session enregistrée', async () => {
  assert.strictEqual((await sync.pullRecord('revision')).ok, false);
  assert.strictEqual((await sync.pushRecord('revision', '{}')).ok, false);
  assert.strictEqual((await sync.pushRecord('revision', 'pas du json')).ok, false);
});
