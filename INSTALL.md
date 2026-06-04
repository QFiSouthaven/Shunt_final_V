# How to install Aether Shunt (the store-bought way)

You no longer need to run `npm install`, open a terminal, or edit a config file.
This is the one-time path to get a real `.exe` installer on your computer.

---

## Step 1 — Get the .exe built (one-time, ~5 minutes, no terminal)

The installer is built on Microsoft's servers (free) every time you push code to your
GitHub repo. The first time, you need to get the new wrapper files up to GitHub.

**If you have GitHub Desktop installed** (the free GUI app — no terminal):

1. Open GitHub Desktop. Your `Shunt_final_V` repo should already be there.
2. You'll see a list of changed files on the left (the new `aether-app/` folder and
   `.github/workflows/build-installer.yml`).
3. In the bottom-left, type a summary like `Add installer wrapper`.
4. Click **Commit to main**.
5. Click **Push origin** at the top.

That's it. GitHub now starts building your installer.

**If you don't have GitHub Desktop**: install it from <https://desktop.github.com/>.
Free, GUI-only, zero terminal commands.

## Step 2 — Wait for the build to finish (3–5 minutes)

1. Open your browser to <https://github.com/QFiSouthaven/Shunt_final_V/actions>.
2. You'll see a workflow called **Build Windows installer** running. A spinning icon
   means it's still going.
3. When the icon turns into a green check, the build finished. Click the run.
4. Scroll down to **Artifacts** at the bottom of the page.
5. Click **Aether-Shunt-Setup** — your browser downloads a ZIP.
6. Open the ZIP. Inside is `Aether-Shunt-Setup-0.1.0.exe`.

## Step 3 — Install it like any other Windows program

1. Double-click `Aether-Shunt-Setup-0.1.0.exe`.
2. Windows shows a SmartScreen warning ("Windows protected your PC"). This is because
   the installer isn't signed with a commercial code-signing certificate yet. Click
   **More info** → **Run anyway**.
3. Pick where to install (or accept the default), click Install. Takes ~10 seconds.
4. Tick **Run Aether Shunt** and click Finish.

## Step 4 — One-time setup wizard

The app opens to a wizard. Three quick screens:

1. **Which AIs should collaborate?** Tick the boxes for any AI you have access to.
   You need at least one.
   - **LM Studio** is detected automatically. If you don't have it, click the
     "download here" link — installs in ~2 minutes, fully private, free.
   - **Anthropic** / **OpenAI** — get an API key from the linked page (~30 seconds).
2. **Paste any API keys you need.** Stored encrypted on your computer.
3. **You're set.** Click "Open Aether Shunt".

After this wizard, the app launches every time straight to the main interface. No
Settings tab visits, no config files.

## How to launch it next time

- Start Menu → **Aether Shunt**, or double-click the desktop shortcut.
- Closing the window hides it to the system tray. Right-click the tray icon → **Quit**
  to fully exit.

## When you want a new version

Anyone who works on this repo (you or me) just pushes new code. GitHub builds a fresh
installer automatically. You download the new `.exe` from the Actions page and run it —
it updates the existing install in place.

## Troubleshooting

- **"The build failed"** on the Actions page → click into the run, find the red step,
  send the error back and I'll fix it.
- **App opens to a blank window** → right-click tray icon → "Open bus log". Send me the
  last 50 lines.
- **Pattern Z fan-out only uses one AI** → the wizard saved which AIs you ticked, but the
  bridges only spawn for AIs that have credentials. Re-launch the wizard via
  `%APPDATA%/Aether Shunt` → delete `first-run.complete` → relaunch.
