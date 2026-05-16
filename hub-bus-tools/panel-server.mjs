// panel-server.mjs — Aether Shunt broadcast panel.
// Pure Node stdlib. ESM. Zero npm deps.
// Serves a dark-theme HTML panel + small JSON API over the hub-bus filesystem,
// so zack can watch live AI<->AI traffic without pasting files into chat.
//
// Routes:
//   GET /                 -> HTML panel (template literal below)
//   GET /api/state        -> { presence, recent[<=200], inbox_counts }
//   GET /api/transcript?since=<iso>
//   GET /api/inbox/<addr> -> [envelope...]   (only un-read top-level files)
//   GET /api/envelope/<id>
//   GET /healthz
//
// Env:
//   PANEL_PORT  (default 7777)
//   BUS_DIR     (default <repo>/hub-bus)

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnvelope, writeEnvelopeToBus } from './envelope.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT    = Number(process.env.PANEL_PORT) || 7777;
const BUS_DIR = process.env.BUS_DIR || path.resolve(__dirname, '..', 'hub-bus');

const KNOWN_AGENTS = [
  '@claude', '@claude-code', '@gemini', '@lmstudio',
  '@anythingllm', '@ollama', '@zack',
];

// ─── helpers ───────────────────────────────────────────────────────────────

async function safeReadJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readPresence() {
  const p = path.join(BUS_DIR, 'presence.json');
  const data = await safeReadJson(p);
  return data || { agents: {}, rooms: {} };
}

/**
 * Read transcript.jsonl. Tolerates ENOENT, blank lines, and partial-write
 * races (skip malformed lines silently). Returns array of envelope objects.
 */
async function readTranscript() {
  const p = path.join(BUS_DIR, 'transcript.jsonl');
  let raw = '';
  try { raw = await fs.readFile(p, 'utf8'); }
  catch { return []; }
  const out = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); }
    catch { /* partial write or junk — skip */ }
  }
  return out;
}

/** List unread envelope files in inbox/<addr>/ (top-level *.json only). */
async function listInboxFiles(addr) {
  const dir = path.join(BUS_DIR, 'inbox', addr);
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return []; }
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.json') && !e.name.startsWith('.'))
    .map(e => path.join(dir, e.name));
}

async function readInbox(addr) {
  const files = await listInboxFiles(addr);
  const envelopes = [];
  for (const f of files) {
    const env = await safeReadJson(f);
    if (env) envelopes.push(env);
  }
  // newest first
  envelopes.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  return envelopes;
}

async function inboxCounts() {
  const counts = {};
  for (const addr of KNOWN_AGENTS) {
    const files = await listInboxFiles(addr);
    counts[addr] = files.length;
  }
  return counts;
}

/** Best-effort lookup of a single envelope by id. */
async function findEnvelopeById(id) {
  // 1) transcript
  const t = await readTranscript();
  const hit = t.find(e => e && e.id === id);
  if (hit) return hit;
  // 2) every inbox (unread + .read)
  const inboxRoot = path.join(BUS_DIR, 'inbox');
  let agents = [];
  try { agents = (await fs.readdir(inboxRoot, { withFileTypes: true }))
    .filter(d => d.isDirectory()).map(d => d.name); }
  catch { agents = []; }
  for (const addr of agents) {
    for (const sub of ['', '.read']) {
      const target = path.join(inboxRoot, addr, sub, `${id}.json`);
      const env = await safeReadJson(target);
      if (env) return env;
    }
  }
  // 3) outbox
  const ob = await safeReadJson(path.join(BUS_DIR, 'outbox', `${id}.json`));
  if (ob) return ob;
  return null;
}

// ─── HTTP server ───────────────────────────────────────────────────────────

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    // CORS: open API to AI Studio Build previews and any frontend.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

/**
 * Read raw request body up to a max size. Resolves with a string (utf-8) or
 * rejects on overflow / aborted connection.
 */
function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error('payload too large'), { code: 'PAYLOAD_TOO_LARGE' }));
        try { req.destroy(); } catch {}
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send404(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
}

function sendHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;

  // CORS preflight for cross-origin frontends (AI Studio, Cloudflare Pages, etc.).
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  // POST /api/send — Local-trusted endpoint that lets @zack send messages from
  // the chat-room panel UI. DO NOT EXPOSE THIS PORT TO THE PUBLIC INTERNET
  // WITHOUT AN AUTH WRAPPER. The `from` field is hardcoded to '@zack' on the
  // server side; clients have no say. Body shape:
  //   { to: '@addr'|'#room', body: string, kind?: 'task'|'broadcast'|'request_aid',
  //     intent?: string, room?: '#main'|'#whisper-...' }
  if (req.method === 'POST' && pathname === '/api/send') {
    let raw;
    try {
      raw = await readRequestBody(req, 64 * 1024); // 64 KB cap on entire JSON request
    } catch (err) {
      return sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', error: 'request body too large' });
    }
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch { return sendJson(res, 400, { ok: false, code: 'BAD_JSON', error: 'invalid JSON body' }); }
    if (!payload || typeof payload !== 'object') {
      return sendJson(res, 400, { ok: false, code: 'BAD_BODY', error: 'body must be a JSON object' });
    }
    const to = payload.to;
    const body = payload.body;
    const kindIn = payload.kind || 'task';
    const intent = payload.intent;
    const roomIn = payload.room;

    if (typeof to !== 'string' || to.length === 0 || !(to.startsWith('@') || to.startsWith('#') || to === '*')) {
      return sendJson(res, 400, { ok: false, code: 'BAD_TO', error: '"to" must be @addr, #room, or *' });
    }
    if (typeof body !== 'string' || body.length === 0) {
      return sendJson(res, 400, { ok: false, code: 'BAD_BODY', error: '"body" must be a non-empty string' });
    }
    if (Buffer.byteLength(body, 'utf8') > 16 * 1024) {
      return sendJson(res, 400, { ok: false, code: 'BODY_TOO_LARGE', error: '"body" exceeds 16 KB' });
    }
    const allowedKinds = new Set(['task', 'broadcast', 'request_aid', 'response']);
    if (typeof kindIn !== 'string' || !allowedKinds.has(kindIn)) {
      return sendJson(res, 400, { ok: false, code: 'BAD_KIND', error: '"kind" must be one of task|broadcast|request_aid|response' });
    }
    let room = '#main';
    if (typeof roomIn === 'string' && roomIn.length > 0) {
      if (!(roomIn.startsWith('#'))) {
        return sendJson(res, 400, { ok: false, code: 'BAD_ROOM', error: '"room" must start with #' });
      }
      room = roomIn;
    }
    // Broadcast convenience: `to: '*'` implies broadcast kind.
    let kind = kindIn;
    if (to === '*' && kind !== 'broadcast') kind = 'broadcast';

    try {
      const envOpts = {
        from: '@zack',
        to,
        kind,
        body,
        room,
        busDir: BUS_DIR,
      };
      const env = await createEnvelope(envOpts);
      if (typeof intent === 'string' && intent.length > 0) {
        env.intent = intent.slice(0, 64);
      }
      await writeEnvelopeToBus(env, BUS_DIR);
      return sendJson(res, 200, { ok: true, id: env.id, ts: env.ts });
    } catch (err) {
      const code = (err && (err.code || err.name)) || 'ERR';
      const msg = (err && err.message) ? err.message : String(err);
      return sendJson(res, 500, { ok: false, code, error: msg });
    }
  }

  if (req.method !== 'GET') return send404(res);

  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  if (pathname === '/') {
    // Prefer the on-disk chat-room panel at hub-bus-panel/index.html so edits
    // there are picked up without restarting. Fall back to the inline
    // PANEL_HTML template if the file is missing.
    const panelHtmlPath = path.resolve(__dirname, '..', 'hub-bus-panel', 'index.html');
    try {
      const html = await fs.readFile(panelHtmlPath, 'utf8');
      return sendHtml(res, html);
    } catch {
      return sendHtml(res, PANEL_HTML);
    }
  }

  if (pathname === '/api/state') {
    const [presence, transcript, counts] = await Promise.all([
      readPresence(), readTranscript(), inboxCounts(),
    ]);
    const recent = transcript.slice(-200);
    return sendJson(res, 200, { presence, recent, inbox_counts: counts });
  }

  if (pathname === '/api/transcript') {
    const since = url.searchParams.get('since') || '';
    const transcript = await readTranscript();
    const filtered = since
      ? transcript.filter(e => String(e.ts || '') > since)
      : transcript;
    return sendJson(res, 200, filtered);
  }

  if (pathname.startsWith('/api/inbox/')) {
    const addr = decodeURIComponent(pathname.slice('/api/inbox/'.length));
    if (!addr || addr.includes('/') || addr.includes('\\') || addr.includes('..')) {
      return sendJson(res, 400, { error: 'bad addr' });
    }
    const envelopes = await readInbox(addr);
    return sendJson(res, 200, envelopes);
  }

  if (pathname.startsWith('/api/envelope/')) {
    const id = decodeURIComponent(pathname.slice('/api/envelope/'.length));
    if (!id || id.includes('/') || id.includes('\\') || id.includes('..')) {
      return sendJson(res, 400, { error: 'bad id' });
    }
    const env = await findEnvelopeById(id);
    if (!env) return sendJson(res, 404, { error: 'not found' });
    return sendJson(res, 200, env);
  }

  return send404(res);
}

function startServer() {
  const server = http.createServer((req, res) => {
    handle(req, res).catch(err => {
      try { sendJson(res, 500, { error: String(err && err.message || err) }); }
      catch { /* response already sent */ }
    });
  });

  server.listen(PORT, () => {
    console.log(`[panel] port ${PORT}`);
    console.log(`[panel] bus  ${BUS_DIR}`);
    console.log(`[panel] open http://localhost:${PORT}`);
  });

  const shutdown = (sig) => {
    console.log(`[panel] ${sig} received, shutting down`);
    server.close(() => process.exit(0));
    // hard-exit fallback
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

// ─── HTML panel (single-file template literal) ─────────────────────────────

const PANEL_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aether Shunt — Bus Panel</title>
<style>
  :root {
    --bg:        #0d1117;
    --panel:     #161b22;
    --panel2:    #1c232c;
    --border:    #30363d;
    --text:      #e6edf3;
    --dim:       #8b949e;
    --dim2:      #6e7681;
    --green:     #3fb950;
    --blue:      #58a6ff;
    --red:       #f85149;
    --purple:    #bc8cff;
    --yellow:    #d29922;
    --mono:      ui-monospace, "SF Mono", "JetBrains Mono", Consolas, Monaco, monospace;
    --sans:      -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; background:var(--bg); color:var(--text); font-family:var(--sans); height:100%; }
  a { color: var(--blue); }

  #topbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: 12px;
    padding: 8px 14px; background: var(--panel); border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  #topbar .stat { color: var(--dim); }
  #topbar .stat b { color: var(--text); font-weight: 600; }
  #topbar input[type="search"] {
    flex: 1; min-width: 120px; max-width: 420px;
    background: var(--bg); color: var(--text);
    border: 1px solid var(--border); border-radius: 6px;
    padding: 6px 10px; font-family: var(--sans); font-size: 13px;
    outline: none;
  }
  #topbar input[type="search"]:focus { border-color: var(--blue); }
  #topbar button {
    background: var(--panel2); color: var(--text);
    border: 1px solid var(--border); border-radius: 6px;
    padding: 5px 10px; font-size: 12px; cursor: pointer;
    font-family: var(--sans);
  }
  #topbar button.on { background: #1f3a5e; border-color: var(--blue); color: var(--blue); }

  #grid {
    display: grid;
    grid-template-columns: 220px 1fr 260px;
    gap: 1px;
    background: var(--border);
    height: calc(100vh - 41px);
  }
  .col { background: var(--bg); overflow-y: auto; }
  .col h2 {
    margin: 0; padding: 10px 12px; font-size: 11px; font-weight: 600;
    color: var(--dim); text-transform: uppercase; letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border); position: sticky; top: 0;
    background: var(--panel);
  }

  /* LEFT — agent roster */
  .agent-card {
    margin: 8px 10px; padding: 8px 10px;
    background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
    cursor: pointer; user-select: none;
  }
  .agent-card.active { border-color: var(--blue); background: #11233e; }
  .agent-row { display: flex; align-items: center; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
  .dot.on  { background: var(--green); box-shadow: 0 0 6px var(--green); }
  .dot.off { background: var(--dim2); }
  .agent-name { font-family: var(--mono); font-weight: 700; font-size: 13px; }
  .agent-transport { font-family: var(--mono); font-size: 10px; color: var(--dim2); margin-top: 4px; word-break: break-all; }
  .caps { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 5px; }
  .cap {
    font-size: 10px; font-family: var(--mono);
    background: var(--panel2); border: 1px solid var(--border);
    padding: 1px 5px; border-radius: 3px; color: var(--dim);
  }

  /* CENTER — transcript */
  #transcript { padding: 6px 0; }
  .row {
    margin: 2px 10px; padding: 6px 10px;
    background: var(--panel); border: 1px solid var(--border); border-radius: 5px;
    cursor: pointer;
  }
  .row.thread { margin-left: 26px; border-left: 2px solid var(--blue); }
  .row .head {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    font-size: 12px;
  }
  .id   { font-family: var(--mono); color: var(--dim2); }
  .ts   { font-family: var(--mono); color: var(--dim); }
  .from, .to { font-family: var(--mono); font-weight: 700; }
  .arrow { color: var(--dim2); }
  .badge {
    font-family: var(--mono); font-size: 10px;
    padding: 1px 6px; border-radius: 3px; text-transform: uppercase;
    border: 1px solid transparent;
  }
  .badge.kind-task,
  .badge.kind-request_aid,
  .badge.kind-deliver       { background: #0d2a4a; color: var(--blue);   border-color: #1f3a5e; }
  .badge.kind-response,
  .badge.kind-summary       { background: #0d2818; color: var(--green);  border-color: #1f3a25; }
  .badge.kind-error         { background: #3a0d0d; color: var(--red);    border-color: #5a1f1f; }
  .badge.kind-presence,
  .badge.kind-join,
  .badge.kind-leave         { background: #1c232c; color: var(--dim);    border-color: var(--border); }
  .badge.kind-broadcast     { background: #2a0d3a; color: var(--purple); border-color: #4a1f5e; }
  .preview {
    margin-top: 4px; font-size: 12px; color: var(--text);
    overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    white-space: pre-wrap; word-break: break-word;
  }
  .row.expanded .preview { display: block; -webkit-line-clamp: unset; }
  .details {
    margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border);
    font-family: var(--mono); font-size: 11px; color: var(--dim);
    display: none; white-space: pre-wrap; word-break: break-word;
  }
  .row.expanded .details { display: block; }
  .details b { color: var(--text); font-weight: 600; }

  /* RIGHT — pending inboxes */
  .inbox-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; border-bottom: 1px solid var(--border);
    cursor: pointer; font-size: 13px;
  }
  .inbox-row:hover { background: var(--panel); }
  .inbox-row .name { font-family: var(--mono); font-weight: 700; }
  .inbox-row .count {
    font-family: var(--mono); font-size: 11px; min-width: 22px; text-align: center;
    background: var(--panel2); border: 1px solid var(--border);
    padding: 1px 6px; border-radius: 10px; color: var(--dim);
  }
  .inbox-row .count.nz { background: #1f3a5e; border-color: var(--blue); color: var(--blue); }
  #inboxBody { padding: 6px 10px; }
  #inboxBody .ie {
    background: var(--panel); border: 1px solid var(--border); border-radius: 4px;
    margin-bottom: 6px; padding: 6px 8px; font-family: var(--mono); font-size: 11px;
    white-space: pre-wrap; word-break: break-word;
  }
  #inboxBody .ie .head { color: var(--dim); margin-bottom: 4px; }

  @media (max-width: 900px) {
    #grid {
      grid-template-columns: 220px 1fr;
      grid-template-rows: 1fr auto;
      height: auto;
    }
    #grid > .col:nth-child(3) {
      grid-column: 1 / -1;
      max-height: 300px;
    }
  }

  .empty { padding: 20px; color: var(--dim); font-size: 13px; text-align: center; }
</style>
</head>
<body>

<div id="topbar">
  <span class="stat"><b id="statEnv">0</b> envelopes</span>
  <span class="stat"><b id="statPeers">0</b> peers</span>
  <span class="stat" id="statLatency">—</span>
  <input id="search" type="search" placeholder="filter by from / to / kind / body…">
  <button id="btnPause">⏸ Pause</button>
  <button id="btnSound">🔔 Sound off</button>
</div>

<div id="grid">
  <div class="col">
    <h2>Agents</h2>
    <div id="roster"></div>
  </div>
  <div class="col">
    <h2 id="centerHeader">Transcript</h2>
    <div id="transcript"><div class="empty">waiting for envelopes…</div></div>
  </div>
  <div class="col">
    <h2>Pending inboxes</h2>
    <div id="inboxList"></div>
    <div id="inboxBody"></div>
  </div>
</div>

<script>
(() => {
  // Stable per-agent color via simple hash → HSL.
  function colorFor(name) {
    if (!name) return '#e6edf3';
    let h = 2166136261 >>> 0;
    for (let i = 0; i < name.length; i++) {
      h ^= name.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const hue = h % 360;
    return 'hsl(' + hue + ', 65%, 70%)';
  }

  function shortId(id) { return id ? String(id).slice(0, 8) : '????????'; }
  function fmtTs(ts) {
    if (!ts) return '--:--:--';
    const d = new Date(ts);
    if (isNaN(+d)) return String(ts).slice(11, 19);
    return d.toISOString().slice(11, 19);
  }
  function bodyPreview(body) {
    if (body == null) return '';
    if (typeof body === 'string') return body;
    try { return JSON.stringify(body); } catch { return String(body); }
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── State ────────────────────────────────────────────────────
  const state = {
    seen: new Map(),     // id -> envelope
    order: [],           // ids, newest-first
    presence: { agents: {} },
    inboxCounts: {},
    selectedAgent: null, // filter
    selectedInbox: null,
    paused: false,
    sound: false,
    search: '',
    lastTs: null,
  };

  // ── DOM refs ─────────────────────────────────────────────────
  const $roster      = document.getElementById('roster');
  const $transcript  = document.getElementById('transcript');
  const $inboxList   = document.getElementById('inboxList');
  const $inboxBody   = document.getElementById('inboxBody');
  const $centerHdr   = document.getElementById('centerHeader');
  const $statEnv     = document.getElementById('statEnv');
  const $statPeers   = document.getElementById('statPeers');
  const $statLatency = document.getElementById('statLatency');
  const $search      = document.getElementById('search');
  const $btnPause    = document.getElementById('btnPause');
  const $btnSound    = document.getElementById('btnSound');

  // ── Audio blip ───────────────────────────────────────────────
  let audioCtx = null;
  function blip() {
    if (!state.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 600; o.type = 'sine';
      g.gain.value = 0.04;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.08);
    } catch {}
  }

  // ── Roster render ────────────────────────────────────────────
  function renderRoster() {
    const agents = state.presence.agents || {};
    const names = Object.keys(agents);
    if (!names.length) { $roster.innerHTML = '<div class="empty">no presence</div>'; return; }
    $roster.innerHTML = names.map(name => {
      const a = agents[name] || {};
      const active = state.selectedAgent === name ? 'active' : '';
      const col = colorFor(name);
      const caps = (a.capabilities || []).map(c => '<span class="cap">' + escapeHtml(c) + '</span>').join('');
      return '<div class="agent-card ' + active + '" data-agent="' + escapeHtml(name) + '">' +
               '<div class="agent-row">' +
                 '<span class="dot ' + (a.online ? 'on' : 'off') + '"></span>' +
                 '<span class="agent-name" style="color:' + col + '">' + escapeHtml(name) + '</span>' +
               '</div>' +
               '<div class="caps">' + caps + '</div>' +
               '<div class="agent-transport">' + escapeHtml(a.transport || '') + '</div>' +
             '</div>';
    }).join('');
    [...$roster.querySelectorAll('.agent-card')].forEach(el => {
      el.addEventListener('click', () => {
        const a = el.dataset.agent;
        state.selectedAgent = state.selectedAgent === a ? null : a;
        $centerHdr.textContent = state.selectedAgent
          ? 'Transcript — filter: ' + state.selectedAgent
          : 'Transcript';
        renderRoster();
        rerenderTranscript();
      });
    });
  }

  // ── Inbox list render ────────────────────────────────────────
  function renderInboxList() {
    const counts = state.inboxCounts || {};
    const names = Object.keys(counts).sort();
    if (!names.length) { $inboxList.innerHTML = '<div class="empty">no inboxes</div>'; return; }
    $inboxList.innerHTML = names.map(name => {
      const n = counts[name] || 0;
      return '<div class="inbox-row" data-addr="' + escapeHtml(name) + '">' +
               '<span class="name" style="color:' + colorFor(name) + '">' + escapeHtml(name) + '</span>' +
               '<span class="count ' + (n > 0 ? 'nz' : '') + '">' + n + '</span>' +
             '</div>';
    }).join('');
    [...$inboxList.querySelectorAll('.inbox-row')].forEach(el => {
      el.addEventListener('click', () => {
        const addr = el.dataset.addr;
        state.selectedInbox = addr;
        loadInbox(addr);
      });
    });
  }

  async function loadInbox(addr) {
    $inboxBody.innerHTML = '<div class="empty">loading ' + escapeHtml(addr) + '…</div>';
    try {
      const r = await fetch('/api/inbox/' + encodeURIComponent(addr));
      const data = await r.json();
      if (!Array.isArray(data) || !data.length) {
        $inboxBody.innerHTML = '<div class="empty">' + escapeHtml(addr) + ' inbox empty</div>';
        return;
      }
      $inboxBody.innerHTML = data.map(env => {
        const head = '<div class="head">' +
          shortId(env.id) + ' · ' + escapeHtml(fmtTs(env.ts)) + ' · ' +
          '<span style="color:' + colorFor(env.from) + '">' + escapeHtml(env.from || '?') + '</span>' +
          ' → <span style="color:' + colorFor(env.to) + '">' + escapeHtml(env.to || '?') + '</span> · ' +
          escapeHtml(env.kind || '') + '</div>';
        return '<div class="ie">' + head + escapeHtml(bodyPreview(env.body)) + '</div>';
      }).join('');
    } catch (e) {
      $inboxBody.innerHTML = '<div class="empty">error loading inbox</div>';
    }
  }

  // ── Transcript render ───────────────────────────────────────
  function envMatchesFilter(env) {
    if (state.selectedAgent) {
      if (env.from !== state.selectedAgent && env.to !== state.selectedAgent) return false;
    }
    const q = state.search.trim().toLowerCase();
    if (q) {
      const hay = [env.from, env.to, env.kind, bodyPreview(env.body)]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function buildRow(env) {
    const sid    = shortId(env.id);
    const ts     = fmtTs(env.ts);
    const fromC  = colorFor(env.from);
    const toC    = colorFor(env.to);
    const kind   = env.kind || 'unknown';
    const isThread = !!env.replyTo && state.seen.has(env.replyTo);
    const preview = bodyPreview(env.body).slice(0, 140);

    const detailObj = {
      id: env.id, replyTo: env.replyTo, trace: env.trace,
      room: env.room, ttl: env.ttl,
      capabilities: env.capabilities || [],
      body: env.body,
    };

    const row = document.createElement('div');
    row.className = 'row' + (isThread ? ' thread' : '');
    row.dataset.id = env.id;
    row.innerHTML =
      '<div class="head">' +
        '<span class="id">' + escapeHtml(sid) + '</span>' +
        '<span class="ts">' + escapeHtml(ts) + '</span>' +
        '<span class="from" style="color:' + fromC + '">' + escapeHtml(env.from || '?') + '</span>' +
        '<span class="arrow">→</span>' +
        '<span class="to" style="color:' + toC + '">' + escapeHtml(env.to || '?') + '</span>' +
        '<span class="badge kind-' + escapeHtml(kind) + '">' + escapeHtml(kind) + '</span>' +
      '</div>' +
      '<div class="preview">' + escapeHtml(preview) + '</div>' +
      '<div class="details">' + escapeHtml(JSON.stringify(detailObj, null, 2)) + '</div>';
    row.addEventListener('click', () => row.classList.toggle('expanded'));
    return row;
  }

  function rerenderTranscript() {
    // Full re-render path used only on filter changes; otherwise we append.
    $transcript.innerHTML = '';
    let any = false;
    for (const id of state.order) {
      const env = state.seen.get(id);
      if (!env) continue;
      if (!envMatchesFilter(env)) continue;
      $transcript.appendChild(buildRow(env));
      any = true;
    }
    if (!any) $transcript.innerHTML = '<div class="empty">no matching envelopes</div>';
  }

  function appendNew(env) {
    if (!env || !env.id || state.seen.has(env.id)) return false;
    state.seen.set(env.id, env);
    state.order.unshift(env.id);
    state.lastTs = env.ts || state.lastTs;
    if (envMatchesFilter(env)) {
      // remove "no matching" placeholder if present
      const placeholder = $transcript.querySelector('.empty');
      if (placeholder) placeholder.remove();
      $transcript.insertBefore(buildRow(env), $transcript.firstChild);
    }
    return true;
  }

  // ── Top-bar stats ────────────────────────────────────────────
  function updateStats() {
    $statEnv.textContent = state.seen.size;
    const peers = Object.values(state.presence.agents || {}).filter(a => a && a.online).length;
    $statPeers.textContent = peers;
    if (state.lastTs) {
      const ms = Date.now() - new Date(state.lastTs).getTime();
      if (isFinite(ms) && ms >= 0) {
        const s = Math.floor(ms / 1000);
        $statLatency.textContent = s < 60 ? s + 's ago'
          : s < 3600 ? Math.floor(s / 60) + 'm ago'
          : Math.floor(s / 3600) + 'h ago';
      } else $statLatency.textContent = '—';
    } else $statLatency.textContent = '—';
  }

  // ── Polling ──────────────────────────────────────────────────
  async function pollOnce() {
    if (state.paused) return;
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      state.presence = data.presence || state.presence;
      state.inboxCounts = data.inbox_counts || {};
      // diff transcript: append only new ids
      let appended = 0;
      for (const env of (data.recent || [])) {
        if (appendNew(env)) appended++;
      }
      renderRoster();
      renderInboxList();
      updateStats();
      if (appended > 0) blip();
    } catch {/* tolerate transient fetch error */}
  }

  // ── Topbar wiring ────────────────────────────────────────────
  $search.addEventListener('input', () => {
    state.search = $search.value;
    rerenderTranscript();
  });
  $btnPause.addEventListener('click', () => {
    state.paused = !state.paused;
    $btnPause.textContent = state.paused ? '▶ Resume' : '⏸ Pause';
    $btnPause.classList.toggle('on', state.paused);
  });
  $btnSound.addEventListener('click', () => {
    state.sound = !state.sound;
    $btnSound.textContent = state.sound ? '🔔 Sound on' : '🔔 Sound off';
    $btnSound.classList.toggle('on', state.sound);
  });

  // ── Boot ─────────────────────────────────────────────────────
  pollOnce();
  setInterval(pollOnce, 2000);
})();
</script>
</body>
</html>`;

// ─── run as script ─────────────────────────────────────────────────────────
// Only start listening when this file is executed directly, NOT when imported.
const isMain = (() => {
  try {
    if (!process.argv[1]) return false;
    const argvUrl = new URL('file://' + path.resolve(process.argv[1])).href;
    return import.meta.url === argvUrl;
  } catch { return false; }
})();

if (isMain) {
  startServer();
}

export { startServer, readPresence, readTranscript, readInbox, inboxCounts, findEnvelopeById, PANEL_HTML };
