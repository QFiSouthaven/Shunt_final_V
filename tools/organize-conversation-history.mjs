#!/usr/bin/env node
// organize-conversation-history.mjs
//
// Build a clean, browsable archive of the Aether Shunt bus conversation
// history at `<repo>/Conversation history/`.
//
// NON-DESTRUCTIVE: copies envelope JSON out of `hub-bus/inbox/**` and
// `hub-bus/outbox/**`. The bus's bridges, orchestrator, and panel server
// keep reading from the same files unchanged.
//
// ESM, Node 18+, no npm deps. Stdlib only.

import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values: cli } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    out: { type: 'string' },
    quiet: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: false,
});

if (cli.help) {
  console.log(`organize-conversation-history.mjs

Usage:
  node tools/organize-conversation-history.mjs [options]

Options:
  --dry-run       Do not write anything; only report what would happen.
  --out <path>    Override output directory (default: '<repo>/Conversation history').
  --quiet         Suppress per-file logs.
  --help          Show this help.
`);
  process.exit(0);
}

const DRY_RUN = !!cli['dry-run'];
const QUIET = !!cli.quiet;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const BUS_DIR = path.join(REPO_ROOT, 'hub-bus');
const INBOX_ROOT = path.join(BUS_DIR, 'inbox');
const OUTBOX_DIR = path.join(BUS_DIR, 'outbox');
const TRANSCRIPT_PATH = path.join(BUS_DIR, 'transcript.jsonl');

const OUT_DIR = cli.out
  ? path.resolve(cli.out)
  : path.join(REPO_ROOT, 'Conversation history');
const BY_TRACE = path.join(OUT_DIR, 'by-trace');
const BY_PEER = path.join(OUT_DIR, 'by-peer');
const INDEX_MD = path.join(OUT_DIR, 'INDEX.md');
const RAW_JSONL = path.join(OUT_DIR, 'RAW.jsonl');
const README_MD = path.join(OUT_DIR, 'README.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(...args) {
  if (!QUIET) console.log(...args);
}

function warn(...args) {
  console.warn(...args);
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(d) {
  if (DRY_RUN) return;
  await mkdir(d, { recursive: true });
}

/**
 * Recursively walk a directory and yield every regular file path.
 * Returns [] if the dir does not exist. Skips dotfiles like `.gitkeep`.
 * NOTE: we descend INTO any subdirectory whose name starts with `.`
 * (e.g. `.read/`, `.processing/`, `.read/2026-05-07/`) because those
 * are the bus's archive locations.
 */
async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out;
    throw err;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      // Recurse into everything (including .read/ and dated subdirs).
      out.push(...(await walk(full)));
    } else if (ent.isFile()) {
      // Skip envelopes/atomic-tmp markers and the gitkeep files.
      if (ent.name === '.gitkeep') continue;
      if (ent.name.endsWith('.tmp')) continue;
      if (!ent.name.endsWith('.json')) continue;
      out.push(full);
    }
  }
  return out;
}

async function readJsonSafe(p) {
  try {
    const txt = await readFile(p, 'utf8');
    if (!txt.trim()) return { ok: false, reason: 'empty' };
    const env = JSON.parse(txt);
    return { ok: true, env };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function envTsMs(env) {
  if (typeof env.ts !== 'string') return 0;
  const m = Date.parse(env.ts);
  return Number.isNaN(m) ? 0 : m;
}

function shortId(id) {
  if (typeof id !== 'string') return String(id);
  // Take the chunk that humans actually distinguish on:
  // for legacy `01000000-…000001` use the trailing 12 chars,
  // for random uuids use the first 8.
  if (id.startsWith('01000000-')) {
    const tail = id.slice(-12);
    return `01000000-…${tail}`;
  }
  return id.slice(0, 8);
}

function bodyPreview(body, maxLen = 80) {
  if (body == null) return '';
  if (typeof body === 'string') {
    const compact = body.replace(/\s+/g, ' ').trim();
    return compact.length > maxLen
      ? compact.slice(0, maxLen - 1) + '…'
      : compact;
  }
  try {
    const compact = JSON.stringify(body).replace(/\s+/g, ' ');
    return compact.length > maxLen
      ? compact.slice(0, maxLen - 1) + '…'
      : compact;
  } catch {
    return String(body);
  }
}

function formatBodyBlock(body) {
  if (body == null) return '*(empty body)*';
  if (typeof body === 'string') {
    // Render plain string as a fenced block to preserve newlines.
    return '```text\n' + body + '\n```';
  }
  let json;
  try {
    json = JSON.stringify(body, null, 2);
  } catch {
    json = String(body);
  }
  return '```json\n' + json + '\n```';
}

function fmtTs(ts) {
  if (typeof ts !== 'string') return '';
  return ts.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}

function safeJID(jid) {
  // Filenames can include '@' on Windows — but be defensive.
  if (typeof jid !== 'string') return 'unknown';
  return jid.replace(/[^A-Za-z0-9@_\-.*]/g, '_');
}

function topicGuess(env) {
  // Prefer intent (when present) over body preview.
  if (env.intent && typeof env.intent === 'string') {
    return env.intent;
  }
  return bodyPreview(env.body, 60) || `${env.kind || 'envelope'}`;
}

// ---------------------------------------------------------------------------
// Phase 1 — collect envelopes
// ---------------------------------------------------------------------------

async function collectAllEnvelopes() {
  const sources = [];

  // Inboxes (live, .read/, .processing/, plus any dated subfolders inside .read/)
  let inboxAddrs = [];
  try {
    const entries = await readdir(INBOX_ROOT, { withFileTypes: true });
    inboxAddrs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  for (const addr of inboxAddrs) {
    const addrDir = path.join(INBOX_ROOT, addr);
    const files = await walk(addrDir);
    for (const f of files) sources.push({ origin: 'inbox', addr, path: f });
  }

  // Outbox audit copies.
  if (await pathExists(OUTBOX_DIR)) {
    const files = await walk(OUTBOX_DIR);
    for (const f of files) sources.push({ origin: 'outbox', path: f });
  }

  // Parse + dedupe by id. Inbox copies win over outbox when both exist
  // (inbox usually has the full body; outbox sometimes carries a stub).
  const byId = new Map();
  let malformed = 0;
  for (const src of sources) {
    const r = await readJsonSafe(src.path);
    if (!r.ok) {
      malformed++;
      warn(`[skip] ${src.path}: ${r.reason}`);
      continue;
    }
    const env = r.env;
    if (!env || typeof env !== 'object' || typeof env.id !== 'string') {
      malformed++;
      warn(`[skip] ${src.path}: not a valid envelope (no id)`);
      continue;
    }
    const existing = byId.get(env.id);
    if (!existing) {
      byId.set(env.id, { env, src });
      continue;
    }
    // Prefer inbox over outbox.
    const existingFromOutbox = existing.src.origin === 'outbox';
    const newFromInbox = src.origin === 'inbox';
    if (existingFromOutbox && newFromInbox) {
      byId.set(env.id, { env, src });
      continue;
    }
    // Both inbox: prefer the larger body (some outbox-stubs have shorter bodies).
    if (
      existing.src.origin === 'inbox' &&
      src.origin === 'inbox'
    ) {
      const a = JSON.stringify(existing.env.body || '').length;
      const b = JSON.stringify(env.body || '').length;
      if (b > a) byId.set(env.id, { env, src });
    }
  }

  return { items: [...byId.values()], malformed };
}

// ---------------------------------------------------------------------------
// Phase 2 — group + sort
// ---------------------------------------------------------------------------

function groupByTrace(items) {
  const traces = new Map();
  for (const item of items) {
    const traceId = item.env.trace || item.env.id;
    if (!traces.has(traceId)) traces.set(traceId, []);
    traces.get(traceId).push(item);
  }
  for (const arr of traces.values()) {
    arr.sort((a, b) => {
      const ta = envTsMs(a.env);
      const tb = envTsMs(b.env);
      if (ta !== tb) return ta - tb;
      // Tie-breaker: numeric seq if present.
      const sa = Number.isInteger(a.env.seq) ? a.env.seq : 0;
      const sb = Number.isInteger(b.env.seq) ? b.env.seq : 0;
      return sa - sb;
    });
  }
  return traces;
}

function collectPeers(items) {
  const peers = new Set();
  for (const { env } of items) {
    if (typeof env.from === 'string') peers.add(env.from);
    if (typeof env.to === 'string' && env.to !== '*') peers.add(env.to);
  }
  return peers;
}

// ---------------------------------------------------------------------------
// Phase 3 — render
// ---------------------------------------------------------------------------

/**
 * Build a threaded chronological view for one trace. The trace is already
 * sorted by ts asc; we additionally indent replies under their parent based
 * on the replyTo chain. If the chain is broken (parent missing) we render
 * the orphan flat under the trace.
 */
function renderTraceBody(items) {
  const byId = new Map();
  for (const it of items) byId.set(it.env.id, it);

  // Build child list: parent id -> [items], with `null` for roots.
  const children = new Map();
  for (const it of items) {
    const parent =
      it.env.replyTo && byId.has(it.env.replyTo) ? it.env.replyTo : null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(it);
  }
  for (const arr of children.values()) {
    arr.sort((a, b) => envTsMs(a.env) - envTsMs(b.env));
  }

  const lines = [];
  function renderNode(it, depth) {
    const env = it.env;
    const indent = '  '.repeat(depth);
    const intentTag = env.intent ? `/${env.intent}` : '';
    const header =
      `${indent}- **${shortId(env.id)}** ` +
      `\`${fmtTs(env.ts)}\` ` +
      `**${env.from || '?'}** → **${env.to || '?'}** ` +
      `\`[${env.kind || '?'}${intentTag}]\`` +
      (env.room ? ` _${env.room}_` : '');
    lines.push(header);
    const block = formatBodyBlock(env.body);
    // indent fenced block manually so it renders inside the list
    const blockLines = block.split('\n').map((l) => `${indent}  ${l}`);
    lines.push('');
    lines.push(...blockLines);
    lines.push('');
    const kids = children.get(env.id) || [];
    for (const k of kids) renderNode(k, depth + 1);
  }

  const roots = children.get(null) || [];
  for (const r of roots) renderNode(r, 0);
  return lines.join('\n');
}

function renderTraceMeta(traceId, items) {
  const peers = new Set();
  for (const it of items) {
    if (it.env.from) peers.add(it.env.from);
    if (it.env.to && it.env.to !== '*') peers.add(it.env.to);
  }
  const first = items[0]?.env;
  const last = items[items.length - 1]?.env;
  const lines = [];
  lines.push(`| field | value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| trace id | \`${traceId}\` |`);
  lines.push(`| envelopes | ${items.length} |`);
  lines.push(`| peers | ${[...peers].sort().join(', ')} |`);
  lines.push(`| first ts | \`${fmtTs(first?.ts)}\` |`);
  lines.push(`| last ts | \`${fmtTs(last?.ts)}\` |`);
  if (first?.id) lines.push(`| root envelope | \`${first.id}\` |`);
  return lines.join('\n');
}

function buildIndexMd({ items, traces, errorItems }) {
  const peers = collectPeers(items);
  const now = new Date().toISOString();

  // Build a "non-error" view of each trace for the thread render — error
  // envelopes are segregated to a footnote section so they don't pollute the
  // narrative. Traces consisting *only* of errors are dropped here entirely;
  // their contents still appear in the error footnote below.
  const traceEntries = [...traces.entries()]
    .map(([id, arr]) => [id, arr, arr.filter((it) => it.env.kind !== 'error')])
    .filter(([, , nonErr]) => nonErr.length > 0)
    .sort((a, b) => {
      const aFirst = envTsMs(a[2][0].env);
      const bFirst = envTsMs(b[2][0].env);
      return bFirst - aFirst;
    });

  const lines = [];
  lines.push(`# Aether Shunt Bus — Conversation History`);
  lines.push('');
  lines.push(`Snapshot generated: \`${now}\``);
  lines.push('');
  lines.push(
    `**${items.length} envelopes** across **${traces.size} traces** ` +
      `with **${peers.size} peers** active.`,
  );
  lines.push('');
  lines.push(
    `Peers seen: ${[...peers]
      .sort()
      .map((p) => '`' + p + '`')
      .join(', ')}`,
  );
  lines.push('');
  lines.push(`---`);
  lines.push('');

  // Trace list TOC.
  lines.push(`## Traces`);
  lines.push('');
  for (const [traceId, , nonErr] of traceEntries) {
    const first = nonErr[0].env;
    const topic = topicGuess(first);
    lines.push(
      `- [Trace \`${shortId(traceId)}\` — ${escapeMd(topic)}](#trace-${anchor(traceId)})`,
    );
  }
  lines.push('');
  lines.push(`---`);
  lines.push('');

  // One section per trace.
  for (const [traceId, fullArr, nonErr] of traceEntries) {
    const first = nonErr[0].env;
    const topic = topicGuess(first);
    const errCount = fullArr.length - nonErr.length;
    lines.push(``);
    lines.push(`## Trace \`${shortId(traceId)}\` — ${escapeMd(topic)}`);
    lines.push('');
    lines.push(`<a id="trace-${anchor(traceId)}"></a>`);
    lines.push('');
    lines.push(renderTraceMeta(traceId, fullArr));
    if (errCount > 0) {
      lines.push('');
      lines.push(
        `> _${errCount} error envelope(s) on this trace are listed in the error footnote below._`,
      );
    }
    lines.push('');
    lines.push(`### Thread`);
    lines.push('');
    lines.push(renderTraceBody(nonErr));
    lines.push('');
    lines.push(`---`);
    lines.push('');
  }

  // Error footnote section.
  if (errorItems.length > 0) {
    lines.push(``);
    lines.push(`## Error envelopes (debug noise, segregated)`);
    lines.push('');
    lines.push(
      `These \`kind: error\` envelopes are listed here so they don't pollute the threads above.`,
    );
    lines.push('');
    lines.push(`| short id | when | from → to | code | message |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const it of errorItems) {
      const e = it.env;
      const code = (e.body && typeof e.body === 'object' && e.body.code) || '';
      const msg = (e.body && typeof e.body === 'object' && e.body.message) ||
        (typeof e.body === 'string' ? e.body : '');
      lines.push(
        `| \`${shortId(e.id)}\` | \`${fmtTs(e.ts)}\` | ` +
          `${e.from || '?'} → ${e.to || '?'} | \`${escapeTd(code)}\` | ` +
          `${escapeTd(bodyPreview(msg, 100))} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function escapeMd(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/\n/g, ' ');
}

function escapeTd(s) {
  if (typeof s !== 'string') s = String(s ?? '');
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/`/g, "'");
}

function anchor(traceId) {
  return String(traceId).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function buildReadmeMd() {
  return `# Conversation history

This folder is a **non-destructive snapshot** of the Aether Shunt bus conversations
under \`hub-bus/\`. Nothing here is read by the bus daemons — it exists for humans
who want to browse and read what the AI peers said to each other.

## Layout

- \`INDEX.md\` — human-readable, threaded view of every conversation, grouped
  by \`trace\`. The newest conversation is at the top. Error envelopes are listed
  in a footnote section so they don't clutter the threads.
- \`by-trace/<trace-id>/<envelope-id>.json\` — every envelope, copied verbatim
  out of the bus, organized by the conversation (\`trace\`) it belongs to.
- \`by-peer/<jid>/<envelope-id>.json\` — every envelope copied a second time,
  this time grouped by the peer that sent it. Same files, different lens.
- \`RAW.jsonl\` — one envelope per line, deduplicated and sorted ascending by
  \`ts\`. Useful for grep / jq.

## Re-generating

From the repo root:

\`\`\`
npm run history
\`\`\`

That runs \`tools/organize-conversation-history.mjs\`, which:

1. Reads every envelope under \`hub-bus/inbox/<addr>/\`, \`.../.read/\`,
   \`.../.processing/\`, plus the audit copies in \`hub-bus/outbox/\`.
2. Deduplicates by envelope \`id\` (inbox copies win over outbox stubs).
3. Groups by \`trace\`, sorts within each trace by \`ts\`, and rebuilds this
   directory.

Flags:

- \`--dry-run\` — print what would be created/copied; write nothing.
- \`--out <path>\` — override the output directory.
- \`--quiet\` — suppress per-file logs.

## Non-destructive guarantee

The script only **reads** from \`hub-bus/\`. The bridges, orchestrator, and
panel server keep operating normally; they never see this folder.
`;
}

// ---------------------------------------------------------------------------
// Phase 4 — write
// ---------------------------------------------------------------------------

async function copyEnvelopeJson(targetPath, env) {
  if (DRY_RUN) {
    log(`[dry] would write ${targetPath}`);
    return;
  }
  await ensureDir(path.dirname(targetPath));
  const data = JSON.stringify(env, null, 2);
  await writeFile(targetPath, data, 'utf8');
}

async function writeIfReal(p, contents) {
  if (DRY_RUN) {
    log(`[dry] would write ${p} (${contents.length} bytes)`);
    return;
  }
  await ensureDir(path.dirname(p));
  await writeFile(p, contents, 'utf8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log(`organize-conversation-history`);
  log(`  bus dir: ${BUS_DIR}`);
  log(`  out dir: ${OUT_DIR}`);
  log(`  mode:    ${DRY_RUN ? 'DRY RUN' : 'WRITE'}`);
  log('');

  const { items, malformed } = await collectAllEnvelopes();
  log(`Collected ${items.length} unique envelopes (skipped ${malformed} malformed).`);

  if (items.length === 0) {
    warn('No envelopes found. Nothing to do.');
    return;
  }

  const traces = groupByTrace(items);
  const errorItems = items
    .filter((it) => it.env.kind === 'error')
    .sort((a, b) => envTsMs(a.env) - envTsMs(b.env));

  log(`Grouped into ${traces.size} trace(s).`);
  log(`Error envelopes: ${errorItems.length} (segregated to footnote).`);

  // by-trace copies
  let written = 0;
  for (const [traceId, arr] of traces.entries()) {
    const safeTrace = String(traceId).replace(/[^A-Za-z0-9._-]/g, '_');
    const dir = path.join(BY_TRACE, safeTrace);
    for (const it of arr) {
      const target = path.join(dir, `${it.env.id}.json`);
      await copyEnvelopeJson(target, it.env);
      written++;
    }
  }
  log(`by-trace: wrote ${written} files.`);

  // by-peer copies
  let peerWritten = 0;
  for (const it of items) {
    if (typeof it.env.from !== 'string') continue;
    const target = path.join(
      BY_PEER,
      safeJID(it.env.from),
      `${it.env.id}.json`,
    );
    await copyEnvelopeJson(target, it.env);
    peerWritten++;
  }
  log(`by-peer: wrote ${peerWritten} files.`);

  // RAW.jsonl — sorted, deduped.
  const raw = [...items]
    .sort((a, b) => envTsMs(a.env) - envTsMs(b.env))
    .map((it) => JSON.stringify(it.env))
    .join('\n');
  await writeIfReal(RAW_JSONL, raw + '\n');

  // INDEX.md
  const indexMd = buildIndexMd({ items, traces, errorItems });
  await writeIfReal(INDEX_MD, indexMd);

  // README.md
  await writeIfReal(README_MD, buildReadmeMd());

  log('');
  log(`Done.`);
  log(`  by-trace files: ${written}`);
  log(`  by-peer files:  ${peerWritten}`);
  log(`  INDEX.md bytes: ${indexMd.length}`);
  log(`  RAW.jsonl lines: ${items.length}`);
  log(`  output:         ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('organize-conversation-history failed:');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
  await writeIfReal(RAW_JSONL, raw + '\n');

  // INDEX.md
  const indexMd = buildIndexMd({ items, traces, errorItems });
  await writeIfReal(INDEX_MD, indexMd);

  // README.md
  await writeIfReal(README_MD, buildReadmeMd());

  log('');
  log(`Done.`);
  log(`  by-trace files: ${written}`);
  log(`  by-peer files:  ${peerWritten}`);
  log(`  INDEX.md bytes: ${indexMd.length}`);
  log(`  RAW.jsonl lines: ${items.length}`);
  log(`  output:         ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('organize-conversation-history failed:');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
