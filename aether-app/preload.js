/* Aether Shunt — preload.
 *
 * Exposes a small, locked-down IPC surface to the renderer (the first-run
 * wizard AND the SPA) so the SPA can read pre-configured settings without the
 * user touching the Settings tab.
 *
 * Two main consumers:
 *   - first-run.html: the wizard. Reads/writes the settings seed, probes LM
 *     Studio, stores API keys via Electron safeStorage.
 *   - The SPA itself: reads the seed on boot and prefills localStorage so the
 *     user never sees a config screen.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aether', {
  probeLmStudio: () => ipcRenderer.invoke('aether:probe-lmstudio'),
  saveSecret: (key, value) => ipcRenderer.invoke('aether:save-secret', { key, value }),
  hasSecret: (key) => ipcRenderer.invoke('aether:has-secret', key),
  saveSettingsSeed: (seed) => ipcRenderer.invoke('aether:save-settings-seed', seed),
  readSettingsSeed: () => ipcRenderer.invoke('aether:read-settings-seed'),
  completeFirstRun: (seed) => ipcRenderer.invoke('aether:complete-first-run', seed),
  openExternal: (url) => ipcRenderer.invoke('aether:open-external', url),
  getVersion: () => ipcRenderer.invoke('aether:get-version'),
  getBusStatus: () => ipcRenderer.invoke('aether:get-bus-status'),
  restartBus: () => ipcRenderer.invoke('aether:restart-bus')
});

// Auto-seed the SPA's localStorage on every load so the user never sees Settings.
// Reads the seed file via IPC, merges with existing settings, persists. Runs
// before React mounts.
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const seed = await ipcRenderer.invoke('aether:read-settings-seed');
    if (!seed || typeof seed !== 'object') return;
    const KEY = 'ai-shunt-settings';
    let current = {};
    try { current = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) {}
    const merged = { ...seed, ...current };
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch (_) { /* harmless if the SPA isn't expecting this key */ }
});
