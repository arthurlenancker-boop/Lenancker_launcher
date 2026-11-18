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
   serveur : { vide:bool, env:obj } pour peindre la réponse de pull.
   options : { pushes:[...], refresh:fn, rejeter:bool, badge:bool } */
function appareil(serveur, options) {
  options = options || {};
  const store = new Map();
  const appels = { push: 0, pull: 0, refresh: 0, toasts: [] };
  let filePousses = options.pushes ? options.pushes.slice() : null;
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
      appels.push++;
      if (options.rejeter){ return Promise.reject(new Error('réseau en berne')); }
      if (filePousses){ return Promise.resolve(filePousses.length ? filePousses.shift() : { ok: true, updatedMs: 5 }); }
      return Promise.resolve({ ok: true, updatedMs: 5 });
    },
    refresh: () => { appels.refresh++; return Promise.resolve({ ok: true, userId: 'u1' }); },
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
  ctx.toast = (msg) => { appels.toasts.push(msg); };
  ctx.location = { reload: () => { ctx.__recharged = true; } };
  ctx.setInterval = (fn) => { ctx.__poll = fn; return 0; };
  if (options.badge) {
    ctx.__badgeEl = { style: {}, setAttribute: () => {}, textContent: '' };
    ctx.document = {
      body: { appendChild: (el) => { ctx.__badge = el; } },
      createElement: () => ctx.__badgeEl
    };
  }
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'sync-bridge.js' });
  return ctx;
}

const tranquille = () => new Promise((r) => setTimeout(r, 25));

test('quiz terminé après le chargement : l état part au serveur au cycle suivant', async () => {
  const A = appareil({ vide: true });
  await tranquille(); /* adopt() : serveur vide, rien localement */
  assert.equal(A.__appels.push, 0);
  /* L'app sauve l'état du quiz (premier contenu de l'appareil). */
  A.__store.set('lenancker.journee.v1', JSON.stringify(STATE_QUIZ));
  A.__poll();          /* premier cycle qui voit l'état */
  await tranquille();
  A.__poll();          /* cycles suivants */
  await tranquille();
  assert.equal(A.__appels.push, 1, 'l état créé en session doit être poussé');
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
  assert.equal(A.__appels.push, 0);
});

test('adoption au démarrage : le serveur plus frais remplace et recharge', async () => {
  const distant = { v: 1, state: STATE_QUIZ, savedAtMs: 1763000000000 };
  const B = appareil({ vide: false, env: distant });
  await tranquille();
  assert.ok(B.__recharged, 'la page doit se recharger sur adoption');
  const lu = JSON.parse(B.__store.get('lenancker.journee.v1'));
  assert.equal(lu.profile.niveau, 'premiere');
});

test('poll n agit pas tant que l adoption du démarrage est en vol', async () => {
  const store = new Map();
  const appels = { push: 0 };
  let resouds = null;
  const api = {
    loadConfig: () => ({ server: 'https://x', email: 'a@b.c', token: 't', userId: 'u1' }),
    pullRecord: () => new Promise((r) => { resouds = r; }),
    pushRecord: () => { appels.push++; return Promise.resolve({ ok: true, updatedMs: 1 }); },
    refresh: () => Promise.resolve({ ok: true, userId: 'u1' }),
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
  assert.equal(appels.push, 0, 'rien ne doit partir pendant l adoption');
  resouds({ ok: true, changed: false, empty: true });
  await tranquille();
  /* L adoption (serveur vide + contenu) a déjà poussé ; le poll
     suivant ne doit pas repartir pour la même valeur. */
  assert.equal(appels.push, 1);
  ctx.__poll();
  await tranquille();
  assert.equal(appels.push, 1, 'pas de doublon pour le même état');
});

test('badge visible : envoi puis état affiché à l écran', async () => {
  const A = appareil({ vide: true }, { badge: true });
  assert.ok(A.__badge, 'le badge doit être injecté dans la page');
  await tranquille();
  A.__store.set('lenancker.journee.v1', JSON.stringify(STATE_QUIZ));
  A.__poll();
  await tranquille();
  assert.ok(A.__badge.textContent.indexOf('envoyé à') >= 0,
    'le badge doit annoncer l envoi, texte : ' + A.__badge.textContent);
  assert.equal(A.__badge.style.borderColor, '#7bc47f');
});

test('échec d envoi inexpliqué : renouvellement de session puis réessai réussi, silencieux', async () => {
  const A = appareil({ vide: true }, {
    pushes: [{ ok: false, error: 'Erreur serveur (envoi, HTTP 400).' }]
  });
  await tranquille();
  A.__store.set('lenancker.journee.v1', JSON.stringify(STATE_QUIZ));
  A.__poll();
  await tranquille();
  await tranquille();
  assert.equal(A.__appels.refresh, 1, 'un renouvellement doit être tenté');
  assert.equal(A.__appels.push, 2, 'l envoi repart une seconde fois après soin');
  const alarme = A.__appels.toasts.filter((t) => t.indexOf('Nouveaux essais') >= 0);
  assert.equal(alarme.length, 0, 'un soin réussi reste silencieux (l envoi aboutit)');
});

test('échec d envoi persistant : soigné puis refusé, l échec s affiche une fois', async () => {
  const A = appareil({ vide: true }, {
    pushes: [
      { ok: false, error: 'Erreur serveur (envoi, HTTP 400).' },
      { ok: false, error: 'Erreur serveur (envoi, HTTP 400).' }
    ]
  });
  await tranquille();
  A.__store.set('lenancker.journee.v1', JSON.stringify(STATE_QUIZ));
  A.__poll();
  await tranquille();
  await tranquille();
  assert.equal(A.__appels.refresh, 1);
  assert.equal(A.__appels.push, 2);
  const alarme = A.__appels.toasts.filter((t) => t.indexOf('Nouveaux essais') >= 0);
  assert.equal(alarme.length, 1, 'un toast unique prévient de l échec persistant');
  assert.equal(A.__appels.toasts.length, 1, 'pas de répétition du toast');
});

test('réexamen périodique : un distant plus frais arrive sur une page laissée ouverte', async () => {
  const serveur = { vide: true, env: null };
  const A = appareil(serveur);
  A.__store.set('lenancker.journee.v1', JSON.stringify(STATE_QUIZ));
  await tranquille(); /* adoption : serveur vide + contenu -> envoi initial */
  assert.equal(A.__appels.push, 1);
  /* Un autre appareil publie une version plus fraîche que l horodatage local. */
  serveur.vide = false;
  serveur.env = { v: 1, state: STATE_QUIZ, savedAtMs: Date.now() + 60000 };
  for (let i = 0; i < 15; i++) { A.__poll(); await tranquille(); }
  assert.ok(A.__recharged, 'la page doit adopter et se recharger au réexamen');
  const lu = JSON.parse(A.__store.get('lenancker.journee.v1'));
  assert.equal(lu.profile.niveau, 'premiere');
  assert.equal(A.__appels.pull, 2, 'un seul réexamen a dû avoir lieu');
});

test('réexamen prudent : jamais de rechargement sur des modifications locales non parties', async () => {
  const distant = { v: 1, state: STATE_QUIZ, savedAtMs: 1763000000000 };
  const serveur = { vide: false, env: distant };
  const A = appareil(serveur, { rejeter: true });
  A.__store.set('lenancker.journee.v1', JSON.stringify(STATE_QUIZ));
  A.__store.set('lenancker.journee.stamp', '1763000000000');
  await tranquille(); /* adoption : égalité des horodateurs -> à jour */
  /* L'app modifie l'état localement ; le réseau est en berne (envois rejetés). */
  const modifie = Object.assign({}, STATE_QUIZ, { savedAtMs: 1763000099999 });
  A.__store.set('lenancker.journee.v1', JSON.stringify(modifie));
  serveur.env = { v: 1, state: STATE_QUIZ, savedAtMs: 1763000123456 };
  for (let i = 0; i < 15; i++) { A.__poll(); await tranquille(); }
  assert.ok(!A.__recharged, 'aucun rechargement ne doit survenir tant que des envois échouent');
  const lu = JSON.parse(A.__store.get('lenancker.journee.v1'));
  assert.equal(lu.savedAtMs, 1763000099999, 'l état local doit être intact');
});

test('réexamen sur appareil encore vide : le contenu distant est adopté', async () => {
  const serveur = { vide: true, env: null };
  const B = appareil(serveur);
  await tranquille(); /* adoption : serveur vide, rien localement */
  /* Un autre appareil publie des données. */
  serveur.vide = false;
  serveur.env = { v: 1, state: STATE_QUIZ, savedAtMs: Date.now() + 60000 };
  for (let i = 0; i < 15; i++) { B.__poll(); await tranquille(); }
  assert.ok(B.__recharged, 'un appareil sans état local doit adopter le distant');
  const lu = JSON.parse(B.__store.get('lenancker.journee.v1'));
  assert.equal(lu.profile.niveau, 'premiere');
});
