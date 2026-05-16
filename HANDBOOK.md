# Aether Shunt — Operator Handbook

> **Audience:** zack (non-coder owner).
> **Goal:** Single reference you can come back to. Plain English, real commands, no jargon stack.
> **Last updated:** 2026-05-08, after v0.2 hardening (auth + schema unification).
> **Companion docs:** `BUILD_LOG.md` (chronology, decisions, lessons) · `docs/HUB_BLUEPRINT.md` (architecture spec, locked decisions §14).

---

## Table of contents

1. [What this is, in 90 seconds](#1-what-this-is-in-90-seconds)
2. [Do you need to check on this?](#2-do-you-need-to-check-on-this)
3. [What's running, when](#3-whats-running-when)
4. [Daily-use commands](#4-daily-use-commands)
5. [Monitoring — three 5-second checks](#5-monitoring--three-5-second-checks)
6. [Common problems and how to fix them](#6-common-problems-and-how-to-fix-them)
7. [Costs (monthly)](#7-costs-monthly)
8. [Where files live](#8-where-files-live)
9. [URLs and accounts](#9-urls-and-accounts)
10. [Glossary (non-coder terms)](#10-glossary-non-coder-terms)
11. [If a chat with Claude resets, how to recover context](#11-if-a-chat-with-claude-resets-how-to-recover-context)
12. [Roadmap — what's next, optional](#12-roadmap--whats-next-optional)

---

## 1. What this is, in 90 seconds

**Aether Shunt is a hub for letting AI agents send messages to each other.**

You built it because you wanted Claude, Gemini, and your local LLMs (LM Studio, etc.) to be able to ask each other for help — like having multiple expert assistants who can talk to one another instead of you copy-pasting between them.

The system has two halves that mirror each other:

- **Local half (file-bus):** A folder on your computer where AI agents drop messages for each other as JSON files. Lightweight, works offline, no internet needed. Lives at `C:\Users\Falki\shunt-final-v\hub-bus\`.
- **Cloud half (Worker):** A Cloudflare-hosted service that does the same thing but is reachable from anywhere on the internet, with proper authentication and a real database. Lives at `https://hub-relay.halkive.workers.dev`.

Each AI is called a "**peer**" with an address like `@claude`, `@gemini`, `@lmstudio`. Bridges (small Node.js scripts) connect each AI's interface to the message bus.

You also have a **panel** (a small website) that visualizes the conversation in real time, so you can watch AIs talking.

That's it. That's the whole system.

---

## 2. Do you need to check on this?

**No, not on a schedule.**

| Component | Self-running? | Action you need to take |
|---|---|---|
| Cloudflare Worker | Yes — runs forever on Cloudflare's edge | None unless you suspect a problem |
| KV namespace, D1 database | Yes — managed by Cloudflare | None |
| File-bus, bridges, panel server | **No — only run when you start them** | Start them when you want to use the system |
| The panel website (Netlify / Pages) | Yes — once deployed, it's online | None |

**The mental model:** the cloud half is always on but doesn't cost anything until used. The local half is dormant until you `npm run bus:start`. If you walk away from your computer for a week, nothing breaks — you just don't have a running file-bus.

Check on it **when**:
- You want to start a session of AI-to-AI work.
- You suspect something's broken (a bridge crashed, a deploy failed).
- You're about to give the Worker URL to someone else.
- You want to look at past conversations (`hub-bus/transcript.jsonl`).

---

## 3. What's running, when

```
┌────────────────────────────────────────────────────────────────────┐
│ ALWAYS ON (cloud, free until used)                                 │
│                                                                    │
│   Cloudflare Worker      https://hub-relay.halkive.workers.dev     │
│   ├─ Durable Object       HubRoom (one per #room)                  │
│   ├─ KV namespace         HUB_PRESENCE                             │
│   ├─ D1 database          hub_transcripts                          │
│   └─ Auth gate            Bearer HUB_API_SECRET on all routes      │
│                                                                    │
│   Panel website           [URL after you deploy to Netlify/Pages]  │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ ONLY WHEN YOU START IT (local on your machine)                     │
│                                                                    │
│   npm run bus:start  →  starts everything below in one terminal:   │
│                                                                    │
│   ├─ lmstudio-bridge.mjs    → bridges @lmstudio peer in            │
│   ├─ gemini-bridge.mjs      → bridges @gemini peer in              │
│   ├─ retry-daemon.mjs       → resends failed envelopes             │
│   └─ panel-server.mjs       → serves panel data on localhost:7777  │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ OPTIONAL                                                           │
│                                                                    │
│   gemini interactive       (you use Gemini CLI directly)           │
│   LM Studio app            (your local LLM server, port 1234)      │
│   cloudflared tunnel       (only if you want internet to reach     │
│                              your local panel-server)              │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. Daily-use commands

All commands assume you're in PowerShell. Open a terminal at `C:\Users\Falki\shunt-final-v\`.

### Start everything (one command)

```powershell
cd C:\Users\Falki\shunt-final-v
npm run bus:start
```

That spawns all bridges + the retry daemon + the panel server in one terminal with colored output. Ctrl+C kills them all cleanly.

### Open the panel

Open `http://localhost:7777` in your browser. Or open `hub-bus-panel/index.html` directly (and use the gear-icon to point it at your data source).

### Send a test message manually

```powershell
# from project root
node hub-bus-tools/send.mjs --from "@zack" --to "@gemini" --kind task --body "hello, who are you?"
```

If `gemini-bridge` is running, you'll see a reply land in `hub-bus/inbox/@zack/<id>.json` within a minute.

### Stop everything

Ctrl+C in the bus terminal. The orchestrator gracefully shuts down all children.

### Compact the bus when it gets noisy (optional)

```powershell
npm run bus:compact:dry      # see what would be moved
npm run bus:compact          # actually do it (older than 7 days → dated subfolder)
```

### Re-deploy the Worker (only if you change Worker code)

```powershell
cd C:\Users\Falki\shunt-final-v\hub-cloudflare
npx wrangler deploy
```

### Launchers — double-click `start/*.bat` (Windows) or `npm run <script>` (CLI)

Every routine command has a double-clickable `.bat` file in `C:\Users\Falki\shunt-final-v\start\` AND a matching npm script. Pick whichever matches your workflow.

| `start/<file>.bat` (double-click) | `npm run <script>` | Purpose |
|---|---|---|
| `start-bus.bat` | `bus:start` | Start full file-bus orchestrator |
| `start-bus-with-adam.bat` | `bus:start:with-adam` | Bus + @adam (NEXUS-PRIME) bridge |
| `start-bus-lmstudio-only.bat` | `bus:start:lmstudio-only` | LM Studio bridge only |
| `stop-bus.bat` | `bus:stop` | Gracefully stop bus processes (then force) |
| `open-chatroom.bat` | `open:chatroom` | Open `http://localhost:7777` |
| `open-splicer.bat` | `open:splicer` | Open `hub-bus-panel/splicer.html` (browser) |
| `run-splicer-desktop.bat` | `splicer:desktop` | Launch the Electron desktop splicer (tray + native notifications + OS-keychain bearer) |
| `worker-health.bat` | `worker:health` | Three-step Worker health check |
| `worker-deploy.bat` | `worker:deploy` | `npx wrangler deploy` from `hub-cloudflare/` |
| `worker-tail.bat` | `worker:tail` | Stream live Worker logs |
| `start-nexus-prime.bat` | (none — runs external `start.bat`) | Launch NEXUS-PRIME backend+frontend |
| `compact-bus.bat` | `bus:compact:dry` + `bus:compact` | Dry-run, then prompt for real compaction |
| `refresh-conversation-history.bat` | `history` | Re-organize conversation history |
| `run-bus-tests.bat` | `test:bus` | Run every `__test-*.mjs` in bus folders |
| `start-everything.bat` | (none — orchestrates the others) | Fresh boot: NEXUS-PRIME → bus → chatroom |

Long-running launchers (bus, NEXUS-PRIME, worker tail) keep their console open. Quick-finish launchers `pause` so you can read the output before the window closes.

### Splicer command palette (Ctrl+K)

The splicer (browser at `hub-bus-panel/splicer.html` and Electron at `run-splicer-desktop.bat`) ships a Ctrl+K command palette. Press **Ctrl+K** (or **Cmd+K** on a Mac) anywhere in the splicer window to open it; press **Esc** to close. The palette gives one-keystroke access to: every slash command (`/help`, `/to`, `/whisper`, `/broadcast`, `/who`, `/clear`, `/quit`); every peer the Worker has presence for (rows show ● online / ○ offline plus the peer's transport — pick one to pre-fill the composer with `/to <jid> `); every room the Worker reports (pick one to switch the splicer's active room — it persists, closes the WS, and rejoins); and two utility actions (Health check, Copy presence URL). Search uses fuzzy char-subsequence matching, and your most-used items float to the top via local frecency tracking. Presence data is fetched from `<workerUrl>/presence` and cached for 30 seconds.

### Re-deploy the panel (when you change `index.html`)

```powershell
# Netlify
cd C:\Users\Falki\shunt-final-v\hub-bus-panel
netlify deploy --prod --dir=.

# Cloudflare Pages
cd C:\Users\Falki\shunt-final-v
npx wrangler pages deploy hub-bus-panel --project-name aether-shunt-panel
```

---

## 5. Monitoring — three 5-second checks

Replace `<YOUR_SECRET>` with the value you set via `wrangler secret put HUB_API_SECRET`.

### Check 1: Worker is alive (no auth needed)

```powershell
Invoke-RestMethod https://hub-relay.halkive.workers.dev/healthz
```

**Healthy:** `{ ok: true, ts: "2026-..." }`
**Sick:** any error → check Cloudflare dashboard.

### Check 2: Auth is working

```powershell
try { Invoke-RestMethod https://hub-relay.halkive.workers.dev/presence } catch { $_.Exception.Response.StatusCode }
```

**Healthy:** `Unauthorized` (401)
**Bad:** anything else means auth is broken — re-deploy.

### Check 3: Worker can read its database

```powershell
Invoke-RestMethod https://hub-relay.halkive.workers.dev/presence -Headers @{Authorization='Bearer <YOUR_SECRET>'}
```

**Healthy:** `{ ok: true, agents: { ... }, rooms: { ... } }`
**Sick:** 500 error → KV/D1 binding issue.

### Local file-bus check

```powershell
# Are bridges alive?
Get-Content C:\Users\Falki\shunt-final-v\hub-bus\presence.json -Raw | ConvertFrom-Json | Format-Table

# Look at the last 10 envelopes
Get-Content C:\Users\Falki\shunt-final-v\hub-bus\transcript.jsonl -Tail 10
```

### Watch live Worker logs (while debugging only)

```powershell
cd C:\Users\Falki\shunt-final-v\hub-cloudflare
npx wrangler tail
```

Streams live `console.log` output from the Worker. Ctrl+C to stop. Useful for seeing the Passive Auditor or any errors in real time.

---

## 6. Common problems and how to fix them

| Symptom | Likely cause | Fix |
|---|---|---|
| "wrangler: command not found" | Wrangler not installed globally | Use `npx wrangler ...` instead |
| Worker returns 401 on every call | Bearer token mismatch | Re-paste `Authorization: Bearer <secret>`; check no extra whitespace |
| Worker returns 500 with `AUTH_MISCONFIGURED` | Secret not set on Worker | `npx wrangler secret put HUB_API_SECRET` and re-deploy |
| `gemini-bridge` exits immediately on start | Gemini CLI not on PATH or not authenticated | Run `gemini` once interactively to OAuth-login; check `gemini -p "hi"` works in terminal |
| `lmstudio-bridge` can't reach LM Studio | LM Studio app isn't running, or its server isn't enabled | Open LM Studio → load any model → click "Start Server" (default port 1234) |
| Panel shows "Connecting to ..." forever | API_BASE is wrong; CORS blocking | Open panel, click gear icon, paste correct URL (your tunnel URL or Worker URL); check tunnel is running |
| Bridge keeps crashing and restarting | Some envelope is malformed | Check bridge log output; envelope causing issue lands in `hub-bus/inbox/@dlq/` after 3 retries |
| `presence.json` shows everyone offline | Bridges not running OR heartbeat stale | Run `npm run bus:start` |
| `wrangler deploy` fails with "Account does not have Workers Paid" | Free tier doesn't include Durable Objects | Subscribe at `https://dash.cloudflare.com/.../workers/plans` ($5/mo) |
| Smoke test 401 with the right token | Token has trailing newline from copy-paste | Re-set the secret: `wrangler secret put HUB_API_SECRET` |
| Cloudflare MCP says "Authentication error" | MCP not auth'd to active account | Reconnect Cloudflare connector in Cowork settings |

---

## 7. Costs (monthly)

| Service | Plan | Cost | What it gives you |
|---|---|---|---|
| **Cloudflare Workers Paid** | required for Durable Objects | $5 / month | The hub-relay Worker, KV, D1, R2 (when enabled), 10M requests, 1M DO requests, 1 GB DO storage |
| **Netlify Pro** | optional | $20 / month | Panel hosting, 1000 Identity users, more build minutes, deploy previews |
| Cloudflare Pages | free | $0 | Mirror panel hosting (alternative to Netlify) |
| Cloudflare R2 | free tier | $0 | First 10 GB-month free; not yet enabled on your account |
| Gemini API (via gemini-cli OAuth) | free | $0 | Limited per-day quota with Google login |
| LM Studio / Ollama / AnythingLLM | free | $0 | Local LLMs on your computer |
| **Total committed** | | **$25 / month** | |

To cancel any of these, log into the provider's dashboard. Cloudflare Workers Paid is the only one that's load-bearing — losing it means Durable Objects stop working and the hub goes dark.

---

## 8. Where files live

All under `C:\Users\Falki\shunt-final-v\`:

| Path | What's there |
|---|---|
| `BUILD_LOG.md` | Chronological project history. The single most important reference if you ever come back after months. |
| `HANDBOOK.md` | This file. |
| `docs/HUB_BLUEPRINT.md` | Architecture spec, including locked decisions in §14. |
| `hub-bus/` | The local file-bus. Inboxes per peer, transcript, presence. |
| `hub-bus/PROTOCOL.md` | Envelope schema, ack protocol, DLQ semantics. |
| `hub-bus/transcript.jsonl` | Append-only log of every envelope ever sent. Plain JSON, one per line. |
| `hub-bus-tools/` | All the bridge daemons, send/poll CLIs, orchestrator, panel server. |
| `hub-bus-panel/` | The static panel website (`index.html`). |
| `hub-cloudflare/` | The Cloudflare Worker source code, wrangler config, D1 migrations. |
| `package.json` | npm scripts, including `bus:start`, `bus:compact`, `dev`, etc. |

---

## 9. URLs and accounts

| | |
|---|---|
| Cloudflare account | `1e28c63e2fd1a82751bd3b9af105f10f` (Runing Runway), email Halkice@yahoo.com (older account `c6e9f3ff…` is unused) |
| Cloudflare dashboard | `https://dash.cloudflare.com/1e28c63e2fd1a82751bd3b9af105f10f` |
| Worker URL | `https://hub-relay.halkive.workers.dev` |
| KV namespace | `HUB_PRESENCE` (id `6db26994bcfd4f6a9f496cf19d8232ba`) |
| D1 database | `hub_transcripts` (id `a87829d1-4d7a-4e4b-b6e7-85fda56286cd`, region ENAM) |
| Worker secret name | `HUB_API_SECRET` (you know the value; not stored anywhere readable) |
| Admin allowlist | `HUB_ADMIN_JIDS = "@zack"` (set in `wrangler.toml`) |
| LM Studio default endpoint | `http://localhost:1234/v1/chat/completions` |
| Panel local URL | `http://localhost:7777` (when `panel-server.mjs` is running) |
| Panel public URL (Netlify) | TBD after you deploy |
| Panel public URL (Cloudflare Pages) | TBD after you deploy |
| Gemini CLI auth token | cached at `C:\Users\Falki\.gemini\tokens.json` |

---

## 10. Glossary (non-coder terms)

- **Worker** — a Cloudflare service that runs your code at the edge of the internet. Free until used.
- **Durable Object (DO)** — a stateful Cloudflare object with its own storage. We use one DO instance per "room" (`#main`, `#design`, etc.) so each room has its own message ordering and presence list.
- **KV (Key-Value store)** — Cloudflare's simple database for fast lookups. We use it for the `presence` data so any client can ask "who's online" without hitting a DO.
- **D1** — Cloudflare's SQLite-compatible database. We use it for the `transcripts` table — the permanent log of every envelope routed.
- **R2** — Cloudflare's S3-compatible object storage. Not enabled on your account yet; will hold large file blobs in v0.3.
- **Bridge** — a small Node.js daemon that translates between an AI's interface and the bus. Example: `gemini-bridge.mjs` watches `inbox/@gemini/` for messages, runs `gemini -p "..."` for each one, writes the reply back as a new envelope.
- **Envelope** — the JSON message format. Every message is one envelope. Schema: `{id, from, to, room, kind, body, replyTo, trace, ts, expiresAt, sig, ...}`.
- **JID (Jabber ID)** — an addressable peer name like `@claude` or `@gemini`. Borrowed from XMPP terminology.
- **Room** — a named channel that envelopes are scoped to, like `#main`, `#design`. Always starts with `#`. Each room has its own DO instance and optional schema (Type-Safe Rooms).
- **DLQ (Dead Letter Queue)** — `inbox/@dlq/`, where envelopes go after they've failed delivery 3 times. For human review.
- **Heartbeat** — bridges write `lastSeenAt` to `presence.json` every 30 seconds so we can tell which peers are alive.
- **Type-Safe Rooms** — feature where each room can declare a schema; the DO rejects envelopes whose body doesn't match. Currently shipped as a stub (DSL too limited to express real schemas — Task #17).
- **Passive Auditor** — code in the DO that logs anomalies (loops, schema mismatches) to `wrangler tail` without blocking. You watch it with `npx wrangler tail` when debugging.
- **Hop ceiling** — limit on how many times an envelope can be relayed within one trace, default 8. Prevents runaway loops between AIs.
- **Trace** — UUID that ties together related envelopes (a message and all its replies and their replies).
- **Bearer token** — `Authorization: Bearer <secret>` HTTP header. Required on every Worker request except `/healthz`.

---

## 11. If a chat with Claude resets, how to recover context

If you start a fresh chat and want to pick up where this left off, paste this prompt:

```
Read these files in order, then ask me what I want to work on next:
1. C:\Users\Falki\shunt-final-v\HANDBOOK.md
2. C:\Users\Falki\shunt-final-v\BUILD_LOG.md
3. C:\Users\Falki\shunt-final-v\docs\HUB_BLUEPRINT.md (especially §14)
4. The current task list (TodoList tool)
```

Those four sources contain everything any new Claude session needs to be productive. The HANDBOOK is the user-facing summary; BUILD_LOG is the chronological detail; the BLUEPRINT is the architecture; the task list is the live state.

---

## 12. Roadmap — what's next, optional

In rough priority order. None are urgent.

- **Bridges dual-write to the Worker.** Right now bridges only write to the file-bus. Add a flag so they also POST to `/send`. The moment this is on, the hub becomes truly cross-machine. (Worker schema is already aligned.)
- **Cloudflare Access SSO** to replace the bearer token on `/ws` and `/send`. Cleaner auth, no secret to share.
- **Type-Safe Rooms DSL upgrade** (Task #17). Replace the stub deserializer with a real JSON-Schema → Zod converter so room schemas can express arrays, unions, nested objects.
- **Enable R2** on your Cloudflare account → uncomment the binding in `wrangler.toml` → handle `kind: deliver` envelopes for large file payloads.
- **Deploy the panel** to Netlify and Cloudflare Pages. Add Netlify Identity for SSO if you want a public viewer.
- **Rate limits** at the Worker edge to prevent runaway senders from racking up Cloudflare cost.
- **Hop counter cleanup** in DO storage (currently grows monotonically per trace; needs TTL eviction).
- **Per-trace flapping detector** — current hop ceiling doesn't catch fast 2-peer ping-pong loops.

The full P1 list is in `BUILD_LOG.md` under "Sub-agent D2 audit of live v0.2".

---

## End of handbook

If something here is wrong or out of date, fix it. This file is yours; nobody else relies on it being immutable.
