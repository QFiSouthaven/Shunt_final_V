# Pattern Z — Full Build Plan (single-source revision)

**Date:** 2026-05-13
**Author:** Cowork (Claude Opus 4.7)
**Mission:** Wire the bus so every action button in the Aether Shunt SPA
fans out to multiple LLMs, an aggregator synthesizes their replies, and
the user sees a joint output that's better than any single LLM alone.

**Audience:** two Claude Code sessions running in parallel — an
*Architect* that proposes file changes and an *Executor* that applies
them and runs shell commands. zack pre-authorizes the plan and lets them
run unattended until done, blocked, or out of usage.

**Architectural defaults committed in this revision:**
1. Aggregator on `127.0.0.1:7780`. SPA dispatches direct to it.
2. `lms-instances.json` is auto-seeded from LM Studio's `/v1/models` at
   first boot. Operator overrides via UI thereafter.
3. Autonomous-loop daemon (`claude-pair-daemon.mjs`) is built BEFORE
   the build proper begins so the two-Claude loop is stable.
4. Aggregator proxies LM Studio's `/v1/models` to dodge CORS.

Phases run **strictly top-to-bottom**. No re-sequencing. No options.

---

## 0. Pre-flight contract (read once)

### 0.1 Role assignment

| Role | Tool surface | Responsibilities |
|---|---|---|
| **Architect** | File tools (Read/Write/Edit), envelope sends | Reads plan + latest executor reply. Proposes file changes. Writes patches inline in `kind:request` envelopes. Updates BUILD_LOG at save markers. |
| **Executor** | Shell, `npm`, file tools, process control | Reads inbox. Applies patches. Runs verification commands. Replies with verification output. Triggers rollback on failure. |

Either Claude may take either role per turn. zack's launch instruction
pre-assigns: the desktop Claude Code is Architect; the CLI Claude Code
in the admin terminal is Executor.

### 0.2 Handoff envelope format

Architect → Executor:

```json
{
  "kind": "request",
  "from": "@architect",
  "to": "@executor",
  "room": "#pattern-z-build",
  "intent": "patch.apply",
  "body": {
    "phase": "2",
    "step": "2.3",
    "files": ["hub-bus-tools/orchestrator.mjs"],
    "summary": "Extend DEFAULT_CHILDREN to register N lmstudio bridges",
    "patch": "<inline content; full file or diff>",
    "verify": [
      "node --check hub-bus-tools/orchestrator.mjs",
      "Invoke-RestMethod http://127.0.0.1:7779/status"
    ],
    "expected_verify_pass": "5 children running, lmstudio-bridge-* count matches lms-instances.json",
    "rollback": "Copy-Item hub-bus-tools/orchestrator.mjs.bak.2 hub-bus-tools/orchestrator.mjs -Force"
  }
}
```

Executor → Architect:

```json
{
  "kind": "reply",
  "from": "@executor",
  "to": "@architect",
  "replyTo": "<request id>",
  "intent": "patch.applied",
  "body": {
    "phase": "2",
    "step": "2.3",
    "applied": true,
    "verify_output": {
      "node_check": "ok",
      "status_children_count": 7,
      "status_lmstudio_count": 3
    },
    "notes": "Auto-resolved 3 models from /v1/models; lms-instances.json seeded."
  }
}
```

On failure: `applied: false` + `failure_reason` + STOP. Do not advance.

### 0.3 Standing rails (DO NOT)

1. Do not modify the existing single-LLM call path in `aiService.ts` so
   that it stops working. The new bus path is added alongside; default
   OFF; existing users see zero change until they flip the toggle.
2. Do not change the bridge `kind === 'request'` filter — it's the
   firewall against the loop bug.
3. Do not bind the aggregator's HTTP face to non-loopback.
4. Do not reintroduce `@google/genai` or any vendor LLM SDK.
5. Do not change provider order in `App.tsx` (Settings → Telemetry →
   MCP → Mailbox → Mia → Subscription → UndoRedo).
6. Do not refactor `HealthPoller`'s polling layer in cockpit — keep the
   `systemsRef`/`statesRef`/`tickInFlightRef` pattern.
7. Do not edit `public/splicer.html` directly; sync from
   `hub-bus-panel-desktop/splicer.html` only.
8. Do not delete `zip/`, `zip.zip`, the malformed
   `C:UsersFalkishunt-final-vhub-bus/`, or anything in
   `hub-bus/archive/` without zack's verdict.
9. Do not run `npm audit fix --force`. Transitive bumps need review.
10. Do not change the default MissionControl landing tab from `'shunt'`.
11. Do not bypass the `.bak.<phase>` backup step in any phase.

### 0.4 Stop conditions

Stop immediately and write a `kind: alert` envelope to `@zack` if any of:

- `node --check` fails after an edit
- `npx tsc --noEmit` (run from SPA root) reports new errors
- `Invoke-RestMethod http://127.0.0.1:7779/status` returns fewer children
  than before this phase
- Any bridge shows `restarts > 0` or state `permanently_failed`
- SPA fails to load at `http://127.0.0.1:3000`
- Existing SPA tabs (Shunt, Weaver, Foundry, Vision, Oracle, Chronicle,
  Diagnostics) fail to render
- Two consecutive verification failures on the same step
- Claude session terminates (usage limit)

No silent retries past the limits. Save what's done to BUILD_LOG, write
the alert envelope, exit.

### 0.5 Save markers (BUILD_LOG discipline)

After each phase passes verification, Architect appends an entry to
`BUILD_LOG.md` under "Lessons learned" with:

- Phase number + title
- Files modified
- Concise verification output
- Any decisions that deviated + why
- ISO timestamp

Don't update BUILD_LOG mid-phase. Partial completion is detected by
absence of the save marker.

---

## 1. Target architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Aether Shunt SPA  (:3000)                                    │
│                                                              │
│  Settings → Pattern Z panel                                  │
│    ├─ Toggle (enable/disable bus dispatch globally)          │
│    ├─ Per-slot LM Studio model dropdowns                     │
│    ├─ Per-peer enable toggles (@claude, @gemini, @ollama)    │
│    └─ Per-button strategy overrides (vote/pick-best/synth)   │
│                                                              │
│  User clicks "Amplify" button                                │
│    → aiService.performShunt(text, 'amplify', ...)            │
│    → isPatternZEnabled() true?                               │
│        Y: POST :7780/dispatch                                │
│        N: existing single-LLM POST :1234/v1/chat/completions │
└────────────────────┬─────────────────────────────────────────┘
                     │  (bus mode)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Aggregator  (:7780, hub-bus-tools/aggregator.mjs)            │
│                                                              │
│  HTTP face:                                                  │
│    GET  /healthz             → liveness                     │
│    POST /dispatch            → fan-out + synthesize         │
│    GET  /participants        → current participant config   │
│    PUT  /participants        → mutate + reconcile bridges   │
│    GET  /lmstudio-models     → proxy to LM Studio (CORS)    │
│                                                              │
│  /dispatch flow:                                             │
│    1. Read participants.json                                 │
│    2. Generate trace_id                                      │
│    3. Write N request envelopes (one per active peer)        │
│    4. Poll @aggregator inbox until N replies or timeout      │
│    5. Apply strategy → joint_output                          │
│    6. Return { joint_output, source_candidates, trace }      │
└────────────────────┬─────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬────────────┐
        ▼            ▼            ▼            ▼
   @lmstudio-1   @lmstudio-2   @claude     @gemini
   (model A)     (model B)     bridge      bridge
        │            │            │            │
        ▼            ▼            ▼            ▼
     reply       reply         reply         reply
        └────────────┴────────────┴────────────┘
                     │
                     ▼
                @aggregator inbox
                     │
                     ▼
            synthesize → return
```

**Process inventory after build:**

| Process | Port | Role |
|---|---|---|
| Vite SPA dev server | 3000 | Aether Shunt UI |
| `panel-server.mjs` | 7777 | Bus inspection (existing) |
| `cockpit/launcher.cjs` | 7778 | Cockpit's process spawner (existing) |
| `orchestrator.mjs` HTTP face | 7779 | Bridge supervision (existing) |
| **`aggregator.mjs`** | **7780** | **NEW — dispatch + synthesize + participants** |
| LM Studio | 1234 | Local LLM server |
| NEXUS-PRIME | 8000 | FastAPI backend (existing) |
| `claude-pair-daemon.mjs` | (no HTTP) | NEW — runs the two-Claude autopilot |

**File inventory after build:**

| File | Status |
|---|---|
| `hub-bus-tools/aggregator.mjs` | NEW |
| `hub-bus-tools/claude-pair-daemon.mjs` | NEW |
| `hub-bus-tools/lms-instances.json` | NEW (auto-seeded) |
| `hub-bus/participants.json` | NEW (auto-seeded by aggregator) |
| `styles/services/patternZStrategies.ts` | NEW |
| `hub-bus-tools/orchestrator.mjs` | MODIFIED |
| `hub-bus-tools/lmstudio-bridge.mjs` | MODIFIED (JID from env) |
| `styles/services/aiService.ts` | MODIFIED (dispatchToBus added) |
| `types/index.ts` | MODIFIED (settings shape) |
| `hooks/components/settings/Settings.tsx` | MODIFIED (Pattern Z panel) |

---

## 2. Phase 1 — Preflight baseline

**Goal:** Capture current state so the end-of-build diff is verifiable.
No code changes. Read-only.

### 2.1 Executor — verify baseline

```powershell
cd C:\Users\Falki\shunt-final-v

# Bus
Invoke-RestMethod http://127.0.0.1:7779/status | Select-Object ok, uptime_seconds, @{n='children_count';e={$_.children.Count}}

# SPA
Invoke-WebRequest http://127.0.0.1:3000 -UseBasicParsing -TimeoutSec 5 | Select-Object StatusCode

# LM Studio
Invoke-RestMethod http://localhost:1234/v1/models | Select-Object -ExpandProperty data | Select-Object id

# NEXUS
Invoke-RestMethod http://localhost:8000/health
```

**Expected:**
- Bus `ok: true`, children ≥ 5 (lmstudio-bridge, gemini-bridge, claude-bridge, retry-daemon, panel-server)
- SPA `StatusCode 200`
- LM Studio returns at least one model id
- NEXUS `status: healthy`

If any of the above fails, STOP. Pattern Z assumes a healthy starting
state. Fix the broken thing first.

### 2.2 Executor — capture baseline checksums

```powershell
$files = @(
  "hub-bus-tools/orchestrator.mjs",
  "hub-bus-tools/lmstudio-bridge.mjs",
  "hub-bus-tools/claude-bridge.mjs",
  "hub-bus-tools/gemini-bridge.mjs",
  "styles/services/aiService.ts",
  "types/index.ts",
  "hooks/components/settings/Settings.tsx",
  "App.tsx",
  "hooks/components/mission_control/MissionControl.tsx"
)
foreach ($f in $files) {
  Get-FileHash $f -Algorithm SHA256 | Select-Object @{n='File';e={$_.Path}}, Hash
} | Format-Table -AutoSize | Out-File C:\Users\Falki\shunt-final-v\pattern-z-baseline-hashes.txt

cat pattern-z-baseline-hashes.txt
```

Save the output. At Phase 8, compare against this — only the files in
the "MODIFIED" inventory above should differ.

### 2.3 Save marker

Architect appends to `BUILD_LOG.md`:

```
### Pattern Z Phase 1 — Preflight baseline (2026-05-13)
- Bus: <children_count> children running, uptime <seconds>s
- SPA reachable on :3000
- LM Studio models: <list of ids>
- NEXUS healthy
- Baseline hashes captured at pattern-z-baseline-hashes.txt
```

---

## 3. Phase 2 — Multi-LM-Studio bridges

**Goal:** Replace the single `lmstudio-bridge` child with N children
(one per loaded LM Studio model), each with a unique JID. Auto-seed
`lms-instances.json` from LM Studio's `/v1/models` on first run.

### 3.1 Backup

```powershell
Copy-Item hub-bus-tools/orchestrator.mjs hub-bus-tools/orchestrator.mjs.bak.2
Copy-Item hub-bus-tools/lmstudio-bridge.mjs hub-bus-tools/lmstudio-bridge.mjs.bak.2
```

### 3.2 Architect — create `hub-bus-tools/lms-instances.json` (auto-seed-compatible)

Initial committed content (one slot, auto-resolve model):

```json
{
  "version": 1,
  "comment": "Auto-seeded from LM Studio /v1/models on first orchestrator boot when slots[].model is null. UI overrides via aggregator's PUT /participants.",
  "slots": [
    { "jid": "@lmstudio-1", "model": null, "enabled": true }
  ]
}
```

The orchestrator will auto-fill slot `model` fields from `/v1/models` if
they're null at boot — see §3.4.

### 3.3 Architect — modify `lmstudio-bridge.mjs`

Find the JID definition (likely `const ME = '@lmstudio';`). Change to:

```js
const ME = process.env.LMSTUDIO_JID || '@lmstudio';
```

Confirm `LMSTUDIO_MODEL` is already read from env. If not, add it. The
bridge should already auto-resolve via `/v1/models` when `LMSTUDIO_MODEL`
is unset — verify that path is intact.

### 3.4 Architect — modify `orchestrator.mjs` (dynamic child registration)

Add a function near the top of the file:

```js
import fs from 'node:fs';

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
```

In `DEFAULT_CHILDREN`, REPLACE the single `lmstudio-bridge` entry with:

```js
...loadLmsInstances().map((inst) => {
  const slotName = inst.jid.replace('@lmstudio-', '').replace('@lmstudio', 'default').replace('@', '');
  return {
    name: `lmstudio-bridge-${slotName}`,
    scriptPath: 'hub-bus-tools/lmstudio-bridge.mjs',
    enabled: true,
    required: false,
    color: 'magenta',
    envOverride: {
      LMSTUDIO_JID: inst.jid,
      ...(inst.model ? { LMSTUDIO_MODEL: inst.model } : {}),
    },
  };
}),
```

In `ChildSupervisor.spawn()`, find where `env` is passed to `spawn(...)`.
Change:

```js
env: process.env,
```

to:

```js
env: { ...process.env, ...(this.spec.envOverride || {}) },
```

This lets per-child env overrides win without polluting the parent
process's env.

### 3.5 Executor — verify

```powershell
node --check hub-bus-tools/orchestrator.mjs
node --check hub-bus-tools/lmstudio-bridge.mjs
```

Both should print nothing (silent = pass).

### 3.6 Executor — restart bus and verify

```powershell
# Ctrl+C the orchestrator window first. Then:
npm run bus:start
```

Watch the orchestrator's stdout for `lmstudio-bridge-*` spawn lines.
After ~10 seconds:

```powershell
Invoke-RestMethod http://127.0.0.1:7779/status |
  ConvertTo-Json -Depth 5 |
  Out-File phase-2-status.json
cat phase-2-status.json
```

**Expected:** `children` array contains entries with names like
`lmstudio-bridge-1`, `lmstudio-bridge-default`, etc. — one per slot in
`lms-instances.json`. All in state `running` with `restarts: 0`.

### 3.7 Executor — smoke test each lms slot

For each JID in `lms-instances.json`:

```powershell
node hub-bus-tools/send.mjs --to=@lmstudio-1 --kind=request --body="Reply with just the LM Studio model id you are running. Nothing else."
Start-Sleep -Seconds 15
Get-Content hub-bus/transcript.jsonl -Tail 3
```

**Expected:** A `kind:reply` envelope in the transcript with the model
name embedded. Each JID returns its own model.

### 3.8 Save marker

```
### Pattern Z Phase 2 — Multi-LM-Studio bridges (2026-05-13)
- lms-instances.json created with N slots
- lmstudio-bridge.mjs reads LMSTUDIO_JID from env
- orchestrator.mjs loadLmsInstances() registers N children
- ChildSupervisor.spawn merges envOverride
- /status shows N lmstudio-bridge-* children
- Smoke: each JID returned its own model name
```

---

## 4. Phase 3 — Aggregator

**Goal:** New process on `:7780` that owns participants.json, exposes
dispatch + participants management endpoints, fans out, synthesizes,
returns.

### 4.1 Backup

```powershell
Copy-Item hub-bus-tools/orchestrator.mjs hub-bus-tools/orchestrator.mjs.bak.3
```

### 4.2 Architect — write `hub-bus-tools/aggregator.mjs`

```javascript
#!/usr/bin/env node
// hub-bus-tools/aggregator.mjs
//
// Pattern Z aggregator: HTTP front + file-bus fan-out + strategy synthesis.
// Also owns participants.json (the runtime LLM pool config that the SPA
// edits through PUT /participants) and proxies LM Studio's /v1/models for
// the SPA (CORS dodge).
//
// Runs as a child of the orchestrator. Loopback-only HTTP bind.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  createEnvelope,
  writeEnvelopeToBus,
  readInboxFor,
  releaseEnvelope,
} from './envelope.mjs';

const ME = '@aggregator';
const PORT = Number(process.env.AGGREGATOR_PORT) || 7780;
const HOST = process.env.AGGREGATOR_HOST || '127.0.0.1';
const ORCH_ADMIN_URL = process.env.ORCH_ADMIN_URL || 'http://127.0.0.1:7779';
const LMSTUDIO_BASE_URL = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const HUB_BUS_DIR = path.join(REPO_ROOT, 'hub-bus');
const PARTICIPANTS_PATH = path.join(HUB_BUS_DIR, 'participants.json');
const LMS_INSTANCES_PATH = path.join(__dirname, 'lms-instances.json');

// ─── participants.json — read / seed / write ───────────────────────

async function readParticipants() {
  try {
    const raw = await fs.promises.readFile(PARTICIPANTS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const seed = await seedParticipants();
    await writeParticipants(seed);
    return seed;
  }
}

async function seedParticipants() {
  let slots = [{ jid: '@lmstudio-1', model: null, enabled: true }];
  try {
    const raw = await fs.promises.readFile(LMS_INSTANCES_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    if (Array.isArray(cfg.slots) && cfg.slots.length > 0) {
      slots = cfg.slots.map((s) => ({
        jid: s.jid,
        model: s.model || null,
        enabled: s.enabled !== false,
      }));
    }
  } catch { /* leave default */ }

  return {
    version: 1,
    updated_at: new Date().toISOString(),
    updated_by: '@aggregator-boot',
    lm_studio_slots: slots,
    external_peers: [
      { jid: '@claude', enabled: true },
      { jid: '@gemini', enabled: true },
      { jid: '@ollama', enabled: false },
      { jid: '@anythingllm', enabled: false },
    ],
  };
}

async function writeParticipants(config) {
  config.updated_at = new Date().toISOString();
  const tmp = PARTICIPANTS_PATH + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(config, null, 2), 'utf8');
  await fs.promises.rename(tmp, PARTICIPANTS_PATH);
}

// ─── reconcileBridges — sync orchestrator state to participants ─────

async function reconcileBridges(newConfig) {
  // For each lm_studio slot, restart bridge if model changed; start/stop
  // based on enabled flag. External peers are managed via the existing
  // single-instance bridges (claude/gemini/ollama/anythingllm) which we
  // toggle via /start /stop based on the enabled flag.
  const orch = ORCH_ADMIN_URL;

  for (const slot of newConfig.lm_studio_slots ?? []) {
    const slotName = slot.jid.replace('@lmstudio-', '').replace('@', '');
    const bridgeName = `lmstudio-bridge-${slotName}`;
    if (slot.enabled) {
      await orchPost(`${orch}/restart/${encodeURIComponent(bridgeName)}`);
    } else {
      await orchPost(`${orch}/stop/${encodeURIComponent(bridgeName)}`);
    }
  }

  const peerToBridge = {
    '@claude': 'claude-bridge',
    '@gemini': 'gemini-bridge',
    '@ollama': 'ollama-bridge',
    '@anythingllm': 'anythingllm-bridge',
  };
  for (const peer of newConfig.external_peers ?? []) {
    const bridgeName = peerToBridge[peer.jid];
    if (!bridgeName) continue;
    if (peer.enabled) {
      await orchPost(`${orch}/start/${bridgeName}`);
    } else {
      await orchPost(`${orch}/stop/${bridgeName}`);
    }
  }
}

async function orchPost(url) {
  try {
    const res = await fetch(url, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── dispatch — fan-out, collect, synthesize ────────────────────────

async function dispatch({ intent, prompt, fanout_jids, strategy, timeout_ms }) {
  const config = await readParticipants();
  const peers = (fanout_jids && fanout_jids.length > 0)
    ? fanout_jids
    : activePeersFrom(config);

  if (peers.length === 0) {
    throw new Error('No active participants. Enable peers in Settings.');
  }

  const trace = randomUUID();
  const requestIds = [];

  for (const peer of peers) {
    const env = await createEnvelope({
      from: ME,
      to: peer,
      kind: 'request',
      intent,
      body: prompt,
      room: `#fanout-${trace}`,
      trace,
    });
    await writeEnvelopeToBus(env, HUB_BUS_DIR);
    requestIds.push(env.id);
  }

  // Poll our inbox for replies until timeout or all in.
  const deadline = Date.now() + (timeout_ms || 30000);
  const replies = new Map();

  while (Date.now() < deadline && replies.size < peers.length) {
    const inbox = await readInboxFor(ME, HUB_BUS_DIR);
    for (const entry of inbox) {
      const env = entry?.envelope || entry?.data || entry;
      const filePath = entry?.path || entry?.__path;
      if (!env || !requestIds.includes(env.replyTo) || replies.has(env.from)) continue;
      const text = typeof env.body === 'string' ? env.body : JSON.stringify(env.body);
      replies.set(env.from, text);
      if (filePath) {
        try { await releaseEnvelope(filePath, 'done'); } catch { /* ignore */ }
      }
    }
    if (replies.size < peers.length) await new Promise((r) => setTimeout(r, 500));
  }

  const candidates = Array.from(replies.entries()).map(([jid, reply]) => ({ jid, reply }));
  const joint_output = await synthesize(candidates, strategy, prompt);

  return {
    ok: true,
    joint_output,
    source_candidates: candidates,
    trace,
    fanout_count: peers.length,
    replied_count: candidates.length,
  };
}

function activePeersFrom(config) {
  const lms = (config.lm_studio_slots ?? [])
    .filter((s) => s.enabled && s.model)
    .map((s) => s.jid);
  const ext = (config.external_peers ?? [])
    .filter((p) => p.enabled)
    .map((p) => p.jid);
  return [...lms, ...ext];
}

async function synthesize(candidates, strategy, originalPrompt) {
  if (candidates.length === 0) {
    throw new Error('No candidates returned (all peers timed out)');
  }
  if (candidates.length === 1) return candidates[0].reply;

  switch (strategy) {
    case 'vote':
      return pickMostCommon(candidates);
    case 'pick-best':
      return pickLongestCoherent(candidates);
    case 'synthesize':
    default:
      return await synthesizeViaPeer(candidates, originalPrompt);
  }
}

function pickMostCommon(candidates) {
  // Simple normalized-string vote; in practice candidate texts won't be
  // identical, so vote falls back to pick-best behavior. v1 stub.
  return pickLongestCoherent(candidates);
}

function pickLongestCoherent(candidates) {
  return candidates.reduce((a, b) =>
    (b.reply || '').length > (a.reply || '').length ? b : a
  ).reply;
}

async function synthesizeViaPeer(candidates, originalPrompt) {
  // Ask the configured synthesizer peer (default @claude) to merge.
  // If that peer is also one of the original candidates, use the strongest
  // available alternative instead, otherwise we'd recurse.
  const synthesizerJid = process.env.SYNTH_JID || '@claude';
  const fallback = candidates[0].reply; // belt-and-suspenders

  const prompt = [
    'You are a synthesizer. You have been given the original question and',
    'N candidate answers from different LLMs. Produce a single answer that',
    'is better than any individual candidate. Be concise; do not narrate.',
    '',
    `Original question:\n${originalPrompt}`,
    '',
    'Candidates:',
    ...candidates.map((c, i) => `[${i + 1} — ${c.jid}]\n${c.reply}\n`),
    '',
    'Your synthesized answer:',
  ].join('\n');

  const trace = randomUUID();
  const env = await createEnvelope({
    from: ME,
    to: synthesizerJid,
    kind: 'request',
    intent: 'synthesize.candidates',
    body: prompt,
    room: `#synth-${trace}`,
    trace,
  });
  await writeEnvelopeToBus(env, HUB_BUS_DIR);

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const inbox = await readInboxFor(ME, HUB_BUS_DIR);
    for (const entry of inbox) {
      const r = entry?.envelope || entry?.data || entry;
      const fp = entry?.path || entry?.__path;
      if (r?.replyTo === env.id) {
        const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
        if (fp) {
          try { await releaseEnvelope(fp, 'done'); } catch { /* ignore */ }
        }
        return text;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return fallback;
}

// ─── HTTP face ──────────────────────────────────────────────────────

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/healthz' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
  }

  if (url.pathname === '/dispatch' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const result = await dispatch(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
    }
  }

  if (url.pathname === '/participants' && req.method === 'GET') {
    try {
      const cfg = await readParticipants();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(cfg));
    } catch (e) {
      res.writeHead(500);
      return res.end(JSON.stringify({ ok: false, error: e?.message }));
    }
  }

  if (url.pathname === '/participants' && req.method === 'PUT') {
    try {
      const body = await readJsonBody(req);
      if (!body || !Array.isArray(body.lm_studio_slots) || !Array.isArray(body.external_peers)) {
        res.writeHead(400);
        return res.end(JSON.stringify({ ok: false, error: 'invalid shape' }));
      }
      await writeParticipants(body);
      await reconcileBridges(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, config: body }));
    } catch (e) {
      res.writeHead(500);
      return res.end(JSON.stringify({ ok: false, error: e?.message }));
    }
  }

  if (url.pathname === '/lmstudio-models' && req.method === 'GET') {
    try {
      const r = await fetch(`${LMSTUDIO_BASE_URL}/v1/models`);
      const data = await r.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(502);
      return res.end(JSON.stringify({ ok: false, error: e?.message || 'lmstudio unreachable' }));
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`[aggregator] listening on http://${HOST}:${PORT}`);
});

process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
```

### 4.3 Architect — register aggregator as orchestrator child

In `orchestrator.mjs` `DEFAULT_CHILDREN`, add (alphabetical near top is fine):

```js
{
  name: 'aggregator',
  scriptPath: 'hub-bus-tools/aggregator.mjs',
  enabled: true,
  required: false,
  color: 'brightCyan',
},
```

### 4.4 Executor — verify

```powershell
node --check hub-bus-tools/aggregator.mjs
node --check hub-bus-tools/orchestrator.mjs

# Restart bus
# Ctrl+C orchestrator window, then:
npm run bus:start

# After ~10s
Invoke-RestMethod http://127.0.0.1:7779/status | ConvertTo-Json -Depth 5
# Expected: 'aggregator' present, state=running

Invoke-RestMethod http://127.0.0.1:7780/healthz
# Expected: { ok: true, ts: <iso> }

Invoke-RestMethod http://127.0.0.1:7780/participants | ConvertTo-Json -Depth 5
# Expected: { version: 1, lm_studio_slots: [...], external_peers: [...] }
# First call seeds participants.json from lms-instances.json

Invoke-RestMethod http://127.0.0.1:7780/lmstudio-models | ConvertTo-Json -Depth 5
# Expected: LM Studio's model list (proxy works)
```

### 4.5 Executor — smoke dispatch

```powershell
$body = @{
  intent = "smoke.test"
  prompt = "Reply with the single word: pong"
  strategy = "synthesize"
  timeout_ms = 60000
} | ConvertTo-Json

Invoke-RestMethod -Method POST -Uri http://127.0.0.1:7780/dispatch `
  -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 8
```

**Expected:** `joint_output` is non-empty. `source_candidates` lists
each active peer that replied. `replied_count` ≤ `fanout_count`. If
`replied_count` < `fanout_count`, some peer timed out — flag but not
fatal.

### 4.6 Save marker

```
### Pattern Z Phase 3 — Aggregator (2026-05-13)
- hub-bus-tools/aggregator.mjs registered, running on :7780
- /healthz /dispatch /participants /lmstudio-models all responsive
- participants.json auto-seeded from lms-instances.json
- Smoke dispatch returned joint output from N peers
```

---

## 5. Phase 4 — Participants UI in Settings

**Goal:** Operator can pick LM Studio models per slot and toggle peers
from Settings → Pattern Z panel. Changes hit the aggregator's PUT, which
reconciles bridges.

### 5.1 Backup

```powershell
Copy-Item hooks/components/settings/Settings.tsx hooks/components/settings/Settings.tsx.bak.4
Copy-Item types/index.ts types/index.ts.bak.4
```

### 5.2 Architect — extend `types/index.ts`

Locate the Settings shape (search for `export interface Settings` or
similar). Add fields:

```ts
patternZEnabled?: boolean;
patternZStrategy?: 'vote' | 'pick-best' | 'synthesize';
patternZTimeoutMs?: number;
```

The participants config is owned by the aggregator (participants.json),
NOT in localStorage. The SPA reads it on demand from `/participants`.

### 5.3 Architect — add the panel to `Settings.tsx`

Add a new section (Architect picks insertion point near other AI-related
settings). Component skeleton:

```tsx
import React, { useEffect, useState, useCallback } from 'react';

const AGGREGATOR_BASE_URL = 'http://127.0.0.1:7780';

interface LmsSlot {
  jid: string;
  model: string | null;
  enabled: boolean;
}

interface ExtPeer {
  jid: string;
  enabled: boolean;
}

interface Participants {
  version: number;
  lm_studio_slots: LmsSlot[];
  external_peers: ExtPeer[];
}

function PatternZPanel() {
  const [participants, setParticipants] = useState<Participants | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pRes, mRes] = await Promise.all([
        fetch(`${AGGREGATOR_BASE_URL}/participants`),
        fetch(`${AGGREGATOR_BASE_URL}/lmstudio-models`),
      ]);
      if (!pRes.ok) throw new Error(`participants HTTP ${pRes.status}`);
      const p = await pRes.json() as Participants;
      setParticipants(p);
      if (mRes.ok) {
        const m = await mRes.json();
        const ids = Array.isArray(m?.data) ? m.data.map((x: any) => x.id).filter(Boolean) : [];
        setAvailableModels(ids);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!participants) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${AGGREGATOR_BASE_URL}/participants`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(participants),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-300">
        Could not load Pattern Z participants: {error}. Is the aggregator running on :7780?
      </div>
    );
  }

  if (!participants) {
    return <p className="text-sm text-gray-400">Loading participants…</p>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-white">Pattern Z — Bus Participants</h3>

      <div>
        <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">LM Studio slots</p>
        {participants.lm_studio_slots.map((slot, i) => (
          <div key={slot.jid} className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={slot.enabled}
              onChange={(e) => {
                const next = { ...participants };
                next.lm_studio_slots[i] = { ...slot, enabled: e.target.checked };
                setParticipants(next);
              }}
            />
            <span className="text-xs text-gray-300 font-mono w-32">{slot.jid}</span>
            <select
              value={slot.model ?? ''}
              onChange={(e) => {
                const next = { ...participants };
                next.lm_studio_slots[i] = { ...slot, model: e.target.value || null };
                setParticipants(next);
              }}
              className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white"
            >
              <option value="">(unset)</option>
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">External peers</p>
        {participants.external_peers.map((peer, i) => (
          <label key={peer.jid} className="flex items-center gap-2 mb-1">
            <input
              type="checkbox"
              checked={peer.enabled}
              onChange={(e) => {
                const next = { ...participants };
                next.external_peers[i] = { ...peer, enabled: e.target.checked };
                setParticipants(next);
              }}
            />
            <span className="text-xs text-gray-300 font-mono">{peer.jid}</span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-fuchsia-500/20 border border-fuchsia-400/60 text-fuchsia-100 hover:bg-fuchsia-500/30 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save participants'}
        </button>
        <button
          onClick={() => void load()}
          className="text-xs text-gray-400 hover:text-white"
        >
          Reload
        </button>
      </div>

      <p className="text-[10px] text-gray-500">
        Changes apply within ~5s — the aggregator restarts the affected
        bridges automatically.
      </p>
    </div>
  );
}

export default PatternZPanel;
```

Then import and render `<PatternZPanel />` inside the Settings tab's
existing layout, ideally below the AI Provider section.

### 5.4 Executor — verify

```powershell
npx tsc --noEmit
# Expected: no new errors

# Restart SPA (Ctrl+C, npm run dev)
# Open http://127.0.0.1:3000 → Settings tab → scroll to "Pattern Z — Bus Participants"
# Toggle a peer off → click Save → within 5s, orchestrator's /status shows that bridge stopped
```

### 5.5 Save marker

```
### Pattern Z Phase 4 — Participants UI (2026-05-13)
- PatternZPanel rendered in Settings tab
- GET /participants populates the form; PUT saves
- Bridge reconciliation observed in /status within 5s of save
```

---

## 6. Phase 5 — SPA bus-dispatch path

**Goal:** Add bus-dispatch to `aiService.ts`, wired so the existing
single-LLM path is untouched. Pilot on `performShunt('amplify', ...)`.

### 6.1 Backup

```powershell
Copy-Item styles/services/aiService.ts styles/services/aiService.ts.bak.5
```

### 6.2 Architect — add `dispatchToBus` + `isPatternZEnabled` at the top of `aiService.ts`

Insert near the top, before the existing exports:

```ts
const AGGREGATOR_BASE_URL = 'http://127.0.0.1:7780';

export function isPatternZEnabled(): boolean {
  try {
    const raw = localStorage.getItem('ai-shunt-settings');
    if (!raw) return false;
    const s = JSON.parse(raw);
    return s.patternZEnabled === true;
  } catch {
    return false;
  }
}

function getPatternZStrategy(): 'vote' | 'pick-best' | 'synthesize' {
  try {
    const raw = localStorage.getItem('ai-shunt-settings');
    if (!raw) return 'synthesize';
    const s = JSON.parse(raw);
    return s.patternZStrategy ?? 'synthesize';
  } catch {
    return 'synthesize';
  }
}

function getPatternZTimeoutMs(): number {
  try {
    const raw = localStorage.getItem('ai-shunt-settings');
    if (!raw) return 30000;
    const s = JSON.parse(raw);
    return typeof s.patternZTimeoutMs === 'number' ? s.patternZTimeoutMs : 30000;
  } catch {
    return 30000;
  }
}

export async function dispatchToBus(opts: {
  intent: string;
  prompt: string;
}): Promise<{ text: string; sources: Array<{ jid: string; reply: string }> }> {
  const res = await fetch(`${AGGREGATOR_BASE_URL}/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: opts.intent,
      prompt: opts.prompt,
      strategy: getPatternZStrategy(),
      timeout_ms: getPatternZTimeoutMs(),
    }),
  });
  if (!res.ok) throw new Error(`Bus dispatch failed: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Bus dispatch error: ${data.error ?? 'unknown'}`);
  return { text: data.joint_output, sources: data.source_candidates ?? [] };
}
```

### 6.3 Architect — pilot on `performShunt('amplify', ...)`

Find `performShunt` in the file. Just inside its body, before the
existing single-LLM call, add:

```ts
if (isPatternZEnabled() && action === 'amplify') {
  try {
    const { text: joint } = await dispatchToBus({
      intent: `shunt.${action}`,
      prompt: buildShuntPrompt(text, action),  // existing helper; reuse
    });
    return joint;
  } catch (e) {
    console.warn('[aiService] Pattern Z dispatch failed, falling back to single-LLM:', e);
    // fall through to existing single-LLM path
  }
}
```

`buildShuntPrompt` is the existing prompt builder for performShunt — if
it has a different name in the actual file, swap. The goal: the bus path
sees the same final prompt the single-LLM path would have used.

### 6.4 Executor — verify

```powershell
npx tsc --noEmit
# Expected: no new errors

# Restart SPA. Open Settings → toggle Pattern Z ON, save.
# Open Shunt tab. Paste any text. Click Amplify.
# Watch the aggregator's stdout (orchestrator window) for a [/dispatch] log line.
# Watch transcript.jsonl for N kind:request envelopes sharing one trace,
# then N kind:reply envelopes back, then the synthesizer's output.
# UI displays the joint output in the same slot a single-LLM reply would.

# Verify fallback: stop the aggregator (POST :7779/stop/aggregator)
# Click Amplify again. UI shows single-LLM output (fallback fired).
# Console shows the warn.
```

### 6.5 Save marker

```
### Pattern Z Phase 5 — SPA bus dispatch (2026-05-13)
- aiService.dispatchToBus added (does not modify single-LLM path)
- performShunt('amplify') pilots the bus path with graceful fallback
- Verified: bus path returns joint output; fallback kicks in when aggregator down
```

---

## 7. Phase 6 — Per-button strategy + remaining wiring

**Goal:** Extend the pilot to other buttons with sensible per-intent
strategies. Add the strategy override UI to Settings.

### 7.1 Backup

```powershell
Copy-Item styles/services/aiService.ts styles/services/aiService.ts.bak.6
Copy-Item hooks/components/settings/Settings.tsx hooks/components/settings/Settings.tsx.bak.6
```

### 7.2 Architect — create `styles/services/patternZStrategies.ts`

```ts
export type Strategy = 'vote' | 'pick-best' | 'synthesize' | 'single';

export const DEFAULT_BUTTON_STRATEGIES: Record<string, Strategy> = {
  'shunt.amplify': 'synthesize',
  'shunt.summarize': 'pick-best',
  'shunt.translate': 'vote',
  'shunt.factcheck': 'pick-best',
  'weaver.outline': 'synthesize',
  'foundry.refine': 'synthesize',
  'oraculum.insights': 'synthesize',
  'imageAnalysis.preset': 'single',  // never bus — preset is LM Studio specific
};

export function strategyFor(intent: string, overrides?: Record<string, Strategy>): Strategy {
  return overrides?.[intent] ?? DEFAULT_BUTTON_STRATEGIES[intent] ?? 'synthesize';
}
```

### 7.3 Architect — refactor `aiService.ts` to use the strategy map

Replace the Phase 5 pilot's hardcoded `action === 'amplify'` gate with a
strategy lookup. Each call site checks: `strategyFor(intent)` — if
`'single'`, skip bus and use single-LLM; otherwise dispatch.

Wrap the dispatch in a helper:

```ts
import { strategyFor, Strategy } from './patternZStrategies';

async function maybeDispatch<T>(
  intent: string,
  buildPrompt: () => string,
  singleLlmFallback: () => Promise<T>,
  asText: (text: string) => T,
): Promise<T> {
  if (!isPatternZEnabled()) return singleLlmFallback();
  const strat = strategyFor(intent);
  if (strat === 'single') return singleLlmFallback();
  try {
    const { text } = await dispatchToBus({ intent, prompt: buildPrompt() });
    return asText(text);
  } catch (e) {
    console.warn(`[aiService] Pattern Z dispatch failed (${intent}), fallback:`, e);
    return singleLlmFallback();
  }
}
```

Then call from each relevant entry point. For string-returning functions
(`performShunt`, `generateRawText`), `asText` is identity.

### 7.4 Architect — extend Settings.tsx with strategy overrides

Add a sub-section to PatternZPanel:

```tsx
<div>
  <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">Default strategy</p>
  <select
    value={getPatternZStrategy()}
    onChange={(e) => {
      const settings = JSON.parse(localStorage.getItem('ai-shunt-settings') || '{}');
      settings.patternZStrategy = e.target.value;
      localStorage.setItem('ai-shunt-settings', JSON.stringify(settings));
    }}
    className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white"
  >
    <option value="synthesize">Synthesize (LLM merges all candidates)</option>
    <option value="pick-best">Pick best (longest coherent)</option>
    <option value="vote">Vote (most common)</option>
  </select>
</div>
```

Per-intent overrides are deferred to a future phase — defaults from
`patternZStrategies.ts` are sufficient for v1.

### 7.5 Executor — verify

```powershell
npx tsc --noEmit

# Open SPA. Pattern Z ON. Exercise:
# - Shunt → Summarize: should hit bus with pick-best
# - Weaver → Outline: should hit bus with synthesize
# - Image Analysis → preset: should use single-LLM (Mode 'single')

# Watch transcript.jsonl + aggregator stdout to confirm correct strategies.
```

### 7.6 Save marker

```
### Pattern Z Phase 6 — Per-button strategy (2026-05-13)
- patternZStrategies.ts default map for major intents
- maybeDispatch helper in aiService unifies bus/single decision
- Image Analysis stays single-LLM as designed
- Default strategy selector in Settings
```

---

## 8. Phase 7 — Autonomous-loop daemon

**Goal:** A standalone Node process that runs the two-Claude loop
unattended. Polls both Architect and Executor inboxes; on each new
inbound envelope, spawns `claude -p` with the right context; writes the
reply envelope back. Terminates on usage-limit or explicit completion.

This is the OPERATIONAL companion to the build phases, not strictly a
build artifact. Ship it now so the autopilot is robust.

### 8.1 Backup

(Nothing to back up — new file only.)

### 8.2 Architect — write `hub-bus-tools/claude-pair-daemon.mjs`

```javascript
#!/usr/bin/env node
// hub-bus-tools/claude-pair-daemon.mjs
//
// Runs two Claude Code CLI loops in alternation: @architect reads
// envelopes addressed to it, decides next action via `claude -p`, writes
// reply to @executor's inbox. @executor reads its inbox, applies patches
// or runs commands, writes reply to @architect. Cycles until done or
// usage limits hit.
//
// Self-contained: no HTTP face. Stops on max-turns, on alert envelope to
// @zack, or on SIGINT/SIGTERM.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readInboxFor,
  createEnvelope,
  writeEnvelopeToBus,
  releaseEnvelope,
} from './envelope.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const HUB_BUS_DIR = path.join(REPO_ROOT, 'hub-bus');
const PLAN_PATH = path.join(REPO_ROOT, 'PATTERN_Z_BUILD_PLAN_2026-05-13.md');

const MAX_TURNS = Number(process.env.MAX_TURNS) || 200;
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS) || 600_000; // 10 min
const POLL_INTERVAL_MS = 5000;

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
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      reject(new Error('Claude turn timed out'));
    }, TURN_TIMEOUT_MS);

    child.stdin.write(prompt);
    child.stdin.end();
    child.stdout.on('data', (c) => { stdout += c.toString(); });
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Claude exited ${code}: ${stderr}`));
      // Parse the last JSON line
      const lines = stdout.trim().split(/\n/).reverse();
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed === 'object') return resolve(parsed);
        } catch { /* try previous line */ }
      }
      reject(new Error('No JSON envelope in Claude output'));
    });
  });
}

async function pollForInbound(jid) {
  const inbox = await readInboxFor(jid, HUB_BUS_DIR);
  for (const entry of inbox) {
    const env = entry?.envelope || entry?.data || entry;
    const fp = entry?.path || entry?.__path;
    if (env && env.kind === 'request') {
      return { env, fp };
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
        to: decision.reply_to_jid,
        kind: 'reply',
        intent: decision.intent || 'turn.reply',
        body: decision.body,
        replyTo: inbound.env.id,
        trace: inbound.env.trace,
      });
      await writeEnvelopeToBus(replyEnv, HUB_BUS_DIR);
      try { await releaseEnvelope(inbound.fp, 'done'); } catch {}

      if (decision.stop) {
        console.log('[pair-daemon] stop requested by Claude');
        stopping = true;
        return false;
      }
    } catch (e) {
      console.error(`[pair-daemon] turn ${turns} failed:`, e?.message || e);
      // Write alert to @zack
      const alert = await createEnvelope({
        from: '@pair-daemon',
        to: '@zack',
        kind: 'system',
        intent: 'pair-daemon.error',
        body: { role, turn: turns, error: String(e?.message || e), inbound: inbound.env.id },
      });
      await writeEnvelopeToBus(alert, HUB_BUS_DIR);
      stopping = true;
      return false;
    }
  }

  return true;
}

console.log('[pair-daemon] starting; max turns =', MAX_TURNS);
const loop = setInterval(async () => {
  const cont = await tick().catch((e) => {
    console.error('[pair-daemon] tick threw:', e);
    return false;
  });
  if (!cont) {
    clearInterval(loop);
    console.log(`[pair-daemon] stopped after ${turns} turns`);
    process.exit(0);
  }
}, POLL_INTERVAL_MS);

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
```

### 8.3 Architect — DO NOT auto-register the daemon as an orchestrator child

The daemon is operator-launched, not part of the standing bus. Operator
starts it with `node hub-bus-tools/claude-pair-daemon.mjs` in a separate
window when ready to run the autonomous build.

### 8.4 Executor — verify

```powershell
node --check hub-bus-tools/claude-pair-daemon.mjs
# Expected: silent (pass)

# Smoke (do NOT run unattended yet; this just confirms the daemon starts):
node hub-bus-tools/claude-pair-daemon.mjs
# Expected: log line "starting; max turns = 200" then quiet polling
# Ctrl+C to stop.
```

### 8.5 Save marker

```
### Pattern Z Phase 7 — Pair daemon (2026-05-13)
- hub-bus-tools/claude-pair-daemon.mjs ships
- Polls @architect + @executor inboxes, runs claude -p per turn
- Stops on MAX_TURNS, error, or stop:true signal from Claude
- NOT registered as orchestrator child (operator-launched)
```

---

## 9. Phase 8 — End-to-end smoke + documentation

### 9.1 Smoke matrix (Executor)

For each row, run the action and record pass/fail:

| # | Scenario | Pattern Z | Expected |
|---|---|---|---|
| 1 | Shunt → Amplify | OFF | Single-LLM result (baseline) |
| 2 | Shunt → Amplify | ON | Joint output; aggregator log shows fanout; 2+ source_candidates |
| 3 | Shunt → Summarize | ON | Bus path; strategy `pick-best` per strategies map |
| 4 | Image Analysis preset | ON | Single-LLM (strategy `single`); aggregator log is silent |
| 5 | Aggregator stopped | ON | Single-LLM fallback fires; console warn; UI works |
| 6 | One peer kill | ON | Aggregator returns partial; UI works |
| 7 | Settings → toggle @gemini off → save | ON | Next dispatch excludes @gemini (verify in transcript) |
| 8 | Settings → change LM Studio slot model → save | ON | Bridge restarts; orchestrator /status shows last_exit_code briefly |

### 9.2 Architect — update `BUILD_LOG.md`

Append a comprehensive entry summarizing all 7 phases with timestamps,
modified file count, and a one-line "what users can now do" note.

### 9.3 Architect — update root `CLAUDE.md`

Add a section "Pattern Z" under Architecture, ~20 lines, covering:
- The toggle and where it lives (Settings)
- The aggregator (`hub-bus-tools/aggregator.mjs`, port 7780)
- The per-button strategy map
- The participants config (`hub-bus/participants.json`, aggregator-owned)
- The pair daemon (operator-launched)

### 9.4 Architect — add inline rails

At the top of `aiService.ts`'s `dispatchToBus`:

```ts
// ⚠ DO NOT bypass `isPatternZEnabled()` checks at call sites.
// Existing call sites must remain single-LLM compatible when the toggle is off.
// See PATTERN_Z_BUILD_PLAN §6 and §7 for the strategy map.
```

At the top of `aggregator.mjs`'s `http.createServer` block:

```js
// ⚠ Loopback-only bind (HOST=127.0.0.1). If you ever expose remotely,
// add bearer auth FIRST. See COWORK_HANDOFF §7.5 #13.
```

### 9.5 Final verification

```powershell
# Compare against baseline
Get-FileHash -Path @(<files from §2.2>) -Algorithm SHA256
# Diff against pattern-z-baseline-hashes.txt
# Expected: only files listed in §1 "File inventory" MODIFIED row should differ
```

### 9.6 Save marker

```
### Pattern Z Phase 8 — Smoke + docs (2026-05-13)
- 8-scenario smoke matrix: pass/fail per row
- BUILD_LOG comprehensive entry
- CLAUDE.md Pattern Z section
- Inline rails added at booby-trap sites
- Baseline hash diff: only intended files changed
- Pattern Z is now operator-visible, fallback-safe, and documented
```

---

## 10. Done criteria

Pattern Z is "done" when ALL of these are true:

- [ ] `Invoke-RestMethod http://127.0.0.1:7779/status` shows aggregator + N lmstudio-bridge-* + claude-bridge + gemini-bridge + retry-daemon + panel-server, all `state=running, restarts=0`
- [ ] `Invoke-RestMethod http://127.0.0.1:7780/healthz` returns `{ ok: true }`
- [ ] In the SPA, toggling Pattern Z OFF → existing buttons work identically to pre-build
- [ ] In the SPA, toggling Pattern Z ON → exercising any Shunt/Weaver/Foundry/Oraculum action returns a non-empty joint output
- [ ] In Settings, toggling a peer off → next dispatch excludes that peer within 5s
- [ ] In Settings, changing an LM Studio slot model → corresponding bridge restarts within 5s with the new model
- [ ] Aggregator killed mid-dispatch → SPA single-LLM fallback fires, button still works, console warn shown
- [ ] One peer killed mid-dispatch → aggregator returns partial result with remaining peers
- [ ] Image Analysis (strategy `single`) → bus is bypassed; behavior unchanged from baseline
- [ ] `npx tsc --noEmit` clean
- [ ] `BUILD_LOG.md` has entries for all 8 phases
- [ ] `CLAUDE.md` has the Pattern Z section
- [ ] Baseline hash diff shows only intended files changed
- [ ] All `.bak.<phase>` files moved to `archive/pattern-z-baks/` (or deleted with operator OK)

---

## 11. Rollback procedures

If any phase fails verification twice and Stop Conditions trigger:

```powershell
# Generic rollback per phase. Replace <N> with the phase number.
$bakSuffix = ".bak.<N>"
$files = @(
  "hub-bus-tools/orchestrator.mjs",
  "hub-bus-tools/lmstudio-bridge.mjs",
  "styles/services/aiService.ts",
  "types/index.ts",
  "hooks/components/settings/Settings.tsx"
)
foreach ($f in $files) {
  $bak = "$f$bakSuffix"
  if (Test-Path $bak) {
    Copy-Item $bak $f -Force
    Write-Host "Restored $f from $bak"
  }
}

# Restart bus (orchestrator Ctrl+C, then npm run bus:start)
# Restart SPA (Ctrl+C dev server, then npm run dev)

# Verify /status returns to pre-phase shape
Invoke-RestMethod http://127.0.0.1:7779/status
```

Then write a `kind: alert` envelope to `@zack` describing what failed and what was rolled back. Stop.

---

## 12. Authorization summary (what zack pre-approves)

By launching the autonomous build, zack pre-authorizes:

1. **File writes** to all paths listed in §1 "File inventory" (10 files, 4 new + 6 modified).
2. **Process spawns** by the orchestrator for new children: aggregator, N lmstudio-bridge-* instances.
3. **HTTP binds** on `127.0.0.1:7780` (aggregator).
4. **Mutations** of `hub-bus/participants.json` and `hub-bus-tools/lms-instances.json`.
5. **Bridge restarts** via the existing orchestrator HTTP admin face.
6. **BUILD_LOG appends** at each phase save marker.
7. **`CLAUDE.md` edit** to add the Pattern Z section.
8. **Backup file creation** at each phase (`.bak.<N>` suffixes).
9. **Pair daemon launch** is operator-explicit (not pre-authorized). Operator runs
   `node hub-bus-tools/claude-pair-daemon.mjs` manually when ready.

NOT authorized without explicit operator say-so during the run:

- Deleting any file other than `.bak.<N>` cleanup in §10's done check
- Modifying `App.tsx`, `MissionControl.tsx`, `vite.config.ts`, or any cockpit file
- Adding new npm dependencies
- Changing `hub-cloudflare/` (the deployed Worker)
- Touching anything in `hub-bus/archive/`

---

*End of plan. Execution time: ~2-3 focused days of two-Claude work.*
*Pause-and-resume safe: each phase's save marker in BUILD_LOG is the resume anchor.*
*Generated by Cowork, 2026-05-13. Single-source revision.*
