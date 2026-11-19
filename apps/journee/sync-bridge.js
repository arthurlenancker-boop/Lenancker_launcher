/* Pont de synchronisation pour l'app Journée (PocketBase).
   Chargé en dernier, il ne modifie jamais journee.js : l'app
   écrit d'abord dans le stockage local (clé lenancker.journee.v1), le pont
   observe ce stockage et synchronise quand une session existe
   (page Sync).

   Journée est un document unique et indivisible (pas de fusion champ à
   champ) : l'enveloppe envoyée est { v:1, state, savedAtMs } et le côté
   qui a modifié en dernier gagne. L'app assainit elle-même tout état lu
   (JourneeCore.sanitizeState au chargement), y compris venu du serveur.

   Au démarrage : le plus frais l'emporte (recharge unique si le serveur
   gagne). En session : l'état part dès qu'il change — y compris sa
   première apparition de contenu (quiz terminé après le chargement) — et
   un réexamen du serveur toutes les REVOIR_ITERATIONS itérations adopte un
   état distant plus frais si rien n'a bougé localement (pages laissées
   ouvertes). Tout est observable : un badge en bas à droite affiche
   l'état (envoyé, à jour, hors ligne, échec, session expirée) et tout
   échec d'envoi retente automatiquement ; un jeton ou un identifiant de
   compte périmés sont réparés par un renouvellement de session puis un
   nouvel essai. Une liste vide n'annonce « rien de neuf » qu'après
   vérification de la session : PocketBase répond par une liste vide
   (sans erreur) aux jetons qu'il n'accepte plus, notamment ceux d'un
   compte supprimé ou recréé. Hors ligne ou non connecté : l'app
   fonctionne en local comme avant. */
(function(){
'use strict';

var SYNC_KEY = 'journee';
var LS_STATE = 'lenancker.journee.v1';
var LS_STAMP = 'lenancker.journee.stamp';
var POLL_MS = 4000;
var REVOIR_ITERATIONS = 15; /* réexamen du serveur ~ toutes les minutes */

var api = window.LenanckerSync;
if(!api || typeof api.loadConfig !== 'function' || !api.loadConfig()){ return; }
var storage = window.lenanckerStorage;
if(!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function'){ return; }
var warned = { auth:false, missing:false, erreur:false };
var healed = false;

function parseOr(v){
  try{ return JSON.parse(v) || null; }
  catch(e){ return null; }
}

/* ---------- Badge : la synchronisation rendue visible ---------- */
var badge = null;
function creerBadge(){
  if(typeof document === 'undefined' || !document.body ||
     typeof document.createElement !== 'function'){ return null; }
  try{
    var el = document.createElement('div');
    el.id = 'journee-sync';
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:9999;'
      + 'font:12px/1.4 Inter,system-ui,sans-serif;color:#eae6da;'
      + 'background:rgba(15,14,11,.92);border:1px solid rgba(183,156,255,.38);'
      + 'border-radius:999px;padding:5px 12px;pointer-events:none;'
      + 'box-shadow:0 6px 18px rgba(0,0,0,.35);opacity:.95;';
    document.body.appendChild(el);
    return el;
  }catch(e){ return null; }
}
var TONS = { ok:'#7bc47f', warn:'#e8b34b', err:'#ff6b4a', off:'#9a917d' };
function statut(txt, ton){
  if(!badge){ return; }
  badge.textContent = txt;
  badge.style.borderColor = TONS[ton] || TONS.off;
}
function heureMs(ms){
  var d = new Date(ms > 0 ? ms : Date.now());
  var h = d.getHours(), m = d.getMinutes();
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

/* ---------- Avertissements (un seul toast par nature et par visite) ---------- */
function warn(kind, msg){
  if(warned[kind]){ return; }
  warned[kind] = true;
  if(window.toast){ window.toast(msg, 'warn', 8000); }
}

function fail(res){
  if(res && res.authExpired){
    statut('Sync : session expirée — reconnecte-toi sur la page Sync', 'err');
    warn('auth', 'Session sync expirée — reconnecte-toi sur la page Sync.');
  }else if(res && res.missingCollection){
    statut('Sync : collection absente du serveur (voir la console PocketBase)', 'err');
    warn('missing', 'Collection sync_records absente du serveur : crée-la dans la console PocketBase (voir la PR).');
  }else if(res){
    statut('Sync : échec — nouvel essai automatique', 'err');
    warn('erreur', ((res.error || 'Échec de la synchronisation.') +
      ' Nouveaux essais automatiques en cours.'));
  }else{
    statut('Sync : serveur injoignable', 'off');
  }
}

/* ---------- État local ---------- */
function stateRaw(){
  return storage.get(LS_STATE);
}
function stampActuel(){
  var n = Math.floor(Number(storage.get(LS_STAMP)));
  return isFinite(n) && n > 0 ? n : 0;
}
var localStamp = stampActuel();

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

/* ---------- Envoi (avec auto-réparation de session puis réessai) ---------- */
function pushEtat(ms){
  var st = parseOr(stateRaw());
  if(!st){ return Promise.resolve({ ok:false, silenceLocal:true }); }
  return api.pushRecord(SYNC_KEY, JSON.stringify({ v:1, state:st, savedAtMs: ms }));
}
function envoi(ms){
  return pushEtat(ms).then(function(res){
    if(!res || res.ok || res.authExpired || res.missingCollection || res.silenceLocal){ return res; }
    if(healed || typeof api.refresh !== 'function'){ return res; }
    /* Échec d'envoi inexpliqué : jeton ou identifiant de compte
       potentiellement périmés — renouveler la session puis réessayer
       une fois (la config stockée est mise à jour par refresh). */
    healed = true;
    return api.refresh().then(function(r){
      if(r && (r.authExpired || r.missingCollection)){ return r; }
      return pushEtat(ms);
    });
  });
}
function envoyer(v, premiereFois, ms){
  ms = ms || Date.now();
  storage.set(LS_STAMP, String(ms));
  pushing = true;
  statut('Sync : envoi…', 'off');
  return envoi(ms).then(function(res){
    if(!res){ res = {}; }
    if(res.ok){
      baseline = v;
      statut('Sync : envoyé à ' + heureMs(ms), 'ok');
      api.saveMeta(SYNC_KEY, { syncedAtMs: res.updatedMs });
    }else if(res.silenceLocal){
      /* plus d'état localement : rien à faire */
    }else if(res.authExpired || res.missingCollection){
      fail(res);
      baseline = v; /* pas de nouvel essai tant que le problème dure */
    }else{
      fail(res);
      lastSeen = premiereFois ? null : baseline; /* réessai au prochain cycle */
    }
    pushing = false;
    return res;
  }, function(){
    lastSeen = premiereFois ? null : baseline;
    statut('Sync : serveur injoignable', 'off');
    pushing = false;
  });
}

/* Une liste vide n'est pas une preuve de « rien de neuf » : PocketBase
   répond 200 + liste vide à un jeton qu'il n'accepte plus (compte
   supprimé ou recréé). Avant d'annoncer « rien de neuf », la session
   est vérifiée par un renouvellement (auth-refresh), qui au passage
   prolonge le jeton ; une vérification indécise (serveur momentanément
   injoignable) maintient l'annonce normale. Un refus authentique
   affiche « session expirée » (badge + toast unique). */
function verifierRienDeNeuf(){
  var annonce = function(){ statut('Sync : en ligne, rien de neuf', 'off'); solder(); };
  if(typeof api.refresh !== 'function'){ annonce(); return; }
  api.refresh().then(function(r){
    if(!r || r.ok || (!r.authExpired && !r.missingCollection)){ annonce(); return; }
    fail(r);
    solder();
  }, annonce);
  return;
}

/* Adoption d'un état distant plus frais : remplace l'état local et
   recharge la page une fois. */
function appliquerDistant(remoteState, remoteMs, updatedMs){
  storage.set(LS_STATE, JSON.stringify(remoteState));
  storage.set(LS_STAMP, String(remoteMs));
  api.saveMeta(SYNC_KEY, { syncedAtMs: updatedMs });
  statut('Sync : données du serveur appliquées — rechargement', 'ok');
  location.reload();
}

/* Réconciliation : appelée à l'adoption du démarrage et au réexamen
   périodique. demarrage=true : sans condition locale (la page vient
   de se charger). demarrage=false : seulement si rien n'a bougé depuis
   le dernier échange (on ne recharge pas une page active). */
function reconcilier(res, demarrage){
  if(!res.ok){ fail(res); solder(); return; }
  if(res.empty){
    /* Serveur vide : si l'appareil possède un état (quiz et devoirs
       saisis), c'est lui qui ouvre la synchronisation (un éventuel
       échec d'envoi reste visible et auto-réparé). */
    if(hasContent(parseOr(stateRaw()))){
      var ms = Date.now();
      storage.set(LS_STAMP, String(ms));
      lastSeen = baseline = stateRaw();
      envoyer(lastSeen, true, ms);
      solder();
      return;
    }
    verifierRienDeNeuf();
    return;
  }
  var env = parseOr(res.value);
  var remoteState = (env && typeof env === 'object') ? env.state : null;
  var remoteMs = Math.max(0, Math.floor(Number(env && env.savedAtMs)) || 0);
  var stamp = stampActuel();
  if(remoteState && remoteMs > stamp){
    if(demarrage){
      appliquerDistant(remoteState, remoteMs, res.updatedMs);
      solder();
      return;
    }
    /* Réexamen en session : adopter seulement si l'état local n'a pas
       bougé depuis le dernier échange (ou s'il n'existe pas encore :
       rien à perdre sur un appareil neuf). */
    if(!pushing){
      var localActuel = stateRaw();
      if(localActuel === null || localActuel === lastSeen){
        appliquerDistant(remoteState, remoteMs, res.updatedMs);
        return;
      }
      statut('Sync : en attente (modifications locales non envoyées)', 'warn');
    }
    solder();
    return;
  }
  if(hasContent(parseOr(stateRaw())) && stamp > remoteMs && stateRaw() !== null){
    /* Le local est plus frais (éditions hors ligne ou jamais envoyées) : il envoie. */
    lastSeen = baseline = stateRaw();
    envoyer(lastSeen, false, stamp);
    solder();
    return;
  }
  statut('Sync : à jour à ' + heureMs(Date.now()), 'ok');
  solder();
}
function solder(){
  if(lastSeen === null){ lastSeen = stateRaw(); }
  if(lastSeen !== null){ baseline = lastSeen; }
  ready = true;
}

/* Adoption au démarrage : le plus frais l'emporte. */
function adopt(){
  statut('Sync : mise en route…', 'off');
  api.pullRecord(SYNC_KEY).then(function(res){
    reconcilier(res, true);
  }).catch(function(){ /* silencieux : mode local */
    lastSeen = baseline = stateRaw();
    ready = true;
    statut('Sync : serveur injoignable', 'off');
  });
}

/* Réexamen périodique du serveur : une page laissée ouverte finit par
   adopter les données venues d'un autre appareil. */
function revue(){
  if(pushing){ return; }
  api.pullRecord(SYNC_KEY).then(function(res){
    reconcilier(res, false);
  }).catch(function(){
    statut('Sync : serveur injoignable', 'off');
  });
}

/* Sondage : l'état part dès qu'il change, y compris sa première
   apparition de contenu ; toutes les REVOIR_ITERATIONS itérations, on
   réexamine le serveur. */
var lastSeen = null;
var baseline = null;
var pushing = false;
var ready = false;
var cycles = 0;
function poll(){
  if(!ready || pushing){ return; }
  cycles++;
  if(cycles % REVOIR_ITERATIONS === 0){ revue(); return; }
  var v = stateRaw();
  if(v === null){ return; }
  if(lastSeen === null){
    /* Première observation : un contenu qui apparaît (quiz terminé
       après le chargement) part immédiatement ; un état sans contenu
       reste local. */
    lastSeen = v; baseline = v;
    if(hasContent(parseOr(v))){ envoyer(v, true); }
    return;
  }
  if(v === lastSeen){ return; }
  lastSeen = v;
  envoyer(v, false);
}

badge = creerBadge();
adopt();
setInterval(poll, POLL_MS);
})();
