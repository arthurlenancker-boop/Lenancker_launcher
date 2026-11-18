/* Pont de synchronisation pour l'app Journée (PocketBase).
   Chargé en dernier, il ne modifie jamais journee.js : l'app
   écrit d'abord dans le stockage local (clé lenancker.journee.v1), le pont
   observe ce stockage et synchronise quand une session existe
   (page Sync).

   Journée est un document unique et indivisible (pas de fusion champ à champ) : l'enveloppe envoyée est { v:1, state, savedAtMs } et le côté qui a modifié en dernier gagne. L'app assainit elle-même tout état lu (JourneeCore.sanitizeState au chargement), y compris un état venu du serveur.

   Au démarrage : si le serveur est plus frais, l'état distant remplace l'état local et la page se recharge une fois ; si cet
   appareil est plus frais (modifications hors ligne), c'est lui qui
   envoie. En session : un sondage léger surveille le stockage ; chaque
   changement part au serveur, avec réessai au cycle suivant si le
   réseau est en berne. Hors ligne ou non connecté : silence total,
   l'app fonctionne en local comme avant. */
(function(){
'use strict';

var SYNC_KEY = 'journee';
var LS_STATE = 'lenancker.journee.v1';
var LS_STAMP = 'lenancker.journee.stamp';
var POLL_MS = 4000;

var api = window.LenanckerSync;
if(!api || typeof api.loadConfig !== 'function' || !api.loadConfig()){ return; }
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

function stateRaw(){
  return storage.get(LS_STATE);
}

function readStamp(){
  var n = Math.floor(Number(storage.get(LS_STAMP)));
  return isFinite(n) && n > 0 ? n : 0;
}

var localStamp = readStamp();

/* L'état mérite-t-il d'être envoyé ? (Évite de publier l'état par
   défaut d'un appareil neuf sur un serveur encore vide.) */
function hasContent(st){
  if(!st || typeof st !== 'object'){ return false; }
  if(st.profile && typeof st.profile === 'object' &&
     (st.profile.niveau || (Array.isArray(st.profile.spes) && st.profile.spes.length))){ return true; }
  if(Array.isArray(st.tasks) && st.tasks.length){ return true; }
  if(st.done && typeof st.done === 'object' && Object.keys(st.done).length){ return true; }
  return false;
}

function pushState(ms){
  var st = parseOr(stateRaw());
  if(!st){ return Promise.resolve({ ok:false }); }
  return api.pushRecord(SYNC_KEY, JSON.stringify({ v:1, state:st, savedAtMs:ms }));
}

/* Adoption au démarrage : le plus frais l'emporte. */
function adopt(){
  api.pullRecord(SYNC_KEY).then(function(res){
    if(!res.ok){ fail(res); return; }
    if(res.empty){
      /* Serveur vide : si l'appareil possède un état (quiz et devoirs saisis
         avant ce pont), c'est lui qui ouvre la synchronisation. */
      if(hasContent(parseOr(stateRaw()))){
        var ms = Date.now();
        storage.set(LS_STAMP, String(ms));
        pushState(ms).then(function(out){
          if(out.ok){ api.saveMeta(SYNC_KEY, { syncedAtMs: out.updatedMs }); }
        }, function(){ /* silencieux */ });
      }
      return;
    }
    var env = parseOr(res.value);
    var remoteState = (env && typeof env === 'object') ? env.state : null;
    var remoteMs = Math.max(0, Math.floor(Number(env && env.savedAtMs)) || 0);
    if(remoteState && remoteMs > localStamp){
      /* Le serveur a l'état le plus frais : l'app démarre dessus.
         Une reprise d'exécution ici serait perdue : elle part d'un
         document de toute façon écrasé, adoption unique au lancement. */
      storage.set(LS_STATE, JSON.stringify(remoteState));
      storage.set(LS_STAMP, String(remoteMs));
      api.saveMeta(SYNC_KEY, { syncedAtMs: res.updatedMs });
      location.reload();
    }else if(remoteMs < localStamp && stateRaw() !== null){
      /* Cet appareil a le plus frais (éditions hors ligne) : il envoie. */
      pushState(localStamp).then(function(out){
        if(out.ok){ api.saveMeta(SYNC_KEY, { syncedAtMs: out.updatedMs }); }
      }, function(){ /* silencieux */ });
    }
  }).catch(function(){ /* silencieux : mode local */ });
}

/* Envoi opportuniste : l'état part dès qu'il change, avec réessai
   au cycle suivant si l'envoi échoue pour le réseau. */
var lastSeen = null;
var baseline = null;
var pushing = false;
function poll(){
  if(pushing){ return; }
  var v = stateRaw();
  if(v === null){ return; }
  if(lastSeen === null){ lastSeen = v; baseline = v; return; }
  if(v === lastSeen){ return; }
  lastSeen = v;
  var ms = Date.now();
  storage.set(LS_STAMP, String(ms));
  pushing = true;
  pushState(ms).then(function(res){
    if(res.ok){
      baseline = v;
      api.saveMeta(SYNC_KEY, { syncedAtMs: res.updatedMs });
    }else if(res.authExpired || res.missingCollection){
      fail(res);
      baseline = v; /* pas de nouvel essai tant que le problème dure */
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
