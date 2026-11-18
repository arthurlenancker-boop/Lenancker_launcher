/* Synchronisation des données du launcher via un serveur PocketBase
   privé (voir la PR d'origine).

   Principe de sécurité : le mot de passe n'est JAMAIS stocké. Seuls
   l'adresse du serveur, l'e-mail, le jeton de session PocketBase
   (valide ~14 jours, renouvelable en se reconnectant) et
   l'identifiant du compte sont conservés dans localStorage,
   clé « lenancker.sync.v1 » :

     { "server": "https://…", "email": "…", "token": "…", "userId": "…" }

   Chaque compte ne voit sur le serveur que ses propres
   enregistrements : les règles PocketBase de la collection
   sync_records (champ « user ») cloisonnent tout côté serveur, le
   client n'envoie que son propre identifiant.

   Le module expose aussi ses fonctions pures via module.exports quand
   il tourne sous Node (tests : tests/sync.test.js). */
(function(root){
'use strict';

var DEFAULT_SERVER = 'https://pcarthur-1.tailda0234.ts.net';
var STORAGE_KEY = 'lenancker.sync.v1';
var SKIP_KEY = 'lenancker.sync.skipped';
var ENDPOINT_HEALTH = '/api/health';
var ENDPOINT_AUTH = '/api/collections/users/auth-with-password';
var ENDPOINT_REFRESH = '/api/collections/users/auth-refresh';
var ENDPOINT_REGISTER = '/api/collections/users/records';
var ENDPOINT_SYNC = '/api/collections/sync_records/records';
var META_PREFIX = 'lenancker.sync.meta.';

/* ---------- fonctions pures (testées sous Node) ---------- */

/* Normalise l'adresse du serveur : trim, slashs finaux retirés,
   schéma https ajouté par défaut (le launcher refuse le http pour
   ne jamais envoyer le mot de passe en clair sur le réseau). */
function normalizeServer(server){
  var s = (server || '').trim();
  while(s.slice(-1) === '/'){ s = s.slice(0, -1); }
  if(s === ''){ return ''; }
  if(!/^https?:\/\//i.test(s)){
    s = 'https://' + s;
  }
  if(/^http:\/\//i.test(s)){
    s = s.replace(/^http:\/\//i, 'https://');
  }
  return s;
}

/* Concatène serveur normalisé + chemin commençant par « / ».
   Retourne '' si le serveur est vide. */
function joinEndpoint(server, path){
  var s = normalizeServer(server);
  if(s === ''){ return ''; }
  var p = path.charAt(0) === '/' ? path : '/' + path;
  return s + p;
}

/* Valide un objet de configuration chargé du stockage :
   - objet non nul ;
   - server non vide (renvoyé normalisé) ;
   - email : string non vide ;
   - token : string non vide ;
   - userId : string optionnelle (sessions plus anciennes) ;
   - champs inconnus ignorés. Retourne null si invalide. */
function validateConfig(cfg){
  if(!cfg || typeof cfg !== 'object'){ return null; }
  var server = normalizeServer(cfg.server);
  var email = typeof cfg.email === 'string' ? cfg.email.trim() : '';
  var token = typeof cfg.token === 'string' ? cfg.token.trim() : '';
  if(!server || !email || !token){ return null; }
  var out = { server: server, email: email, token: token };
  var userId = typeof cfg.userId === 'string' ? cfg.userId.trim() : '';
  if(userId){ out.userId = userId; }
  return out;
}

/* Convertit une date PocketBase (« 2026-11-17 18:30:00.000Z ») en
   millisecondes. Retourne 0 si la valeur est absente ou illisible. */
function pbDateToMs(s){
  if(typeof s !== 'string' || s === ''){ return 0; }
  var iso = s.indexOf(' ') > -1 ? s.replace(' ', 'T') : s;
  var t = Date.parse(iso);
  return isNaN(t) ? 0 : t;
}

/* Décide s'il faut rapatrier l'enregistrement distant : « pull » quand
   le serveur a changé depuis la dernière synchronisation connue,
   sinon « none ». Pure. */
function decideSync(syncedAtMs, remoteUpdatedMs){
  var last = Number(syncedAtMs) || 0;
  var remote = Number(remoteUpdatedMs) || 0;
  return remote > last ? 'pull' : 'none';
}

/* Décide du rapatriement en tenant compte du compte connecté :
   « pull » dès que le compte n'est pas celui du dernier échange
   (les métadonnées locales appartiennent au compte précédent),
   sinon même logique que decideSync. Sans métadonnées : pull
   (premier échange du compte sur cet appareil). Pure. */
function decidePull(meta, remoteUpdatedMs, userId){
  if(!meta || typeof meta !== 'object'){ return 'pull'; }
  var metaUser = typeof meta.userId === 'string' ? meta.userId : '';
  var cfgUser = typeof userId === 'string' ? userId : '';
  if(metaUser !== cfgUser){ return 'pull'; }
  return decideSync(meta.syncedAtMs, remoteUpdatedMs);
}

/* Interprète un statut HTTP PocketBase en résultat normalisé :
   ok:true, ou ok:false avec authExpired (401), missingCollection (404),
   ou error générique. Pure. */
function interpretStatus(status, json, action){
  if(status === 401){ return { ok:false, authExpired:true, error:'Session expirée — reconnecte-toi sur la page Sync.' }; }
  if(status === 403){ return { ok:false, error:'Accès refusé : vérifie les règles de la collection sync_records.' }; }
  if(status === 404){ return { ok:false, missingCollection:true, error:'Collection sync_records absente du serveur : crée-la dans la console PocketBase.' }; }
  if(status < 200 || status >= 300){ return { ok:false, error:'Erreur serveur (' + action + ', HTTP ' + status + ').' }; }
  return { ok:true, json: json };
}

/* Traduit l'échec d'une création de compte (PocketBase renvoie le
   détail champ par champ) en message français pour l'utilisateur.
   Pure : reçoit le statut HTTP et le corps JSON de la réponse. */
function registerError(status, json){
  if(status === 403){
    return 'Inscription pas encore ouverte sur ce serveur — réessaie plus tard.';
  }
  if(status !== 400){
    return 'Inscription impossible (HTTP ' + status + ').';
  }
  var data = json && json.data ? json.data : {};
  function msgOf(field){
    var f = data[field];
    if(f && typeof f.message === 'string'){ return f.message.toLowerCase(); }
    return '';
  }
  var mail = msgOf('email');
  var pass = msgOf('password');
  var confirm = msgOf('passwordConfirm');
  if(mail.indexOf('unique') > -1){ return 'Cette adresse e-mail a déjà un compte — connecte-toi.'; }
  if(mail.indexOf('email') > -1){ return 'Adresse e-mail invalide.'; }
  if(pass.indexOf('character') > -1 || pass.indexOf('long') > -1){ return 'Mot de passe trop court (8 caractères minimum).'; }
  if(pass){ return 'Mot de passe refusé par le serveur (8 caractères minimum).'; }
  if(confirm){ return 'Les deux mots de passe ne correspondent pas.'; }
  return 'Inscription impossible : vérifie l\'adresse e-mail et le mot de passe.';
}

/* ---------- stockage local (navigateur uniquement) ---------- */

function loadConfig(){
  try{
    var raw = root.localStorage ? root.localStorage.getItem(STORAGE_KEY) : null;
    if(!raw){ return null; }
    return validateConfig(JSON.parse(raw));
  }catch(e){
    return null;
  }
}

function saveConfig(cfg){
  var clean = validateConfig(cfg);
  if(!clean){ return false; }
  try{
    root.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return true;
  }catch(e){
    return false;
  }
}

function clearConfig(){
  try{
    root.localStorage.removeItem(STORAGE_KEY);
    return true;
  }catch(e){
    return false;
  }
}

/* Marque « passé » : l'utilisateur a choisi de ne pas se connecter
   maintenant ; le launcher ne lui représente plus la page Sync à
   chaque ouverture (le badge Sync reste disponible). */
function wasSkipped(){
  try{
    return !!(root.localStorage && root.localStorage.getItem(SKIP_KEY));
  }catch(e){
    return false;
  }
}

function markSkipped(){
  try{
    root.localStorage.setItem(SKIP_KEY, '1');
    return true;
  }catch(e){
    return false;
  }
}

/* Métadonnées de synchronisation par app : { syncedAtMs, userId }
   (dernier « updated » du serveur vu lors d'un échange réussi, et
   compte concerné), localStorage, clé META_PREFIX + appKey. Si
   userId n'est pas fourni, celui de la session en cours est utilisé. */
function loadMeta(appKey){
  try{
    var raw = root.localStorage ? root.localStorage.getItem(META_PREFIX + appKey) : null;
    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return null;
  }
}

function saveMeta(appKey, meta){
  if(!meta || typeof meta !== 'object'){ return false; }
  var m = { syncedAtMs: Number(meta.syncedAtMs) || 0 };
  var userId = typeof meta.userId === 'string' ? meta.userId.trim() : '';
  if(!userId){
    var cfg = loadConfig();
    if(cfg && cfg.userId){ userId = cfg.userId; }
  }
  if(userId){ m.userId = userId; }
  try{
    root.localStorage.setItem(META_PREFIX + appKey, JSON.stringify(m));
    return true;
  }catch(e){
    return false;
  }
}

/* ---------- appels réseau ---------- */

/* Test de santé : GET {server}/api/health.
   Résout { ok:true, server } ou { ok:false, error: message }. */
function testServer(server){
  var url = joinEndpoint(server, ENDPOINT_HEALTH);
  if(!url){
    return Promise.resolve({ ok: false, error: 'Adresse du serveur vide.' });
  }
  return fetch(url, { method: 'GET' })
    .then(function(res){
      if(!res.ok){ throw new Error('HTTP ' + res.status); }
      return res.json();
    })
    .then(function(){
      return { ok: true, server: normalizeServer(server) };
    })
    .catch(function(){
      return { ok: false, error: 'Serveur injoignable : vérifie l\'adresse et la connexion Tailscale.' };
    });
}

/* Connexion : POST auth-with-password (PocketBase, collection users).
   En cas de succès, enregistre {server, email, token, userId} ; le mot
   de passe, passé en argument, n'est conservé nulle part.
   Résout { ok:true, email, userId } ou { ok:false, error }. */
function connect(server, email, password){
  var url = joinEndpoint(server, ENDPOINT_AUTH);
  var mail = (email || '').trim();
  if(!url){ return Promise.resolve({ ok: false, error: 'Adresse du serveur vide.' }); }
  if(!mail){ return Promise.resolve({ ok: false, error: 'E-mail vide.' }); }
  if(!password){ return Promise.resolve({ ok: false, error: 'Mot de passe vide.' }); }
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: mail, password: password })
  })
    .then(function(res){
      return res.json().then(function(data){
        return { status: res.status, data: data };
      });
    })
    .then(function(out){
      if(out.status >= 200 && out.status < 300 && out.data && out.data.token){
        var rec = (out.data.record || out.data.user) || {};
        var userId = typeof rec.id === 'string' ? rec.id.trim() : '';
        var clean = validateConfig({ server: server, email: mail, token: out.data.token, userId: userId });
        saveConfig(clean);
        return { ok: true, email: clean.email, userId: clean.userId || null };
      }
      return { ok: false, error: 'E-mail ou mot de passe incorrect.' };
    })
    .catch(function(){
      return { ok: false, error: 'Serveur injoignable : vérifie l\'adresse et la connexion Tailscale.' };
    });
}

/* Création de compte : POST /api/collections/users/records, puis
   connexion immédiate. Résout { ok:true, created:true, email } ou
   { ok:false, error } (messages de registerError). */
function register(server, email, password, passwordConfirm){
  var url = joinEndpoint(server, ENDPOINT_REGISTER);
  var mail = (email || '').trim();
  if(!url){ return Promise.resolve({ ok: false, error: 'Adresse du serveur vide.' }); }
  if(!mail){ return Promise.resolve({ ok: false, error: 'E-mail vide.' }); }
  if(!password){ return Promise.resolve({ ok: false, error: 'Mot de passe vide.' }); }
  if(password !== passwordConfirm){ return Promise.resolve({ ok: false, error: 'Les deux mots de passe ne correspondent pas.' }); }
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: mail, password: password, passwordConfirm: passwordConfirm })
  })
    .then(function(res){
      return res.json().then(function(data){
        return { status: res.status, data: data };
      });
    })
    .then(function(out){
      if(out.status >= 200 && out.status < 300){
        return connect(server, mail, password).then(function(res){
          if(res.ok){ return { ok: true, created: true, email: res.email }; }
          return { ok: false, error: 'Compte créé, mais connexion impossible : ' + res.error };
        });
      }
      return { ok: false, error: registerError(out.status, out.data) };
    })
    .catch(function(){
      return { ok: false, error: 'Serveur injoignable : vérifie l\'adresse et la connexion Tailscale.' };
    });
}

/* Renouvelle la session : POST auth-refresh. Met à jour le jeton et
   l'identifiant de compte dans la configuration enregistrée.
   Résout { ok:true, userId } ou { ok:false, error }. */
function refresh(){
  var cfg = loadConfig();
  if(!cfg){ return Promise.resolve({ ok: false, error: 'Non connecté.' }); }
  var url = joinEndpoint(cfg.server, ENDPOINT_REFRESH);
  return fetch(url, { method: 'POST', headers: { 'Authorization': cfg.token } })
    .then(function(res){
      return res.json().then(function(data){
        return interpretStatus(res.status, data, 'renouvellement');
      });
    })
    .then(function(out){
      if(!out.ok){ return out; }
      if(!out.json || !out.json.token){ return { ok: false, error: 'Réponse du serveur illisible.' }; }
      var rec = (out.json.record || out.json.user) || {};
      var userId = typeof rec.id === 'string' ? rec.id.trim() : (cfg.userId || '');
      var clean = validateConfig({ server: cfg.server, email: cfg.email, token: out.json.token, userId: userId });
      saveConfig(clean);
      return { ok: true, userId: clean.userId || null };
    })
    .catch(function(){
      return { ok: false, error: 'Serveur injoignable.' };
    });
}

/* Déconnexion : efface la session locale (le serveur garde les
   données, seul l'appareil oublie le jeton). */
function logout(){
  return Promise.resolve(clearConfig());
}

/* Identifiant de compte pour une création d'enregistrement : celui
   de la session, sinon récupéré par un renouvellement de session
   (sessions créées avant cette version). Résout userId ou null. */
function ensureUserId(cfg){
  if(cfg && cfg.userId){ return Promise.resolve(cfg.userId); }
  return refresh().then(function(res){
    return res.ok && res.userId ? res.userId : null;
  });
}

/* En-têtes d'authentification PocketBase pour les écritures. */
function authHeaders(token){
  return { 'Authorization': token, 'Content-Type': 'application/json' };
}

/* ---------- synchronisation des données (collection sync_records) ---------- */

/* Rapatrie l'enregistrement d'une app (GET filtré par clé ; le
   serveur ne renvoie de toute façon que les enregistrements du
   compte connecté). Résout { ok:true, changed, empty, value,
   updatedMs, id } ou une erreur normalisée. changed vaut vrai quand
   le serveur a du nouveau depuis la dernière synchronisation de ce
   compte (décidé par decidePull). */
function pullRecord(appKey){
  var cfg = loadConfig();
  if(!cfg){ return Promise.resolve({ ok:false, error:'Non connecté.' }); }
  var url = joinEndpoint(cfg.server, ENDPOINT_SYNC) +
    '?filter=' + encodeURIComponent('(key="' + appKey + '")') + '&perPage=1';
  return fetch(url, { method:'GET', headers:{ 'Authorization': cfg.token } })
    .then(function(res){
      return res.json().then(function(j){ return interpretStatus(res.status, j, 'lecture'); });
    })
    .then(function(out){
      if(!out.ok){ return out; }
      var items = out.json && Array.isArray(out.json.items) ? out.json.items : [];
      if(items.length === 0){ return { ok:true, changed:false, empty:true }; }
      var rec = items[0];
      var updatedMs = pbDateToMs(rec.updated);
      var meta = loadMeta(appKey) || {};
      return {
        ok:true,
        changed: decidePull(meta, updatedMs, cfg.userId) === 'pull',
        empty:false,
        value: JSON.stringify(rec.data || null),
        updatedMs: updatedMs,
        id: rec.id
      };
    })
    .catch(function(){
      return { ok:false, error:'Serveur injoignable.' };
    });
}

/* Envoie la valeur d'une app (chaîne JSON ou objet) : PATCH si
   l'enregistrement existe, sinon POST (avec l'identifiant du
   compte, exigé par les règles du serveur). Résout
   { ok:true, updatedMs, id } ou une erreur normalisée. */
function pushRecord(appKey, value){
  var cfg = loadConfig();
  if(!cfg){ return Promise.resolve({ ok:false, error:'Non connecté.' }); }
  var base = joinEndpoint(cfg.server, ENDPOINT_SYNC);
  var payload;
  try{
    payload = typeof value === 'string' ? JSON.parse(value) : value;
  }catch(e){
    return Promise.resolve({ ok:false, error:'Données locales illisibles.' });
  }
  var query = '?filter=' + encodeURIComponent('(key="' + appKey + '")') + '&perPage=1';
  return fetch(base + query, { method:'GET', headers:{ 'Authorization': cfg.token } })
    .then(function(res){
      return res.json().then(function(j){ return interpretStatus(res.status, j, 'recherche'); });
    })
    .then(function(out){
      if(!out.ok){ return out; }
      var rec = out.json && Array.isArray(out.json.items) && out.json.items[0] ? out.json.items[0] : null;
      if(rec){
        return fetch(base + '/' + rec.id, {
          method:'PATCH',
          headers: authHeaders(cfg.token),
          body: JSON.stringify({ key: appKey, data: payload })
        });
      }
      /* Création : le serveur exige que l'enregistrement appartienne
         au compte connecté (@request.body.user = @request.auth.id). */
      return ensureUserId(cfg).then(function(userId){
        if(!userId){
          return { status: 401, data: null };
        }
        return fetch(base, {
          method:'POST',
          headers: authHeaders(cfg.token),
          body: JSON.stringify({ key: appKey, data: payload, user: userId })
        });
      });
    })
    .then(function(res){
      if(res && typeof res.ok === 'undefined' && typeof res.status === 'number'){
        return interpretStatus(res.status, res.data, 'envoi');
      }
      return res.json().then(function(j){ return interpretStatus(res.status, j, 'envoi'); });
    })
    .then(function(out){
      if(!out.ok){ return out; }
      return { ok:true, updatedMs: pbDateToMs(out.json && out.json.updated), id: out.json && out.json.id };
    })
    .catch(function(){
      return { ok:false, error:'Serveur injoignable.' };
    });
}

/* ---------- API publique ---------- */
var api = {
  DEFAULT_SERVER: DEFAULT_SERVER,
  STORAGE_KEY: STORAGE_KEY,
  SKIP_KEY: SKIP_KEY,
  META_PREFIX: META_PREFIX,
  normalizeServer: normalizeServer,
  joinEndpoint: joinEndpoint,
  validateConfig: validateConfig,
  pbDateToMs: pbDateToMs,
  decideSync: decideSync,
  decidePull: decidePull,
  interpretStatus: interpretStatus,
  registerError: registerError,
  loadConfig: loadConfig,
  saveConfig: saveConfig,
  clearConfig: clearConfig,
  wasSkipped: wasSkipped,
  markSkipped: markSkipped,
  loadMeta: loadMeta,
  saveMeta: saveMeta,
  testServer: testServer,
  connect: connect,
  register: register,
  refresh: refresh,
  logout: logout,
  pullRecord: pullRecord,
  pushRecord: pushRecord
};

if(typeof module !== 'undefined' && module.exports){
  module.exports = api; /* tests Node (tests/sync.test.js) */
}
root.LenanckerSync = api;
})(typeof window !== 'undefined' ? window : globalThis);
