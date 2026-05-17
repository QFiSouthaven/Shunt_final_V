#!/usr/bin/env node
// cloud-puller.mjs
// Aether Shunt — cross-machine receive daemon.
//
// Opens a WebSocket to the deployed Cloudflare Worker for each local-owned
// JID listed in CLOUD_PULLER_JIDS (or, by default, every JID under hub-bus/
// inbox/). Any envelope the Worker routes to that JID is written into the
// local file-bus inbox so the local bridges pick it up normally.
//
// This closes the cross-machine loop:
//
//   Machine A bridge → writeEnvelopeToBus → dualWriteToWorker → Worker
//     ↓
//     Worker DO routes to @<jid> WS client
//     ↓
//   Machine B cloud-puller (this script) → writeEnvelopeToBus(skipDualWrite)
//     ↓
//   Machine B bridge for that JID picks it up from local inbox
//
// Loop prevention: writeEnvelopeToBus is invoked with { skipDualWrite: true }
// so envelopes that came FROM the Worker don't get POSTed back TO the Worker.
//
// Env vars:
//   WORKER_URL                 e.g. https://hub-relay.halkive.workers.dev
//                              (the Worker accepts wss:// upgrades on /ws)
//   WORKER_SECRET              HUB_API_SECRET — passed as ?token=... query
//                              param (Node's built-in WebSocket doesn't allow
//                              custom request headers).
//   CLOUD_PULLER_JIDS          Comma-separated list of JIDs to subscribe to.
//                              If unset, defaults to every inbox dir name
//                              found under hub-bus/inbox/.
//   CLOUD_PULLER_ROOM          Room to join (default "#main").
//   CLOUD_PULLER_VERBOSE       "1" to log every envelope received.
//   BUS_DIR                    Override hub-bus/ location (default = repo's
//                              hub-bus directory).
//
// Required: WORKER_URL + WORKER_SECRET. If either is missing the daemon
// logs a clear startup error and exits cleanly so the orchestrator can mark
// it permanently_failed (instead of restart-looping forever).
//
// Reconnect strategy: exponential backoff per JID — 1s, 2s, 4s, 8s, capped at
// 30s. Reset to 1s after 60 seconds of clean uptime. One independent loop
// per JID — failure of one doesn't tear down the others.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateEnvelope,
  writeEnvelopeToBus,
} from './envelope.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_BUS_DIR = path.resolve(__dirname, '..', 'hub-bus');

const BUS_DIR = process.env.BUS_DIR || DEFAULT_BUS_DIR;
const WORKER_URL = process.env.WORKER_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;
const ROOM = process.env.CLOUD_PULLER_ROOM || '#main';
const VERBOSE = process.env.CLOUD_PULLER_VERBOSE === '1';

const MAX_BACKOFF_MS = 30_000;
const UPTIME_RESET_MS = 60_000;

function log(jid, msg) {
  const stamp = new Date().toISOString();
  console.log(`[cloud-puller ${stamp}] ${jid} ${msg}`);
}
function warn(jid, msg) {
  const stamp = new Date().toISOString();
  console.warn(`[cloud-puller ${stamp}] ${jid} WARN ${msg}`);
}

function discoverJids() {
  const explicit = (process.env.CLOUD_PULLER_JIDS || '').trim();
  if (explicit) {
    return explicit
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('@'));
  }
  const inboxRoot = path.join(BUS_DIR, 'inbox');
  if (!fs.existsSync(inboxRoot)) return [];
  return fs
    .readdirSync(inboxRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('@'))
    .map((e) => e.name);
}

function buildWsUrl(jid) {
  // wss://host[/path]/ws?room=...&jid=...&token=...
  const url = new URL(WORKER_URL);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  // Ensure the /ws path even if WORKER_URL was given with or without a trailing slash
  if (!url.pathname.endsWith('/ws')) {
    url.pathname = url.pathname.replace(/\/$/, '') + '/ws';
  }
  url.searchParams.set('room', ROOM);
  url.searchParams.set('jid', jid);
  url.searchParams.set('token', WORKER_SECRET);
  return url.toString();
}

async function handleIncoming(jid, raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    warn(jid, `received non-JSON frame, dropping: ${e?.message ?? e}`);
    return;
  }

  // Validate. If invalid, drop with a warning — don't propagate junk into the file-bus.
  try {
    validateEnvelope(parsed);
  } catch (e) {
    warn(jid, `invalid envelope id=${parsed?.id ?? '<?>'}, dropping: ${e?.message ?? e}`);
    return;
  }

  // Don't re-ingest envelopes WE sent — the Worker echoes broadcasts back,
  // and the cloud-puller's own JID might appear as `from`. (Worker also
  // suppresses sender-echo for `to: '*'`, but defense-in-depth is cheap.)
  if (parsed.from === jid) {
    if (VERBOSE) log(jid, `skipping self-echo id=${parsed.id}`);
    return;
  }

  try {
    await writeEnvelopeToBus(parsed, BUS_DIR, { skipDualWrite: true });
    if (VERBOSE) log(jid, `wrote ${parsed.id} from=${parsed.from} kind=${parsed.kind}`);
  } catch (e) {
    warn(jid, `local write failed for id=${parsed.id}: ${e?.message ?? e}`);
  }
}

function connectOne(jid) {
  let backoffMs = 1000;
  let connectedAt = 0;
  let stopped = false;
  // Track outstanding timers so close/stop can cancel them. Without this, the
  // backoff-reset setTimeout would keep firing against a closed/replaced ws
  // long after disconnect — wasted memory and stale closures.
  let reconnectTimer = null;
  let resetBackoffTimer = null;

  function scheduleReconnect() {
    if (stopped) return;
    const wait = Math.min(backoffMs, MAX_BACKOFF_MS);
    warn(jid, `reconnect in ${wait}ms`);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => { reconnectTimer = null; open(); }, wait);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }

  function open() {
    if (stopped) return;
    const url = buildWsUrl(jid);
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      warn(jid, `WebSocket construction failed: ${e?.message ?? e}`);
      scheduleReconnect();
      return;
    }

    ws.addEventListener('open', () => {
      connectedAt = Date.now();
      log(jid, `connected to ${WORKER_URL}/ws (room=${ROOM})`);
      // Reset backoff after a stable connection — but only after UPTIME_RESET_MS
      // of uptime, so a flap-loop doesn't masquerade as a healthy reconnect.
      // Cancel any prior reset timer first (e.g. a reconnect that opened, closed,
      // and is opening again within UPTIME_RESET_MS).
      if (resetBackoffTimer) clearTimeout(resetBackoffTimer);
      resetBackoffTimer = setTimeout(() => {
        resetBackoffTimer = null;
        if (ws.readyState === WebSocket.OPEN && Date.now() - connectedAt >= UPTIME_RESET_MS) {
          backoffMs = 1000;
        }
      }, UPTIME_RESET_MS);
    });

    ws.addEventListener('message', (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
      // Fire-and-forget — writing one envelope shouldn't block the WS reader.
      handleIncoming(jid, data).catch((e) => warn(jid, `handler threw: ${e?.message ?? e}`));
    });

    ws.addEventListener('error', (ev) => {
      const msg = ev?.message || ev?.error?.message || 'unspecified WS error';
      warn(jid, `error: ${msg}`);
      // Don't reconnect here — the close event will fire next.
    });

    ws.addEventListener('close', (ev) => {
      log(jid, `closed code=${ev.code} reason=${ev.reason || '<none>'}`);
      // Cancel a pending backoff-reset; this WS is gone, the timer's check
      // would be against a stale reference.
      if (resetBackoffTimer) { clearTimeout(resetBackoffTimer); resetBackoffTimer = null; }
      scheduleReconnect();
    });
  }

  open();
  return () => {
    stopped = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (resetBackoffTimer) { clearTimeout(resetBackoffTimer); resetBackoffTimer = null; }
  };
}

function main() {
  if (!WORKER_URL || !WORKER_SECRET) {
    console.error(
      '[cloud-puller] ABORT: WORKER_URL and WORKER_SECRET must both be set. ' +
        'Without them, cross-machine receive is impossible — exiting cleanly.',
    );
    process.exit(2);
  }
  const jids = discoverJids();
  if (jids.length === 0) {
    console.error(
      '[cloud-puller] ABORT: no JIDs to subscribe to. Set CLOUD_PULLER_JIDS=@foo,@bar ' +
        'or populate hub-bus/inbox/ with directories named for the local JIDs.',
    );
    process.exit(2);
  }
  console.log(`[cloud-puller] subscribing as ${jids.join(', ')} via ${WORKER_URL} room=${ROOM}`);

  const stoppers = jids.map((j) => connectOne(j));

  const shutdown = () => {
    console.log('[cloud-puller] shutdown requested');
    for (const s of stoppers) s();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
