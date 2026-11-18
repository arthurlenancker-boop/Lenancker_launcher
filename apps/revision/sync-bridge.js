/* Pont de synchronisation pour l'app Révision (PocketBase).
   Chargé en dernier, il ne modifie jamais revision.js : l'app écrit
   d'abord dans le stockage local (comme toujours), le pont observe
   ce stockage et synchronise quand une session existe (page Sync).

   Au démarrage : rapatrie l'enregistrement du serveur ; s'il a du
   nouveau, fusionne (RevisionCore.mergeData, sans doublon, la carte
   la plus récemment révisée gagne), écrit le résultat, l'envoie au
   serveur puis recharge la page pour que l'app démarre dessus.

   En session : un sondage léger surveille le stockage ; dès que
   l'app y écrit (chaque modification y persiste), la nouvelle
   version part vers le serveur. Rien ne part tant que rien ne
   change. Hors ligne ou non connecté : silence total, l'app
   fonctionne en local comme avant. */
(function(){
'use strict';

var SYNC_KEY = 'revision';
var LS_DATA = 'lenancker.revision.data';
var POLL_MS = 4000;

var api = window.LenanckerSync;
if(!api || typeof api.loadConfig !== 'function' || !api.loadConfig()){ return; }
if(!window.RevisionCore || typeof RevisionCore.mergeData !== 'function'){ return; }
var storage = window.lenanckerStorage;
var warned = { auth:false, missing:false };

function parseOr(v){
  try{ return JSON.parse(v) || null; }
  catch(e){ return null; }
}

function warn(kind, msg){
  if(warned[kind]){ return; }
  warned[kind] = true;
  if(window.toast){ window.toast(msg, 'warn', 8000); }
}

function fail(res){
  if(res && res.authExpired){
    warn('auth', 'Session sync expirée — reconnecte-toi sur la page Sync.');
  }else if(res && res.missingCollection){
    warn('missing', 'Collection sync_records absente du serveur : crée-la dans la console PocketBase (voir la PR).');
  }
}

/* Adoption au démarrage : fusion additive serveur -> local. */
function adopt(){
  api.pullRecord(SYNC_KEY).then(function(res){
    if(!res.ok){ fail(res); return; }
    if(!res.changed || res.empty){ return; }
    var remote = parseOr(res.value);
    if(!remote){ return; }
    var local = parseOr(storage.get(LS_DATA));
    var merged = RevisionCore.mergeData(
      RevisionCore.normalizeData(local, Date.now()),
      RevisionCore.normalizeData(remote, Date.now()),
      Date.now()
    );
    var value = JSON.stringify(merged);
    storage.set(LS_DATA, value);
    api.saveMeta(SYNC_KEY, { syncedAtMs: res.updatedMs });
    var reloaded = false;
    function reload(){
      if(reloaded){ return; }
      reloaded = true;
      location.reload();
    }
    /* Envoie la fusion au serveur avant de recharger : le serveur
       et l'app démarrent ainsi sur le même état. */
    api.pushRecord(SYNC_KEY, value).then(function(out){
      if(out.ok){ api.saveMeta(SYNC_KEY, { syncedAtMs: out.updatedMs }); }
    }, function(){ /* silencieux */ }).then(reload);
    setTimeout(reload, 5000); /* garde-fou si le réseau traîne */
  }).catch(function(){ /* silencieux : mode local */ });
}

/* Envoi opportuniste : la version locale part dès qu'elle change. */
var lastSeen = null;
var pushing = false;
function poll(){
  if(pushing){ return; }
  var v = storage.get(LS_DATA);
  if(v === null){ return; }
  if(lastSeen === null){ lastSeen = v; return; }
  if(v === lastSeen){ return; }
  pushing = true;
  api.pushRecord(SYNC_KEY, v).then(function(res){
    if(res.ok){
      api.saveMeta(SYNC_KEY, { syncedAtMs: res.updatedMs });
      lastSeen = v;
    }else if(res.authExpired || res.missingCollection){
      fail(res);
      lastSeen = v; /* pas de nouvel essai tant que le problème dure */
    }else{
      lastSeen = null; /* réseau en berne : réessai au prochain cycle */
    }
    pushing = false;
  }, function(){
    lastSeen = null;
    pushing = false;
  });
}

adopt();
setInterval(poll, POLL_MS);
})();
