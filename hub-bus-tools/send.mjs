#!/usr/bin/env node
// send.mjs - CLI to send a single envelope onto the local file-bus.
// Usage:
//   node hub-bus-tools/send.mjs --from @claude --to @gemini --kind task --body "hello"
//   node hub-bus-tools/send.mjs --from @claude --to @gemini --body-file ./long.txt
//
// Defaults: --room=#main, --kind=task. Bus dir is hardcoded.
// ESM, zero deps.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createEnvelope, writeEnvelopeToBus } from './envelope.mjs';

const BUS_DIR = 'C:\\Users\\Falki\\shunt-final-v\\hub-bus';

/** Parse argv into a flag map. Supports --flag value and --flag=value. */
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
  process.stderr.write(`send: ${msg}\n`);
  process.exit(code);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const from = args.from;
  const to = args.to;
  const kind = args.kind || 'task';
  const room = args.room || '#main';
  const replyTo = args.replyTo || null;
  const trace = args.trace || null;

  if (!from) fail('missing --from');
  if (!to) fail('missing --to');

  let body;
  if (args['body-file']) {
    const p = path.resolve(String(args['body-file']));
    try {
      body = await readFile(p, 'utf8');
    } catch (err) {
      fail(`could not read --body-file ${p}: ${err.message}`);
    }
  } else if (args.body !== undefined && args.body !== true) {
    body = String(args.body);
  } else {
    fail('missing --body or --body-file');
  }

  let env;
  try {
    env = await createEnvelope({ from, to, kind, body, room, replyTo, trace, busDir: BUS_DIR });
  } catch (err) {
    fail(err.message);
  }

  try {
    await writeEnvelopeToBus(env, BUS_DIR);
  } catch (err) {
    fail(`write failed: ${err.message}`);
  }

  process.stdout.write(`sent ${env.id} ${env.from}→${env.to} (${env.kind})\n`);
  process.exit(0);
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
