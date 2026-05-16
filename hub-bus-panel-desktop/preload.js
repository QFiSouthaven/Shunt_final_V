// preload.js — runs in an isolated world before the renderer scripts.
// Bridges safeStorage-backed credential APIs to the renderer via contextBridge.
//
// Exposes `window.coworkSecret` with three async methods:
//   * get()   → Promise<string|null>
//   * set(v)  → Promise<void>
//   * clear() → Promise<void>
//
// Also exposes `window.coworkNotify(title, body)` as an IPC fallback for
// notifications. The renderer can equally use the Web Notification API
// directly; both reach the OS notification center on Windows.
//
// splicer.html (the local copy in this directory) detects window.coworkSecret
// and prefers it over localStorage for HUB_API_SECRET storage. When loaded in
// a plain browser without a preload, it falls back to localStorage.

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('coworkSecret', {
  get: () => ipcRenderer.invoke('cowork-secret:get'),
  set: (value) => ipcRenderer.invoke('cowork-secret:set', value),
  clear: () => ipcRenderer.invoke('cowork-secret:clear')
});

contextBridge.exposeInMainWorld('coworkNotify', (title, body) => {
  return ipcRenderer.invoke('cowork-notify', { title, body });
});

// Marker so splicer.html / notify.js can branch cleanly.
contextBridge.exposeInMainWorld('coworkDesktop', {
  platform: process.platform,
  version: '0.1.0'
});
