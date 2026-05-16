// main.js — Electron main process for Aether Splicer desktop wrapper.
//
// Responsibilities:
//   * Single-instance lock (focus existing window if relaunched).
//   * BrowserWindow loading the local copy of splicer.html.
//   * System tray icon with Show/Hide, Toggle Auto-start, Quit.
//   * Minimize-to-tray (window close hides; only tray Quit exits).
//   * safeStorage-backed bearer credential persistence (Windows Credential
//     Vault on Windows). Exposed to the renderer through preload.js.
//   * Login-item toggle (default OFF).
//
// No code-signing — Windows SmartScreen will warn on first run; user clicks
// "More info → Run anyway". Documented in README.md.

'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, safeStorage, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// ─── Single-instance lock ────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ─── Globals ─────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let isQuitting = false;

// Storage paths for safeStorage-encrypted bearer.
//   userData on Windows: %APPDATA%/<productName>/
const SECRET_FILE = () => path.join(app.getPath('userData'), 'splicer-secret.bin');

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 680,
    minWidth: 380,
    minHeight: 500,
    title: 'Aether Splicer',
    backgroundColor: '#0d1117',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'tray-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'splicer.html'));

  // Minimize-to-tray: closing the window only hides it.
  mainWindow.on('close', (ev) => {
    if (!isQuitting) {
      ev.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Tray ────────────────────────────────────────────────────────────────────
function rebuildTrayMenu() {
  if (!tray) return;
  const loginItem = app.getLoginItemSettings();
  const ctx = Menu.buildFromTemplate([
    {
      label: 'Show / Hide',
      click: () => {
        if (!mainWindow) { createWindow(); return; }
        if (mainWindow.isVisible()) mainWindow.hide();
        else { mainWindow.show(); mainWindow.focus(); }
      }
    },
    {
      label: 'Auto-start on login',
      type: 'checkbox',
      checked: !!loginItem.openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: !!item.checked });
        rebuildTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(ctx);
}

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Aether Splicer');
  tray.on('click', () => {
    if (!mainWindow) { createWindow(); return; }
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });
  rebuildTrayMenu();
}

// ─── safeStorage IPC bridge (renderer ↔ main) ────────────────────────────────
ipcMain.handle('cowork-secret:get', async () => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const f = SECRET_FILE();
    if (!fs.existsSync(f)) return null;
    const buf = fs.readFileSync(f);
    if (!buf || buf.length === 0) return null;
    const plain = safeStorage.decryptString(buf);
    return plain || null;
  } catch (err) {
    console.error('[cowork-secret:get] failed:', err && err.message);
    return null;
  }
});

ipcMain.handle('cowork-secret:set', async (_ev, value) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage encryption not available on this platform');
    }
    const v = String(value == null ? '' : value);
    const buf = safeStorage.encryptString(v);
    const f = SECRET_FILE();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf, { mode: 0o600 });
    return true;
  } catch (err) {
    console.error('[cowork-secret:set] failed:', err && err.message);
    throw err;
  }
});

ipcMain.handle('cowork-secret:clear', async () => {
  try {
    const f = SECRET_FILE();
    if (fs.existsSync(f)) fs.unlinkSync(f);
    return true;
  } catch (err) {
    console.error('[cowork-secret:clear] failed:', err && err.message);
    return false;
  }
});

// Optional notification IPC — renderer can also use the Web Notification API
// directly. This is a fallback for callers that prefer IPC.
ipcMain.handle('cowork-notify', async (_ev, payload) => {
  try {
    const { title, body } = payload || {};
    if (!Notification.isSupported()) return false;
    const n = new Notification({
      title: String(title || 'Aether Splicer'),
      body: String(body || ''),
      silent: false
    });
    n.on('click', () => {
      if (mainWindow) {
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    });
    n.show();
    return true;
  } catch (err) {
    console.error('[cowork-notify] failed:', err && err.message);
    return false;
  }
});

// ─── App lifecycle ───────────────────────────────────────────────────────────
app.on('second-instance', () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  // On Windows, set an AppUserModelID so notifications get the right identity.
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.halkive.aether-splicer');
  }
  createWindow();
  createTray();
});

app.on('window-all-closed', (ev) => {
  // Don't quit when the window is closed — we minimize-to-tray.
  // Only the tray "Quit" item flips isQuitting.
  if (!isQuitting) ev.preventDefault();
});

app.on('before-quit', () => { isQuitting = true; });

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
