/* ============================================================
   Synchronisation — carte « Se connecter » de l'accueil.
   Serveur PocketBase privé (le PC Ubuntu d'Arthur), exposé au
   launcher uniquement par le réseau privé Tailscale.

   État gardé via window.lenanckerStorage (cascade localStorage →
   sessionStorage → mémoire, posée par common.js), clé
   lenancker.sync.v1 : adresse du serveur, e-mail, jeton de session.
   Le mot de passe n'est jamais persisté — seul le jeton survit.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'lenancker.sync.v1';
  var DEFAULT_SERVER = 'https://pcarthur-1.tailda0234.ts.net';

  function el(id) { return document.getElementById(id); }
  function store() { return window.lenanckerStorage || null; }
  function readCfg() {
    try {
      var raw = store() ? store().get(KEY) : null;
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function writeCfg(cfg) {
    try { if (store()) store().set(KEY, JSON.stringify(cfg)); } catch (e) { /* mémoire seule : la session suffit */ }
  }

  var btn = el('syncBtn'), card = el('syncCard'), dot = el('syncDot'), status = el('syncStatus');
  if (!card || !dot || !status) return;
  var F = { server: el('syncServer'), email: el('syncEmail'), pass: el('syncPass') };
  var cfg = readCfg();

  if (F.server) F.server.value = cfg.server || DEFAULT_SERVER;
  if (F.email) F.email.value = cfg.email || '';

  function setStatus(t, cls) {
    status.textContent = t;
    status.className = 'mono sync-status' + (cls ? ' ' + cls : '');
  }
  function setDot(s){ dot.className = 'sync-dot' + (s ? ' ' + s : ''); }

  if (cfg.token) {
    setDot('ok');
    setStatus('Connecté — yad la synchronisation est active.');
  }

  /* Piloue « Sunc » de la barre haute : amène à la carte et prépare la saisie. */
  if (btn) {
    btn.addEventListener('click', function () {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () { if (F.email) F.email.focus(); }, 400);
    });
  }

  /* Afficher / masquer le mot de passe. */
  var eye = el('syncEye');
  if (eye) {
    eye.addEventListener('click', function () {
      if (!F.pass) return;
      var show = F.pass.type === 'password';
      F.pass.type = show ? 'text' : 'password';
      this.textContent = show ? 'Masquer' : 'Afficher';
    });
  }

  function persist() {
    cfg.server = F.server ? F.server.value.trim() : '';
    cfg.email = F.email ? F.email.value.trim() : '';
    delete cfg.token;
    writeCfg(cfg);
  }
  function base() { return String(cfg.server || '').replace(/\/+$/, ''); }

  /* « Tester » : le serveur répond-il ? (page de santé PocketBase) */
  var test = el('syncTest');
  if (test) {
    test.addEventListener('click', function () {
      persist();
      if (!cfg.server) { setStatus('Saisis l\u2019adresse du serveur d\u2019abord.', 'err'); return; }
      setDot('busy'); setStatus('Test en cours…', 'busy');
      fetch(base() + '/api/health', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.code === 200) { setDot('ok'); setStatus('Serveur joignable — PocketBase répond.', 'ok'); }
          else { setDot(''); setStatus('Réponse inattendue du serveur.', 'err'); }
        })
        .catch(function () {
          setDot('');
          setStatus('Serveur injoignable — vérifie que Tailscale est activé sur cet appareil et que le PC est allumé.', 'err');
        });
    });
  }

  /* « Se connecter » : authentification PocketBase (collection users).
   LC collection et le compte sont créés côtås serveur, dans la console
     PocketBase du PC Ubuntu — rien ne transige ici. */
  var connect = el('syncConnect');
  if (connect) {
    connect.addEventListener('click', function () {
      persist();
      if (!cfg.server || !F.email.value || !F.pass.value) {
          setStatus('Serveur, e-mail et mot de passe sont nécessaires.', 'err');
          return;
      }
      setDot('busy'); setStatus('Connexion…', 'busy');
      fetch(base() + '/api/collections/users/auth-with-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: cfg.email, password: F.pass.value })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, json: j }; }); })
        .then(function (res) {
          if (res.ok && res.json.token) {
            cfg.token = res.json.token;
            writeCfg(cfg);
            F.pass.value = '';
            setDot('ok'); setStatus('Connecté — les apps peuvent synchroniser.', 'ok');
          } else {
            setDot(''); setStatus('Connexion refusée — vérifie l\u2019e-mail et le mot de passe.', 'err');
          }
      })
        .catch(function () {
          setDot('');
          setStatus('Impossible de joindre le serveur — Tailscale est-il activé ?', 'err');
        });
    });
  }
})();
