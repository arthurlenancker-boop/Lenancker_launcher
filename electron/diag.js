/* Diagnostic : se connecte au port DevTools de l'app Electron, recharge
   la page, collecte exceptions console / erreurs reseau / evenements de log,
   capture l'etat du DOM et une capture d'ecran. Sorties : <DIAG_OUT>.json,
   <DIAG_OUT>.png, et un resume JSON sur stdout. */
const fs = require('fs');
const port = process.env.DIAG_PORT || '9222';
const outPrefix = process.env.DIAG_OUT || 'diag';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && !t.url.startsWith('devtools'));
      if (page) return page;
    } catch (e) { /* app pas encore prete */ }
    await sleep(500);
  }
  throw new Error('aucune page devtools trouvee (app lancee ?)');
}

(async () => {
  const page = await getPage();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('websocket devtools impossible')); });

  const events = [];
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      events.push('EXCEPTION ' + (d.text || '') + ' ' + ((d.exception && d.exception.description) || JSON.stringify(d) || '').slice(0, 400));
    }
    if (m.method === 'Runtime.consoleAPICalled') events.push('CONSOLE ' + m.params.type + ' ' + m.params.args.map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' ').slice(0, 300));
    if (m.method === 'Log.entryAdded') { const e = m.params.entry; events.push('LOG ' + e.level + ' ' + e.text + ' ' + (e.url || '')); }
    if (m.method === 'Network.loadingFailed') events.push('NET-FAIL ' + m.params.errorText + ' ' + (m.params.blockedReason || ''));
  });

  function call(method, params) {
    return new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout CDP ' + method)); } }, 9000);
    });
  }

  let state = null;
  const problems = [];
  try {
    await call('Runtime.enable');
    await call('Log.enable');
    await call('Page.enable');
    await call('Network.enable');
    await call('Page.reload', { ignoreCache: true });
    await sleep(9000);
  } catch (e) { problems.push(String(e.message)); }
  try {
    const r = await call('Runtime.evaluate', {
      expression: `JSON.stringify({
        url: location.href, ready: document.readyState, title: document.title,
        jsReveal: document.documentElement.classList.contains('js-reveal'),
        reveal: document.querySelectorAll('.reveal').length,
        revealIn: document.querySelectorAll('.reveal.in').length,
        shellChildren: document.querySelector('.shell') ? document.querySelector('.shell').children.length : -1,
        toastFn: typeof window.toast,
        storageMode: window.lenanckerStorage ? window.lenanckerStorage.mode : 'absent',
        focusCore: typeof window.FocusCore
      })`,
      returnByValue: true,
    });
    state = r.result ? r.result.value : null;
  } catch (e) { problems.push(String(e.message)); }
  let pngB64 = null;
  try {
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    pngB64 = shot.result.data;
  } catch (e) { problems.push(String(e.message)); }

  const result = { page: page.url, state, problems, events };
  fs.writeFileSync(`${outPrefix}.json`, JSON.stringify(result, null, 2));
  if (pngB64) fs.writeFileSync(`${outPrefix}.png`, Buffer.from(pngB64, 'base64'));
  console.log('LENANCKER-DIAG ' + JSON.stringify(result));
  process.exit(0);
})().catch((e) => { console.error('LENANCKER-DIAG-ERROR ' + e.message); process.exit(1); });
