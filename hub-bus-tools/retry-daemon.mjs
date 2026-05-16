#!/usr/bin/env node
// retry-daemon.mjs
// Aether Shunt — pending-ack retry daemon (optional).
//
// Reads `<busDir>/.pending-acks.json`, which sendWithAck writes to when it
// kicks off a delivery. For each entry where the per-attempt timeout
// (ackTimeoutMs * 2^(attempts-1)) has elapsed without an ack landing, the
// daemon either resends (with a deterministic id) or moves the envelope to
// `inbox/@dlq/` once retries are exhausted.
//
// Pure Node stdlib — no npm deps. Node 18+.

import fs from 'node:fs';
import {
  mkdir,
  rename,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { writeEnvelopeToBus } from './envelope.mjs';
import { ACK_KIND } from './ack-retry.mjs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 5000;
const BUS_DIR =
  process.env.BUS_DIR || 'C:\\Users\\Falki\\shunt-final-v\\hub-bus';
const PENDING_ACKS_FILE = '.pending-acks.json';
const DLQ_ADDR = '@dlq';

const log = (...a) => console.log('[retry-daemon]', ...a);
const errlog = (...a) => console.error('[retry-daemon]', ...a);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let stopping = false;
let timer = null;
let processing = false;

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function readPending(busDir) {
  const p = path.join(busDir, PENDING_ACKS_FILE);
  try {
    const txt = await readFile(p, 'utf8');
    const obj = JSON.parse(txt);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    return {};
  }
}

async function writePending(busDir, obj) {
  const p = path.join(busDir, PENDING_ACKS_FILE);
  await ensureDir(busDir);
  const tmp = path.join(
    busDir,
    `.${PENDING_ACKS_FILE}.${process.pid}.${Date.now()}.tmp`,
  );
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmp, p);
}

function deterministicRetryId(baseId, attempt) {
  const h = createHash('sha1')
    .update(`${baseId}::attempt=${attempt}`)
    .digest('hex');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    h.slice(12, 16),
    h.slice(16, 20),
    h.slice(20, 32),
  ].join('-');
}

async function moveToDLQ(env, busDir) {
  const dlqDir = path.join(busDir, 'inbox', DLQ_ADDR);
  await ensureDir(dlqDir);
  const dest = path.join(dlqDir, `${env.id}.json`);
  const tmp = path.join(
    dlqDir,
    `.${env.id}.${process.pid}.${Date.now()}.tmp`,
  );
  await writeFile(tmp, JSON.stringify(env, null, 2), 'utf8');
  await rename(tmp, dest);
  return dest;
}

async function findAckFor(origId, myJID, busDir) {
  if (!myJID) return null;
  const base = path.join(busDir, 'inbox', myJID);
  const dirs = [base, path.join(base, '.read'), path.join(base, '.processing')];
  for (const dir of dirs) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith('.json')) continue;
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      try {
        const txt = await readFile(full, 'utf8');
        const env = JSON.parse(txt);
        if (
          env &&
          env.kind === ACK_KIND &&
          env.body &&
          env.body.ackOf === origId
        ) {
          return env;
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

async function tick() {
  if (stopping || processing) return;
  processing = true;
  try {
    const ledger = await readPending(BUS_DIR);
    const ids = Object.keys(ledger);
    if (ids.length === 0) return;

    let mutated = false;
    const now = Date.now();

    for (const id of ids) {
      if (stopping) break;
      const entry = ledger[id];
      if (!entry || !entry.env) {
        delete ledger[id];
        mutated = true;
        continue;
      }

      // 1. If an ack already landed, clear the entry.
      const ack = await findAckFor(entry.env.id, entry.sender, BUS_DIR);
      if (ack) {
        log(
          `ack found for ${entry.env.id} status=${ack.body?.status} - clearing`,
        );
        delete ledger[id];
        mutated = true;
        continue;
      }

      // 2. Check the per-attempt timeout.
      const attempts = entry.attempts || 1;
      const ackTimeoutMs = entry.ackTimeoutMs || 10000;
      const sentAt = entry.sentAt || now;
      const elapsed = now - sentAt;
      // exponent: attempts - 1 (so first wait equals base)
      const dueAfter = ackTimeoutMs * Math.pow(2, attempts - 1);

      if (elapsed < dueAfter) continue;

      // 3. Decide: resend or DLQ?
      const maxRetries = entry.maxRetries ?? 3;
      const backoffBase = entry.backoffBase ?? 2000;

      if (attempts > maxRetries) {
        log(`exhausted ${entry.env.id} attempts=${attempts} -> DLQ`);
        try {
          await moveToDLQ(entry.env, BUS_DIR);
        } catch (e) {
          errlog('DLQ move failed:', e?.message || e);
        }
        delete ledger[id];
        mutated = true;
        continue;
      }

      // Resend: derive a fresh id from the baseId and the new attempt count.
      const baseId = entry.baseId || entry.env.id;
      const newAttempt = attempts; // was 1-indexed, next attempt index = old attempts
      const newEnv = {
        ...entry.env,
        id: deterministicRetryId(baseId, newAttempt),
        attempt: newAttempt,
        ts: new Date().toISOString(),
      };

      try {
        await writeEnvelopeToBus(newEnv, BUS_DIR);
        log(
          `resend ${entry.env.id} -> ${newEnv.id} attempt=${newAttempt + 1}`,
        );
      } catch (e) {
        errlog('resend failed:', e?.message || e);
      }

      delete ledger[id];
      ledger[newEnv.id] = {
        ...entry,
        env: newEnv,
        sentAt: now,
        attempts: attempts + 1,
        ackTimeoutMs,
        maxRetries,
        backoffBase,
        baseId,
      };
      mutated = true;
    }

    if (mutated) {
      await writePending(BUS_DIR, ledger);
    }
  } catch (e) {
    errlog('tick failed:', e?.message || e);
  } finally {
    processing = false;
  }
}

// ---------------------------------------------------------------------------
// Boot / shutdown
// ---------------------------------------------------------------------------

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log(`received ${signal}, shutting down…`);
  try {
    if (timer) clearInterval(timer);
  } catch {}
  // Let the in-flight tick finish briefly then exit.
  const deadline = Date.now() + 5_000;
  const wait = () => {
    if (!processing || Date.now() >= deadline) {
      log('shutdown complete.');
      process.exit(0);
      return;
    }
    setTimeout(wait, 100);
  };
  wait();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => {
  errlog('uncaughtException:', e?.stack || e?.message || e);
});
process.on('unhandledRejection', (e) => {
  errlog('unhandledRejection:', e?.stack || e?.message || e);
});

log(`bus dir: ${BUS_DIR}`);
log(`poll interval: ${POLL_INTERVAL_MS}ms`);

// ensure DLQ dir exists eagerly so the first move is fast
try {
  fs.mkdirSync(path.join(BUS_DIR, 'inbox', DLQ_ADDR), { recursive: true });
} catch {}

timer = setInterval(() => {
  tick().catch((e) => errlog('tick error:', e?.message || e));
}, POLL_INTERVAL_MS);

// initial tick
tick().catch((e) => errlog('initial tick error:', e?.message || e));
