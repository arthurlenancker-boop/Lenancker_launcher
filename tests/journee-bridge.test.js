/* Tests du pont de synchronisation Journée (apps/journee/sync-bridge.js).
   Le pont réel est chargé dans un bac à sable Node avec une API sync et un
   stockage stubs : on pilote les cycles de sondage à la main. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BRIDGE = path.join(__dirname, '..', 'apps', 'journee', 'sync-bridge.js');
const SRC = fs.readFileSync(BRIDGE, 'utf8');

const STATE_QUIZ = {
  v: 1,
  profile: { niveau: 'premiere', spes: ['anglais-amc', 'maths', 'physique-chimie'] },
  settings: { wake: 405, bed: 1170, schoolStart: 510, schoolEnd: 1020,
    weekdays: ['cours', 'cours', 'cours', 'cours', 'cours', 'libre', 'libre'] },
  tasks: [], done: {}, savedAtMs: 1763000000000
};

/* Construit un appareil : API sync stub, stockage stub, pont chargé.
   serveur : { vide:bool, env:obj } pour peindre la réponse de pull. */
function appareil(serveur) {
  const store = new Map();
  const appels = { push: [], pull: 0 };
  const api = {
    loadConfig: () => ({ server: 'https://x', email: 'a@b.c', token: 't', userId: 'u1' }),
    pullRecord: (key) => {
      appels.pull++;
      return Promise.resolve(serveur.vide
        ? { ok: true, changed: false, empty: true }
        : { ok: true, changed: true, empty: false,
            value: JSON.stringify(serveur.env), updatedMs: serveur.env.savedAtMs + 5, id: 'r1' });
    },
    pushRecord: (key, value) => {
      appels.push.push({ key, value: JSON.parse(value) });
      return Promise.resolve({ ok: true, updatedMs: Date.parse('2026-11-18T17:00:00Z') });
    },
    saveMeta: () => {}
  };
  const ctx = {};
  ctx.window = ctx;
  ctx.__store = store;
  ctx.__appels = appels;
  ctx.LenanckerSync = api;
  ctx.lenanckerStorage = {
    get: (k) => (store.has(k) ? store.get(k) : null),
    set: (k, v) => store.set(k, String(v))
  };
  ctx.toast = () => {};
  ctx.location = { reload: () => { ctx.__reloaded = true; } };
  ctx.setInterval = (fn) => { ctx.__poll = fn; return 0; };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'sync-bridge.js' });
  return ctx;
}

const tranquille = () => new Promise((r) => setTimeout(r, 25));

test('quiz terminé après le chargement : l état part au serveur au cycle suivant', async () => {
  const A = appareil({ vide: true });
  await tranquille(); /* adopt() : serveur vide, rien localement */
  assert.equal(A.__appels.push.length, 0);
  /* L'app sauve l'état du quiz (premier contenu de l'appareil). */
  A.__store.set('lenancker.journee.v1', JSON.stringify(STATE_QUIZ));
  A.__poll();          /* premier cycle qui voit l'état */
  await tranquille();
  A.__poll();          /* cycles suivants */
  await tranquille();
  assert.equal(A.__appels.push.length, 1, 'l état créé en session doit être poussé');
  assert.equal(A.__appels.push[0].key, 'journee');
  assert.equal(A.__appels.push[0].value.state.profile.niveau, 'premiere');
  assert.ok(Number(A.__store.get('lenancker.journee.stamp')) > 0);
});

test('état sans contenu : jamais poussé', async () => {
  const A = appareil({ vide: true });
  await tranquille();
  A.__store.set('lenancker.journee.v1', JSON.stringify({ v: 1, tasks: [], done: {} }));
  A.__poll();
  await tranquille();
  A.__poll();
  await tranquille();
  assert.equal(A.__appels.push.length, 0);
});

test('adoption inchangée : le serveur plus frais remplace et recharge', async () => {
  const distant = { v: 1, state: STATE_QUIZ, savedAtMs: 1763000000000 };
  const B = appareil({ vide: false, env: distant });
  await tranquille();
  assert.ok(B.__reloaded, 'la page doit se recharger sur adoption');
  const lu = JSON.parse(B.__store.get('lenancker.journee.v1'));
  assert.equal(lu.profile.niveau, 'premiere');
});

test('poll n agit pas tant que l adoption du démarrage est en vol', async () => {
  const store = new Map();
  const appels = { push: [] };
  let resouds = null;
  const api = {
    loadConfig: () => ({ server: 'https://x', email: 'a@b.c', token: 't', userId: 'u1' }),
    pullRecord: () => new Promise((r) => { resouds = r; }),
    pushRecord: (key, value) => { appels.push.push(value); return Promise.resolve({ ok: true, updatedMs: 1 }); },
    saveMeta: () => {}
  };
  const ctx = {};
  ctx.window = ctx; ctx.__store = store; ctx.__appels = appels;
  ctx.LenanckerSync = api;
  ctx.lenanckerStorage = { get: (k) => store.has(k) ? store.get(k) : null, set: (k, v) => store.set(k, String(v)) };
  ctx.toast = () => {}; ctx.location = { reload: () => {} };
  ctx.setInterval = (fn) => { ctx.__poll = fn; return 0; };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'sync-bridge.js' });
  store.set('lenancker.journee.v1', JSON.stringify(STATE_QUIZ));
  ctx.__poll();
  await tranquille();
  assert.equal(appels.push.length, 0, 'rien ne doit partir pendant l adoption');
  resouds({ ok: true, changed: false, empty: true });
  await tranquille();
  /* L adoption (serveur vide + contenu) a déjà poussé ; le poll
     suivant ne doit pas repartir pour la même valeur. */
  assert.equal(appels.push.length, 1);
  ctx.__poll();
  await tranquille();
  assert.equal(appels.push.length, 1, 'pas de doublon pour le même état');
});
