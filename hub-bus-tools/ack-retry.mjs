// ack-retry.mjs - Aether Shunt local file-bus ack/retry/DLQ helpers
// ESM, zero deps. Node 18+.
//
// Hardens the WRITE side of the bus:
//   - writeAck:    receivers signal back received | processed | rejected.
//   - sendWithAck: senders write a message and wait for ack/processed/rejected,
//                  with retries on timeout and exponential backoff, and a DLQ
//                  drop when retries are exhausted.

import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  mkdir,
  rename,
  readdir,
  readFile,
  writeFile,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

import { writeEnvelopeToBus, nextSeq } from './envelope.mjs';

// ---------------------------------------------------------------------------
// Constants / exports
// ---------------------------------------------------------------------------

export const ACK_KIND = 'ack';
export const ACK_STATUS = Object.freeze({
  RECEIVED: 'received',
  PROCESSED: 'processed',
  REJECTED: 'rejected',
});

const DLQ_ADDR = '@dlq';
const PENDING_ACKS_FILE = '.pending-acks.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deterministic ID derived from a base id + attempt number, so retries are
 * reproducible and de-duplicable. Uses uuid-ish formatting from a sha1.
 */
function deterministicRetryId(baseId, attempt) {
  const h = createHash('sha1')
    .update(`${baseId}::attempt=${attempt}`)
    .digest('hex');
  // shape as 8-4-4-4-12
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    h.slice(12, 16),
    h.slice(16, 20),
    h.slice(20, 32),
  ].join('-');
}

// ---------------------------------------------------------------------------
// writeAck
// ---------------------------------------------------------------------------

/**
 * Write an ack envelope replying to originalEnvelope.
 * @param {object} originalEnvelope - the envelope being acked.
 * @param {string} busDir - absolute path to the bus root.
 * @param {('received'|'processed'|'rejected')} [status='received']
 * @param {string|null} [myJID=null] - sender JID for the ack ('from'); falls back to '@unknown'.
 * @returns {Promise<object>} the written ack envelope.
 */
export async function writeAck(
  originalEnvelope,
  busDir,
  status = 'received',
  myJID = null,
) {
  if (!originalEnvelope || typeof originalEnvelope !== 'object') {
    throw new Error('writeAck: originalEnvelope must be an object');
  }
  if (!busDir) throw new Error('writeAck: busDir is required');
  if (!['received', 'processed', 'rejected'].includes(status)) {
    throw new Error(`writeAck: invalid status "${status}"`);
  }

  const ts = new Date().toISOString();
  const fromJID = myJID || '@unknown';
  // v0.2.2: ack envelopes carry `seq` (per-JID counter) and `expiresAt`
  // instead of the deprecated relative `ttl`.
  const seq = await nextSeq(fromJID, busDir);
  const ackEnv = {
    id: randomUUID(),
    kind: ACK_KIND,
    from: fromJID,
    to: originalEnvelope.from,
    room: originalEnvelope.room || '#main',
    body: { ackOf: originalEnvelope.id, status },
    replyTo: originalEnvelope.id,
    trace: originalEnvelope.trace || originalEnvelope.id,
    ts,
    seq,
    expiresAt: new Date(Date.parse(ts) + 86400 * 1000).toISOString(),
    capabilities: [],
  };

  await writeEnvelopeToBus(ackEnv, busDir);
  return ackEnv;
}

// ---------------------------------------------------------------------------
// Pending-acks ledger (for the optional retry-daemon)
// ---------------------------------------------------------------------------

async function readPendingAcks(busDir) {
  const p = path.join(busDir, PENDING_ACKS_FILE);
  try {
    const txt = await readFile(p, 'utf8');
    const obj = JSON.parse(txt);
    if (obj && typeof obj === 'object') return obj;
    return {};
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    return {};
  }
}

async function writePendingAcks(busDir, obj) {
  const p = path.join(busDir, PENDING_ACKS_FILE);
  const tmp = path.join(
    busDir,
    `.${PENDING_ACKS_FILE}.${process.pid}.${Date.now()}.tmp`,
  );
  await ensureDir(busDir);
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmp, p);
}

export async function recordPendingAck(busDir, entry) {
  if (!entry || !entry.env || !entry.env.id) {
    throw new Error('recordPendingAck: entry.env.id required');
  }
  const ledger = await readPendingAcks(busDir);
  ledger[entry.env.id] = entry;
  await writePendingAcks(busDir, ledger);
}

export async function clearPendingAck(busDir, id) {
  const ledger = await readPendingAcks(busDir);
  if (id in ledger) {
    delete ledger[id];
    await writePendingAcks(busDir, ledger);
  }
}

export async function listPendingAcks(busDir) {
  return readPendingAcks(busDir);
}

// ---------------------------------------------------------------------------
// DLQ helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Ack scanning
// ---------------------------------------------------------------------------

/**
 * Look for an ack envelope (ackOf === origId) in:
 *   inbox/<myJID>/
 *   inbox/<myJID>/.read/
 *   inbox/<myJID>/.processing/
 * Returns the ack envelope object or null.
 */
async function findAckFor(origId, myJID, busDir) {
  if (!myJID) return null;
  const base = path.join(busDir, 'inbox', myJID);
  const dirs = [base, path.join(base, '.read'), path.join(base, '.processing')];
  let best = null;
  for (const dir of dirs) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      continue;
    }
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!ent.name.endsWith('.json')) continue;
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
          // Track best by status precedence: rejected/processed beat received.
          const rank = (s) =>
            s === 'rejected' ? 3 : s === 'processed' ? 2 : s === 'received' ? 1 : 0;
          if (!best || rank(env.body.status) > rank(best.body.status)) {
            best = env;
          }
        }
      } catch {
        // ignore malformed
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// sendWithAck
// ---------------------------------------------------------------------------

/**
 * Send `env` and wait for an ack from the recipient. Resends with exponential
 * backoff if no ack arrives within timeoutMs. After maxRetries+1 attempts with
 * no ack, the envelope is moved to the DLQ.
 *
 * @param {object} env - envelope to send (must include id/from/to/kind/body/ts).
 * @param {string} busDir
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=10000]
 * @param {number} [opts.maxRetries=3]
 * @param {number} [opts.backoffBase=2000]
 * @param {string} [opts.myJID] - this sender's JID; required to find acks.
 * @returns {Promise<{ status:'acked'|'processed'|'rejected'|'timeout', latencyMs:number, attempts:number, finalEnvelope?:object }>}
 */
export async function sendWithAck(env, busDir, opts = {}) {
  const {
    timeoutMs = 10000,
    maxRetries = 3,
    backoffBase = 2000,
    myJID,
  } = opts;

  if (!env || typeof env !== 'object') {
    throw new Error('sendWithAck: env must be an object');
  }
  if (!busDir) throw new Error('sendWithAck: busDir is required');
  if (!myJID) {
    throw new Error('sendWithAck: opts.myJID is required to watch for acks');
  }

  const startedAt = Date.now();
  const baseId = env.id || randomUUID();

  // Ensure my own inbox exists (so fs.watch and pollers don't error).
  const myInbox = path.join(busDir, 'inbox', myJID);
  try {
    await ensureDir(myInbox);
  } catch {}

  let attempts = 0;
  let lastSent = null;

  // We try up to maxRetries+1 attempts (initial + maxRetries resends).
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts = attempt + 1;

    // Compose the envelope for this attempt.
    let sendEnv;
    if (attempt === 0) {
      sendEnv = { ...env, id: env.id || baseId, attempt: 0 };
    } else {
      sendEnv = {
        ...env,
        id: deterministicRetryId(baseId, attempt),
        attempt,
        ts: new Date().toISOString(),
      };
    }
    lastSent = sendEnv;

    try {
      await writeEnvelopeToBus(sendEnv, busDir);
    } catch (e) {
      // If we fail to even write, treat as timeout-ish.
      // Best-effort: continue to next attempt or DLQ.
    }

    // Record in the pending-acks ledger so a daemon could pick it up.
    try {
      await recordPendingAck(busDir, {
        env: sendEnv,
        sentAt: Date.now(),
        attempts,
        ackTimeoutMs: timeoutMs,
        maxRetries,
        backoffBase,
        sender: myJID,
        baseId,
      });
    } catch {}

    // Wait for an ack within timeoutMs.
    const result = await waitForAck({
      origId: sendEnv.id,
      busDir,
      myJID,
      timeoutMs,
    });

    if (result.status === 'rejected') {
      try {
        await clearPendingAck(busDir, sendEnv.id);
      } catch {}
      return {
        status: 'rejected',
        latencyMs: Date.now() - startedAt,
        attempts,
        finalEnvelope: result.envelope,
      };
    }
    if (result.status === 'processed') {
      try {
        await clearPendingAck(busDir, sendEnv.id);
      } catch {}
      return {
        status: 'processed',
        latencyMs: Date.now() - startedAt,
        attempts,
        finalEnvelope: result.envelope,
      };
    }
    if (result.status === 'acked') {
      // 'received' but no follow-up before timeout.
      try {
        await clearPendingAck(busDir, sendEnv.id);
      } catch {}
      return {
        status: 'acked',
        latencyMs: Date.now() - startedAt,
        attempts,
        finalEnvelope: result.envelope,
      };
    }

    // status === 'timeout': clear ledger entry for this attempt and back off
    // before the next attempt (if any).
    try {
      await clearPendingAck(busDir, sendEnv.id);
    } catch {}

    if (attempt < maxRetries) {
      const wait = backoffBase * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  // Exhausted: DLQ the most recently sent envelope (and the original).
  try {
    if (lastSent) {
      await moveToDLQ(lastSent, busDir);
    } else {
      await moveToDLQ(env, busDir);
    }
  } catch {}

  return {
    status: 'timeout',
    latencyMs: Date.now() - startedAt,
    attempts,
  };
}

/**
 * Watch for an ack with body.ackOf === origId addressed to myJID.
 * Returns:
 *   { status: 'rejected'|'processed', envelope }      - terminal
 *   { status: 'acked', envelope }                     - 'received' only, timed out waiting for follow-up
 *   { status: 'timeout' }                             - no ack at all within timeoutMs
 *
 * Strategy: 500ms polling fallback + fs.watch wake-ups.
 */
function waitForAck({ origId, busDir, myJID, timeoutMs }) {
  return new Promise((resolve) => {
    const inboxDir = path.join(busDir, 'inbox', myJID);
    const startedAt = Date.now();

    let settled = false;
    let receivedSeen = null;
    let pollTimer = null;
    let watcher = null;
    let timeoutTimer = null;

    function cleanup() {
      try {
        if (pollTimer) clearInterval(pollTimer);
      } catch {}
      try {
        if (watcher) watcher.close();
      } catch {}
      try {
        if (timeoutTimer) clearTimeout(timeoutTimer);
      } catch {}
    }

    function settle(value) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }

    async function check() {
      if (settled) return;
      try {
        const ack = await findAckFor(origId, myJID, busDir);
        if (ack) {
          const status = ack.body?.status;
          if (status === 'rejected') {
            settle({ status: 'rejected', envelope: ack });
            return;
          }
          if (status === 'processed') {
            settle({ status: 'processed', envelope: ack });
            return;
          }
          if (status === 'received') {
            // Remember, but keep waiting for processed/rejected.
            receivedSeen = ack;
          }
        }
      } catch {
        // ignore
      }
    }

    // Polling fallback every 500ms.
    pollTimer = setInterval(check, 500);

    // fs.watch wakeups (best-effort).
    try {
      // Make sure the dir exists for watcher.
      try {
        fs.mkdirSync(inboxDir, { recursive: true });
      } catch {}
      watcher = fs.watch(inboxDir, { persistent: false }, () => {
        check();
      });
      watcher.on?.('error', () => {});
    } catch {
      // No fs.watch — polling carries us.
    }

    // Initial check (in case ack already landed).
    check();

    timeoutTimer = setTimeout(() => {
      if (settled) return;
      if (receivedSeen) {
        settle({ status: 'acked', envelope: receivedSeen });
      } else {
        settle({ status: 'timeout' });
      }
    }, timeoutMs);

    // Safety: also bound the loop. Already handled by timeoutTimer.
    void startedAt;
  });
}
