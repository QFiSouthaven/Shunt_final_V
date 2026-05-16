// claim.mjs - Aether Shunt local file-bus claim/release primitives
// ESM, zero deps. Node 18+.
//
// Adds at-most-once delivery guarantees to the file-bus:
//   - claimEnvelope: atomic move from inbox/<addr>/<id>.json to
//     inbox/<addr>/.processing/<id>.<pid>.<claimer>.json. fs.rename is the
//     only step, so it's racy-safe: exactly one of N parallel claimants wins.
//   - releaseEnvelope: move out of .processing/ into .read/ (done), back to
//     inbox/<addr>/ (retry), or to inbox/@dlq/ (failed).
//   - recoverOrphans: scans .processing/ for files older than maxAgeSec; moves
//     each back to inbox/<addr>/<id>.json so a freshly-restarted bridge picks
//     them up. Filename pattern is <id>.<pid>.<claimer>.json.
//   - computeDeterministicId: stable SHA-256-derived UUID-shape from the
//     content fields (excludes ts) for content-addressed dedupe.
//   - writeEnvelopeIdempotent: short-circuits writeEnvelopeToBus if an envelope
//     with this id is already on the bus (inbox / .processing / .read /
//     transcript tail).

import { createHash } from 'node:crypto';
import {
  mkdir,
  rename,
  readdir,
  readFile,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { writeEnvelopeToBus } from './envelope.mjs';

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
 * Atomically claim an envelope file by renaming it into the .processing/
 * subdir of its inbox. Exactly one of N parallel callers will win the rename;
 * the rest get ENOENT and { claimed: false }.
 *
 * @param {string} filePath  absolute path to inbox/<addr>/<id>.json
 * @param {string} claimerJID  e.g. "@lmstudio"
 * @returns {Promise<{ claimed: boolean, newPath: string|null }>}
 */
export async function claimEnvelope(filePath, claimerJID) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath); // <id>.json
  const id = base.endsWith('.json') ? base.slice(0, -'.json'.length) : base;
  // Sanitize claimer for filesystem (strip leading @, colons, etc.)
  const safeClaimer = String(claimerJID || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
  const procDir = path.join(dir, '.processing');
  await ensureDir(procDir);
  const newPath = path.join(procDir, `${id}.${process.pid}.${safeClaimer}.json`);

  try {
    await rename(filePath, newPath);
    return { claimed: true, newPath };
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return { claimed: false, newPath: null };
    }
    throw e;
  }
}

/**
 * Parse the original envelope id out of a .processing/ filename of shape
 * `<id>.<pid>.<claimer>.json`. The id itself may contain dots (UUIDs don't,
 * but content-addressed ids might), so we strip the trailing two dot-segments
 * plus `.json`.
 */
function parseProcessingId(name) {
  if (!name.endsWith('.json')) return null;
  const stem = name.slice(0, -'.json'.length); // <id>.<pid>.<claimer>
  const parts = stem.split('.');
  if (parts.length < 3) return null;
  // Last two segments are <pid> and <claimer>; everything before is the id.
  return parts.slice(0, parts.length - 2).join('.');
}

/**
 * Move an envelope out of inbox/<addr>/.processing/ to its terminal location.
 *
 *   done    -> inbox/<addr>/.read/<id>.json
 *   retry   -> inbox/<addr>/<id>.json  (back to the head of the queue)
 *   failed  -> inbox/@dlq/<id>.json
 *
 * @param {string} processingPath  absolute path to file inside .processing/
 * @param {"done"|"retry"|"failed"} status
 * @returns {Promise<string>} the new path
 */
export async function releaseEnvelope(processingPath, status) {
  if (!['done', 'retry', 'failed'].includes(status)) {
    throw new Error(`releaseEnvelope: invalid status "${status}"`);
  }
  const procDir = path.dirname(processingPath); // .../inbox/<addr>/.processing
  const inboxAddrDir = path.dirname(procDir);   // .../inbox/<addr>
  const inboxRoot = path.dirname(inboxAddrDir); // .../inbox
  const fname = path.basename(processingPath);
  const id = parseProcessingId(fname);
  if (!id) {
    throw new Error(`releaseEnvelope: cannot parse id from "${fname}"`);
  }
  const idFile = `${id}.json`;

  let destDir;
  if (status === 'done') {
    destDir = path.join(inboxAddrDir, '.read');
  } else if (status === 'retry') {
    destDir = inboxAddrDir;
  } else {
    destDir = path.join(inboxRoot, '@dlq');
  }
  await ensureDir(destDir);
  const dest = path.join(destDir, idFile);
  await rename(processingPath, dest);
  return dest;
}

/**
 * Recover envelopes whose claimer crashed mid-processing.
 *
 * Scans inbox/<addr>/.processing/ for files older than maxAgeSec; moves each
 * back to inbox/<addr>/<id>.json so the next live bridge claims it again.
 *
 * @param {string} addr   e.g. "@lmstudio"
 * @param {string} busDir absolute path to hub-bus
 * @param {number} maxAgeSec orphan threshold; default 300s
 * @returns {Promise<number>} count of envelopes recovered
 */
export async function recoverOrphans(addr, busDir, maxAgeSec = 300) {
  const inboxAddrDir = path.join(busDir, 'inbox', addr);
  const procDir = path.join(inboxAddrDir, '.processing');
  let entries;
  try {
    entries = await readdir(procDir, { withFileTypes: true });
  } catch (e) {
    if (e && e.code === 'ENOENT') return 0;
    throw e;
  }

  const cutoff = Date.now() - maxAgeSec * 1000;
  let recovered = 0;
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith('.json')) continue;
    const full = path.join(procDir, ent.name);
    let st;
    try {
      st = await stat(full);
    } catch {
      continue;
    }
    if (st.mtimeMs > cutoff) continue; // still fresh
    const id = parseProcessingId(ent.name);
    if (!id) continue;
    const dest = path.join(inboxAddrDir, `${id}.json`);
    try {
      await rename(full, dest);
      recovered++;
    } catch {
      // Another recoverer may have moved it; ignore.
    }
  }
  return recovered;
}

/**
 * Canonicalize and stably hash a payload. Object keys are sorted recursively
 * so semantically identical bodies produce identical digests.
 */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k]));
  return '{' + parts.join(',') + '}';
}

/**
 * Content-addressed envelope id. Same inputs => same id, regardless of clock.
 * Format: 8-4-4-4-12 hex (UUID shape, but it's a SHA-256 truncation).
 *
 * @param {{from:string,to:string,trace?:string|null,replyTo?:string|null,body:any}} fields
 * @returns {string}
 */
export function computeDeterministicId({ from, to, trace = null, replyTo = null, body }) {
  const canonical = canonicalJson({
    from: String(from || ''),
    to: String(to || ''),
    trace: trace == null ? null : String(trace),
    replyTo: replyTo == null ? null : String(replyTo),
    body: body === undefined ? null : body,
  });
  const hex = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Read the last `n` lines of a (potentially large) text file efficiently.
 * Returns "" on missing file. Used by the duplicate scan against the
 * transcript without loading the whole history.
 */
async function readLastLines(filePath, n) {
  let st;
  try {
    st = await stat(filePath);
  } catch (e) {
    if (e && e.code === 'ENOENT') return '';
    throw e;
  }
  if (st.size === 0) return '';
  // Pragmatic read-tail: cap at ~4 MiB for n=10000 typical lines.
  const cap = Math.min(st.size, 4 * 1024 * 1024);
  const fh = await import('node:fs/promises').then((m) => m.open(filePath, 'r'));
  try {
    const buf = Buffer.alloc(cap);
    const start = st.size - cap;
    await fh.read(buf, 0, cap, start);
    let text = buf.toString('utf8');
    // If we sliced mid-line, drop the partial first line.
    if (start > 0) {
      const nl = text.indexOf('\n');
      if (nl >= 0) text = text.slice(nl + 1);
    }
    const lines = text.split('\n').filter(Boolean);
    return lines.slice(-n).join('\n');
  } finally {
    await fh.close();
  }
}

/**
 * Write an envelope to the bus only if no envelope with this id is already
 * present. "Present" = exists as inbox/<to>/<id>.json, or as a file in
 * inbox/<to>/.processing/ whose name contains <id>, or as inbox/<to>/.read/
 * <id>.json, or as a transcript line containing the id.
 *
 * @param {object} env  validated envelope (will be validated by writeEnvelopeToBus)
 * @param {string} busDir
 * @returns {Promise<{ written: boolean, reason?: string, paths?: any }>}
 */
export async function writeEnvelopeIdempotent(env, busDir) {
  if (!env || !env.id || !env.to) {
    // Let the underlying writer surface the validation error.
    const paths = await writeEnvelopeToBus(env, busDir);
    return { written: true, paths };
  }
  const id = env.id;
  const inboxAddrDir = path.join(busDir, 'inbox', env.to);
  const direct = path.join(inboxAddrDir, `${id}.json`);
  const readPath = path.join(inboxAddrDir, '.read', `${id}.json`);

  if (await pathExists(direct)) {
    return { written: false, reason: 'duplicate' };
  }
  if (await pathExists(readPath)) {
    return { written: false, reason: 'duplicate' };
  }
  // .processing/ filename starts with <id>.
  const procDir = path.join(inboxAddrDir, '.processing');
  try {
    const ents = await readdir(procDir);
    if (ents.some((n) => n.startsWith(`${id}.`))) {
      return { written: false, reason: 'duplicate' };
    }
  } catch (e) {
    if (!e || e.code !== 'ENOENT') throw e;
  }

  // Transcript tail scan.
  const transcript = path.join(busDir, 'transcript.jsonl');
  try {
    const tail = await readLastLines(transcript, 10000);
    if (tail) {
      // Cheap substring guard before JSON parse.
      const needle = `"id":"${id}"`;
      if (tail.includes(needle) || tail.includes(`"id": "${id}"`)) {
        return { written: false, reason: 'duplicate' };
      }
    }
  } catch {
    // If transcript read fails, fall through to write — better to risk a
    // duplicate than to drop a real send.
  }

  const paths = await writeEnvelopeToBus(env, busDir);
  return { written: true, paths };
}
