# aether-app

Electron wrapper that turns the Aether Shunt SPA + multi-AI bus into a single
double-click Windows installer.

## What this directory contains

| File | Purpose |
|---|---|
| `main.js` | Electron main process. Single-instance lock, hidden bus child spawn, tray icon, first-run gating. |
| `preload.js` | contextBridge IPC + auto-seeds the SPA's `localStorage` from `settings-seed.json` on every load. |
| `first-run.html` | One-time setup wizard: detect LM Studio, prompt for API keys, build the settings seed. |
| `gen-icon.cjs` | Placeholder tray-icon.png generator. Replace with real art before public release. |
| `package.json` | Electron + electron-builder NSIS config. |

## How the installer ships to the operator (no terminal on their side)

1. GitHub Actions (`.github/workflows/build-installer.yml`) builds the SPA, then runs
   electron-builder on a Windows runner. Output: `Aether-Shunt-Setup-<ver>.exe` attached
   to a GitHub Release.
2. Operator opens the repo's Releases page in a browser, downloads the `.exe`, double-clicks.
3. NSIS installer asks where to install (per-user, no admin needed), creates Start Menu and
   Desktop shortcuts, finishes.
4. Operator clicks the Start Menu shortcut. First-run wizard opens. Operator ticks which AIs
   to use, pastes any API keys, clicks Finish. App loads.
5. Subsequent launches skip the wizard and open straight to the SPA. No Settings page friction.

## Local dev (not the operator path)

```
npm install        # in repo root (SPA deps)
npm run build      # vite build → dist/
cd aether-app
npm install
npm start          # Electron loads dist/ via file:// + spawns the bus hidden
```

## Known limits

- Installer is unsigned. First launch shows a Windows SmartScreen warning ("More info →
  Run anyway"). To eliminate, attach an EV/OV code-signing certificate (~$200/year).
- LM Studio is detected, not bundled. If absent, the wizard links the user to the LM Studio
  download. Bundling LM Studio's installer is out of scope (it's an ~800MB vendor binary).
- Bus runs only while the app is running. To auto-start the bus at Windows login, the user
  can pin Aether Shunt to startup via Windows Settings → Apps → Startup. A future tray
  menu item could automate this with `app.setLoginItemSettings({ openAtLogin: true })`.
