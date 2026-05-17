// heartbeat.mjs - Aether Shunt local file-bus presence heartbeat
// ESM, zero deps. Node 18+.
//
// P1 #3 — per-JID presence files (2026-05-17).
// Each bridge now writes EXCLUSIVELY to `hub-bus/presence/<sanitized-jid>.json`
// (one file per JID). The shared `presence.json` was a merge-race hazard:
// two bridges heartbeating concurrently would read-modify-write the same file
// and the last writer would clobber the other's `lastSeenAt`. Per-JID files
// eliminate the race — each writer owns its own file. Aggregation moves to
// the consumer side (panel-server reads the directory and merges).
//
// Reads/writes still use tmpfile + rename so a crash mid-write can't leave
// the per-JID file half-baked.

import {
  mkdir,
  readFile,
  writeFile,
  rename,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

/**
 * Translate a JID ('@lmstudio-1') into a filesystem-safe filename
 * ('lmstudio-1.json'). Strips leading '@' and replaces anything outside
 * [A-Za-z0-9_-] with '_'.
 */
export function presenceFileNameFor(jid) {
  const stripped = String(jid || '').replace(/^@/, '');
  const safe = stripped.replace(/[^A-Za-z0-9_-]/g, '_');
  return `${safe}.json`;
}

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
  // P1 #3 — write to per-JID file. Each bridge owns its own file, so two
  // bridges heartbeating concurrently can't clobber each other.
  const presenceDir = path.join(busDir, 'presence');
  const filePath = path.join(presenceDir, presenceFileNameFor(myJID));
  const now = new Date().toISOString();
  // Preserve sticky fields (e.g. caps, offlineReason from a prior shutdown)
  // by reading the per-JID file if it exists. Failure is fine — we'll create
  // it. (We do NOT read the legacy shared presence.json here; the migration
  // pass on first run handles the old format.)
  let existing = {};
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') existing = parsed;
  } catch { /* no prior file; OK */ }
  const entry = {
    ...existing,
    jid: myJID,
    online: true,
    lastSeenAt: now,
    // A live heartbeat means the bridge is not offline anymore — clear stale
    // offlineReason/offlineSince that orchestrator may have set on a prior
    // permanent-fail.
    offlineReason: undefined,
    offlineSince: undefined,
  };
  // JSON.stringify drops keys with value `undefined`, so the cleared fields
  // disappear from disk on the next write.
  try {
    await atomicWriteJson(filePath, entry);
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
