#!/usr/bin/env node
// hub-bus-tools/claude-pair-daemon.mjs
//
// Pattern Z Phase 7 — autonomous two-Claude loop daemon.
//
// Runs the Architect/Executor pair unattended: polls the @architect and
// @executor inboxes; on each new kind:request envelope, spawns `claude -p`
// with the build plan + the inbound envelope as context; writes the reply
// envelope back onto the file-bus. Terminates on MAX_TURNS, on a turn
// error (after alerting @zack), or on an explicit stop:true signal from
// the Claude turn.
//
// NOT registered as an orchestrator child by design (plan §8.3) — this is
// operator-launched:  node hub-bus-tools/claude-pair-daemon.mjs
//
// Deviations from the plan's §8.2 sketch (API drift, matches aggregator.mjs):
//   - releaseEnvelope imports from ./claim.mjs, not ./envelope.mjs
//   - readInboxFor returns flat envelopes carrying __path
//   - reply envelopes use kind:'response' (bus convention), not 'reply'

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEnvelope,
  writeEnvelopeToBus,
  readInboxFor,
} from './envelope.mjs';
import { releaseEnvelope } from './claim.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const HUB_BUS_DIR = path.join(REPO_ROOT, 'hub-bus');
const PLAN_PATH = process.env.PLAN_PATH
  ? path.resolve(process.env.PLAN_PATH)
  : path.join(REPO_ROOT, 'PATTERN_Z_BUILD_PLAN_2026-05-13.md');

const MAX_TURNS = Number(process.env.MAX_TURNS) || 200;
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS) || 600_000; // 10 min
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 5_000;

const CLAUDE_CMD = process.env.CLAUDE_CMD || 'claude';

let turns = 0;
let stopping = false;

async function runClaudeTurn(role, inboundEnvelope) {
  const planText = await fs.promises.readFile(PLAN_PATH, 'utf8');
  const prompt = [
    `You are ${role}, executing the Pattern Z build plan autonomously.`,
    `The plan is below. Follow it strictly. Inbound envelope is included.`,
    `Your output MUST be ONE JSON object on a single final line, after any`,
    `tool use you do. The JSON has shape:`,
    `  { "reply_to_jid": "@architect" | "@executor" | "@zack",`,
    `    "intent": "...", "body": <string or object>, "stop": <bool> }`,
    `If "stop" is true, the daemon will terminate after writing the reply.`,
    ``,
    `=== PLAN ===`,
    planText,
    ``,
    `=== INBOUND ENVELOPE ===`,
    JSON.stringify(inboundEnvelope, null, 2),
    ``,
    `Now produce your reply.`,
  ].join('\n');

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(CLAUDE_CMD, ['-p'], {
      shell: process.platform === 'win32', // claude is a .cmd shim on Windows
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* already dead */ }
      reject(new Error('Claude turn timed out'));
    }, TURN_TIMEOUT_MS);

    child.stdin.write(prompt);
    child.stdin.end();
    child.stdout.on('data', (c) => { stdout += c.toString(); });
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`Claude exited ${code}: ${stderr.slice(0, 2000)}`));
      }
      // Parse the last parseable JSON line.
      const lines = stdout.trim().split(/\n/).reverse();
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed === 'object') return resolve(parsed);
        } catch { /* try previous line */ }
      }
      reject(new Error('No JSON decision object in Claude output'));
    });
  });
}

async function pollForInbound(jid) {
  const inbox = await readInboxFor(jid, HUB_BUS_DIR);
  for (const env of inbox) {
    if (env && env.kind === 'request') {
      return { env, fp: env.__path };
    }
  }
  return null;
}

async function tick() {
  if (stopping || turns >= MAX_TURNS) return false;

  for (const role of ['@architect', '@executor']) {
    const inbound = await pollForInbound(role);
    if (!inbound) continue;

    turns++;
    console.log(`[pair-daemon] turn ${turns}: ${role} processing ${inbound.env.id}`);

    try {
      const decision = await runClaudeTurn(role, inbound.env);
      const replyEnv = await createEnvelope({
        from: role,
        to: decision.reply_to_jid || (role === '@architect' ? '@executor' : '@architect'),
        kind: 'response',
        intent: decision.intent || 'turn.reply',
        body: decision.body ?? '',
        replyTo: inbound.env.id,
        trace: inbound.env.trace || null,
        busDir: HUB_BUS_DIR,
      });
      await writeEnvelopeToBus(replyEnv, HUB_BUS_DIR);
      if (inbound.fp) {
        try { await releaseEnvelope(inbound.fp, 'done'); } catch { /* best effort */ }
      }

      if (decision.stop === true) {
        console.log('[pair-daemon] stop requested by Claude turn');
        stopping = true;
        return false;
      }
    } catch (e) {
      console.error(`[pair-daemon] turn ${turns} failed:`, e?.message || e);
      try {
        const alert = await createEnvelope({
          from: '@pair-daemon',
          to: '@zack',
          kind: 'system',
          intent: 'pair-daemon.error',
          body: {
            role,
            turn: turns,
            error: String(e?.message || e),
            inbound: inbound.env.id,
          },
          busDir: HUB_BUS_DIR,
        });
        await writeEnvelopeToBus(alert, HUB_BUS_DIR);
      } catch (alertErr) {
        console.error('[pair-daemon] failed to write alert envelope:', alertErr?.message || alertErr);
      }
      stopping = true;
      return false;
    }
  }

  return true;
}

console.log(`[pair-daemon] starting; max turns = ${MAX_TURNS}; plan = ${PLAN_PATH}`);

let inTick = false;
const loop = setInterval(async () => {
  if (inTick) return; // never overlap turns
  inTick = true;
  const cont = await tick().catch((e) => {
    console.error('[pair-daemon] tick threw:', e?.message || e);
    return false;
  });
  inTick = false;
  if (!cont) {
    clearInterval(loop);
    console.log(`[pair-daemon] stopped after ${turns} turns`);
    process.exit(0);
  }
}, POLL_INTERVAL_MS);

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
