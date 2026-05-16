#!/usr/bin/env node
// poll.mjs - CLI to read envelopes addressed to <addr> from the local file-bus.
// Usage:
//   node hub-bus-tools/poll.mjs --as @claude
//   node hub-bus-tools/poll.mjs --as @claude --watch
//   node hub-bus-tools/poll.mjs --as @claude --limit 5
//
// Defaults: --limit=20, --unread-only=true.
// ESM, zero deps.

import { readFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { readInboxFor } from './envelope.mjs';

const BUS_DIR = 'C:\\Users\\Falki\\shunt-final-v\\hub-bus';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    let key = a.slice(2);
    let val;
    const eq = key.indexOf('=');
    if (eq >= 0) {
      val = key.slice(eq + 1);
      key = key.slice(0, eq);
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        val = true;
      } else {
        val = next;
        i++;
      }
    }
    out[key] = val;
  }
  return out;
}

function fail(msg, code = 1) {
  process.stderr.write(`poll: ${msg}\n`);
  process.exit(code);
}

function shortId(id) {
  if (!id) return '????????';
  return String(id).slice(0, 8);
}

function bodyPreview(body, n = 60) {
  let s;
  if (body === null || body === undefined) s = '';
  else if (typeof body === 'string') s = body;
  else {
    try {
      s = JSON.stringify(body);
    } catch {
      s = String(body);
    }
  }
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > n) s = s.slice(0, n - 1) + '…';
  return s;
}

function formatEnvelope(env) {
  const id = shortId(env.id);
  const ts = env.ts || '';
  const from = env.from || '?';
  const to = env.to || '?';
  const kind = env.kind || '?';
  const preview = bodyPreview(env.body, 60);
  return `${id}  ${ts}  ${from} → ${to}  [${kind}]  ${preview}`;
}

async function dumpOnce(addr, limit, includeRead) {
  const envs = await readInboxFor(addr, BUS_DIR, { limit, includeRead });
  for (const env of envs) {
    process.stdout.write(formatEnvelope(env) + '\n');
  }
  return envs;
}

async function readEnvelopeFile(filePath) {
  try {
    const txt = await readFile(filePath, 'utf8');
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const addr = args.as;
  if (!addr) fail('missing --as <addr>');

  const limit = args.limit !== undefined ? Number(args.limit) : 20;
  if (!Number.isFinite(limit) || limit < 0) fail('--limit must be a non-negative number');

  // --unread-only is the default. Allow explicit --unread-only=false to include .read/.
  let unreadOnly = true;
  if (args['unread-only'] !== undefined) {
    const v = args['unread-only'];
    if (v === false || v === 'false' || v === '0' || v === 'no') unreadOnly = false;
  }
  const includeRead = !unreadOnly;

  // First pass: dump current inbox.
  const seen = new Set();
  const initial = await dumpOnce(addr, limit, includeRead);
  for (const env of initial) {
    if (env.id) seen.add(env.id);
  }

  if (!args.watch) {
    process.exit(0);
  }

  // Watch mode: tail the inbox dir and print new arrivals as they land.
  const inboxDir = path.join(BUS_DIR, 'inbox', addr);

  // Debounce / coalesce events; fs.watch fires multiple times per write on Windows.
  let pending = false;
  async function rescan() {
    if (pending) return;
    pending = true;
    // Tiny delay so the atomic-rename has settled.
    setTimeout(async () => {
      pending = false;
      try {
        const envs = await readInboxFor(addr, BUS_DIR, { includeRead: false });
        for (const env of envs) {
          if (env.id && !seen.has(env.id)) {
            seen.add(env.id);
            process.stdout.write(formatEnvelope(env) + '\n');
          }
        }
      } catch (err) {
        process.stderr.write(`poll: watch error: ${err.message}\n`);
      }
    }, 50);
  }

  let watcher;
  try {
    watcher = watch(inboxDir, { persistent: true }, () => rescan());
  } catch (err) {
    fail(`could not watch ${inboxDir}: ${err.message}`);
  }

  // Polling fallback in case fs.watch misses an event (it sometimes does on Windows
  // when atomic-rename comes from another process).
  const interval = setInterval(rescan, 1000);

  function shutdown() {
    try { watcher && watcher.close(); } catch {}
    clearInterval(interval);
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
