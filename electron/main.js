/* Lenancker Launcher — wrapper Electron (Windows .exe).
   Le site statique est servi via le protocole app:// et non en file:// :
   sous file://, les <script> insérés dynamiquement (KaTeX, export .docx,
   pdf-lib, chargés à la demande par le site) finissent par échouer avec
   net::ERR_UNKNOWN_URL_SCHEME après quelques chargements, ce qui casse
   le rendu des maths et les exports dans le .exe. Sur app:// — schéma
   privilégié, sécurisé, fetch et stream — tout se comporte comme en PWA.
   En dev comme packagé, la racine servie est la même. */
const { app, BrowserWindow, dialog, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const webRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'app')
  : path.join(__dirname, '..');

/* app://local/index.html -> <webRoot>/index.html ; jamais en dehors de la racine. */
function serveApp(request) {
  const { pathname } = new URL(request.url);
  let p = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!p) p = 'index.html';
  const full = path.normalize(path.join(webRoot, p));
  if (full !== webRoot && !full.startsWith(webRoot + path.sep)) {
    return new Response('404', { status: 404 });
  }
  return net.fetch(pathToFileURL(full).toString());
}

/* Mise a jour automatique (electron-updater), installateur NSIS uniquement.
   Au lancement, l'app lit latest.yml des Releases GitHub (genere par
   electron-builder a chaque build) : si une version plus recente existe,
   elle est telechargee en arriere-plan puis l'utilisateur choisit entre
   installer immediatement ou a la fermeture. La version portable ne se met
   pas a jour (limitation electron-updater) : la verification y est
   desactivee. Tout echec reste silencieux : hors-ligne ou GitHub
   injoignable ne doit jamais gener l'app. Les preversions ne declenchent
   pas de mise a jour (canal « latest » uniquement). */
function verifierMisesAJour() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'arthurlenancker-boop',
    repo: 'Lenancker_launcher',
  });
  autoUpdater.on('error', () => {});
  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Mise à jour disponible',
        message: 'La version ' + info.version + ' de Lenancker Launcher est prête.',
        detail: "Vous pouvez installer maintenant, ou laisser l'application le faire à sa fermeture.",
        buttons: ['Redémarrer et installer', 'Installer à la fermeture'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall(true, true);
      });
  });
  autoUpdater.checkForUpdates().catch(() => {});
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 920,
    minHeight: 640,
    backgroundColor: '#0f0e0b',
    autoHideMenuBar: true,
    title: 'Lenancker Launcher',
    icon: path.join(webRoot, 'assets', 'icons', 'icon-512.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  /* Diagnostic : LENANCKER_URL ouvre une page precise (ex. une app) pour
     capturer sa console dans la CI. Toujours l'accueil en usage normal. */
  win.loadURL(process.env.LENANCKER_URL || 'app://local/index.html');

  /* Diagnostic v3 : journaliser les evenements du processus de rendu
     (blocage, crash, console) quand LENANCKER_EVENTS est defini. */
  const diagLog = process.env.LENANCKER_EVENTS;
  if (diagLog) {
    const t0 = Date.now();
    const log = (type, data) => {
      try { fs.appendFileSync(diagLog, JSON.stringify(Object.assign({ t: Date.now() - t0, type }, data)) + '\n'); } catch (e) { /* diagnostic best effort */ }
    };
    win.webContents.on('render-process-gone', (e, d) => log('render-process-gone', { reason: d.reason, exitCode: d.exitCode }));
    win.webContents.on('unresponsive', () => log('unresponsive', {}));
    win.webContents.on('responsive', () => log('responsive', {}));
    win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => log('did-fail-load', { code, desc, url }));
    win.webContents.on('console-message', (e, level, message, line, sourceId) => log('console', { level, message: String(message).slice(0, 300), source: String(sourceId).slice(0, 120), line }));
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length) {
      const win = wins[0];
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle('app', serveApp);
    verifierMisesAJour();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
