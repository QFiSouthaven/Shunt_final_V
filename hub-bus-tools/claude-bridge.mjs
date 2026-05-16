#!/usr/bin/env node
// claude-bridge.mjs
// Aether Shunt - Claude CLI bus bridge daemon.
//
// Polls hub-bus/inbox/@claude/ for envelopes addressed to @claude, spawns a
// one-shot `claude -p "<body>"` subprocess for each, and writes the CLI's
// stdout back onto the bus as a response envelope.
//
// Pure Node stdlib - no npm deps. Node 18+. ESM.
//
// Mirrors gemini-bridge.mjs almost line-for-line; differs only in the CLI
// binary (`claude`) and the non-interactive flag (`-p`/`--print`, positional
// prompt — claude has no `--prompt=<body>` form, so we pass the body as a
// trailing positional argv entry).
//
// This file completes the Claude<->Gemini symmetry that the
// COWORK_HANDOFF_2026-05-11.md s9.5 marked as missing: the handoff listed
// "four bridges (LM Studio / Gemini / Adam / Claude)" but a @claude inbox
// poller didn't exist until this daemon. With this bridge in place, Claude is
// a first-class peer on the file-bus alongside @gemini, @lmstudio, @adam.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
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

const CLAUDE_CMD = process.env.CLAUDE_CMD || 'claude';
// Default preamble args are empty; the prompt is appended as a trailing
// positional after `-p` (claude's documented non-interactive flag). Operators
// can prepend extra flags via CLAUDE_ARGS (e.g. `--model sonnet --output-format text`).
const CLAUDE_ARGS_RAW = process.env.CLAUDE_ARGS || '';
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS) || 120000;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 2000;
const BUS_DIR =
  process.env.BUS_DIR || 'C:\\Users\\Falki\\shunt-final-v\\hub-bus';

const ME = '@claude';
const INBOX_DIR = path.join(BUS_DIR, 'inbox', ME);

// Split CLAUDE_ARGS on whitespace; empty string -> no preamble args.
const CLAUDE_ARGS = CLAUDE_ARGS_RAW.trim().length
  ? CLAUDE_ARGS_RAW.trim().split(/\s+/)
  : [];

// Resolve CLAUDE_CMD to a full path (e.g. C:\Users\...\npm\claude.cmd) so we
// can spawn with shell:false. shell:true on Windows wraps the call in
// cmd.exe, which word-splits unescaped argv on punctuation in the envelope
// body (em-dashes, quotes, parens, semicolons), causing CreateProcess to
// receive a mangled command line and exit with "The system cannot find the
// file specified." shell:false + a fully-resolved path lets Node's
// CreateProcess do proper argv escaping per CommandLineToArgvW.
function resolveCmdPath(cmd) {
  // Already a path / has a known executable extension -> keep as-is.
  if (cmd.includes('\\') || cmd.includes('/') || /\.(cmd|bat|exe|ps1)$/i.test(cmd)) {
    return cmd;
  }
  const which = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(which, [cmd], { encoding: 'utf8', shell: false });
  if (r.status !== 0) return cmd;
  const lines = (r.stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return cmd;
  if (process.platform === 'win32') {
    return (
      lines.find((l) => l.toLowerCase().endsWith('.cmd')) ||
      lines.find((l) => l.toLowerCase().endsWith('.exe')) ||
      lines[0]
    );
  }
  return lines[0];
}

const CLAUDE_CMD_RESOLVED = resolveCmdPath(CLAUDE_CMD);

// Best-effort: locate a claude-code bundle JS so we can spawn
// `node.exe <bundle.js> ...` directly. This avoids claude.cmd, which on
// Node 24+ trips CVE-2024-27980's .cmd protection (returns spawn EINVAL when
// argv contains shell-meta chars). Spawning node.exe is a regular .exe spawn
// with proper CreateProcess argv escaping; no cmd.exe, no .cmd, no CVE check.
//
// The official package historically ships as @anthropic-ai/claude-code with
// a `cli.js` entry. We probe a few well-known install locations; if none
// match, fall back to invoking the .cmd via shell (best-effort, may mangle
// shell-meta chars in the body).
function resolveClaudeBundle() {
  if (process.env.CLAUDE_BUNDLE_PATH) return process.env.CLAUDE_BUNDLE_PATH;
  const candidates = [
    path.join(
      process.env.APPDATA || '',
      'npm',
      'node_modules',
      '@anthropic-ai',
      'claude-code',
      'cli.js',
    ),
    '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js',
  ];
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const CLAUDE_BUNDLE_PATH = resolveClaudeBundle();
const NODE_EXEC = process.execPath;
const USE_NODE_DIRECT = !!CLAUDE_BUNDLE_PATH;

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const log = (...args) => console.log('[claude-bridge]', ...args);
const errlog = (...args) => console.error('[claude-bridge]', ...args);

// ---------------------------------------------------------------------------
// Daemon state
// ---------------------------------------------------------------------------

let stopping = false;
let inFlight = 0;
let processing = false; // single-flight tick guard
let watcher = null;
let pollTimer = null;
let activeChild = null; // currently running subprocess, for shutdown
let heartbeatHandle = null;

// IDs we've already enqueued/processed in this run, to avoid double-handling
// when fs.watch fires multiple times for the same file.
const seenIds = new Set();

// Per-envelope retry counter; max MAX_RETRIES transient failures before DLQ.
const retryCounts = new Map();
const MAX_RETRIES = 3;
// Subprocess timeout / spawn / network-ish errors are transient. Validation
// or non-zero exit codes are not.
const TRANSIENT_CODES = new Set([
  'TIMEOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EBUSY',
]);

function isTransient(err) {
  if (!err) return false;
  const code = err.code || err.errno || '';
  if (TRANSIENT_CODES.has(code)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Subprocess invocation
// ---------------------------------------------------------------------------

/**
 * Spawn `claude -p "<prompt>"` (or whatever CLAUDE_CMD/ARGS are configured)
 * as a one-shot subprocess. Resolves with { stdout, stderr, code } on exit,
 * rejects if the process couldn't be spawned at all.
 *
 * Times out after CLAUDE_TIMEOUT_MS by killing the child.
 *
 * claude's `--help` documents `-p, --print` as the non-interactive flag:
 *   "Print response and exit (useful for pipes)"
 * and the prompt is a positional argument: `claude [options] [prompt]`. We
 * pass `-p` plus the body as a single trailing argv entry so CreateProcess
 * (or argv splitting on POSIX) hands it to the CLI as one whole positional.
 */
function runClaudeOnce(promptText) {
  return new Promise((resolve, reject) => {
    const promptArg =
      typeof promptText === 'string'
        ? promptText
        : JSON.stringify(promptText, null, 2);

    // `-p` (non-interactive) plus any operator-supplied preamble flags.
    // Preamble is safe to pass via argv in both spawn paths because it
    // doesn't contain user input — only the prompt body does.
    const preambleArgs = ['-p', ...CLAUDE_ARGS];
    // USE_NODE_DIRECT path appends the prompt as a single trailing positional
    // argv entry (no shell, no quoting hazards). The shell:true fallback
    // path cannot do that safely — see the else branch — and uses stdin.
    const directArgs = [...preambleArgs, promptArg];

    let child;
    try {
      if (USE_NODE_DIRECT) {
        // node.exe + bundle.js -- no cmd.exe, no .cmd, no CVE-2024-27980.
        // stdio[0]='inherit' (not 'ignore') and NO windowsHide -- claude-code,
        // like gemini-cli, checks stdio/window signals to pick between
        // interactive and non-interactive paths. The gemini-bridge header
        // comment documents why 'ignore' or windowsHide:true can hang the
        // child; we mirror its choice here defensively.
        child = spawn(NODE_EXEC, [CLAUDE_BUNDLE_PATH, ...directArgs], {
          shell: false,
          stdio: ['inherit', 'pipe', 'pipe'],
        });
      } else if (CLAUDE_CMD_RESOLVED.toLowerCase().endsWith('.exe')) {
        // Mode C — direct .exe spawn. Native installer path
        // (e.g. %USERPROFILE%\.local\bin\claude.exe). The .exe doesn't need
        // cmd.exe to resolve PATHEXT, so we drop shell:true entirely:
        //   * No DEP0190 deprecation warning (Node 24+ flags args+shell:true).
        //   * No cmd.exe word-splitting on shell-meta characters in the body.
        //   * No CVE-2024-27980 surface (that's .cmd/.bat shim territory).
        //
        // Because the shell layer is gone, the prompt is safe in argv —
        // we use `directArgs` (preamble + prompt) just like Mode A. No
        // stdin gymnastics needed.
        //
        // See COWORK_HANDOFF / BUILD_LOG (claude-exe-direct dispatch
        // 2026-05-13).
        child = spawn(CLAUDE_CMD_RESOLVED, directArgs, {
          shell: false,
          env: process.env,
          stdio: ['inherit', 'pipe', 'pipe'],
        });
      } else {
        // Mode B — last-resort fallback for .cmd / .bat shims (npm-installed
        // claude where CLAUDE_BUNDLE_PATH wasn't located by
        // resolveClaudeBundle). cmd.exe IS needed here to walk PATHEXT.
        //
        // ⚠ DO NOT pass the prompt as argv on this branch. shell:true routes
        // through cmd.exe, which word-splits the prompt on shell-meta
        // characters (em-dash, ampersand, pipe, parentheses, quotes). Any
        // non-trivial body lands at claude as shredded argv and the process
        // exits 1 with a parse error. Fix: send only preamble flags as argv
        // (operator-controlled, no user input) and pipe the prompt text to
        // stdin.
        //
        // claude --help: "-p, --print  Print response and exit (useful for
        // pipes)" — exactly the affordance we're using here.
        //
        // DEP0190 still fires on this branch (preamble args + shell:true)
        // but is unavoidable for .cmd / .bat. Operators on the native
        // .exe installer hit Mode C above and don't see it.
        //
        // ⚠ Operator note: preambleArgs flows through cmd.exe on this branch,
        // so a CLAUDE_ARGS value containing embedded quotes
        // (e.g. CLAUDE_ARGS='--model "claude sonnet 4"') will be word-mangled.
        // If you need quoted CLAUDE_ARGS on a .cmd / .bat install, point
        // CLAUDE_CMD at the full .exe path so Mode C takes over.
        //
        // See COWORK_HANDOFF_2026-05-11.md §7.5 and BUILD_LOG 2026-05-13
        // (Bug 1 diagnosis + fix-claude-shell + claude-exe-direct).
        child = spawn(CLAUDE_CMD_RESOLVED, preambleArgs, {
          shell: true,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
        try {
          if (child.stdin) {
            child.stdin.write(promptArg);
            child.stdin.end();
          }
        } catch {
          // Don't reject the whole promise here. If stdin write fails, the
          // child will see closed stdin and either exit on its own or be
          // killed by the existing timeout watchdog. Avoid surfacing what's
          // essentially a benign teardown race as a spawn failure.
        }
      }
    } catch (e) {
      reject(e);
      return;
    }

    activeChild = child;

    let stdoutBuf = '';
    let stderrBuf = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      // Hard-kill safety net.
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, 2000).unref();
    }, CLAUDE_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
    });

    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeChild = null;
      reject(e);
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeChild = null;
      resolve({
        stdout: stdoutBuf,
        stderr: stderrBuf,
        code: code === null ? -1 : code,
        signal: signal || null,
        timedOut,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Envelope handling
// ---------------------------------------------------------------------------

async function handleEnvelope(entry) {
  // readInboxFor returns envelope objects with __path attached.
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

  // Atomic claim: only one bridge instance gets to process this envelope.
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
  // processed kind=response/error/event/etc., LM Studio's reply would be
  // re-spawned as a new claude work-item, fail, emit an error reply, and
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
    `arrival id=${id} from=${envelope.from} kind=${envelope.kind} room=${envelope.room || '#main'}`,
  );

  inFlight++;
  const started = Date.now();
  let releaseStatus = 'done';
  try {
    log(`spawn id=${id} -> ${CLAUDE_CMD} -p ${CLAUDE_ARGS.join(' ')} <prompt>`);
    const result = await runClaudeOnce(envelope.body);
    const latency = Date.now() - started;

    if (result.timedOut) {
      errlog(
        `timeout id=${id} latency=${latency}ms (limit=${CLAUDE_TIMEOUT_MS}ms) signal=${result.signal || ''}`,
      );
      const next = (retryCounts.get(id) || 0) + 1;
      if (next <= MAX_RETRIES) {
        retryCounts.set(id, next);
        log(`transient timeout id=${id}; retry ${next}/${MAX_RETRIES}`);
        releaseStatus = 'retry';
        seenIds.delete(id);
      } else {
        retryCounts.delete(id);
        await sendErrorReply(envelope, 'TIMEOUT', `subprocess exceeded ${CLAUDE_TIMEOUT_MS}ms`);
        releaseStatus = 'failed';
      }
      return;
    }

    log(
      `exit id=${id} code=${result.code} latency=${latency}ms stdout=${result.stdout.length}b stderr=${result.stderr.length}b`,
    );

    const stdoutTrimmed = result.stdout.trim();

    if (result.code === 0 && stdoutTrimmed.length > 0) {
      const reply = await createEnvelope({
        from: ME,
        to: envelope.from,
        kind: 'response',
        replyTo: envelope.id,
        trace: envelope.trace,
        room: envelope.room,
        body: stdoutTrimmed,
        busDir: BUS_DIR,
      });
      await writeEnvelopeToBus(reply, BUS_DIR);
      log(`reply sent id=${reply.id} replyTo=${envelope.id} to=${envelope.from}`);
      retryCounts.delete(id);
      return;
    }

    // Non-zero exit, or zero exit with empty stdout (likely stderr-only).
    const errMessage = result.stderr.toString().slice(0, 2000) || stdoutTrimmed.slice(0, 2000) || '<no output>';
    errlog(
      `error-exit id=${id} code=${result.code} stderr="${result.stderr.slice(0, 200).replace(/\s+/g, ' ')}"`,
    );
    retryCounts.delete(id);
    await sendErrorReply(envelope, result.code === 0 ? 'EMPTY_OUTPUT' : `EXIT_${result.code}`, errMessage);
    releaseStatus = 'failed';
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
        retryCounts.delete(id);
        await sendErrorReply(envelope, e?.code || 'BRIDGE_ERROR', String(e?.message || e));
        releaseStatus = 'failed';
      }
    } else {
      retryCounts.delete(id);
      await sendErrorReply(envelope, e?.code || 'BRIDGE_ERROR', String(e?.message || e));
      releaseStatus = 'failed';
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

  // Always run the interval poller as a baseline.
  pollTimer = setInterval(() => {
    tick().catch((e) => errlog('tick error:', e?.message || e));
  }, POLL_INTERVAL_MS);

  // Best-effort fs.watch to wake up immediately on new files.
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
  log(`received ${signal}, shutting down...`);
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
      // If still in-flight at deadline, kill the active child.
      if (inFlight > 0 && activeChild) {
        log('deadline reached with subprocess still running, killing it');
        try {
          activeChild.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
      log('shutdown complete.');
      process.exit(0);
      return;
    }
    setTimeout(waitForInflight, 100);
  };
  waitForInflight();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => {
  errlog('uncaughtException:', e?.stack || e?.message || e);
});
process.on('unhandledRejection', (e) => {
  errlog('unhandledRejection:', e?.stack || e?.message || e);
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

log(`starting as ${ME}`);
log(`bus dir: ${BUS_DIR}`);
log(`claude cmd: ${CLAUDE_CMD} -p ${CLAUDE_ARGS.join(' ')} <prompt>`);
if (USE_NODE_DIRECT) {
  log(`invoke mode: node.exe + bundle (${CLAUDE_BUNDLE_PATH})`);
} else {
  log(`invoke mode: claude.cmd via shell (bundle not found at expected path)`);
}
log(`claude resolved: ${CLAUDE_CMD_RESOLVED}`);
log(`subprocess timeout: ${CLAUDE_TIMEOUT_MS}ms`);
log(`poll interval: ${POLL_INTERVAL_MS}ms`);

// Recover orphans from any prior bridge that crashed mid-process.
try {
  const recovered = await recoverOrphans(ME, BUS_DIR);
  log(`orphan recovery: ${recovered} envelope(s) returned to inbox`);
} catch (e) {
  errlog('orphan recovery failed:', e?.message || e);
}

// Begin presence heartbeat.
try {
  heartbeatHandle = startHeartbeat(ME, BUS_DIR, 30000);
  log('heartbeat started (30s interval)');
} catch (e) {
  errlog('heartbeat start failed (continuing without):', e?.message || e);
}

startWatching();
// Run an immediate tick so any backlog is processed on boot.
tick().catch((e) => errlog('initial tick error:', e?.message || e));
