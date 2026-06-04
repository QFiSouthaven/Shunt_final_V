/* Aether Shunt — Electron main process.
 *
 * Mission: deliver a store-bought feel. Double-click installer → Start Menu shortcut →
 * launch → no terminal windows visible, no Settings page friction, no manual config.
 *
 * Responsibilities:
 *   1. Single-instance lock.
 *   2. One BrowserWindow that loads first-run.html (first launch) or the bundled
 *      SPA dist (subsequent launches).
 *   3. Stage hub-bus-tools into the writable userData directory on every launch
 *      (Program Files is conventionally read-only and bus tools need to write
 *      adjacent files like .seq.json, presence/, inbox/, etc.).
 *   4. Spawn the bus orchestrator from userData as a hidden child via
 *      ELECTRON_RUN_AS_NODE — no CMD windows ever flash.
 *   5. Tray icon (minimize-to-tray, Quit).
 *   6. IPC bridges via preload for the wizard.
 */

'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, safeStorage, shell, Notification, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const http = require('node:http');

// ─── single-instance lock (must run before any side effects) ──────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

// ─── path resolution ──────────────────────────────────────────────────────────
// In production (app.isPackaged === true) the SPA lives at
// <resources>/spa/index.html and the bus tools at <resources>/hub-bus-tools/.
// In development (npm start from aether-app/) they live at ../dist and
// ../hub-bus-tools relative to this file.
const USER_DATA_DIR = app.getPath('userData');
const FIRST_RUN_FLAG = path.join(USER_DATA_DIR, 'first-run.complete');
const SETTINGS_SEED_FILE = path.join(USER_DATA_DIR, 'settings-seed.json');
const SECRETS_DIR = path.join(USER_DATA_DIR, 'secrets');
const BUS_LOG_FILE = path.join(USER_DATA_DIR, 'bus.log');
const BUS_STAGE_VERSION_FILE = path.join(USER_DATA_DIR, 'bus-stage.version');
const STAGED_BUS_TOOLS_DIR = path.join(USER_DATA_DIR, 'hub-bus-tools');
const STAGED_BUS_DIR = path.join(USER_DATA_DIR, 'hub-bus');

function resourceDir(rel) {
  return app.isPackaged
    ? path.join(process.resourcesPath, rel)
    : path.join(__dirname, '..', rel === 'spa' ? 'dist' : rel);
}

const SPA_INDEX = path.join(resourceDir('spa'), 'index.html');
const SRC_BUS_TOOLS = resourceDir('hub-bus-tools');
const SRC_BUS_SEEDS = resourceDir('hub-bus');

// ─── module-scope state ───────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let busChild = null;
let isQuitting = false;

// ─── filesystem helpers ───────────────────────────────────────────────────────
function ensureUserDirs() {
  for (const dir of [USER_DATA_DIR, SECRETS_DIR, STAGED_BUS_DIR]) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  }
}

function copyDirSync(src, dst, filter) {
  if (!fs.existsSync(src)) return;
  try { fs.mkdirSync(dst, { recursive: true }); } catch (_) {}
  for (const name of fs.readdirSync(src)) {
    const sp = path.join(src, name);
    const dp = path.join(dst, name);
    const stat = fs.statSync(sp);
    if (stat.isDirectory()) {
      copyDirSync(sp, dp, filter);
    } else if (!filter || filter(name)) {
      try { fs.copyFileSync(sp, dp); } catch (_) {}
    }
  }
}

// Stage hub-bus-tools into the writable userData dir if the app version
// changed since the last stage (or on first launch).
function stageBusTools() {
  if (!fs.existsSync(SRC_BUS_TOOLS)) {
    appendLog('[stage] source bus tools missing at ' + SRC_BUS_TOOLS);
    return;
  }
  const currentVer = app.getVersion();
  let stagedVer = null;
  try { stagedVer = fs.readFileSync(BUS_STAGE_VERSION_FILE, 'utf8').trim(); } catch (_) {}
  if (stagedVer === currentVer && fs.existsSync(path.join(STAGED_BUS_TOOLS_DIR, 'orchestrator.mjs'))) {
    return; // already staged at this version
  }
  appendLog('[stage] copying bus tools to userData (v=' + currentVer + ')');
  copyDirSync(SRC_BUS_TOOLS, STAGED_BUS_TOOLS_DIR,
    (name) => name.endsWith('.mjs') || name.endsWith('.json'));
  // Seed hub-bus dir with read-only docs + participants.json — but only on
  // first stage. Don't clobber the user's runtime state on update.
  if (!fs.existsSync(path.join(STAGED_BUS_DIR, 'participants.json'))) {
    copyDirSync(SRC_BUS_SEEDS, STAGED_BUS_DIR,
      (name) => name === 'PROTOCOL.md' || name === 'README.md' || name === 'participants.json');
  }
  try { fs.writeFileSync(BUS_STAGE_VERSION_FILE, currentVer); } catch (_) {}
}

// ─── first-run + seed file ────────────────────────────────────────────────────
function isFirstRun() { return !fs.existsSync(FIRST_RUN_FLAG); }
function markFirstRunComplete() {
  try { fs.writeFileSync(FIRST_RUN_FLAG, new Date().toISOString(), 'utf8'); } catch (_) {}
}
function readSettingsSeed() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_SEED_FILE, 'utf8')); }
  catch (_) { return null; }
}
function writeSettingsSeed(obj) {
  try { fs.writeFileSync(SETTINGS_SEED_FILE, JSON.stringify(obj, null, 2), 'utf8'); }
  catch (_) {}
}
function saveSecret(key, plaintext) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  try {
    const buf = safeStorage.encryptString(String(plaintext));
    fs.writeFileSync(path.join(SECRETS_DIR, key + '.bin'), buf);
    return true;
  } catch (_) { return false; }
}
function loadSecret(key) {
  try {
    const buf = fs.readFileSync(path.join(SECRETS_DIR, key + '.bin'));
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(buf);
  } catch (_) { return null; }
}

// ─── LM Studio detection ──────────────────────────────────────────────────────
function probeLmStudio(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1', port: 1234, path: '/v1/models', method: 'GET', timeout: timeoutMs
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const models = (data && data.data) ? data.data.map((m) => m.id) : [];
          resolve({ reachable: true, models });
        } catch (_) {
          resolve({ reachable: true, models: [] });
        }
      });
    });
    req.on('error', () => resolve({ reachable: false, models: [] }));
    req.on('timeout', () => { req.destroy(); resolve({ reachable: false, models: [] }); });
    req.end();
  });
}

// ─── hidden bus spawn ─────────────────────────────────────────────────────────
function startBus() {
  if (busChild && !busChild.killed) return;
  const orchestrator = path.join(STAGED_BUS_TOOLS_DIR, 'orchestrator.mjs');
  if (!fs.existsSync(orchestrator)) {
    appendLog('[bus] orchestrator not found at ' + orchestrator + ' — staging skipped or failed');
    return;
  }
  try {
    const logStream = fs.createWriteStream(BUS_LOG_FILE, { flags: 'a' });
    busChild = spawn(process.execPath, [orchestrator, '--no-adam'], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',     // run Electron's node, not the UI
        BUS_DIR: STAGED_BUS_DIR,       // honored by envelope.mjs
        NODE_NO_WARNINGS: '1'
      },
      cwd: STAGED_BUS_TOOLS_DIR,
      detached: false,
      windowsHide: true,               // critical: no CMD window flash
      stdio: ['ignore', 'pipe', 'pipe']
    });
    busChild.stdout.pipe(logStream);
    busChild.stderr.pipe(logStream);
    busChild.on('exit', (code, sig) => {
      appendLog(`[bus] exited code=${code} signal=${sig}`);
      busChild = null;
      if (!isQuitting) setTimeout(startBus, 3000);
    });
    appendLog('[bus] started pid=' + busChild.pid + ' cwd=' + STAGED_BUS_TOOLS_DIR);
  } catch (err) {
    appendLog('[bus] spawn failed: ' + err.message);
  }
}

function stopBus() {
  if (busChild && !busChild.killed) {
    try { busChild.kill('SIGTERM'); } catch (_) {}
    busChild = null;
  }
}

function appendLog(line) {
  try { fs.appendFileSync(BUS_LOG_FILE, `[${new Date().toISOString()}] ${line}\n`); } catch (_) {}
}

// ─── window ───────────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b1020',
    show: false,
    autoHideMenuBar: true,
    title: 'Aether Shunt',
    icon: path.join(__dirname, 'tray-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (tray && Notification.isSupported()) {
        new Notification({
          title: 'Aether Shunt',
          body: 'Running in the system tray. Right-click the icon to quit.'
        }).show();
      }
    }
  });

  const target = isFirstRun()
    ? 'file://' + path.join(__dirname, 'first-run.html').replace(/\\/g, '/')
    : 'file://' + SPA_INDEX.replace(/\\/g, '/');

  mainWindow.loadURL(target).catch((err) => {
    appendLog('[ui] loadURL failed: ' + err.message + ' target=' + target);
  });
}

// ─── tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  let img;
  try { img = nativeImage.createFromPath(path.join(__dirname, 'tray-icon.png')); }
  catch (_) { img = nativeImage.createEmpty(); }
  tray = new Tray(img);
  tray.setToolTip('Aether Shunt');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { label: 'Hide', click: () => { if (mainWindow) mainWindow.hide(); } },
    { type: 'separator' },
    { label: 'Open user data folder', click: () => shell.openPath(USER_DATA_DIR) },
    { label: 'Open bus log', click: () => shell.openPath(BUS_LOG_FILE) },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

// ─── ipc surface for the wizard ───────────────────────────────────────────────
function registerIpc() {
  ipcMain.handle('aether:probe-lmstudio', async () => probeLmStudio());
  ipcMain.handle('aether:save-secret', async (_evt, { key, value }) => saveSecret(key, value));
  ipcMain.handle('aether:has-secret', async (_evt, key) => {
    try { return fs.existsSync(path.join(SECRETS_DIR, key + '.bin')); }
    catch (_) { return false; }
  });
  ipcMain.handle('aether:save-settings-seed', async (_evt, seed) => {
    writeSettingsSeed(seed || {});
    return true;
  });
  ipcMain.handle('aether:read-settings-seed', async () => readSettingsSeed());
  ipcMain.handle('aether:complete-first-run', async (_evt, seed) => {
    if (seed && typeof seed === 'object') writeSettingsSeed(seed);
    markFirstRunComplete();
    if (mainWindow) {
      mainWindow.loadURL('file://' + SPA_INDEX.replace(/\\/g, '/')).catch(() => {});
    }
    return true;
  });
  ipcMain.handle('aether:open-external', async (_evt, url) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });
  ipcMain.handle('aether:get-version', async () => app.getVersion());
  ipcMain.handle('aether:get-bus-status', async () => ({
    running: !!(busChild && !busChild.killed),
    pid: busChild ? busChild.pid : null
  }));
  ipcMain.handle('aether:restart-bus', async () => {
    stopBus();
    setTimeout(startBus, 500);
    return true;
  });
}

// ─── lifecycle ────────────────────────────────────────────────────────────────
app.on('second-instance', () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  ensureUserDirs();
  stageBusTools();
  registerIpc();
  startBus();
  createTray();
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  // Otherwise stay alive in the tray (the close handler hides the window).
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBus();
});
