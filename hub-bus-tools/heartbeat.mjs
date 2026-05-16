// heartbeat.mjs - Aether Shunt local file-bus presence heartbeat
// ESM, zero deps. Node 18+.
//
// Lets each running bridge periodically stamp `presence.json` with its own
// lastSeenAt, so an external observer (panel, watchdog, sibling bridge) can
// tell live daemons from dead ones. Reads/writes use tmpfile + rename so a
// bridge crash mid-write can never leave presence.json half-baked.

import {
  mkdir,
  readFile,
  writeFile,
  rename,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function readPresence(presencePath) {
  try {
    const txt = await readFile(presencePath, 'utf8');
    const parsed = JSON.parse(txt);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.agents || typeof parsed.agents !== 'object') {
      parsed.agents = {};
    }
    return parsed;
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return null;
    }
    return null; // malformed: leave it alone
  }
}

async function atomicWriteJson(targetPath, obj) {
  const dir = path.dirname(targetPath);
  await ensureDir(dir);
  const base = path.basename(targetPath);
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  const data = JSON.stringify(obj, null, 2);
  await writeFile(tmpPath, data, 'utf8');
  await rename(tmpPath, targetPath);
}

async function tickHeartbeat(myJID, busDir) {
  const presencePath = path.join(busDir, 'presence.json');
  const presence = await readPresence(presencePath);
  if (!presence) {
    // Presence file missing or malformed; skip without rewriting it.
    // (Don't synthesize a presence file from scratch — that's the bus
    // operator's responsibility.)
    return false;
  }
  const now = new Date().toISOString();
  const existing = presence.agents[myJID] || {};
  presence.agents[myJID] = {
    ...existing,
    online: true,
    lastSeenAt: now,
  };
  try {
    await atomicWriteJson(presencePath, presence);
    return true;
  } catch {
    return false;
  }
}

/**
 * Begin periodic heartbeat updates. Returns a handle with a stop() method.
 *
 * @param {string} myJID  e.g. "@lmstudio"
 * @param {string} busDir absolute path to hub-bus
 * @param {number} [intervalMs=30000]
 * @returns {{ stop: () => void }}
 */
export function startHeartbeat(myJID, busDir, intervalMs = 30000) {
  let stopped = false;
  // Fire one immediately so observers don't wait `intervalMs` for the first
  // proof-of-life on boot.
  tickHeartbeat(myJID, busDir).catch((e) => {
    console.warn('[heartbeat] initial tick failed:', e?.message || e);
  });
  const timer = setInterval(() => {
    if (stopped) return;
    tickHeartbeat(myJID, busDir).catch((e) => {
      console.warn('[heartbeat] tick failed:', e?.message || e);
    });
  }, intervalMs);
  // Don't keep the event loop alive on the heartbeat alone; the bridge has
  // its own pollTimer / fs.watch that already pin the loop.
  if (typeof timer.unref === 'function') timer.unref();
  return {
    stop() {
      stopped = true;
      try {
        clearInterval(timer);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Pure check: is this agent still considered online based on a presence
 * snapshot you've already loaded? An agent is online if its `online` flag
 * is true AND its lastSeenAt is within `staleAfterMs` of now.
 *
 * @param {string} myJID
 * @param {object} presence  parsed presence.json
 * @param {number} [staleAfterMs=90000]
 * @returns {boolean}
 */
export function isAgentOnline(myJID, presence, staleAfterMs = 90000) {
  if (!presence || !presence.agents) return false;
  const a = presence.agents[myJID];
  if (!a || a.online !== true) return false;
  const t = Date.parse(a.lastSeenAt || '');
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < staleAfterMs;
}
