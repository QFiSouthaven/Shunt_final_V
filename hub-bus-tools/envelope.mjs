// envelope.mjs - Aether Shunt local file-bus envelope helpers
// ESM, zero deps. Node 18+. Schema v0.2.2 (P0 fixes for Worker drift).
//
// v0.3 dual-write to Cloudflare Worker
// -------------------------------------
// `writeEnvelopeToBus` performs an authoritative local-file write
// (inbox + outbox + transcript). After the local write succeeds, it
// fire-and-forget POSTs the same envelope to the deployed Worker's
// `/send` endpoint so peers on other machines can receive it.
//
// Configuration (read at call time from process.env, not at module load,
// so toggling on/off does NOT require a process restart):
//
//   WORKER_URL                      e.g. https://hub-relay.halkive.workers.dev
//                                   If unset OR empty, dual-write is disabled
//                                   and behavior is identical to v0.2 (local
//                                   only). Trailing slash is tolerated.
//   WORKER_SECRET                   Bearer token for Worker auth. If
//                                   WORKER_URL is set but WORKER_SECRET is
//                                   empty, a one-shot warning is logged and
//                                   dual-write is skipped (do not crash).
//   WORKER_DUAL_WRITE_TIMEOUT_MS    AbortController timeout in ms.
//                                   Default 5000.
//   WORKER_DUAL_WRITE_VERBOSE       When "1", log a debug line on every
//                                   successful POST. Off by default to keep
//                                   bridge logs quiet.
//
// Failure-handling philosophy: the LOCAL write is authoritative. Any error
// from the Worker post (4xx, 5xx, network, timeout) is logged as a warning
// and swallowed — `writeEnvelopeToBus` always returns the local file path
// (or array of paths for broadcast). The bus must not flap when the cloud
// hiccups.

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  mkdir,
  writeFile,
  rename,
  readdir,
  readFile,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

/**
 * Default bus directory. Used by `nextSeq` when the caller doesn't supply one.
 * Override with the BUS_DIR env var. Falls back to `<repo-root>/hub-bus` —
 * the module sits at `<repo>/hub-bus-tools/envelope.mjs`, so two `..` up from
 * the module URL puts us at the repo root.
 */
const DEFAULT_BUS_DIR =
  process.env.BUS_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'hub-bus');

/**
 * Legacy file-bus → canonical Worker `kind` translation table.
 *
 * keep in sync with hub-cloudflare/src/kind-map.ts
 *
 * The file-bus historically emitted kinds like `task`, `request_aid`,
 * `response`, `deliver`, `summary`, `relay`, and `ack`. The Worker's locked
 * decision section 14 enum is `request | reply | event | broadcast | system |
 * join | leave | presence | error | schema-update`. Bridges that relay file-bus
 * envelopes to the Worker MUST translate `kind` via `canonicalKind()` before
 * POSTing to `/send`; the Worker also runs the same map on its side as a
 * defence in depth, but bridges should not rely on that.
 */
export const KIND_MAP = Object.freeze({
  // legacy file-bus kinds -> canonical Worker kinds
  task: 'request',
  request_aid: 'request',
  response: 'reply',
  deliver: 'event',
  summary: 'event',
  relay: 'event',

  // pass-through (already canonical)
  request: 'request',
  reply: 'reply',
  event: 'event',
  broadcast: 'broadcast',
  system: 'system',
  join: 'join',
  leave: 'leave',
  presence: 'presence',
  error: 'error',
  'schema-update': 'schema-update',

  // file-bus-only (not in the canonical enum) — collapse to `system` so the
  // Worker can ingest bridge-relayed acks. Bridges that want a richer
  // representation should remap on their side.
  ack: 'system',
});

/**
 * Returns the canonical Worker `kind` for a possibly-legacy input. Inputs
 * already canonical pass through. Unknown inputs are returned as-is so the
 * Worker's enum check produces a clear error downstream.
 */
export function canonicalKind(legacyKind) {
  if (typeof legacyKind !== 'string') return legacyKind;
  const mapped = KIND_MAP[legacyKind];
  return mapped !== undefined ? mapped : legacyKind;
}

// In-process flag so we only warn ONCE about pre-seq legacy envelopes per run.
let _warnedMissingSeq = false;

/**
 * Per-JID monotonic sequence counter persisted at <busDir>/.seq.json.
 *
 * The file is a JSON object mapping `from-jid` (string) -> next seq (integer
 * counter, starts at 0). On each call we read, increment the entry for the
 * caller's JID, atomically rewrite the file (temp + rename), and return the
 * value that was assigned to the caller. Independent counters per JID.
 *
 * If the file is missing or malformed, we treat the counter as fresh (start
 * at 0). The first concurrent writer wins; mid-write torn reads cannot
 * happen because rename is atomic on the same filesystem.
 *
 * @param {string} fromJID JID requesting a sequence number, e.g. "@claude".
 * @param {string} [busDir=DEFAULT_BUS_DIR]
 * @returns {Promise<number>} The integer assigned to this call.
 */
export async function nextSeq(fromJID, busDir = DEFAULT_BUS_DIR) {
  if (!fromJID || typeof fromJID !== 'string') {
    throw new Error('nextSeq: "fromJID" is required');
  }
  await ensureDir(busDir);
  const seqPath = path.join(busDir, '.seq.json');

  let counters = {};
  try {
    const txt = await readFile(seqPath, 'utf8');
    const parsed = JSON.parse(txt);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      counters = parsed;
    }
  } catch (err) {
    // ENOENT or malformed JSON -> start fresh.
    if (err && err.code !== 'ENOENT') {
      // malformed JSON; treat as fresh counters but don't blow up
      counters = {};
    }
  }

  const current = counters[fromJID];
  const assigned = Number.isInteger(current) && current >= 0 ? current : 0;
  counters[fromJID] = assigned + 1;

  // Atomic rewrite: temp file in same dir + rename.
  const tmpPath = path.join(
    busDir,
    `.seq.${process.pid}.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2)}.tmp`,
  );
  const data = JSON.stringify(counters, null, 2);
  await writeFile(tmpPath, data, 'utf8');
  await rename(tmpPath, seqPath);

  return assigned;
}

/**
 * Build a fully-populated envelope object.
 *
 * Schema v0.2.2 changes (P0 BLOCKER fixes for Worker drift):
 *   - Adds `seq` (per-JID monotonic counter) — Worker's Zod schema requires it.
 *   - **No longer emits `ttl`** — the Worker tolerates it but consumers that
 *     read `ttl` instead of `expiresAt` get stale windows once `expiresAt` is
 *     overridden. `expiresAt` is the canonical absolute expiry. Legacy
 *     readers that still consult `ttl` will compute it from `expiresAt - ts`
 *     in `migrateLegacyEnvelope` on the read side.
 *   - The function is now **async** because `seq` is persisted to disk
 *     (`<busDir>/.seq.json`).
 *
 * @param {object} opts
 * @param {string} opts.from
 * @param {string} opts.to
 * @param {string} opts.kind
 * @param {string|object} opts.body
 * @param {string} [opts.room='#main']
 * @param {string|null} [opts.replyTo=null]
 * @param {string|null} [opts.trace=null]
 * @param {string[]} [opts.capabilities=[]]
 * @param {number} [opts.ttl=86400] DEPRECATED - relative TTL in seconds. Still
 *   accepted as INPUT to derive `expiresAt`, but **no longer written onto**
 *   the returned envelope. Will be ignored entirely in v0.3.
 * @param {string} [opts.expiresAt] Absolute ISO-8601 expiry timestamp. If
 *   omitted, derived from `ttl` (and the freshly-minted `ts`).
 * @param {string|null} [opts.sig=null] Stubbed signature, v0.3 will enforce.
 * @param {string|null} [opts.issuer=null] Stubbed issuer JID, v0.3 will enforce.
 * @param {string} [opts.busDir] Override bus directory for the seq counter.
 *   Defaults to `process.env.BUS_DIR` or
 *   `C:\\Users\\Falki\\shunt-final-v\\hub-bus`.
 * @param {number} [opts.seq] Pre-computed seq number. If supplied, skips the
 *   on-disk counter (used by tests).
 * @returns {Promise<object>} envelope
 */
export async function createEnvelope({
  from,
  to,
  kind,
  intent,
  body,
  room = '#main',
  replyTo = null,
  trace = null,
  capabilities = [],
  ttl,
  expiresAt,
  sig,
  issuer,
  busDir,
  seq,
}) {
  if (!from) throw new Error('createEnvelope: "from" is required');
  if (!to) throw new Error('createEnvelope: "to" is required');
  if (!kind) throw new Error('createEnvelope: "kind" is required');
  if (body === undefined || body === null)
    throw new Error('createEnvelope: "body" is required');

  const id = randomUUID();
  const ts = new Date().toISOString();

  // Resolve expiresAt: explicit > ttl-derived > default-ttl-derived (24h).
  // We DO NOT emit `ttl` on the envelope anymore (deprecated, removed in
  // v0.2.2). It still drives the default expiresAt computation when an
  // explicit absolute timestamp wasn't supplied.
  let resolvedTtl = ttl;
  let resolvedExpiresAt = expiresAt;
  if (resolvedExpiresAt === undefined) {
    if (resolvedTtl === undefined) resolvedTtl = 86400;
    resolvedExpiresAt = new Date(
      Date.parse(ts) + resolvedTtl * 1000,
    ).toISOString();
  }

  const resolvedSeq =
    typeof seq === 'number' && Number.isInteger(seq) && seq >= 0
      ? seq
      : await nextSeq(from, busDir || DEFAULT_BUS_DIR);

  // P1 #4 — propagate `intent` if the caller supplied one. Previously this
  // field was silently dropped by destructuring, even though the Worker
  // validator accepts and the aggregator passes it. Optional; omitted from
  // the emitted envelope entirely when not provided (Worker's Zod schema
  // treats it as `z.string().optional()`).
  const envelope = {
    id,
    from,
    to,
    room,
    kind,
    body,
    replyTo,
    seq: resolvedSeq,
    expiresAt: resolvedExpiresAt,
    ts,
    trace: trace || id,
    capabilities,
  };
  if (intent !== undefined && intent !== null && intent !== '') {
    envelope.intent = String(intent);
  }
  // P1 #7 — emit sig/issuer under `_unverified` namespace so consumers can't
  // confuse "claim present" with "claim verified". v0.3 will verify and
  // promote validated values; until then anything reading these MUST read
  // env._unverified.* and treat the values as untrusted.
  if ((sig !== undefined && sig !== null) || (issuer !== undefined && issuer !== null)) {
    envelope._unverified = {
      ...(sig !== undefined && sig !== null ? { sig: String(sig) } : {}),
      ...(issuer !== undefined && issuer !== null ? { issuer: String(issuer) } : {}),
    };
  }
  return envelope;
}

/**
 * Validate that an envelope contains all required fields.
 *
 * v0.2.2 semantics:
 *   - `expiresAt` is required for new-style envelopes.
 *   - If `expiresAt` is missing AND both `ttl` and `ts` are present, this
 *     function lazily computes `expiresAt` and attaches it to the input
 *     object (read-side migration). This keeps in-flight v0.1/v0.2 envelopes
 *     valid during the migration window.
 *   - `seq` is required for new-style envelopes (v0.2.2+). Envelopes from
 *     older runs that lack `seq` are tolerated by treating them as
 *     `seq: -1` (out-of-order); we mutate the envelope to attach `seq: -1`
 *     and emit a single-shot `console.warn` per process the first time.
 *   - `sig` / `issuer` are optional; only checked for type when present.
 *
 * Throws on missing required field (other than `seq`, which is downgraded to
 * a warning per the rule above).
 */
export function validateEnvelope(env) {
  if (!env || typeof env !== 'object')
    throw new Error('validateEnvelope: envelope must be an object');
  const required = ['id', 'from', 'to', 'kind', 'body', 'ts'];
  for (const key of required) {
    const v = env[key];
    if (v === undefined || v === null || v === '')
      throw new Error(`validateEnvelope: missing required field "${key}"`);
  }
  // Read-side migration: synthesize expiresAt from legacy ttl + ts if missing.
  if (env.expiresAt === undefined || env.expiresAt === null || env.expiresAt === '') {
    if (typeof env.ttl === 'number' && typeof env.ts === 'string') {
      env.expiresAt = new Date(Date.parse(env.ts) + env.ttl * 1000).toISOString();
    } else {
      throw new Error('validateEnvelope: missing required field "expiresAt"');
    }
  }
  // seq tolerance: pre-v0.2.2 envelopes lack `seq`. Mark them as out-of-order
  // (seq: -1) and warn once per process.
  if (
    env.seq === undefined ||
    env.seq === null ||
    !Number.isInteger(env.seq)
  ) {
    if (!_warnedMissingSeq) {
      _warnedMissingSeq = true;
      console.warn(
        'validateEnvelope: envelope missing "seq" field; treating as seq:-1 ' +
          '(legacy pre-v0.2.2 sender). This warning fires once per process.',
      );
    }
    env.seq = -1;
  }
  // P1 #7 — sig/issuer live under env._unverified.* (unverified claims
  // namespace). Validator relocates any legacy top-level fields here so
  // downstream consumers can't accidentally trust them by reading env.sig.
  if (env.sig !== undefined || env.issuer !== undefined) {
    if (env.sig !== undefined && env.sig !== null && typeof env.sig !== 'string') {
      throw new Error('validateEnvelope: "sig" must be a string or null');
    }
    if (env.issuer !== undefined && env.issuer !== null && typeof env.issuer !== 'string') {
      throw new Error('validateEnvelope: "issuer" must be a string or null');
    }
    const existing = (env._unverified && typeof env._unverified === 'object') ? env._unverified : {};
    env._unverified = {
      ...existing,
      ...(env.sig !== undefined && existing.sig === undefined ? { sig: env.sig } : {}),
      ...(env.issuer !== undefined && existing.issuer === undefined ? { issuer: env.issuer } : {}),
    };
    delete env.sig;
    delete env.issuer;
  }
  if (env._unverified !== undefined) {
    if (typeof env._unverified !== 'object' || env._unverified === null) {
      throw new Error('validateEnvelope: "_unverified" must be an object when present');
    }
    if (
      env._unverified.sig !== undefined &&
      env._unverified.sig !== null &&
      typeof env._unverified.sig !== 'string'
    ) {
      throw new Error('validateEnvelope: "_unverified.sig" must be a string or null');
    }
    if (
      env._unverified.issuer !== undefined &&
      env._unverified.issuer !== null &&
      typeof env._unverified.issuer !== 'string'
    ) {
      throw new Error('validateEnvelope: "_unverified.issuer" must be a string or null');
    }
  }
  return true;
}

/**
 * Return a new envelope object with `expiresAt` filled from `ttl`+`ts` if
 * missing. Does not mutate the input. Used by readers when ingesting older
 * (v0.1/v0.2) envelopes.
 *
 * If the envelope already has `expiresAt`, returns a shallow copy unchanged.
 * If neither `expiresAt` nor a usable (`ttl`,`ts`) pair is present, throws.
 */
export function migrateLegacyEnvelope(env) {
  if (!env || typeof env !== 'object')
    throw new Error('migrateLegacyEnvelope: envelope must be an object');
  if (typeof env.expiresAt === 'string' && env.expiresAt.length > 0) {
    return { ...env };
  }
  if (typeof env.ttl !== 'number' || typeof env.ts !== 'string') {
    throw new Error(
      'migrateLegacyEnvelope: cannot derive expiresAt without numeric ttl and string ts',
    );
  }
  const baseMs = Date.parse(env.ts);
  if (Number.isNaN(baseMs)) {
    throw new Error(`migrateLegacyEnvelope: invalid ts "${env.ts}"`);
  }
  const expiresAt = new Date(baseMs + env.ttl * 1000).toISOString();
  return { ...env, expiresAt };
}

/**
 * Returns true if the envelope has expired (i.e. now > expiresAt).
 * Falls back to computing expiry from `ttl`+`ts` if `expiresAt` is missing.
 */
export function isExpired(env) {
  if (!env || typeof env !== 'object') return false;
  let target;
  if (typeof env.expiresAt === 'string' && env.expiresAt.length > 0) {
    target = Date.parse(env.expiresAt);
  } else if (typeof env.ttl === 'number' && typeof env.ts === 'string') {
    target = Date.parse(env.ts) + env.ttl * 1000;
  } else {
    return false;
  }
  if (Number.isNaN(target)) return false;
  return Date.now() > target;
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

/**
 * Atomically write a JSON file: write a sibling .tmp then rename.
 * Pollers will never see a half-written file.
 */
async function atomicWriteJson(targetPath, obj) {
  const dir = path.dirname(targetPath);
  await ensureDir(dir);
  const base = path.basename(targetPath);
  // Make tmp name unique enough that concurrent writers don't collide.
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  const data = JSON.stringify(obj, null, 2);
  await writeFile(tmpPath, data, 'utf8');
  await rename(tmpPath, targetPath);
}

/**
 * Append a single JSON line to transcript.jsonl.
 * Single writeFile with flag 'a' is atomic enough on a single machine for
 * line-sized writes; we don't need to atomic-rename here.
 */
async function appendJsonLine(filePath, obj) {
  await ensureDir(path.dirname(filePath));
  const line = JSON.stringify(obj) + '\n';
  await writeFile(filePath, line, { flag: 'a', encoding: 'utf8' });
}

// One-shot warning latch for misconfiguration: WORKER_URL set, WORKER_SECRET
// missing. We complain once per process so bridge logs don't flood.
let _warnedMissingWorkerSecret = false;

/**
 * Best-effort POST of an envelope to the deployed Worker's /send endpoint.
 *
 * Reads WORKER_URL, WORKER_SECRET, WORKER_DUAL_WRITE_TIMEOUT_MS, and
 * WORKER_DUAL_WRITE_VERBOSE from process.env at call time (so changes take
 * effect without restart).
 *
 * Never throws. Errors are logged as warnings and swallowed. The local file
 * write performed by `writeEnvelopeToBus` is authoritative.
 *
 * Returns a Promise that resolves when the POST completes (or fails). Callers
 * may await it or fire-and-forget; either way the local write outcome is
 * unaffected.
 */
async function dualWriteToWorker(env) {
  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl || typeof workerUrl !== 'string' || workerUrl.length === 0) {
    return; // Dual-write OFF: preserve single-machine behavior.
  }
  const secret = process.env.WORKER_SECRET;
  if (!secret || typeof secret !== 'string' || secret.length === 0) {
    if (!_warnedMissingWorkerSecret) {
      _warnedMissingWorkerSecret = true;
      console.warn(
        '[dual-write] WORKER_URL is set but WORKER_SECRET is empty; ' +
          'skipping cloud POST. Local file write is authoritative. ' +
          '(This warning fires once per process.)',
      );
    }
    return;
  }

  const timeoutMs = (() => {
    const raw = process.env.WORKER_DUAL_WRITE_TIMEOUT_MS;
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 5000;
  })();
  const verbose = process.env.WORKER_DUAL_WRITE_VERBOSE === '1';

  const targetUrl = `${workerUrl.replace(/\/$/, '')}/send`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(env),
      signal: controller.signal,
    });
    if (resp.ok) {
      if (verbose) {
        console.log(`[dual-write] sent ${env.id} to ${workerUrl}`);
      }
    } else {
      let snippet = '';
      try {
        const txt = await resp.text();
        snippet = typeof txt === 'string' ? txt.slice(0, 200) : '';
      } catch {
        snippet = '<unreadable body>';
      }
      console.warn(
        `[dual-write] worker rejected ${env.id}: status=${resp.status} ` +
          `body=${snippet}`,
      );
    }
  } catch (err) {
    const code = err && (err.code || err.name) ? (err.code || err.name) : 'ERR';
    const msg = err && err.message ? err.message : String(err);
    console.warn(`[dual-write] post failed for ${env.id}: code=${code} ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Write an envelope to the bus.
 * - inbox/<to>/<id>.json (or every inbox if to === '*')
 * - outbox/<id>.json
 * - transcript.jsonl (one JSON line)
 *
 * After local writes succeed, ALSO fire-and-forget POST the envelope to the
 * deployed Worker's /send endpoint when WORKER_URL + WORKER_SECRET are set.
 * Local file write is authoritative; cloud post errors are logged but do
 * NOT affect the return value or throw.
 *
 * Returns the path of the inbox file written. For broadcast it returns the
 * array of inbox paths written.
 */
export async function writeEnvelopeToBus(env, busDir, opts = {}) {
  validateEnvelope(env);
  // Cloud-puller passes { skipDualWrite: true } so envelopes that just arrived
  // FROM the Worker don't get POSTed back TO the Worker, which would loop
  // forever. All other callers (bridges, send.mjs, aggregator) leave this off.
  const skipDualWrite = opts.skipDualWrite === true;
  const inboxRoot = path.join(busDir, 'inbox');
  const outboxDir = path.join(busDir, 'outbox');
  const transcript = path.join(busDir, 'transcript.jsonl');
  const fileName = `${env.id}.json`;

  let inboxPaths;
  if (env.to === '*') {
    await ensureDir(inboxRoot);
    const entries = await readdir(inboxRoot, { withFileTypes: true });
    const inboxes = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    inboxPaths = [];
    for (const addr of inboxes) {
      const p = path.join(inboxRoot, addr, fileName);
      await atomicWriteJson(p, env);
      inboxPaths.push(p);
    }
  } else {
    const p = path.join(inboxRoot, env.to, fileName);
    await atomicWriteJson(p, env);
    inboxPaths = p;
  }

  // Outbox copy
  const outPath = path.join(outboxDir, fileName);
  await atomicWriteJson(outPath, env);

  // Transcript append
  await appendJsonLine(transcript, env);

  // Dual-write to deployed Worker (best-effort; never throws). We await so
  // tests can observe the outcome deterministically; any error inside is
  // already swallowed and logged as a warning, so awaiting cannot break
  // existing callers. Cloud-puller passes skipDualWrite=true (see opts).
  if (!skipDualWrite) await dualWriteToWorker(env);

  return inboxPaths;
}

/**
 * Read inbox envelopes for an address.
 * Returns array sorted by ts ascending.
 * Skips files in .read/ unless includeRead is true.
 */
export async function readInboxFor(addr, busDir, opts = {}) {
  const { limit, includeRead = false } = opts;
  const inboxDir = path.join(busDir, 'inbox', addr);
  const collected = [];

  async function loadFromDir(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!ent.name.endsWith('.json')) continue;
      // Skip atomic-write tmp files defensively.
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      try {
        const txt = await readFile(full, 'utf8');
        const env = JSON.parse(txt);
        collected.push({ ...env, __path: full });
      } catch {
        // Ignore malformed/half-written files; the next poll will pick them up.
      }
    }
  }

  await loadFromDir(inboxDir);
  if (includeRead) {
    await loadFromDir(path.join(inboxDir, '.read'));
  }

  collected.sort((a, b) => {
    const ta = String(a.ts || '');
    const tb = String(b.ts || '');
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });

  if (typeof limit === 'number' && limit >= 0) {
    return collected.slice(0, limit);
  }
  return collected;
}

/**
 * Move an envelope file into a sibling .read/ directory.
 * Returns the new path.
 */
export async function markRead(envPath) {
  const dir = path.dirname(envPath);
  const readDir = path.join(dir, '.read');
  await ensureDir(readDir);
  const dest = path.join(readDir, path.basename(envPath));
  await rename(envPath, dest);
  return dest;
}

/**
 * Best-effort existence check (not part of the public spec; helpers).
 */
export async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
