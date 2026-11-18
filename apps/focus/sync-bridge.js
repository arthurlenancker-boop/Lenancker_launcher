/* Pont de synchronisation pour l'app Focus (PocketBase).
   Chargé en dernier, il ne modifie jamais focus.js : l'app écrit
   d'abord dans le stockage local (comme toujours), le pont observe
   ce stockage et synchronise quand une session existe (page Sync).

   Document unique de sync_records (clé « focus ») :
   { v:1, settings, intent, sessions, days, savedAtMs }.
   Fusion (FocusCore.mergeSyncDocs, pures et testées sous Node) :
   sessions et série par union sans doublon (clé ts, comme l'import),
   réglages et intention pris du côté qui a changé en dernier.

   Au démarrage : rapatrie l'enregistrement. S'il est plus frais que
   cet appareil, fusionne, écrit le résultat, l'envoie au serveur puis
   recharge la page (une seule fois). Si l'appareil a le plus frais
   (modifications hors ligne), c'est lui qui envoie. En session : un
   sondage léger surveille le stockage ; chaque changement part au
   serveur, avec réessai au cycle suivant si le réseau est en berne.
   Hors ligne ou non connecté : silence total, l'app fonctionne en
   local comme avant. */
(function(){
'use strict';

var SYNC_KEY = 'focus';
var LS = {
  settings: 'lenancker.focus.settings',
  intent: 'lenancker.focus.intent',
  sessions: 'lenancker.focus.sessions',
  days: 'lenancker.focus.days',
  stamp: 'lenancker.focus.stamp'
};
var POLL_MS = 4000;

var api = window.LenanckerSync;
if(!api || typeof api.loadConfig !== 'function' || !api.loadConfig()){ return; }
if(!window.FocusCore || typeof FocusCore.mergeSyncDocs !== 'function'){ return; }
var storage = window.lenanckerStorage;
if(!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function'){ return; }
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

function raw(){
  return {
    settings: storage.get(LS.settings),
    intent: storage.get(LS.intent),
    sessions: storage.get(LS.sessions),
    days: storage.get(LS.days)
  };
}

function sig(){
  var r = raw();
  return JSON.stringify([r.settings, r.intent, r.sessions, r.days]);
}

function doc(r, savedAtMs){
  return FocusCore.buildSyncDoc({
    settings: parseOr(r.settings) || {},
    intent: parseOr(r.intent) || {},
    sessions: parseOr(r.sessions) || [],
    days: parseOr(r.days) || {}
  }, savedAtMs);
}

function writeDoc(d){
  storage.set(LS.settings, JSON.stringify(d.settings));
  storage.set(LS.intent, JSON.stringify(d.intent));
  storage.set(LS.sessions, JSON.stringify(d.sessions));
  storage.set(LS.days, JSON.stringify(d.days));
}

function readStamp(){
  var n = Math.floor(Number(storage.get(LS.stamp)));
  return isFinite(n) && n > 0 ? n : 0;
}

var localStamp = readStamp();

function pushDoc(d){
  return api.pushRecord(SYNC_KEY, JSON.stringify(d));
}

/* Adoption au démarrage : le plus frais l'emporte, sessions et série
   fusionnent par union. */
function adopt(){
  api.pullRecord(SYNC_KEY).then(function(res){
    if(!res.ok){ fail(res); return; }
    var localDoc = doc(raw(), localStamp);
    if(res.empty){
      /* Serveur vide : si l'appareil possède des données (créées avant
         ce pont), c'est lui qui ouvre la synchronisation. */
      var hasLocal = localDoc.sessions.length > 0 ||
        Object.keys(localDoc.days).length > 0 || localStamp > 0;
      if(!hasLocal){ return; }
      var ms = Date.now();
      storage.set(LS.stamp, String(ms));
      pushDoc(doc(raw(), ms)).then(function(out){
        if(out.ok){ api.saveMeta(SYNC_KEY, { syncedAtMs: out.updatedMs }); }
      }, function(){ /* silencieux */ });
      return;
    }
    var remoteDoc = FocusCore.normalizeSyncDoc(parseOr(res.value));
    if(remoteDoc.savedAtMs > localStamp){
      /* Le serveur a changé depuis la dernière activité de cet
         appareil : fusion additive, puis départ sur l'état fusionné. */
      var merged = FocusCore.mergeSyncDocs(localDoc, remoteDoc);
      writeDoc(merged);
      storage.set(LS.stamp, String(merged.savedAtMs));
      api.saveMeta(SYNC_KEY, { syncedAtMs: res.updatedMs });
      var reloaded = false;
      function reload(){
        if(reloaded){ return; }
        reloaded = true;
        location.reload();
      }
      /* Envoie la fusion au serveur avant de recharger : le serveur
         et l'app démarrent ainsi sur le même état. */
      pushDoc(merged).then(function(out){
        if(out.ok){ api.saveMeta(SYNC_KEY, { syncedAtMs: out.updatedMs }); }
      }, function(){ /* silencieux */ }).then(reload);
      setTimeout(reload, 5000); /* garde-fou si le réseau traîne */
    }else if(localStamp > remoteDoc.savedAtMs){
      /* Cet appareil a le plus frais (éditions hors ligne) : il envoie. */
      pushDoc(localDoc).then(function(out){
        if(out.ok){ api.saveMeta(SYNC_KEY, { syncedAtMs: out.updatedMs }); }
      }, function(){ /* silencieux */ });
    }
  }).catch(function(){ /* silencieux : mode local */ });
}

/* Envoi opportuniste : la version locale part dès qu'elle change,
   avec réessai au cycle suivant si l'envoi échoue pour le réseau. */
var lastSeen = null;
var baseline = null;
var pushing = false;
function poll(){
  if(pushing){ return; }
  var s = sig();
  if(lastSeen === null){ lastSeen = s; baseline = s; return; }
  if(s === lastSeen){ return; }
  lastSeen = s;
  var ms = Date.now();
  storage.set(LS.stamp, String(ms));
  pushing = true;
  pushDoc(doc(raw(), ms)).then(function(res){
    if(res.ok){
      baseline = s;
      api.saveMeta(SYNC_KEY, { syncedAtMs: res.updatedMs });
    }else if(res.authExpired || res.missingCollection){
      fail(res);
      baseline = s; /* pas de nouvel essai tant que le problème dure */
    }else{
      lastSeen = baseline; /* réseau en berne : réessai au prochain cycle */
    }
    pushing = false;
  }, function(){
    lastSeen = baseline; /* réseau en berne : réessai au prochain cycle */
    pushing = false;
  });
}

adopt();
setInterval(poll, POLL_MS);
})();
