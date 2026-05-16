#!/usr/bin/env node
// dual.mjs - one-shot Claude/Gemini bridge with bus relay.
//
// Each /c <text> or /g <text> command spawns a fresh `claude -p "<text>"` or
// `gemini -p "<text>"` subprocess, captures stdout, and prints it prefixed
// with [C] / [G]. The CLIs are NOT held open as REPL subprocesses - current
// Claude/Gemini CLI builds require a TTY for interactive mode and exit
// immediately when stdin is piped, so the previous long-lived-subprocess
// pattern no longer works.
//
// For continuous bus-routed work, run the gemini-bridge daemon alongside
// this script:  node hub-bus-tools/gemini-bridge.mjs
//
// Usage:  node dual.mjs   (or `npm run dual`)
//
// Commands once running:
//   /c <text>    one-shot: spawn `claude -p "<text>"`, print stdout
//   /g <text>    one-shot: spawn `gemini -p "<text>"`, print stdout
//   /c           switch default target to Claude (then plain lines go there)
//   /g           switch default target to Gemini
//   /relay c->g  feed Claude.lastReply into a fresh `gemini -p` invocation
//   /relay g->c  feed Gemini.lastReply into a fresh `claude -p` invocation
//   /flip        toggle default target
//   /clear       clear the screen
//   /quit        exit
//   /bus help    bus subcommands (send/poll/relay/presence)

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HUB_BUS_DIR = path.join(__dirname, 'hub-bus');

let busApi = null;
async function getBusApi() {
  if (busApi) return busApi;
  busApi = await import('./hub-bus-tools/envelope.mjs');
  return busApi;
}

const isWin = process.platform === 'win32';
const CLAUDE_CMD = process.env.CLAUDE_CMD || 'claude';
const GEMINI_CMD = process.env.GEMINI_CMD || 'gemini';
const CLAUDE_PROMPT_FLAG = process.env.CLAUDE_PROMPT_FLAG || '-p';
const GEMINI_PROMPT_FLAG = process.env.GEMINI_PROMPT_FLAG || '-p';
const ONESHOT_TIMEOUT_MS = Number(process.env.DUAL_TIMEOUT_MS) || 120000;

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

const banner = (msg) => process.stdout.write(`${DIM}${GRAY}${msg}${RESET}\n`);
const err = (msg) => process.stdout.write(`${RED}${msg}${RESET}\n`);

class Agent {
  constructor(name, command, promptFlag, color) {
    this.name = name;
    this.command = command;
    this.promptFlag = promptFlag;
    this.color = color;
    this.lastReply = '';
    this.tag = `${this.color}[${this.name[0].toUpperCase()}]${RESET}`;
  }

  run(text) {
    return new Promise((resolve) => {
      banner(`[${this.name}] spawn: ${this.command} ${this.promptFlag} <prompt> (${text.length} chars)`);

      // Two-mode spawn (mirrors hub-bus-tools/claude-bridge.mjs Mode B/C):
      //   * Mode C — `this.command` ends in `.exe` (operator set CLAUDE_CMD
      //     / GEMINI_CMD to a full native-installer path). Spawn with
      //     shell:false, prompt safe in argv. No DEP0190 deprecation warning,
      //     no cmd.exe word-mangling on shell-meta characters in the body.
      //   * Mode B — bare command name (e.g. `claude`, `gemini`) that may
      //     resolve via PATHEXT to a .cmd / .bat shim. shell:true is needed
      //     for that resolution, but cmd.exe will mangle the prompt if it's
      //     in argv — so the prompt goes via stdin. DEP0190 still fires for
      //     the promptFlag in argv but is unavoidable on this branch.
      //
      // Operators with non-trivial CLAUDE_ARGS / GEMINI_ARGS containing
      // embedded quotes should point CLAUDE_CMD / GEMINI_CMD at a full .exe
      // path so Mode C takes over and the warning goes silent.
      //
      // See COWORK_HANDOFF_2026-05-11.md §7.5 and BUILD_LOG 2026-05-13
      // (fix-claude-shell + claude-exe-direct + dual-exe-direct).
      const isExe = typeof this.command === 'string'
        && this.command.toLowerCase().endsWith('.exe');

      let child;
      try {
        if (isExe) {
          // Mode C — direct .exe spawn. No shell, no DEP0190. Prompt in argv
          // is safe because there's no cmd.exe layer to corrupt it.
          const args = this.promptFlag ? [this.promptFlag, text] : [text];
          child = spawn(this.command, args, {
            shell: false,
            env: process.env,
            stdio: ['inherit', 'pipe', 'pipe'],
          });
        } else {
          // Mode B — shell:true fallback for .cmd / .bat shim resolution.
          // Prompt text via stdin (NOT argv) so cmd.exe can't word-split it
          // on em-dash / ampersand / pipe / parens / quotes.
          // claude --help: "-p, --print  Print response and exit (useful for
          // pipes)" — exactly the affordance we're using.
          const args = this.promptFlag ? [this.promptFlag] : [];
          child = spawn(this.command, args, {
            shell: true,
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          try {
            if (child.stdin) {
              child.stdin.write(text);
              child.stdin.end();
            }
          } catch {
            // Benign — child sees closed stdin and either exits on its own
            // or is killed by the existing watchdog timeout below.
          }
        }
      } catch (e) {
        err(`[${this.name}] failed to spawn: ${e?.message || e}`);
        resolve({ code: -1, stdout: '', stderr: String(e?.message || e), timedOut: false });
        return;
      }

      let stdoutBuf = '';
      let stderrBuf = '';
      let timedOut = false;
      let settled = false;

      const stdoutPartialRef = { value: '' };
      const stderrPartialRef = { value: '' };

      const timer = setTimeout(() => {
        timedOut = true;
        try { child.kill('SIGTERM'); } catch (_e) {}
        setTimeout(() => {
          try { child.kill('SIGKILL'); } catch (_e) {}
        }, 2000).unref();
      }, ONESHOT_TIMEOUT_MS);

      const printLines = (chunkText, isErr, partialRef) => {
        const combined = partialRef.value + chunkText;
        const lines = combined.split(/\r?\n/);
        partialRef.value = lines.pop() ?? '';
        for (const line of lines) {
          process.stdout.write(`${this.tag} ${isErr ? RED : ''}${line}${RESET}\n`);
        }
      };

      child.stdout.on('data', (chunk) => {
        const t = chunk.toString();
        stdoutBuf += t;
        printLines(t, false, stdoutPartialRef);
      });
      child.stderr.on('data', (chunk) => {
        const t = chunk.toString();
        stderrBuf += t;
        printLines(t, true, stderrPartialRef);
      });

      child.on('error', (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        err(`[${this.name}] process error: ${e?.message || e}`);
        if (e && (e.code === 'ENOENT' || /not (recognized|found)/i.test(String(e.message)))) {
          banner(`  hint: \`${this.command}\` may not be on PATH. Install with:`);
          if (this.name === 'Claude') banner('    npm install -g @anthropic-ai/claude-code');
          if (this.name === 'Gemini') banner('    npm install -g @google/gemini-cli');
        }
        resolve({ code: -1, stdout: stdoutBuf, stderr: stderrBuf + String(e?.message || e), timedOut });
      });

      child.on('exit', (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (stdoutPartialRef.value) {
          process.stdout.write(`${this.tag} ${stdoutPartialRef.value}${RESET}\n`);
        }
        if (stderrPartialRef.value) {
          process.stdout.write(`${this.tag} ${RED}${stderrPartialRef.value}${RESET}\n`);
        }
        if (timedOut) {
          banner(`[${this.name}] timed out after ${ONESHOT_TIMEOUT_MS}ms (signal=${signal || ''})`);
        } else {
          banner(`[${this.name}] exited code=${code}${signal ? ` signal=${signal}` : ''}`);
          if (code === 1 || code === 9009 || code === 127) {
            banner(`  hint: \`${this.command}\` may not be on PATH. Install with:`);
            if (this.name === 'Claude') banner('    npm install -g @anthropic-ai/claude-code');
            if (this.name === 'Gemini') banner('    npm install -g @google/gemini-cli');
          }
        }
        const captured = stdoutBuf.trim();
        if (captured) {
          this.lastReply = captured.slice(-8000);
        }
        resolve({ code: code === null ? -1 : code, stdout: stdoutBuf, stderr: stderrBuf, timedOut });
      });
    });
  }
}

const claude = new Agent('Claude', CLAUDE_CMD, CLAUDE_PROMPT_FLAG, MAGENTA);
const gemini = new Agent('Gemini', GEMINI_CMD, GEMINI_PROMPT_FLAG, CYAN);

banner('dual: one-shot bridge for Claude and Gemini CLIs');
banner(`     each /c or /g spawns a fresh \`${CLAUDE_CMD} ${CLAUDE_PROMPT_FLAG} "..."\` / \`${GEMINI_CMD} ${GEMINI_PROMPT_FLAG} "..."\` subprocess`);
banner(`     subprocess timeout: ${ONESHOT_TIMEOUT_MS}ms`);
banner('     for continuous bus routing also run:  node hub-bus-tools/gemini-bridge.mjs');
banner('     /c <txt> /g <txt> · /relay c->g · /relay g->c · /flip · /quit');
banner('     bus: /bus send <to> <body> · /bus poll <addr> [N] · /bus relay c->bus|g->bus <to> · /bus presence · /bus help');
banner('     plain lines go to the current target (toggle with /flip).');

let target = claude;

const inflight = { Claude: 0, Gemini: 0 };

function dispatchOneShot(agent, text) {
  inflight[agent.name]++;
  agent
    .run(text)
    .catch((e) => err(`[${agent.name}] dispatch error: ${e?.message || e}`))
    .finally(() => {
      inflight[agent.name]--;
    });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', (rawLine) => {
  const line = rawLine.trimEnd();
  if (!line) return;

  if (line.startsWith('/')) {
    const [cmd, ...rest] = line.split(/\s+/);
    const arg = rest.join(' ');
    switch (cmd) {
      case '/c':
        if (arg) {
          dispatchOneShot(claude, arg);
        } else {
          target = claude;
          banner(`target -> Claude`);
        }
        return;
      case '/g':
        if (arg) {
          dispatchOneShot(gemini, arg);
        } else {
          target = gemini;
          banner(`target -> Gemini`);
        }
        return;
      case '/flip':
        target = target === claude ? gemini : claude;
        banner(`target -> ${target.name}`);
        return;
      case '/relay': {
        const [direction] = rest;
        if (direction === 'c->g' || direction === 'C->G') {
          const out = claude.lastReply.trim();
          if (!out) return banner('no Claude output to relay yet');
          banner(`relaying Claude -> Gemini (${out.length} chars)`);
          dispatchOneShot(gemini, out);
        } else if (direction === 'g->c' || direction === 'G->C') {
          const out = gemini.lastReply.trim();
          if (!out) return banner('no Gemini output to relay yet');
          banner(`relaying Gemini -> Claude (${out.length} chars)`);
          dispatchOneShot(claude, out);
        } else {
          banner('usage: /relay c->g  OR  /relay g->c');
        }
        return;
      }
      case '/bus':
        (async () => {
          try {
            await handleBusCommand(rest, target, claude, gemini);
          } catch (e) {
            err(`[bus] error: ${e?.message || e}`);
          }
        })();
        return;
      case '/clear':
        process.stdout.write('\x1b[2J\x1b[H');
        return;
      case '/quit':
      case '/exit':
        banner('shutting down...');
        process.exit(0);
        return;
      default:
        banner(`unknown command: ${cmd}`);
        return;
    }
  }

  dispatchOneShot(target, line);
});

function busHelp() {
  banner('bus commands:');
  banner('  /bus send <to> <body...>          send envelope from current target (Claude->@claude, Gemini->@gemini)');
  banner('  /bus poll <addr> [N]              print last N (default 10) unread inbox entries for <addr>');
  banner('  /bus relay c->bus <to>            wrap Claude.lastReply into envelope, kind=relay');
  banner('  /bus relay g->bus <to>            wrap Gemini.lastReply into envelope, kind=relay');
  banner('  /bus presence                     read hub-bus/presence.json');
  banner('  /bus help                         show this list');
}

function targetAddr(t) {
  return t && t.name === 'Gemini' ? '@gemini' : '@claude';
}

function shortId(id) {
  if (!id) return '????????';
  return String(id).split('-')[0].slice(0, 8);
}

function previewBody(body) {
  let s;
  if (typeof body === 'string') {
    s = body;
  } else {
    try {
      s = JSON.stringify(body);
    } catch (_e) {
      s = String(body);
    }
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > 80 ? s.slice(0, 77) + '...' : s;
}

async function handleBusCommand(rest, currentTarget, claudeAgent, geminiAgent) {
  const sub = (rest[0] || '').toLowerCase();
  if (!sub || sub === 'help') {
    busHelp();
    return;
  }

  const api = await getBusApi();

  if (sub === 'send') {
    const to = rest[1];
    const body = rest.slice(2).join(' ');
    if (!to || !body) {
      banner('usage: /bus send <to> <body...>');
      return;
    }
    const from = targetAddr(currentTarget);
    const env = api.createEnvelope({ from, to, kind: 'task', body });
    await api.writeEnvelopeToBus(env, HUB_BUS_DIR);
    banner(`[bus] sent ${shortId(env.id)} ${from} -> ${to} [${env.kind}]`);
    return;
  }

  if (sub === 'poll') {
    const addr = rest[1];
    const n = Math.max(1, parseInt(rest[2], 10) || 10);
    if (!addr) {
      banner('usage: /bus poll <addr> [N]');
      return;
    }
    const items = await api.readInboxFor(addr, HUB_BUS_DIR);
    if (!items || items.length === 0) {
      banner(`[bus] inbox ${addr}: empty`);
      return;
    }
    const slice = items.slice(-n);
    banner(`[bus] inbox ${addr} (last ${slice.length} of ${items.length} unread):`);
    for (const env of slice) {
      const ts = env?.ts || '';
      process.stdout.write(
        `${GRAY}  ${shortId(env?.id)} ${ts} ${env?.from || '?'}->${env?.to || '?'} [${env?.kind || '?'}] ${previewBody(env?.body)}${RESET}\n`
      );
    }
    return;
  }

  if (sub === 'relay') {
    const direction = (rest[1] || '').toLowerCase();
    const to = rest[2];
    if (!to || (direction !== 'c->bus' && direction !== 'g->bus')) {
      banner('usage: /bus relay c->bus <to>   OR   /bus relay g->bus <to>');
      return;
    }
    const fromAgent = direction === 'c->bus' ? claudeAgent : geminiAgent;
    const fromAddr = direction === 'c->bus' ? '@claude' : '@gemini';
    const out = (fromAgent.lastReply || '').trim();
    if (!out) {
      banner(`[bus] no ${fromAgent.name} output to relay yet`);
      return;
    }
    const env = api.createEnvelope({ from: fromAddr, to, kind: 'relay', body: out });
    await api.writeEnvelopeToBus(env, HUB_BUS_DIR);
    banner(`[bus] relayed ${shortId(env.id)} ${fromAddr} -> ${to} (${out.length} chars)`);
    return;
  }

  if (sub === 'presence') {
    const presencePath = path.join(HUB_BUS_DIR, 'presence.json');
    try {
      const raw = await fs.promises.readFile(presencePath, 'utf8');
      const data = JSON.parse(raw);
      banner('[bus] presence:');
      if (Array.isArray(data)) {
        for (const e of data) {
          process.stdout.write(`${GRAY}  ${JSON.stringify(e)}${RESET}\n`);
        }
      } else if (data && typeof data === 'object') {
        for (const [agent, info] of Object.entries(data)) {
          const online = info && (info.online === true || info.status === 'online');
          process.stdout.write(`${GRAY}  ${agent}: ${online ? 'online' : 'offline'} ${JSON.stringify(info)}${RESET}\n`);
        }
      } else {
        process.stdout.write(`${GRAY}  ${JSON.stringify(data)}${RESET}\n`);
      }
    } catch (e) {
      if (e && e.code === 'ENOENT') banner(`[bus] no presence.json at ${presencePath}`);
      else banner(`[bus] presence read error: ${e?.message || e}`);
    }
    return;
  }

  banner(`[bus] unknown subcommand: ${sub}`);
  busHelp();
}

const shutdown = () => {
  banner('shutdown signal received');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
