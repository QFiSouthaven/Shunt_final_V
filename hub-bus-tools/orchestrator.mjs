#!/usr/bin/env node
// orchestrator.mjs
// Aether Shunt — single-command bus orchestrator (Task #13).
//
// Spawns every bridge and daemon needed for a fully functional file-bus,
// aggregates their stdout/stderr with prefixed/colored output, watches
// for crashes, and restarts crashed children with exponential backoff.
//
// Pure Node stdlib — no npm deps. Node 18+. ESM.
//
// Usage:
//   node hub-bus-tools/orchestrator.mjs
//   node hub-bus-tools/orchestrator.mjs --no-lmstudio
//   node hub-bus-tools/orchestrator.mjs --only=lmstudio-bridge
//   node hub-bus-tools/orchestrator.mjs --max-restarts=10 --backoff-base-ms=500

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// ANSI color helpers
// ---------------------------------------------------------------------------

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
};

function colorize(color, str) {
  const code = ANSI[color] || ANSI.white;
  return `${code}${str}${ANSI.reset}`;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    disabled: new Set(),
    enabled: new Set(),
    only: null,
    maxRestarts: 5,
    backoffBaseMs: 1000,
    backoffCapMs: 30000,
    httpPort: Number(process.env.ORCH_HTTP_PORT) || 7779,
    httpHost: process.env.ORCH_HTTP_HOST || '127.0.0.1',
    httpDisabled: false,
  };
  for (const a of argv.slice(2)) {
    if (a === '--no-lmstudio') args.disabled.add('lmstudio-bridge');
    else if (a === '--no-gemini') args.disabled.add('gemini-bridge');
    else if (a === '--no-claude') args.disabled.add('claude-bridge');
    else if (a === '--no-retry') args.disabled.add('retry-daemon');
    else if (a === '--no-panel') args.disabled.add('panel-server');
    else if (a === '--no-adam') args.disabled.add('adam-bridge');
    else if (a === '--no-http') args.httpDisabled = true;
    else if (a.startsWith('--enable=')) {
      const list = a.slice('--enable='.length).split(',').map((s) => s.trim()).filter(Boolean);
      for (const n of list) args.enabled.add(n);
    } else if (a.startsWith('--only=')) {
      const list = a.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean);
      args.only = new Set(list);
    } else if (a.startsWith('--max-restarts=')) {
      const n = Number(a.slice('--max-restarts='.length));
      if (Number.isFinite(n) && n >= 0) args.maxRestarts = n;
    } else if (a.startsWith('--backoff-base-ms=')) {
      const n = Number(a.slice('--backoff-base-ms='.length));
      if (Number.isFinite(n) && n >= 0) args.backoffBaseMs = n;
    } else if (a.startsWith('--backoff-cap-ms=')) {
      const n = Number(a.slice('--backoff-cap-ms='.length));
      if (Number.isFinite(n) && n >= 0) args.backoffCapMs = n;
    } else if (a.startsWith('--http-port=')) {
      const n = Number(a.slice('--http-port='.length));
      if (Number.isFinite(n) && n > 0) args.httpPort = n;
    } else if (a.startsWith('--http-host=')) {
      args.httpHost = a.slice('--http-host='.length);
    } else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  return args;
}

function printUsage() {
  console.log(`orchestrator.mjs — Aether Shunt bus orchestrator

Usage:
  node hub-bus-tools/orchestrator.mjs [flags]

Flags:
  --no-lmstudio              Disable lmstudio-bridge
  --no-gemini                Disable gemini-bridge
  --no-claude                Disable claude-bridge
  --no-retry                 Disable retry-daemon
  --no-panel                 Disable panel-server
  --no-adam                  Disable adam-bridge
  --enable=<n1,n2,...>       Force-enable opt-in children (e.g. adam-bridge)
  --only=<n1,n2,...>         Only run the named children
  --max-restarts=<N>         Crash budget per child before giving up (default: 5)
  --backoff-base-ms=<N>      Initial restart delay (default: 1000)
  --backoff-cap-ms=<N>       Max restart delay (default: 30000)
  --http-port=<N>            HTTP admin face port (default: 7779; env ORCH_HTTP_PORT)
  --http-host=<H>            HTTP admin face host (default: 127.0.0.1; env ORCH_HTTP_HOST)
  --no-http                  Disable the HTTP admin face entirely
  -h, --help                 Show this message
`);
}

// ---------------------------------------------------------------------------
// Default child registry
// ---------------------------------------------------------------------------

// Pattern Z Phase 2: Spawn one lmstudio-bridge child per configured slot.
// Slots are declared in hub-bus-tools/lms-instances.json (committed seed)
// or hub-bus/participants.json (runtime, owned by aggregator — see Phase 3).
// Each child gets LMSTUDIO_JID and optional LMSTUDIO_MODEL via envOverride.
// Falls back to a single default-JID slot if the config file is missing
// or unparseable, so a fresh checkout boots with the legacy behavior.
function loadLmsInstances() {
  const configPath = path.resolve(REPO_ROOT, 'hub-bus-tools/lms-instances.json');
  if (!fs.existsSync(configPath)) {
    return [{ jid: '@lmstudio', model: null, enabled: true }];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (Array.isArray(raw.slots) && raw.slots.length > 0) {
      return raw.slots.filter((s) => s.enabled !== false);
    }
  } catch (e) {
    console.warn('[orchestrator] failed to parse lms-instances.json:', e?.message || e);
  }
  return [{ jid: '@lmstudio', model: null, enabled: true }];
}

const DEFAULT_CHILDREN = [
  ...loadLmsInstances().map((inst) => {
    // Derive a unique child name from the JID. '@lmstudio-1' -> 'lmstudio-bridge-1';
    // bare '@lmstudio' -> 'lmstudio-bridge-default'.
    const slotName = inst.jid.replace('@lmstudio-', '').replace('@lmstudio', 'default').replace('@', '');
    return {
      name: `lmstudio-bridge-${slotName}`,
      scriptPath: 'hub-bus-tools/lmstudio-bridge.mjs',
      enabled: true,
      required: false,
      color: 'magenta',
      // envOverride is merged into process.env by ChildSupervisor.spawn().
      // LMSTUDIO_MODEL is omitted when null so the bridge's auto-resolve
      // path (resolveModel via /v1/models) fires.
      envOverride: {
        LMSTUDIO_JID: inst.jid,
        ...(inst.model ? { LMSTUDIO_MODEL: inst.model } : {}),
      },
    };
  }),
  {
    // Pattern Z Phase 3 — owns dispatch + participants + lmstudio-models
    // proxy on :7780. Loopback-only HTTP bind.
    name: 'aggregator',
    scriptPath: 'hub-bus-tools/aggregator.mjs',
    enabled: true,
    required: false,
    color: 'brightCyan',
  },
  {
    name: 'gemini-bridge',
    scriptPath: 'hub-bus-tools/gemini-bridge.mjs',
    enabled: true,
    required: false,
    color: 'cyan',
  },
  {
    name: 'claude-bridge',
    scriptPath: 'hub-bus-tools/claude-bridge.mjs',
    enabled: true,
    required: false,
    color: 'brightYellow',
  },
  {
    name: 'retry-daemon',
    scriptPath: 'hub-bus-tools/retry-daemon.mjs',
    enabled: true,
    required: false,
    color: 'yellow',
  },
  {
    name: 'panel-server',
    scriptPath: 'hub-bus-tools/panel-server.mjs',
    enabled: true,
    required: false,
    color: 'green',
  },
  {
    // NEXUS-PRIME / Adam bridge — disabled by default because it polls a
    // FastAPI server (localhost:8000) that may not be running. Enable with
    // `--enable=adam-bridge` or `--only=adam-bridge`.
    name: 'adam-bridge',
    scriptPath: 'hub-bus-tools/adam-bridge.mjs',
    enabled: false,
    required: false,
    color: 'brightBlue',
  },
  {
    // Phase B (2026-05-16) — cross-machine receive. WebSocket-subscribes to
    // the deployed Worker on behalf of every local-owned JID, writes incoming
    // envelopes into the local file-bus with skipDualWrite=true. Disabled by
    // default — opt in with `--enable=cloud-puller` once WORKER_URL and
    // WORKER_SECRET are exported in the orchestrator's environment. Without
    // those env vars the daemon exits with code 2 and the supervisor marks
    // it permanently_failed (no restart loop).
    name: 'cloud-puller',
    scriptPath: 'hub-bus-tools/cloud-puller.mjs',
    enabled: false,
    required: false,
    color: 'brightMagenta',
  },
];

/**
 * Resolve which children to run. ORCHESTRATOR_TEST_CHILDREN env var (JSON
 * array of child registry objects) overrides the default registry — used by
 * the test harness to spawn fake crashy children.
 */
function resolveRegistry(args) {
  let registry = DEFAULT_CHILDREN;
  if (process.env.ORCHESTRATOR_TEST_CHILDREN) {
    try {
      const parsed = JSON.parse(process.env.ORCHESTRATOR_TEST_CHILDREN);
      if (Array.isArray(parsed) && parsed.length > 0) {
        registry = parsed.map((c) => ({
          name: String(c.name || 'unnamed'),
          scriptPath: String(c.scriptPath || ''),
          enabled: c.enabled !== false,
          required: !!c.required,
          color: String(c.color || 'white'),
        }));
      }
    } catch (e) {
      console.error('[orchestrator] failed to parse ORCHESTRATOR_TEST_CHILDREN:', e?.message || e);
    }
  }

  return registry.filter((c) => {
    if (args.only) return args.only.has(c.name);
    if (args.disabled.has(c.name)) return false;
    // --enable=<n> opt-in: forces a child whose default `enabled` is false to run.
    if (args.enabled.has(c.name)) return true;
    return c.enabled !== false;
  });
}

// ---------------------------------------------------------------------------
// Orchestrator state
// ---------------------------------------------------------------------------

const STATE = {
  RUNNING: 'running',
  RESTARTING: 'restarting',
  PERMANENTLY_FAILED: 'permanently_failed',
  STOPPED: 'stopped',
};

// ---------------------------------------------------------------------------
// P1 #9 — Presence-offline writer for permanently-failed bridges.
//
// Without this, a bridge that exhausts its restart budget stays "online" in
// presence.json forever (the heartbeat that wrote it is gone, but its last
// stamp remains). Operators reading presence think the bridge is alive.
// ---------------------------------------------------------------------------

const BUS_DIR_FOR_PRESENCE = path.resolve(REPO_ROOT, 'hub-bus');
const PRESENCE_PATH = path.join(BUS_DIR_FOR_PRESENCE, 'presence.json');

/** Map a child spec to the JID(s) it owns; empty for non-bridge children. */
function ownedJidsForSpec(spec) {
  if (spec.envOverride && typeof spec.envOverride.LMSTUDIO_JID === 'string') {
    return [spec.envOverride.LMSTUDIO_JID];
  }
  switch (spec.name) {
    case 'claude-bridge':       return ['@claude'];
    case 'gemini-bridge':       return ['@gemini'];
    case 'adam-bridge':         return ['@adam'];
    case 'lmstudio-bridge-default': return ['@lmstudio'];
    default:                    return [];
  }
}

/** Atomic JSON write — write tmp + rename, so a crash mid-write can't half-bake. */
function atomicWriteJsonSync(targetPath, obj) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(targetPath);
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, targetPath);
}

function markPresenceOffline(jid, reason) {
  let presence;
  try {
    const raw = fs.readFileSync(PRESENCE_PATH, 'utf8');
    presence = JSON.parse(raw);
  } catch {
    // Presence file missing / malformed — don't synthesize from scratch
    // (heartbeat owns creation). Skip silently.
    return false;
  }
  if (!presence || typeof presence !== 'object') return false;
  if (!presence.agents || typeof presence.agents !== 'object') presence.agents = {};
  const existing = presence.agents[jid] || {};
  presence.agents[jid] = {
    ...existing,
    online: false,
    offlineReason: reason,
    offlineSince: new Date().toISOString(),
    lastSeenAt: existing.lastSeenAt || new Date().toISOString(),
  };
  try {
    atomicWriteJsonSync(PRESENCE_PATH, presence);
    return true;
  } catch {
    return false;
  }
}

class ChildSupervisor {
  constructor(spec, opts) {
    this.spec = spec;
    this.opts = opts;
    this.proc = null;
    this.pid = null;
    this.state = STATE.STOPPED;
    this.restarts = 0;
    this.restartTimer = null;
    this.restartDueAt = 0;
    this.stdoutBuf = '';
    this.stderrBuf = '';
    this.shuttingDown = false;
    // HTTP-face observability fields (consumed by toJSON / GET /status):
    this.startedAt = null;          // ms epoch; set in spawn(), cleared on stop()
    this.lastExitCode = null;       // captured from exit handler
    this.lastExitSignal = null;     // captured from exit handler
    this.lastError = null;          // spawn 'error' event message
    this.manuallyStopped = false;   // suppresses auto-restart after exit
  }

  prefix() {
    return colorize(this.spec.color, `[${this.spec.name}]`);
  }

  log(...args) {
    console.log(`${this.prefix()} ${colorize('gray', '(orch)')}`, ...args);
  }

  emitLine(stream, line) {
    // Color the prefix; leave child output uncolored so its own ANSI passes through.
    const prefix = this.prefix();
    if (stream === 'stderr') {
      console.error(`${prefix} ${line}`);
    } else {
      console.log(`${prefix} ${line}`);
    }
  }

  feed(stream, chunk) {
    const text = chunk.toString('utf8');
    let buf = stream === 'stdout' ? this.stdoutBuf : this.stderrBuf;
    buf += text;
    let nlIdx;
    while ((nlIdx = buf.indexOf('\n')) !== -1) {
      const raw = buf.slice(0, nlIdx);
      buf = buf.slice(nlIdx + 1);
      // Strip trailing CR (Windows line endings).
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      this.emitLine(stream, line);
    }
    if (stream === 'stdout') this.stdoutBuf = buf;
    else this.stderrBuf = buf;
  }

  flushPartialLines() {
    if (this.stdoutBuf.length > 0) {
      this.emitLine('stdout', this.stdoutBuf);
      this.stdoutBuf = '';
    }
    if (this.stderrBuf.length > 0) {
      this.emitLine('stderr', this.stderrBuf);
      this.stderrBuf = '';
    }
  }

  spawn() {
    if (this.shuttingDown) return;
    const scriptAbs = path.isAbsolute(this.spec.scriptPath)
      ? this.spec.scriptPath
      : path.resolve(REPO_ROOT, this.spec.scriptPath);

    this.log(`spawning ${scriptAbs}`);
    let proc;
    try {
      proc = spawn(process.execPath, [scriptAbs], {
        stdio: ['ignore', 'pipe', 'pipe'],
        // Pattern Z Phase 2: per-child envOverride wins, so each
        // lmstudio-bridge-N gets its own LMSTUDIO_JID (and optionally
        // LMSTUDIO_MODEL) without polluting the parent process env.
        env: { ...process.env, ...(this.spec.envOverride || {}) },
        cwd: REPO_ROOT,
        windowsHide: false,
      });
    } catch (e) {
      this.log(colorize('red', `spawn failed: ${e?.message || e}`));
      this.scheduleRestart();
      return;
    }

    this.proc = proc;
    this.pid = proc.pid || null;
    this.state = STATE.RUNNING;
    this.startedAt = Date.now();
    this.lastError = null;
    this.log(colorize('green', `started pid=${this.pid}`));

    proc.stdout.on('data', (c) => this.feed('stdout', c));
    proc.stderr.on('data', (c) => this.feed('stderr', c));

    proc.on('error', (e) => {
      this.lastError = e?.message || String(e);
      this.log(colorize('red', `proc error: ${e?.message || e}`));
    });

    proc.on('exit', (code, signal) => {
      this.flushPartialLines();
      const codeStr = signal ? `signal=${signal}` : `code=${code}`;
      this.log(colorize('yellow', `exited ${codeStr}`));
      this.proc = null;
      this.pid = null;
      this.lastExitCode = code;
      this.lastExitSignal = signal;

      // manuallyStopped suppresses auto-restart so a /stop endpoint call
      // doesn't immediately get undone by the scheduleRestart() path.
      if (this.shuttingDown || this.manuallyStopped) {
        this.state = STATE.STOPPED;
        return;
      }

      if (this.restarts >= this.opts.maxRestarts) {
        this.state = STATE.PERMANENTLY_FAILED;
        this.log(
          colorize('red', `permanently failed after ${this.restarts} restart(s)`),
        );
        // P1 #9 — flip each owned JID offline in presence.json so operators
        // and the panel don't continue showing this bridge as alive.
        for (const jid of ownedJidsForSpec(this.spec)) {
          const ok = markPresenceOffline(jid, 'permanent_fail');
          if (ok) this.log(colorize('red', `presence ${jid} → offline (permanent_fail)`));
        }
        if (this.spec.required) {
          console.error(
            colorize(
              'red',
              `[orchestrator] required child '${this.spec.name}' permanently failed, exiting 1`,
            ),
          );
          // Defer slightly so other children get a chance to print final lines.
          setTimeout(() => process.exit(1), 100);
        }
        return;
      }

      this.scheduleRestart();
    });
  }

  scheduleRestart() {
    if (this.shuttingDown) return;
    if (this.restarts >= this.opts.maxRestarts) {
      this.state = STATE.PERMANENTLY_FAILED;
      // P1 #9 — mirror the post-exit path: ensure presence reflects reality
      // even when permanent-fail is reached via scheduleRestart guard.
      for (const jid of ownedJidsForSpec(this.spec)) {
        markPresenceOffline(jid, 'permanent_fail');
      }
      return;
    }
    const attempt = this.restarts; // 0-indexed
    const delay = Math.min(
      this.opts.backoffCapMs,
      this.opts.backoffBaseMs * Math.pow(2, attempt),
    );
    this.restarts++;
    this.state = STATE.RESTARTING;
    this.restartDueAt = Date.now() + delay;
    this.log(
      colorize(
        'yellow',
        `restart ${this.restarts}/${this.opts.maxRestarts} in ${delay}ms`,
      ),
    );
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.spawn();
    }, delay);
  }

  shutdown(graceMs = 10000) {
    this.shuttingDown = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    return new Promise((resolve) => {
      const proc = this.proc;
      if (!proc) {
        this.state = STATE.STOPPED;
        resolve();
        return;
      }
      let resolved = false;
      const onExit = () => {
        if (resolved) return;
        resolved = true;
        this.flushPartialLines();
        this.state = STATE.STOPPED;
        clearTimeout(killTimer);
        resolve();
      };
      proc.once('exit', onExit);
      const killTimer = setTimeout(() => {
        if (resolved) return;
        this.log(colorize('red', `SIGTERM grace expired, sending SIGKILL`));
        try {
          proc.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, graceMs);
      try {
        proc.kill('SIGTERM');
      } catch (e) {
        this.log(colorize('red', `kill failed: ${e?.message || e}`));
        // If we couldn't even send the signal, resolve so we don't hang.
        clearTimeout(killTimer);
        if (!resolved) {
          resolved = true;
          this.state = STATE.STOPPED;
          resolve();
        }
      }
    });
  }

  statusString() {
    switch (this.state) {
      case STATE.RUNNING:
        return `${colorize('green', 'running')} pid=${this.pid}`;
      case STATE.RESTARTING: {
        const remainingMs = Math.max(0, this.restartDueAt - Date.now());
        const remainingS = Math.ceil(remainingMs / 1000);
        return `${colorize('yellow', `restarting in ${remainingS}s`)} (attempt ${this.restarts}/${this.opts.maxRestarts})`;
      }
      case STATE.PERMANENTLY_FAILED:
        return colorize('red', 'permanently failed');
      case STATE.STOPPED:
      default:
        return colorize('gray', 'stopped');
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // HTTP admin surface (consumed by GET /status, POST /start|stop|restart).
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Manually stop the child. Sets manuallyStopped so the exit handler
   * doesn't reschedule a restart. Cancels any pending restart timer.
   * Resolves once the child has exited (SIGTERM, falls back to SIGKILL
   * after 5s if the child ignores the term).
   *
   * Idempotent — returns immediately if the child isn't running.
   */
  async stop() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.manuallyStopped = true;
    const proc = this.proc;
    if (!proc) {
      this.state = STATE.STOPPED;
      return;
    }
    this.log(colorize('yellow', `manual stop requested`));
    return new Promise((resolve) => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(killTimer);
        this.state = STATE.STOPPED;
        resolve();
      };
      proc.once('exit', finish);
      const killTimer = setTimeout(() => {
        if (resolved) return;
        this.log(colorize('red', `manual stop: SIGTERM grace expired, SIGKILL`));
        try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      }, 5000);
      try {
        proc.kill('SIGTERM');
      } catch (e) {
        this.log(colorize('red', `manual stop: kill failed: ${e?.message || e}`));
        finish();
      }
    });
  }

  /**
   * Manually start the child. Clears manuallyStopped, resets the restart
   * counter (so a previous permanent-fail is forgiven), and spawns.
   *
   * Returns synchronously after firing spawn() — the actual process boot
   * happens asynchronously. Callers should poll /status to confirm
   * state === 'running'.
   *
   * Idempotent — returns `{alreadyRunning: true}` if the child is already up.
   */
  start() {
    if (this.proc) {
      return { ok: true, alreadyRunning: true };
    }
    this.manuallyStopped = false;
    this.restarts = 0;
    this.lastError = null;
    this.lastExitCode = null;
    this.lastExitSignal = null;
    this.log(colorize('green', `manual start requested`));
    this.spawn();
    return { ok: true, alreadyRunning: false };
  }

  /**
   * Stop then start. Async; awaits the stop before respawning so we don't
   * double-spawn while the old process is still tearing down.
   */
  async restart() {
    this.log(colorize('brightYellow', `manual restart requested`));
    await this.stop();
    return this.start();
  }

  /**
   * JSON-serializable status snapshot. Used by GET /status.
   * Field names use snake_case for consistency with the Worker / panel-server
   * response shapes that downstream consumers (aether-shunt-hub,
   * cockpit) already decode.
   */
  toJSON() {
    return {
      name: this.spec.name,
      state: this.state,
      pid: this.pid,
      restarts: this.restarts,
      max_restarts: this.opts.maxRestarts,
      restart_due_at:
        this.state === STATE.RESTARTING
          ? new Date(this.restartDueAt).toISOString()
          : null,
      started_at: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      last_exit_code: this.lastExitCode,
      last_exit_signal: this.lastExitSignal,
      last_error: this.lastError,
      manually_stopped: this.manuallyStopped,
      required: !!this.spec.required,
      color: this.spec.color || null,
    };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const registry = resolveRegistry(args);

  if (registry.length === 0) {
    console.error(
      colorize('red', '[orchestrator] no children selected — nothing to do'),
    );
    process.exit(2);
  }

  const opts = {
    maxRestarts: args.maxRestarts,
    backoffBaseMs: args.backoffBaseMs,
    backoffCapMs: args.backoffCapMs,
  };

  console.log(
    colorize(
      'bold',
      `[orchestrator] starting ${registry.length} child(ren): ${registry.map((c) => c.name).join(', ')}`,
    ),
  );
  console.log(
    `[orchestrator] maxRestarts=${opts.maxRestarts} backoffBaseMs=${opts.backoffBaseMs} backoffCapMs=${opts.backoffCapMs}`,
  );

  const supervisors = registry.map((spec) => new ChildSupervisor(spec, opts));

  // Spawn all in parallel — order doesn't matter.
  for (const sup of supervisors) {
    sup.spawn();
  }

  // ─── HTTP admin face ────────────────────────────────────────────────
  // Loopback-only by default. Exposes children state + start/stop/restart
  // so aether-shunt-hub's BridgeRunMatrix and cockpit's launcher proxy
  // can observe and control bridges from a UI.
  //
  // Routes:
  //   GET  /healthz                 → { ok, ts }
  //   GET  /status                  → { ok, uptime_seconds, children: [...] }
  //   POST /start/:name             → { ok, name, action: 'start',   state }
  //   POST /stop/:name              → { ok, name, action: 'stop',    state }
  //   POST /restart/:name           → { ok, name, action: 'restart', state }
  //
  // CORS is open because every consumer is on the same loopback host.
  // Real network exposure should add a bearer-token guard before binding
  // non-127.0.0.1 hosts.
  // ────────────────────────────────────────────────────────────────────
  const supervisorsByName = new Map(supervisors.map((s) => [s.spec.name, s]));
  const orchStartedAt = Date.now();
  let httpServer = null;

  // Helper for the /start /restart endpoints that optionally accept a JSON
  // body with an envOverride patch (Pattern Z Phase 4.5 envprop-fix). Returns
  // the parsed body or {} on empty/invalid input. Never throws — the caller
  // checks for body.envOverride explicitly.
  function readJsonBody(req) {
    return new Promise((resolve) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        if (!raw) return resolve({});
        try { resolve(JSON.parse(raw)); } catch { resolve({}); }
      });
      req.on('error', () => resolve({}));
    });
  }

  if (!args.httpDisabled) {
    httpServer = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const sendJson = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };

      let pathname;
      try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        pathname = url.pathname.replace(/\/+$/, '') || '/';
      } catch {
        return sendJson(400, { ok: false, error: 'invalid url' });
      }

      if (pathname === '/healthz' && req.method === 'GET') {
        return sendJson(200, { ok: true, ts: new Date().toISOString() });
      }

      if (pathname === '/status' && req.method === 'GET') {
        return sendJson(200, {
          ok: true,
          uptime_seconds: Math.floor((Date.now() - orchStartedAt) / 1000),
          children: supervisors.map((s) => s.toJSON()),
        });
      }

      const m = pathname.match(/^\/(start|stop|restart)\/([^/]+)$/);
      if (m && req.method === 'POST') {
        const [, verb, rawName] = m;
        const name = decodeURIComponent(rawName);
        const sup = supervisorsByName.get(name);
        if (!sup) {
          return sendJson(404, { ok: false, error: `no such bridge: ${name}` });
        }

        // Pattern Z Phase 4.5 envprop-fix: /restart and /start optionally
        // accept a JSON body { envOverride: { ... } }. When present, the
        // patch is merged PERSISTENTLY into sup.spec.envOverride before the
        // action — so subsequent crash-restarts also use the new env.
        // Used by aggregator.mjs reconcileBridges() to push UI-selected
        // LM Studio models into running bridges. /stop ignores any body.
        let bodyEnvOverride = null;
        if (verb === 'restart' || verb === 'start') {
          try {
            const body = await readJsonBody(req);
            if (body && body.envOverride && typeof body.envOverride === 'object') {
              bodyEnvOverride = body.envOverride;
            }
          } catch {
            // No body / invalid JSON — proceed without override.
          }
        }
        if (bodyEnvOverride) {
          sup.spec.envOverride = {
            ...(sup.spec.envOverride || {}),
            ...bodyEnvOverride,
          };
        }

        try {
          let result;
          if (verb === 'restart') result = await sup.restart();
          else if (verb === 'stop') { await sup.stop(); result = { ok: true }; }
          else result = sup.start();
          return sendJson(200, {
            ok: true,
            name,
            action: verb,
            state: sup.state,
            envOverride: sup.spec.envOverride || null,
            ...result,
          });
        } catch (e) {
          return sendJson(500, { ok: false, error: e?.message || String(e) });
        }
      }

      return sendJson(404, { ok: false, error: 'not found', path: pathname });
    });

    httpServer.on('error', (e) => {
      console.error(
        colorize('red', `[orchestrator] HTTP server error: ${e?.message || e}`),
      );
    });

    httpServer.listen(args.httpPort, args.httpHost, () => {
      console.log(
        colorize(
          'bold',
          `[orchestrator] HTTP admin face on http://${args.httpHost}:${args.httpPort}`,
        ),
      );
    });
  }

  // Periodic status line.
  const STATUS_INTERVAL_MS = 30000;
  const statusTimer = setInterval(() => {
    const lines = supervisors.map(
      (s) => `  ${s.prefix()} ${s.statusString()}`,
    );
    console.log(
      `${colorize('bold', '[orchestrator] status')} @ ${new Date().toISOString()}\n${lines.join('\n')}`,
    );
  }, STATUS_INTERVAL_MS);
  statusTimer.unref();

  // ---------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(
      colorize(
        'bold',
        `[orchestrator] received ${signal}, shutting down ${supervisors.length} child(ren)…`,
      ),
    );
    clearInterval(statusTimer);
    // Close the HTTP admin face first so no new start/stop requests can land
    // mid-teardown.
    if (httpServer) {
      await new Promise((resolve) => {
        try {
          httpServer.close(() => resolve());
          // Force-close any in-flight connections after a short grace.
          setTimeout(() => {
            try {
              httpServer.closeAllConnections?.();
            } catch { /* ignore */ }
            resolve();
          }, 2000);
        } catch {
          resolve();
        }
      });
    }
    await Promise.all(supervisors.map((s) => s.shutdown(10000)));
    console.log(colorize('bold', '[orchestrator] all children stopped, exiting 0'));
    process.exit(0);
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((e) => {
      console.error('[orchestrator] shutdown error:', e?.message || e);
      process.exit(1);
    });
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((e) => {
      console.error('[orchestrator] shutdown error:', e?.message || e);
      process.exit(1);
    });
  });
  process.on('uncaughtException', (e) => {
    console.error('[orchestrator] uncaughtException:', e?.stack || e?.message || e);
  });
  process.on('unhandledRejection', (e) => {
    console.error('[orchestrator] unhandledRejection:', e?.stack || e?.message || e);
  });
}

main().catch((e) => {
  console.error('[orchestrator] fatal:', e?.stack || e?.message || e);
  process.exit(1);
});
