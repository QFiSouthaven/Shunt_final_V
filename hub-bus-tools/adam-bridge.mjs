#!/usr/bin/env node
// adam-bridge.mjs
// Aether Shunt — NEXUS-PRIME / Adam bus bridge daemon.
//
// Polls hub-bus/inbox/@adam/ for envelopes addressed to @adam, forwards each
// one to a NEXUS-PRIME endpoint (selected by envelope.intent), and writes the
// response back onto the bus as a reply envelope.
//
// Routing by envelope.intent:
//   research     -> POST ${ADAM_URL}/llm/research
//   reason       -> POST ${ADAM_URL}/llm/reason
//   verify       -> POST ${ADAM_URL}/llm/verify
//   act          -> POST ${ADAM_URL}/llm/act
//   inject-goal  -> POST ${ADAM_URL}/adam/goals
//   nudge        -> POST ${ADAM_URL}/adam/nudge
//   <unset|other>-> POST ${ADAM_URL}/llm/chat   (default fallback)
//
// ADAM_INTENT_OVERRIDE env var, when set, forces a single endpoint regardless
// of envelope.intent — useful for testing.
//
// Pure Node stdlib — no npm deps. Node 18+ (built-in fetch).

import fs from 'node:fs';
import path from 'node:path';
import {
  createEnvelope,
  validateEnvelope,
  writeEnvelopeToBus,
  readInboxFor,
} from './envelope.mjs';
import {
  claimEnvelope,
  releaseEnvelope,
  recoverOrphans,
} from './claim.mjs';
import { startHeartbeat } from './heartbeat.mjs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ADAM_URL = process.env.ADAM_URL || 'http://localhost:8000';
const ADAM_TIMEOUT_MS = Number(process.env.ADAM_TIMEOUT_MS) || 60000;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 2000;
const BUS_DIR =
  process.env.BUS_DIR || 'C:\\Users\\Falki\\shunt-final-v\\hub-bus';
const ADAM_INTENT_OVERRIDE = process.env.ADAM_INTENT_OVERRIDE || '';

const ME = '@adam';
const INBOX_DIR = path.join(BUS_DIR, 'inbox', ME);

// ---------------------------------------------------------------------------
// Intent → endpoint routing table
// ---------------------------------------------------------------------------

// Map of supported intents to endpoint paths (relative to ADAM_URL).
// Anything not found in this map (including `undefined`/missing intent)
// falls through to DEFAULT_INTENT_PATH.
export const INTENT_ROUTES = Object.freeze({
  research: '/llm/research',
  reason: '/llm/reason',
  verify: '/llm/verify',
  act: '/llm/act',
  'inject-goal': '/adam/goals',
  nudge: '/adam/nudge',
});
export const DEFAULT_INTENT_PATH = '/llm/chat';

/**
 * Resolve the endpoint URL for a given envelope intent.
 *
 * Pure helper — no I/O. Exported so tests can assert URL routing without
 * spinning up the daemon loop.
 *
 * @param {string|undefined} intent
 * @param {string} [baseUrl=ADAM_URL]
 * @param {string} [override=ADAM_INTENT_OVERRIDE]
 * @returns {string} fully-qualified URL
 */
export function resolveAdamUrl(intent, baseUrl = ADAM_URL, override = ADAM_INTENT_OVERRIDE) {
  const trimmed = String(baseUrl || '').replace(/\/$/, '');
  if (override) {
    // override is a path or full URL fragment — accept either with/without leading slash.
    const p = override.startsWith('/') ? override : `/${override}`;
    return `${trimmed}${p}`;
  }
  if (typeof intent === 'string' && intent in INTENT_ROUTES) {
    return `${trimmed}${INTENT_ROUTES[intent]}`;
  }
  return `${trimmed}${DEFAULT_INTENT_PATH}`;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const log = (...args) => console.log('[adam-bridge]', ...args);
const errlog = (...args) => console.error('[adam-bridge]', ...args);

// ---------------------------------------------------------------------------
// Daemon state
// ---------------------------------------------------------------------------

let stopping = false;
let inFlight = 0;
let processing = false; // single-flight tick guard
let watcher = null;
let pollTimer = null;
let heartbeatHandle = null;

const seenIds = new Set();
const retryCounts = new Map();
const MAX_RETRIES = 3;

// Transient errors release as 'retry'; everything else -> 'failed' (DLQ).
const TRANSIENT_CODES = new Set([
  'TIMEOUT',
  'HTTP_429',
  'HTTP_500',
  'HTTP_502',
  'HTTP_503',
  'HTTP_504',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function isTransient(err) {
  if (!err) return false;
  const code = err.code || err.errno || err.name || '';
  if (TRANSIENT_CODES.has(code)) return true;
  if (typeof code === 'string' && /^HTTP_5\d\d$/.test(code)) return true;
  // fetch AbortError due to timeout
  if (code === 'AbortError') return true;
  return false;
}

// ---------------------------------------------------------------------------
// NEXUS-PRIME request
// ---------------------------------------------------------------------------

/**
 * Forward an envelope to the appropriate NEXUS-PRIME endpoint and return the
 * response body. Response shape varies by endpoint — we surface it as-is so
 * the reply envelope's body carries whatever Adam sent back.
 *
 * @param {object} envelope - the full bus envelope
 * @returns {Promise<string|object>} response body (string or object)
 */
export async function callAdam(envelope) {
  const url = resolveAdamUrl(envelope?.intent);
  const payload = {
    message: envelope?.body,
    from: envelope?.from,
    trace: envelope?.trace,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADAM_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    // Surface fetch network errors with their codes intact.
    if (!e.code && e.name) e.code = e.name;
    throw e;
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(
      `NEXUS-PRIME HTTP ${res.status} ${res.statusText}: ${String(text).slice(0, 500)}`,
    );
    err.code = `HTTP_${res.status}`;
    throw err;
  }

  // Try JSON first; fall back to text. Both are acceptable as envelope.body.
  const contentType = res.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = await res.json();
      // Some endpoints return { reply: "..." }; others return shape-specific
      // objects. Surface the whole object — let the recipient parse it.
      return data;
    } catch (e) {
      const err = new Error('NEXUS-PRIME returned malformed JSON');
      err.code = 'BAD_JSON';
      throw err;
    }
  }
  const txt = await res.text().catch(() => '');
  return txt;
}

// ---------------------------------------------------------------------------
// Envelope handling
// ---------------------------------------------------------------------------

/**
 * Process a single envelope: claim it, forward to NEXUS-PRIME, write the
 * reply, and release. Exported for direct test invocation.
 *
 * Accepts either a `readInboxFor` entry shape ({ ...env, __path }) OR a
 * plain object { envelope, path } so test harnesses can stage in-memory
 * envelopes without touching the filesystem.
 *
 * @param {object} entry
 */
export async function handleEnvelope(entry) {
  const envelope = entry?.envelope || entry?.data || entry;
  const filePath =
    entry?.path || entry?.filePath || entry?.file || entry?.__path;

  if (!envelope || typeof envelope !== 'object') {
    errlog('skipping malformed entry (no envelope object):', entry);
    return;
  }
  if (!filePath) {
    errlog('skipping entry with no path attached');
    return;
  }

  const { claimed, newPath } = await claimEnvelope(filePath, ME);
  if (!claimed) {
    return;
  }

  try {
    if (typeof validateEnvelope === 'function') {
      validateEnvelope(envelope);
    }
  } catch (e) {
    errlog('envelope failed validation:', e?.message || e);
    await sendErrorReply(envelope, 'INVALID_ENVELOPE', String(e?.message || e));
    try {
      await releaseEnvelope(newPath, 'failed');
    } catch (e2) {
      errlog('releaseEnvelope(failed) failed:', e2?.message || e2);
    }
    return;
  }

  // ⚠ Kind filter at intake. These bridges are request-handlers only; if we
  // processed kind=response/error/event/etc., other bridges' replies would
  // be re-routed to Adam as new work-items, fail, emit an error reply, and
  // ping-pong forever. Drop non-request kinds and release the file as 'done'
  // so it moves out of inbox/. Uniform across all four bridges (audit
  // 2026-05-13: claude/gemini/lmstudio/adam all lacked this guard).
  if (envelope.kind !== 'request') {
    try {
      await releaseEnvelope(newPath, 'done');
    } catch {}
    return;
  }

  const id = envelope.id || '<no-id>';
  if (seenIds.has(id)) {
    try {
      await releaseEnvelope(newPath, 'done');
    } catch {}
    return;
  }
  seenIds.add(id);

  log(
    `arrival id=${id} from=${envelope.from} kind=${envelope.kind} intent=${envelope.intent || '<default>'} room=${envelope.room || '#main'}`,
  );

  inFlight++;
  const started = Date.now();
  let releaseStatus = 'done';
  try {
    const url = resolveAdamUrl(envelope.intent);
    log(`request id=${id} -> ${url}`);
    const responseBody = await callAdam(envelope);
    const latency = Date.now() - started;
    const sizeHint =
      typeof responseBody === 'string'
        ? `chars=${responseBody.length}`
        : `keys=${Object.keys(responseBody || {}).length}`;
    log(`response id=${id} latency=${latency}ms ${sizeHint}`);

    const reply = await createEnvelope({
      from: ME,
      to: envelope.from,
      kind: 'response',
      replyTo: envelope.id,
      trace: envelope.trace,
      room: envelope.room,
      body: responseBody,
      busDir: BUS_DIR,
    });

    await writeEnvelopeToBus(reply, BUS_DIR);
    log(`reply sent id=${reply.id} replyTo=${envelope.id} to=${envelope.from}`);
    retryCounts.delete(id);
  } catch (e) {
    const latency = Date.now() - started;
    errlog(
      `error id=${id} latency=${latency}ms code=${e?.code || 'ERR'} msg=${e?.message || e}`,
    );
    if (isTransient(e)) {
      const next = (retryCounts.get(id) || 0) + 1;
      if (next <= MAX_RETRIES) {
        retryCounts.set(id, next);
        log(`transient error id=${id}; retry ${next}/${MAX_RETRIES}`);
        releaseStatus = 'retry';
        seenIds.delete(id);
      } else {
        errlog(`exhausted retries id=${id}; dlq`);
        retryCounts.delete(id);
        releaseStatus = 'failed';
        await sendErrorReply(envelope, e?.code || 'BRIDGE_ERROR', String(e?.message || e));
      }
    } else {
      retryCounts.delete(id);
      releaseStatus = 'failed';
      await sendErrorReply(envelope, e?.code || 'BRIDGE_ERROR', String(e?.message || e));
    }
  } finally {
    inFlight--;
    try {
      await releaseEnvelope(newPath, releaseStatus);
    } catch (e) {
      errlog(`releaseEnvelope(${releaseStatus}) failed for ${newPath}:`, e?.message || e);
    }
  }
}

async function sendErrorReply(originalEnvelope, code, message) {
  try {
    const errEnv = await createEnvelope({
      from: ME,
      to: originalEnvelope?.from || '@zack',
      kind: 'error',
      replyTo: originalEnvelope?.id || null,
      trace: originalEnvelope?.trace,
      room: originalEnvelope?.room,
      body: { code, message },
      busDir: BUS_DIR,
    });
    await writeEnvelopeToBus(errEnv, BUS_DIR);
    log(`error envelope sent id=${errEnv.id} code=${code}`);
  } catch (e) {
    errlog('failed to send error envelope:', e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Polling loop
// ---------------------------------------------------------------------------

async function tick() {
  if (stopping || processing) return;
  processing = true;
  try {
    const list = await readInboxFor(ME, BUS_DIR);
    if (!Array.isArray(list) || list.length === 0) return;
    for (const entry of list) {
      if (stopping) break;
      await handleEnvelope(entry);
    }
  } catch (e) {
    errlog('tick failed:', e?.message || e);
  } finally {
    processing = false;
  }
}

function startWatching() {
  try {
    fs.mkdirSync(INBOX_DIR, { recursive: true });
  } catch (e) {
    errlog(`failed to ensure inbox dir ${INBOX_DIR}:`, e?.message || e);
  }

  pollTimer = setInterval(() => {
    tick().catch((e) => errlog('tick error:', e?.message || e));
  }, POLL_INTERVAL_MS);

  try {
    watcher = fs.watch(INBOX_DIR, { persistent: true }, (eventType, name) => {
      if (stopping) return;
      if (!name) return;
      if (!name.endsWith('.json')) return;
      tick().catch((e) => errlog('watch->tick error:', e?.message || e));
    });
    watcher.on('error', (e) => {
      errlog('fs.watch error (continuing on interval poll):', e?.message || e);
    });
    log(`watching ${INBOX_DIR} (fs.watch active, poll=${POLL_INTERVAL_MS}ms)`);
  } catch (e) {
    errlog(
      `fs.watch unavailable, falling back to interval-only (${POLL_INTERVAL_MS}ms):`,
      e?.message || e,
    );
  }
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log(`received ${signal}, shutting down…`);
  try {
    if (pollTimer) clearInterval(pollTimer);
  } catch {}
  try {
    if (watcher) watcher.close();
  } catch {}
  try {
    if (heartbeatHandle) heartbeatHandle.stop();
  } catch {}

  const deadline = Date.now() + 30_000;
  const waitForInflight = () => {
    if (inFlight <= 0 || Date.now() >= deadline) {
      log('shutdown complete.');
      process.exit(0);
      return;
    }
    setTimeout(waitForInflight, 100);
  };
  waitForInflight();
}

// ---------------------------------------------------------------------------
// Boot — only when invoked as a script, not when imported by tests
// ---------------------------------------------------------------------------

import { fileURLToPath } from 'node:url';
const isMainModule = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMainModule) {
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (e) => {
    errlog('uncaughtException:', e?.stack || e?.message || e);
  });
  process.on('unhandledRejection', (e) => {
    errlog('unhandledRejection:', e?.stack || e?.message || e);
  });

  log(`starting as ${ME} (claim/release/heartbeat enabled)`);
  log(`bus dir: ${BUS_DIR}`);
  log(`adam url: ${ADAM_URL}`);
  log(`timeout: ${ADAM_TIMEOUT_MS}ms`);
  log(`poll interval: ${POLL_INTERVAL_MS}ms`);
  if (ADAM_INTENT_OVERRIDE) {
    log(`intent override: ${ADAM_INTENT_OVERRIDE}`);
  }

  try {
    const recovered = await recoverOrphans(ME, BUS_DIR);
    log(`orphan recovery: ${recovered} envelope(s) returned to inbox`);
  } catch (e) {
    errlog('orphan recovery failed:', e?.message || e);
  }

  try {
    heartbeatHandle = startHeartbeat(ME, BUS_DIR, 30000);
    log('heartbeat started (30s interval)');
  } catch (e) {
    errlog('heartbeat start failed (continuing without):', e?.message || e);
  }

  startWatching();
  tick().catch((e) => errlog('initial tick error:', e?.message || e));
}
