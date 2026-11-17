/* Synchronisation des données du launcher via un serveur PocketBase
   privé (voir docs/synchronisation.md dans la PR d'origine).

   Principe de sécurité : le mot de passe n'est JAMAIS stocké. Seuls
   l'adresse du serveur, l'e-mail et le jeton de session PocketBase
   (valide ~14 jours, renouvelable en se reconnectant) sont conservés
   dans localStorage, clé « lenancker.sync.v1 » :

     { "server": "https://…", "email": "…", "token": "…" }

   Le module expose aussi ses fonctions pures via module.exports quand
   il tourne sous Node (tests : tests/sync.test.js). */
(function(root){
'use strict';

var DEFAULT_SERVER = 'https://pcarthur-1.tailda0234.ts.net';
var STORAGE_KEY = 'lenancker.sync.v1';
var ENDPOINT_HEALTH = '/api/health';
var ENDPOINT_AUTH = '/api/collections/users/auth-with-password';

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
   - champs inconnus ignorés. Retourne null si invalide. */
function validateConfig(cfg){
  if(!cfg || typeof cfg !== 'object'){ return null; }
  var server = normalizeServer(cfg.server);
  var email = typeof cfg.email === 'string' ? cfg.email.trim() : '';
  var token = typeof cfg.token === 'string' ? cfg.token.trim() : '';
  if(!server || !email || !token){ return null; }
  return { server: server, email: email, token: token };
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
   En cas de succès, enregistre {server, email, token} ; le mot de
   passe, passé en argument, n'est conservé nulle part.
   Résout { ok:true, email, token } ou { ok:false, error }. */
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
        var clean = validateConfig({ server: server, email: mail, token: out.data.token });
        saveConfig(clean);
        return { ok: true, email: clean.email, token: clean.token };
      }
      return { ok: false, error: 'E-mail ou mot de passe incorrect.' };
    })
    .catch(function(){
      return { ok: false, error: 'Serveur injoignable : vérifie l\'adresse et la connexion Tailscale.' };
    });
}

/* ---------- API publique ---------- */
var api = {
  DEFAULT_SERVER: DEFAULT_SERVER,
  STORAGE_KEY: STORAGE_KEY,
  normalizeServer: normalizeServer,
  joinEndpoint: joinEndpoint,
  validateConfig: validateConfig,
  loadConfig: loadConfig,
  saveConfig: saveConfig,
  clearConfig: clearConfig,
  testServer: testServer,
  connect: connect
};

if(typeof module !== 'undefined' && module.exports){
  module.exports = api; /* tests Node (tests/sync.test.js) */
}
root.LenanckerSync = api;
})(typeof window !== 'undefined' ? window : globalThis);
