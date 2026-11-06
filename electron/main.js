/* Lenancker Launcher — wrapper Electron (Windows .exe).
   Le site statique est servi via le protocole app:// et non en file:// :
   sous file://, les <script> insérés dynamiquement (KaTeX, export .docx,
   pdf-lib, chargés à la demande par le site) finissent par échouer avec
   net::ERR_UNKNOWN_URL_SCHEME après quelques chargements, ce qui casse
   le rendu des maths et les exports dans le .exe. Sur app:// — schéma
   privilégié, sécurisé, fetch et stream — tout se comporte comme en PWA.
   En dev comme packagé, la racine servie est la même. */
const { app, BrowserWindow, protocol, net } = require('electron');
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
  win.loadURL('app://local/index.html');
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
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
