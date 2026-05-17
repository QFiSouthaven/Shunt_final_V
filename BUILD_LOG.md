# Aether Shunt — Build Log

> **Purpose.** Persistent state-save across turns. Anyone (Claude, Claude-Code, Gemini, the human) reading this should be able to reconstruct *what's built, what's decided, what's outstanding, and what we learned* without scrolling chat history.
> **Update cadence.** After every major build phase or design lock-in. Append-only at the bottom of each section; don't rewrite history.

---

## 1. Mission

Steer Aether Shunt from a single-user text-transformation SPA into a **multi-LLM coordination hub** where local LLMs (LM Studio, AnythingLLM, Ollama) and frontier agents (Claude, Gemini) message each other bidirectionally as peers, addressable across machines via Cloudflare. The project is a *breeding ground for more capable agents requesting aid from each other* — that phrase is from zack's directive and remains the trajectory.

---

## 2. Architecture (locked decisions)

Authoritative source: `docs/HUB_BLUEPRINT.md` Section 14. Validated by 3-way AI consensus (Claude + Gemini + LM Studio) on 2026-05-08. Key decisions:

- **Durable Object per room** as central routing boundary. `idFromName(roomName)` for sharding.
- **Hybrid bridges + central validator.** Bridges are dumb adapters; the DO is the validator/router.
- **Coarse `kind` + separate `intent` field.** DO routes on `kind` only.
- **Per-room hop ceiling** on `trace`, default 8, with global hard cap.
- **Passive Auditor** in DO (logs anomalies, never blocks) — no active critic-injection in v0.2.
- **Machine-as-node tunneling.** One `cloudflared` per machine, not per LLM.
- **DO Hibernation** for idle WS connections.
- **Type-Safe Rooms** (per-room Zod schema enforcement) — deferred to v0.3, currently in 4-peer debate.

Schema fields that must survive promotion to KV/DO:
`id`, `from`, `to`, `room`, `kind`, `intent`, `body`, `replyTo`, `trace`, `seq`, `ts`, `expiresAt` (replaces relative `ttl`), `capabilities`, `sig`, `issuer`.

---

## 3. Live infrastructure

| Component | State | ID / URL |
|---|---|---|
| Cloudflare account | Active | `c6e9f3ff4b3d684700718224c6a63ec4` (Halkice@yahoo.com) |
| KV namespace `HUB_PRESENCE` | Created via MCP 2026-05-08 | `80e03b130d8a4535a4c10e8f9de76390` |
| D1 database `hub_transcripts` | Created via MCP 2026-05-08, region ENAM | `d0466d8d-8c02-4497-90db-7d0c4e7ced24` |
| R2 bucket `hub-deliveries` | **Blocked** — R2 not enabled on account; needs one-time dashboard click | — |
| Worker `hub-relay` | Scaffolded, typecheck passes, **not yet deployed** | `hub-cloudflare/` |
| File-bus | Operational | `hub-bus/` |
| `panel-server.mjs` | Built, CORS open | `http://localhost:7777` |
| `gemini-bridge.mjs` | Working (after 3 fixes) | spawns `node.exe + bundle/gemini.js` |
| `lmstudio-bridge.mjs` | Working | polls `localhost:1234` |
| Pages project `aether-shunt-panel` | Pending deploy | will be at `https://aether-shunt-panel.pages.dev` |

---

## 4. Active peers on the bus

Per `hub-bus/presence.json`:

| JID | Online | Capabilities | Transport |
|---|---|---|---|
| `@claude` | true | reason, code, tools:mcp, architecture | via-zack-chat |
| `@claude-code` | true | reason, filesystem, subprocess, verification, local | via-cli-direct |
| `@gemini` | true | reason, code, tools:mcp, critique | gemini-bridge.mjs (node.exe + bundle) |
| `@lmstudio` | true | chat, summarize, local | http://localhost:1234/v1/chat/completions |
| `@anythingllm` | false | chat, kb, local | openai-compat (not yet wired) |
| `@ollama` | false | chat, local | openai-compat (not yet wired) |
| `@zack` | true | human, decide | human-eyes |

---

## 5. Confirmed cross-AI exchanges

| Exchange | trace | Outcome |
|---|---|---|
| `@claude → @lmstudio` Q1/Q2/Q3 architecture | `01000000-…000002` | LM Studio answered: timestamps + IDs + routing non-negotiable; central router; per-room hop ceiling; reject critic-injection |
| `@claude → @lmstudio` synthesis follow-up | same | LM Studio refined: per-room ceiling within global bound; defer critic-injection to monitoring |
| `@claude-code → @gemini` verification ping | `76bb2c80-…` | Gemini ack 56-byte handshake — first cross-AI round-trip |
| `@claude-code → @gemini` Q1/Q2/Q3 architecture (resent envelope #1) | `01000000-…000001` | Gemini answered: DO per room, coarse kind + intent field, single tunnel per machine, DO Hibernation bonus |
| `@claude → @gemini` Q1/Q2/Q3 (LM Studio anchored) | `01000000-…000007` | Gemini answered: schema must keep trace + room; hybrid model; Passive Auditor (middle path); **flagged opaque-body / Type-Safe Rooms** as biggest unflagged worry |
| `@claude → {@gemini, @lmstudio, @claude-code}` Type-Safe Rooms 4-peer debate | `01000000-…000008/9/a` | In flight |
| `@claude → @gemini` panel HTML build (cancelled mid-flight; building locally instead) | `0100000b-…000b` | May still produce a backup HTML; ignore if it lands |

---

## 6. Open work

See `TodoList`. Current state:

- ✅ #1 file-bus, #3 second-AI consultation, #4–7 sub-agent CLI tools / bridges / dual.mjs / critique, #9 gemini-bridge fixes
- 🟡 #2 Worker promotion (in_progress; KV+D1 done; R2 blocked; deploy pending)
- 🟡 #11 Type-Safe Rooms (in_progress; 4-peer debate in flight)
- 🟡 #12 Live broadcast panel (in_progress; HTML being built)
- ⏳ #8 Apply Plan-agent HIGH-priority fixes (`.processing/` lock, ack/nack, presence heartbeat, ttl→expiresAt)
- ⏳ #10 Loop-detection at validator (spec locked from AI consensus; awaits Worker code)

---

## 7. Lessons learned (reflective log)

### The bridge debug cascade (2026-05-08)

Three sequential failures, each shipped without pre-testing the next failure mode:

1. `shell: true` → cmd.exe word-splitting on em-dash/punctuation in body
2. `-p <body>` → yargs treated body as positional `query` simultaneously with `-p` flag
3. `EINVAL` on `.cmd` → Node 24's CVE-2024-27980 protection rejects spawning `.cmd` files with shell-meta args

**Root cause of the cascade itself:** I built each fix in isolation without a smoke-test step inside the implementer's workflow. Each fix was correct but didn't anticipate the next layer.

**Standing rule from this point forward:**
> Every sub-agent that builds something **must include a test phase in its own workflow** — static syntax check, dry-run with mock inputs, and a one-iteration self-correct loop. Implement → test → refine, in one sub-agent. The cost is small upfront and an order of magnitude smaller than failure-cascade rounds.

### State snapshot taken (2026-05-08)

`STATE_SNAPSHOT.md` written at project root — point-in-time freeze of live cloud resources, local code state, task slate, P1 backlog from Sub-agent D2 audit, cleanup items, monthly cost commitments, and chat-reset recovery instructions. Use as a "restore point" if context drifts. Append `STATE_SNAPSHOT_<date>.md` for subsequent snapshots; don't overwrite this one unless asked.

### v0.2 hardening — fix-groups A & B landed (2026-05-08)

Both P0 BLOCKER fix groups identified by Sub-agent D2 are now in code, tested, and ready to redeploy.

**Fix-group A — schema unification (Sub-agent Q):**
- `createEnvelope` is now async; awaits a per-JID monotonic `seq` counter persisted to `<busDir>/.seq.json`.
- Drops `ttl` from emitted envelopes; `expiresAt` is canonical.
- New `KIND_MAP` shared between `hub-bus-tools/envelope.mjs` and `hub-cloudflare/src/kind-map.ts` (kept in sync via "// keep in sync with" comments). Maps `task→request`, `response→reply`, `request_aid→request`, `deliver→event`, `summary→event`, `relay→event`, `ack→system`. Canonical kinds pass through.
- Worker `EnvelopeSchema.kind` wraps the enum in a `z.preprocess` that runs `canonicalKind()` on ingress, so file-bus envelopes pass Worker Zod validation.
- Cascading awaits added to `send.mjs`, `gemini-bridge.mjs`, `lmstudio-bridge.mjs`, `ack-retry.mjs`.
- 6/6 tests pass: node-check, tsc, seq monotonicity per-JID, kind remap, cross-validation file-bus→Worker, no-ttl-emitted.

**Fix-group B — shared-secret auth on Worker (Sub-agent R):**
- Worker secret `HUB_API_SECRET` (set via `wrangler secret put HUB_API_SECRET`).
- `[vars] HUB_ADMIN_JIDS = "@zack"` plain env var in `wrangler.toml`.
- `requireBearer` middleware on every route except `/healthz` / `/health`. WS upgrade also accepts `?token=` query param fallback (with documented log-leak warning).
- Constant-time string compare. `AUTH_MISCONFIGURED` 500 if secret unset (refuse-by-default).
- `PUT /room/:room/schema` additionally requires `body.updated_by` to be in admin allowlist → 403 `NOT_ADMIN`.
- `kind: 'schema-update'` envelopes from non-admin senders → `SCHEMA_UPDATE_NOT_ADMIN` error envelope back to sender (Self-Bricking back-door closed).
- 27/27 tests pass.

**Deploy (zack runs):**
```
cd C:\Users\Falki\shunt-final-v\hub-cloudflare
npx wrangler secret put HUB_API_SECRET   # paste a long random string
npx wrangler deploy
```

After deploy, the panel + bridges + any future client must include `Authorization: Bearer <secret>` on every non-health request. Live smoke test:
```
Invoke-RestMethod https://hub-relay.halkive.workers.dev/healthz                                  # still open
Invoke-RestMethod https://hub-relay.halkive.workers.dev/presence                                 # 401
Invoke-RestMethod https://hub-relay.halkive.workers.dev/presence -Headers @{Authorization='Bearer <secret>'}   # 200
```

Group C (Type-Safe Rooms DSL upgrade — finding 4.5) is tracked as Task #17, deferred. Not blocking traffic since no room currently has `policy: strict`.

### Sub-agent D2 audit of live v0.2 (2026-05-08)

Independent Plan-agent critique of the deployed system caught what Sub-agent D didn't see at the design stage. Findings:

**P0 BLOCKERs (5):**
- 3.2 file-bus `createEnvelope` omits `seq` field that Worker Zod requires
- 3.3 file-bus `kind` enum (`task`, `request_aid`, `response`, ...) doesn't match Worker enum (`request`, `reply`, `event`, ...)
- 3.1 file-bus still emits deprecated `ttl` zombie field
- 1.1 Worker trusts `?jid=` query param — anyone with URL spoofs identity
- 1.2 `PUT /room/:room/schema` unauthenticated — anyone DoSes routing
- 4.4 `kind: schema-update` bypasses Type-Safe Rooms — sealed back-door

**P1 (11):** `/presence` doesn't mirror WS upgrades to KV (2.6); presence merge race no file lock (2.1); hop counter never deleted from DO storage (2.2); deterministic-id excludes intent+kind so retries break loop detection (3.5); D1+JSONL transcripts diverge by clock skew (3.4); orchestrator silent permanent-fail doesn't flip presence offline (2.3); no rate limits anywhere (1.5); CORS `*` on panel-server leaks transcripts cross-origin (1.3); `sig`/`issuer` accepted but unverified (1.4); ttl zombie field (3.1, partial); etc.

**Axiomatic concern (1):**
- 4.5 Type-Safe Rooms `deserializeStoredSchema` only handles trivial primitive types — can't express arrays, unions, nested objects, refinements. Flagship v0.3 feature shipped as a stub.

**Decision per Operational Mode:** dispatch fix-groups A (schema unification) and B (shared-secret auth) in parallel as P0 BLOCKERs. Group C (Type-Safe Rooms DSL) tracked as follow-up — not blocking today's traffic since no room has `policy: strict` yet. Sub-agents Q (group A) and R (group B) launching with implement+test rule.

### Hub fully operational — first human↔AI roundtrip via cloud bus (2026-05-10)

After two days of dormancy (no bridges running since 2026-05-08), the bus was activated end-to-end.

**Activation sequence (terminal-Claude, via zack-relay):**
- Orchestrator spawned with `--no-adam`; all 5 expected processes alive.
- Heartbeats writing to presence.json (`@gemini`, `@lmstudio` showing `lastSeenAt`).
- Panel-server reachable at localhost:7777.
- Smoke test: `@zack → @lmstudio` envelope `698277f2-…`, ~20s round-trip, kind=response with real generated text. ✅

**Real bugs surfaced:**
1. **`lmstudio-bridge.mjs` defaults `LMSTUDIO_MODEL=local-model`** — placeholder LM Studio rejects with HTTP 400 once it has multiple models loaded. Auto-resolve fix shipped to disk: on startup if env unset or equals legacy default, fetch `/v1/models` and use `data[0].id`. Fallback if fetch fails. 400-handler re-resolves mid-session.
2. **No per-envelope wallclock timeout** — bridge is single-flight; if LM Studio takes 4min on a generation, no other envelope to `@lmstudio` can be processed for 4min. Tracked as Task #22.
3. **Orchestrator doesn't inject `LMSTUDIO_MODEL`** — fresh boot reverts to broken default unless env was set. Auto-resolve fix sidesteps this; orchestrator config could persist as a hardening pass later.

**Re-diagnosis worth recording.** The original "stuck bridge" diagnosis (2-day-old `.processing` claim) was wrong. The bridge was patiently waiting on a long generation that LM Studio finally returned — with HTTP 400 because the model had been swapped out mid-flight. The `.processing` file held a real in-flight claim, not an orphan. Lesson: orphan-recovery alone is insufficient; bridges need wallclock timeouts to bound how long they hold a slot.

**State at end of activation:**
- Worker live · all 4 active peers heartbeating · panel watchable at localhost:7777 · smoke test passing · transcript drained.
- @zack reading the panel in real time; design conversation pivoted to chat-room mode + floor control + flow-of-traffic patterns (free-for-all vs round-robin vs pipeline vs moderator-driven).

### Pre-implementation corrections folded into HUB_UI_COMPONENTS.md (2026-05-08)

`docs/HUB_UI_COMPONENTS.md` Section 11 added with twelve corrections (C1–C12) distilled from an external multi-round adversarial review (qwen3.5-distilled vs qwen3-coder). The review's code samples were not implementable as-is (fictional APIs, unverified URLs); only the architectural findings were extracted. Triage table groups them into "apply now" / "apply when wiring SSO" / "apply additively." Code-gen agents working from the spec must apply C3, C4, C8, C9 before Wave 1.

### v0.2 smoke test — all green (2026-05-08, post-second-deploy)

| Endpoint | Status | Body |
|---|---|---|
| `GET /healthz` | 200 | `{ ok: true, ts: "2026-05-08T23:15:46.752Z" }` |
| `GET /health` | 200 | `{ ok: true, ts: "2026-05-08T23:15:46.804Z" }` (alias confirmed) |
| `GET /presence` | 200 | `{ ok: true, agents: {}, rooms: {} }` (canonical shape) |

v0.2 milestone closed. Every task in the list complete. The hub is live at https://hub-relay.halkive.workers.dev with a hardened file-bus running in parallel for single-machine work.

### Implement+test rule, addendum (2026-05-08)

First live smoke test of the deployed Worker caught two issues no static check would have:

1. `/healthz` 404 — Sub-agent G implemented `/health`. The test plan I gave said `/healthz`. Static typecheck doesn't catch path strings; the agent and the test had drifted. Fix: alias both paths in the route table.
2. `/presence` returned `{ok, members:[]}` while the panel expects `{agents, rooms}` (matches `hub-bus/presence.json`). Two components, no shared source-of-truth for the response shape, inconsistent decoders. Fix: reshape Worker response to match the file-bus `presence.json` so any consumer can use one decoder regardless of source.

**Rule addendum.** The implement+test rule (every sub-agent self-tests) is necessary but not sufficient. The test **must use the same path strings and the same response shape that downstream consumers use**, not whatever the spec asserts in passing. Where multiple components share a shape, the shape lives in ONE place (e.g. a Zod type in `types.ts` or a shared decoder); both producer and consumer import it. Otherwise drift is inevitable.

### State-save discipline

This file is the answer to "what if the chat resets?" Updated after every major decision or build phase. The transcript.jsonl is the bus's memory; this file is the project's memory. Don't let either go stale.

### Implement+test rule's first application (2026-05-08)

First sub-agent built under the new standing rule (Sub-agent J: panel build). Implement → 3 static tests → 0 iterations needed. Compare to the bridge cascade: 5+ rounds of user-witnessed failure. **Confirmed signal: the rule works.** Apply to every future builder.

### Type-Safe Rooms partial synthesis (2026-05-08)

@gemini answered envelope `01000000-…000008`. @lmstudio and @claude-code haven't yet (bridge not running / on-demand peer).

| Q | Decision (subject to @lmstudio confirm) | Source |
|---|---|---|
| Q1 WHERE schemas live | **D1 `room_schemas` table** (option b) | @gemini chose for dashboard-editability by non-coders. @claude conceded from earlier (c) DO storage. |
| Q2 mismatch behavior | **per-room policy `strict`/`warn`/`off`** (option d) | both agreed |
| Q3 schema discovery | **`GET /room/<name>/schema`** public endpoint (option a) | both agreed |
| Q4 migration | **graceful — unknown rooms = `policy: off`** (option b) | both agreed |

**New constraint surfaced: Contractual Deadlock / Self-Bricking.** A strict-schema room can become uneditable if its schema-update mechanism is itself an envelope that must validate against the (now-broken) schema. Mitigation: `kind: "schema-update"` envelopes are exempt from per-room schema enforcement at the DO, OR all schema mutations flow through a privileged `#schema-admin` room with a fixed simple schema that cannot deadlock itself. Lock in before v0.3 ships.

### Reliability hardening pass (2026-05-08)

zack's directive: "optimal bi-directional with congruent through retry and/or repair instances with 0 degradation." Decomposed into four reliability primitives. Three sub-agents in parallel (K, L, M) plus an externally-found bridge fix (stdio from @claude-code or zack).

| Primitive | Module | Behavior |
|---|---|---|
| Atomic claim | `claim.mjs::claimEnvelope` | rename `inbox/<addr>/<id>.json` → `inbox/<addr>/.processing/<id>.<pid>.<claimer>.json` so concurrent pollers can't double-process |
| Orphan recovery | `claim.mjs::recoverOrphans` | sweep `.processing/` on bridge boot; re-inbox any file older than 300s |
| Idempotency | `claim.mjs::writeEnvelopeIdempotent` | reject duplicate ids found in inbox, processing, .read, or transcript |
| Deterministic id | `claim.mjs::computeDeterministicId` | SHA-256(canonical JSON of from+to+trace+replyTo+body) → UUID-shape; same content = same id |
| Heartbeat | `heartbeat.mjs::startHeartbeat` | every 30s, atomic-merge `presence.json` to set `agents[ME].lastSeenAt`; consumers compute online via `now - lastSeenAt < 90s` |
| Ack envelope | `ack-retry.mjs::writeAck` | `kind:ack` with body `{ ackOf, status: received\|processed\|rejected }` |
| Send with ack | `ack-retry.mjs::sendWithAck` | watches own inbox for matching ack; returns `{status, latencyMs, attempts}` |
| Retry daemon | `retry-daemon.mjs` | watches `.pending-acks.json`, resends on no-ack with exponential backoff, DLQs on max retries |
| DLQ | `inbox/@dlq/` | terminal failure bin; human-reviewable |
| Compaction | `compact.mjs::compactReadDir` | move `.read/*.json` older than 7d into `.read/<YYYY-MM-DD>/<file>.json` |
| Transcript rotation | `compact.mjs::rotateTranscript` | rename `transcript.jsonl` → `transcript-<ts>.jsonl` when > 10000 lines |
| npm scripts | `bus:compact`, `bus:compact:dry` | run compaction on demand |
| Bridge stdio fix | `gemini-bridge.mjs:197-200` | `stdio: ['inherit', 'pipe', 'pipe']` + no `windowsHide` — anything else makes gemini-cli's bundle wait for `run_shell_command` and hang. Found by external testing (claude-code or zack), embedded with repro note. |

**Test discipline confirmed.** All 4 sub-agents (J panel, K claim, L ack, M compaction) passed first iteration with the implement+test rule. Compare to the original bridge cascade (5 user-visible failure rounds). The rule is paying for itself an order of magnitude.

**Cooperative multi-agent fix.** While K/L/M ran here, the gemini-bridge stdio bug was caught and fixed elsewhere (claude-code or zack at the keyboard). That's the project thesis demonstrated: parallel agents in different roles catch what any single one missed.

**Cleanup left:** `hub-bus-tools/__check_bridges.mjs` and `__check_lmstudio.mjs` are sub-agent K's verification artifacts (workspace mount-caching workaround) — not imported anywhere, safe to delete.

**What this hardening pass does NOT yet cover:**
- `ttl: 86400` → absolute `expiresAt` schema migration (Plan-agent's #1 promotion-blocker — still due before KV migration)
- `sig` + `issuer` envelope fields stubbed but not enforced
- Per-sender `seq` monotonic counter (gap detection)
- These are the remaining items inside Task #8 / scoped for the Worker promotion (Task #2).

### v0.2 Worker LIVE on Runing Runway (2026-05-08)

```
URL:        https://hub-relay.halkive.workers.dev
Version:    a2acf7c1-2954-49d0-acb0-3e345396f28a
Account:    1e28c63e2fd1a82751bd3b9af105f10f (Runing Runway)
Bundle:     148.10 KiB / 26.22 KiB gzip, 9ms startup
Bindings:   HUB_ROOM (Durable Object)
            HUB_PRESENCE KV (6db26994bcfd4f6a9f496cf19d8232ba)
            HUB_TRANSCRIPTS D1 (a87829d1-4d7a-4e4b-b6e7-85fda56286cd, migrations 0001+0002+0003 applied, ENAM)
Endpoints:  GET /healthz · GET /presence · POST /send · GET /ws?room=<name>&jid=<...>
            GET /room/:room/schema · PUT /room/:room/schema
What runs:  hop-ceiling per trace · Type-Safe Rooms (bypass on kind=schema-update)
            Passive Auditor → wrangler tail · DO Hibernation for idle WS
TODO v0.3:  Cloudflare Access SSO (auth currently trusts ?jid= query param)
            R2 bucket + kind=deliver handler (R2 not yet enabled on account)
```

This is the project's first cross-machine, cloud-native coordination endpoint. The single-machine file-bus and the Worker now run in parallel during transition; bridges can be retrofitted to dual-write later.

### Cloudflare account migration: Halkice → Runing Runway (2026-05-08)

zack pivoted from `c6e9f3ff4b3d684700718224c6a63ec4` (Halkice@yahoo.com) to `1e28c63e2fd1a82751bd3b9af105f10f` (Runing Runway).

**MCP scope finding:** the Cloudflare Developer Platform connector currently in this session was OAuth-granted only Halkice's account. `accounts_list` returns only Halkice; `set_active_account` to Runing Runway accepts the change locally but immediate `kv_namespaces_list` returns 401 Authentication error. Until the MCP is reconnected with Runing Runway in scope, all resource creation must happen via wrangler from zack's machine.

**Resources abandoned on Halkice's account** (preserved for record; not in active use):
- KV namespace HUB_PRESENCE: `80e03b130d8a4535a4c10e8f9de76390`
- D1 database hub_transcripts: `d0466d8d-8c02-4497-90db-7d0c4e7ced24` (region ENAM)
- D1 schema state: migrations 0001 + 0002 + 0003 applied; tables `transcripts` and `room_schemas` populated with no rows.

**wrangler.toml updates:**
- `account_id` → `1e28c63e2fd1a82751bd3b9af105f10f`
- KV `id` → `REPLACE_WITH_RUNING_RUNWAY_KV_ID` placeholder (zack runs `wrangler kv:namespace create HUB_PRESENCE`)
- D1 `database_id` → `REPLACE_WITH_RUNING_RUNWAY_D1_ID` placeholder (zack runs `wrangler d1 create hub_transcripts` + 3 migrations)
- R2 dashboard URL updated to Runing Runway

**Two paths to finish:**
- A: zack reconnects the Cloudflare MCP with Runing Runway in scope → I do everything from here.
- B: zack runs the 5 wrangler commands listed in this turn's chat → pastes back the two IDs → I patch wrangler.toml → zack `wrangler deploy`.

### Backlog drain — three sub-agents in parallel (2026-05-08)

zack delegated with "its all you now". D1 schema migration ran via Cloudflare MCP (no wrangler needed for that step). Three sub-agents N/O/P dispatched in parallel; each implement+test in one workflow.

| Agent | Scope | Output | Tests |
|---|---|---|---|
| N | Type-Safe Rooms (Task #11) | `0002_room_schemas.sql` + `type-safe-rooms.ts` module + GET/PUT `/room/:room/schema` endpoints + Self-Bricking bypass for `kind: schema-update` wired into `routeEnvelope` before hop-ceiling check | 5/5 PASS |
| O | ttl→expiresAt + sig + issuer (Task #8 leftovers) | `0003_envelope_metadata.sql` applied via MCP (ALTER TABLE adds expires_at + issuer columns + index). Both `envelope.mjs` and `envelope.ts` accept absolute `expiresAt` with back-compat read-side migration from legacy `ttl`. PROTOCOL.md v0.2.1. | 13/13 + 12/12 PASS |
| P | Bus orchestrator (Task #13) | `orchestrator.mjs` boots all bridges + retry-daemon + panel-server with watchdog + exponential backoff. `npm run bus:start`. | crash-restart + happy-path PASS |

**Cumulative test discipline result.** Sub-agents J, K, L, M, N, O, P — all SEVEN passed first iteration under the implement+test rule. Compare to the original bridge debug cascade (5 user-witnessed failure rounds for ONE bridge fix). **The rule has saved an order of magnitude over what we lost.**

**Cloud state after this round:**
- D1 `hub_transcripts`: tables `transcripts`, `room_schemas`, all indexes (`idx_transcripts_room_ts`, `_trace`, `_sender`, `_expires_at`, `idx_room_schemas_policy`).
- KV `HUB_PRESENCE`: ready (empty).
- R2 `hub-deliveries`: not yet (zack click R2-Enable in dashboard when ready).
- Worker `hub-relay`: scaffolded, all schema migrations applied, **awaiting `npx wrangler deploy`** on zack's machine (login authorized).

**Cleanup items for zack (when convenient):**
- `hub-bus-tools/__check_bridges.mjs` (sub-agent K artifact, not imported)
- `hub-bus-tools/__check_lmstudio.mjs` (same)
- `hub-cloudflare/src/envelope.fresh.ts` (sub-agent O artifact from mount-cache workaround, not imported)

```powershell
Remove-Item C:\Users\Falki\shunt-final-v\hub-bus-tools\__check_*.mjs
Remove-Item C:\Users\Falki\shunt-final-v\hub-cloudflare\src\envelope.fresh.ts
```

### Panel deployable artifacts

Created at `hub-bus-panel/`:
- `index.html` (24.8 KB, single file, no deps, dark theme, 3-col layout, diff-append, gear drawer for `API_BASE` config)
- `wrangler.toml` (Pages project `aether-shunt-panel`, account `c6e9f3ff…`)
- `_headers` (no-store on index.html, 5min cache on others)
- `README.md`

Deploy command (from project root):
```
wrangler pages deploy hub-bus-panel --project-name aether-shunt-panel
```
Local-first alternative: open `hub-bus-panel/index.html` in a browser, click gear, paste tunnel URL, Save.

---

## 8. Style/process directives from zack (standing)

- Default to **sub-agents in parallel** for development.
- Always **implement → test** in one motion.
- **Reflect** when loop-failing.
- **State-save often** (this file).
- **Never veer from project trajectory** (the multi-LLM hub mission).
- **Refine and iterate** when necessary.
- Use available **skills** that yield best results.
- Be **proactive about connected tools** — inventory before claiming something isn't possible.
- **Don't delegate understanding** — read source files yourself, don't trust summaries.
- **End-of-turn default = pause.** When a response delivers a finding, synthesis, completed action, or answer, the default ending is silence — let the user speak next. Do NOT append "next steps", "want me to also...", option menus, or unsolicited follow-up commands. Exceptions: pre-authorized continuous action ("you do it"), mid-execution of an approved multi-step plan, or when the response is itself a single direct question. Self-check: scan the last paragraph; if it contains "want me to," "should I," "two paths," or any unsolicited menu — delete it.

---

## 2026-05-10 — Splicer desktop wrapper (path C)

**What was built.** An Electron wrapper around the existing
`hub-bus-panel/splicer.html` widget. Path C of the splicer-deployment
decision (browser stays as-is; we add a native shell beside it).

**Where it lives.** `hub-bus-panel-desktop/`:

| File | Purpose |
|---|---|
| `main.js` | Electron main: BrowserWindow, tray, single-instance lock, `safeStorage` IPC, login-item toggle, minimize-to-tray. |
| `preload.js` | contextBridge — exposes `window.coworkSecret = { get, set, clear }` and `window.coworkNotify(title, body)` to the renderer. |
| `splicer.html` | **Local copy** of `hub-bus-panel/splicer.html`. Modified to prefer `window.coworkSecret` for bearer (falls back to localStorage when absent so the original file still works in a plain browser), and to fire native `Notification` when an envelope addressed to `@zack` arrives while the window is unfocused. The original file is **untouched**. |
| `notify.js` | Thin renderer helper that requests Notification permission eagerly. Currently not preloaded; kept as a hook for future renderer-side patches that shouldn't pollute the browser version. |
| `gen-icon.cjs` | Generates the placeholder `tray-icon.png` (32×32 flat #1f3a5e square with #58a6ff border). Runs from `postinstall` and `prestart`. |
| `tray-icon.png` | Generated on first `npm install`. **Placeholder; swap when convenient.** |
| `package.json` | electron + electron-builder devDeps. Build target: Windows NSIS, no code-signing, per-user install (no admin prompt). |
| `README.md` | Build, run, install, migration notes; SmartScreen warning explained. |

**Behavior implemented:** single-instance lock, minimize-to-tray
(window-close hides; only the tray "Quit" item exits), tray menu with
Show/Hide + Auto-start toggle + Quit, OS-keychain bearer storage via
Electron `safeStorage` (DPAPI-encrypted file at
`%APPDATA%/Aether Splicer/splicer-secret.bin`), native notifications for
`@zack`-addressed envelopes when unfocused, `app.setLoginItemSettings({
openAtLogin })` toggle (default OFF).

**How to launch.**

```powershell
# Double-click:
C:\Users\Falki\shunt-final-v\start\run-splicer-desktop.bat

# Or from project root:
npm run splicer:desktop

# Or from the desktop dir:
cd hub-bus-panel-desktop && npm start
```

First run installs Electron locally (one-time `npm install`). The
`run-splicer-desktop.bat` launcher self-installs deps if `node_modules` is
missing.

**Known limits.**

- Tray icon is a generated placeholder (flat blue square). Real artwork
  pending; swap `tray-icon.png` to replace.
- No code-signing — Windows SmartScreen will warn on first run of the
  unsigned NSIS installer. Documented in `README.md`. Adding an
  EV/OV-cert path is a future task.
- Windows-only build target. Mac DMG / Linux AppImage deliberately not
  configured.
- Splicer.html is a **copy**, not a symlink. Future changes to
  `hub-bus-panel/splicer.html` must be manually ported here (or via a
  small sync script — out of scope for this build).
- npm install was not run during build (workspace bash unavailable in
  this session); files are syntax-checked but not smoke-tested with a
  live electron launch. User runs `npm install` once in the desktop dir.

**Files modified outside the new directory.**

- `package.json` (root): added `splicer:desktop` script. No other scripts
  touched.
- `start/run-splicer-desktop.bat`: new launcher matching existing
  conventions.
- `HANDBOOK.md` §4 Launchers table: appended a row for the new launcher.
  Existing `open-splicer.bat` row clarified to read "(browser)".
- `BUILD_LOG.md` (this entry).

---

## 2026-05-10 — Splicer command palette (Ctrl+K)

**What was added.** A self-contained Ctrl+K command palette inside the
splicer widget (browser + Electron desktop copies). No new files, no
build step, no external dependencies — pure inline vanilla JS extending
the existing `(function () { 'use strict'; ... })();` IIFE.

**Where it lives.**

| File | Change |
|---|---|
| `hub-bus-panel/splicer.html` | Added `.cmdk-*` CSS namespace, `<div id="cmdk-overlay">` markup inside `#widget`, and the palette JS (fuzzy ranker, frecency, presence cache, `switchRoom`, global keydown handler) inside the existing IIFE. |
| `hub-bus-panel-desktop/splicer.html` | Same patch, ported. Preserves the desktop-specific `HAS_SAFE_STORAGE` branches, `loadCfgRaw`/async `loadCfg`/async `saveCfg`, and the `@zack` notification path. `switchRoom` wraps `saveCfg` in `Promise.resolve(...).catch(...)` because save is async in desktop mode. |

**Behavior.**

- `Ctrl+K` (and `Cmd+K` on Mac) opens the palette; `Esc` closes. Both
  preventDefault + stopPropagation so the browser's built-in shortcut
  (Cmd+K → address bar) doesn't win. The handler is bound on `document`
  with capture, separate from the existing composer Enter handler.
- Modal overlay covers the splicer widget area (`position: absolute;
  inset: 0`); same CSS variables as the rest of the splicer
  (`--bg`/`--panel`/`--panel2`/`--blue`/...).
- Search auto-focuses on open. Up/Down arrows navigate; Enter or click
  activates.
- **Item categories:** (1) seven slash commands — `/help`, `/to`,
  `/whisper`, `/broadcast`, `/who`, `/clear`, `/quit`; (2) every peer
  from the live `<workerUrl>/presence` response with online/offline
  glyph (●/○) and the peer's `transport` string in dim text; (3) every
  room from the same response, with member count when known; (4) two
  worker actions — `Health check` (calls existing `healthCheck`) and
  `Copy presence URL` (uses `navigator.clipboard.writeText` with a
  textarea + `execCommand('copy')` fallback).
- Selecting a peer pre-fills the composer with `/to <jid> ` and focuses
  it. Selecting `/to`, `/whisper`, or `/broadcast` pre-fills the verb
  prefix the same way.
- Selecting a room calls a new `switchRoom(name)` helper that mutates
  `cfg.room`, persists via `saveCfg`, updates `targetPill`, closes the
  WS gracefully, and calls `connectWs()` again.
- **Fuzzy ranking.** Char-subsequence match against
  `label + ' ' + secondary`. Score = base 1 per char + 10 for first
  char + 10 for first-char-of-word (after space, `-`, `_`, `/`, `#`,
  `@`) + 5 for consecutive matches. Empty query shows everything in
  canonical order (commands → peers → rooms → actions).
- **Frecency.** `localStorage` key `aether_splicer_cmdk_history`,
  `{ <itemId>: { count, lastUsed } }`, capped to 50 entries (oldest by
  `lastUsed` evicted). Ties on fuzzy score break by `(count*2 +
  recencyBonus)` where recencyBonus ranges 0–30 based on minutes since
  last use.
- **Presence cache.** Module-scoped, 30-second TTL. On open the palette
  renders from the cached snapshot immediately and refetches in the
  background; the list re-renders when the fresh response arrives.

**Verification.**

- Both files keep the original anchors: `function parseInput`,
  `function buildWsUrl`, the `(function () { 'use strict'; ... })();`
  IIFE, the `cfg-save` event listener, the
  `composer.addEventListener('keydown', ...)` block, and (desktop only)
  the `HAS_SAFE_STORAGE` checks plus async `loadCfg`/`saveCfg`/init.
- Palette keydown handler is bound on `document` (capture phase). The
  composer's Enter handler stays on the `composer` element. No overlap.
- Both files end correctly: browser closes the IIFE with `})();`;
  desktop closes the inner async init with `})();` and the outer IIFE
  with `})();`.

**Known limits.**

- Presence is fetched per-palette-open with a 30s cache; very fast
  presence churn won't show until the cache expires.
- Frecency cap is 50 entries — beyond that, oldest-by-lastUsed are
  pruned silently.
- The browser will still let the user open multiple splicer tabs; each
  tab keeps its own in-memory cache and shares the localStorage
  history. That's intentional — palette state is intentionally tab-
  local but selection counts are shared.
- Workspace-bash not available in this session; static structural
  review only — no live JS smoke test.

## 2026-05-10 — UI merge-and-fill (sub-agent 2: security + deploy)

**Scope.** Strip AI-Studio template cruft, fix the P0 admin-gating
hole, and prepare `UI/` for Cloudflare Pages deploy. Did NOT touch any
file under `UI/app/` other than `layout.tsx`'s metadata export
(reserved for sub-agent 1).

**Files modified.**

| File | Change |
|---|---|
| `UI/middleware.ts` | Removed hardcoded `isAdmin = true`. Now resolves identity from cookie `aether-jid` (prod + dev) or header `x-aether-jid` (dev only) and checks against `HUB_ADMIN_JIDS` allowlist. `DEV_ADMIN_OVERRIDE=1` forces admin in non-prod with a `console.warn`; production ignores it. Added v1 / v2 trajectory comment block. |
| `UI/package.json` | Removed `@google/genai` dep and `firebase-tools` devDep. Renamed `name` → `aether-shunt-hub-ui`. Added scripts `typecheck`, `pages:build`, `pages:deploy`, `pages:dev`. Added devDeps `@cloudflare/next-on-pages@^1.13.0`, `wrangler@^3.78.0`. |
| `UI/next.config.ts` | Dropped `output: 'standalone'` (next-on-pages owns the build artifact). Tightened CSP to spec: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: wss:; img-src 'self' data:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'`. Existing security-headers stack preserved (HSTS, XCTO, XFO, etc.). |
| `UI/app/layout.tsx` | Metadata only — `title: 'Aether Shunt Hub'`, `description: 'Admin console for the Aether Shunt agent bus'`. Body / html unchanged. |
| `UI/.env.example` | Removed `GEMINI_API_KEY` and `APP_URL` template lines. Added `DEV_ADMIN_OVERRIDE=""` with comment. Kept `HUB_API_SECRET`, `HUB_ADMIN_JIDS`, `WORKER_URL`, `PANEL_SERVER_URL`. |
| `UI/README.md` | Appended `## Authentication` (v1 cookie/header + dev override + v2 HMAC trajectory) and `## Deployment (Cloudflare Pages)` sections. Existing sections untouched. |
| `UI/metadata.json` | Added `_comment` field flagging it as vestigial AI-Studio template output, not loaded at runtime. Kept structure intact for AI-Studio re-imports. |

**Files created.**

| File | Purpose |
|---|---|
| `UI/wrangler.toml` | New Pages project config — `name = "aether-shunt-hub-ui"`, `compatibility_date = "2026-05-09"`, `pages_build_output_dir = ".vercel/output/static"`, three `[[kv_namespaces]]` blocks (`AUDIT_KV`, `AUDIT_FAILURES_KV`, `RATE_LIMIT_KV`) with `REPLACE_WITH_*` placeholder ids and a comment chain telling the operator to run `npx wrangler kv:namespace create ...` for each. |

**Verification.** Re-read each touched file. `isAdmin = true` literal
is gone from `middleware.ts`. `@google/genai` and `firebase-tools` are
gone from `package.json`. `wrangler.toml` exists with all three KV
bindings. `.env.example` has no `GEMINI_API_KEY`, has
`DEV_ADMIN_OVERRIDE`. README has the new headings.

**User actions still required.**

1. `npm install` in `UI/` to pick up the new devDeps and removed deps.
2. `wrangler login` against the Runing Runway account.
3. Create the three Pages KV namespaces and paste ids into
   `UI/wrangler.toml`.
4. Set production env vars in the Cloudflare Pages dashboard
   (`HUB_API_SECRET`, `HUB_ADMIN_JIDS`, `WORKER_URL`,
   `PANEL_SERVER_URL`).
5. Decide where the `aether-jid` cookie gets minted in v1 (no SSO yet)
   — currently no server-side flow sets it, so v1 access requires
   either manually setting the cookie via DevTools or running with
   `DEV_ADMIN_OVERRIDE=1` in non-prod.

---

## 2026-05-10 — UI merge-and-fill (sub-agent 1: pages)

Filled out the multi-page admin shell on top of the secure `UI/` chassis.
All AI-Studio-stub TODOs in `app/page.tsx` are replaced with real wired
pages. The sidebar, send-envelope quick form, peers list, peers detail,
rooms list, room schema editor, bridges page, transcript view, DLQ
viewer, admin gate, and read-only settings page all exist and use
`workerFetch` server-side only. The bearer token never reaches the
client. Every admin mutation is gated on `x-is-admin === '1'`,
rate-limited via `checkRateLimit('admin', ip)`, and wrapped in
`beginAudit`/`completeAudit`/`failAudit`.

### New pages

- `app/page.tsx` — overwritten: dashboard at `/` (uses `<AppShell>`
  inline because it lives outside the `(authed)` route group).
- `app/(authed)/layout.tsx` — new route-group layout providing
  `<SidebarNav>` for nested authed pages.
- `app/(authed)/peers/page.tsx`
- `app/(authed)/peers/[jid]/page.tsx`
- `app/(authed)/rooms/page.tsx`
- `app/(authed)/rooms/[room]/schema/page.tsx`
- `app/(authed)/bridges/page.tsx`
- `app/(authed)/transcript/page.tsx`
- `app/(authed)/dlq/page.tsx`
- `app/(authed)/admin/page.tsx`
- `app/(authed)/settings/page.tsx`

### New components (`app/components/`)

- `SidebarNav.tsx` — left rail + mobile hamburger drawer.
- `AppShell.tsx` — wraps the dashboard at `/` with the sidebar.
- `OverviewTiles.tsx` — server tiles for worker health / peer / room
  counts.
- `SendEnvelopeForm.tsx` — client form, posts to `/api/bus/send`.
- `PeerList.tsx` — server component, reads `/presence`.
- `PeerDetail.tsx` + `PeerEnvelopeStream.tsx` — peer view + per-peer
  filtered SSE stream.
- `RoomList.tsx` — server component, reads `/presence` rooms.
- `RoomSchemaEditor.tsx` — client component, posts to existing
  `/api/admin/room-schema`, embeds `<SelfBrickingWarningBanner>`.
- `DLQViewer.tsx` — list + replay/discard buttons.
- `BridgeStatus.tsx` — pulls `/api/bridges` proxy to panel-server.
- `TranscriptView.tsx` — filters (room, sender, kind, body grep).
- `RotateSecretAction.tsx` — 2-step confirmation widget.
- `EditAdminJidsAction.tsx` — 2-step confirmation widget.
- `ConnectionDiagnostics.tsx` — runs presence/bridges probes.

### New API routes (`app/api/`)

- `bus/send/route.ts` — POST, Zod-validated envelope, audited.
- `bus/presence/route.ts` — GET, proxies Worker `/presence`.
- `bus/peers/[jid]/route.ts` — GET, filtered presence for one JID.
- `bridges/route.ts` — GET, proxies panel-server with stubbed fallback.
- `admin/dlq/list/route.ts` — GET, gated, stubs to `[]` when Worker
  lacks `/dlq` (it currently does — see Outstanding below).
- `admin/dlq/replay/route.ts` — POST, gated, audited, rate-limited.
- `admin/dlq/discard/route.ts` — POST, gated, audited, rate-limited.
- `admin/secret/rotate/route.ts` — POST, gated, audited, demands
  `confirmation: "ROTATE-SECRET-NOW"` body field. Records intent only;
  actual rotation is `wrangler secret put`.
- `admin/jids/edit/route.ts` — POST, gated, audited, demands
  `confirmation: "EDIT-ADMIN-JIDS"` body field, refuses empty list.

### Outstanding / stubbed

- The upstream Worker (`hub-cloudflare/src/worker.ts`) does **not**
  expose `/dlq`, `/dlq/<id>/replay`, or `DELETE /dlq/<id>`. The admin
  DLQ routes are wired end-to-end but currently return a stubbed empty
  list and stubbed-success on replay/discard. To unstub, add `case
  '/dlq':` and a `/dlq/...` regex matcher in the Worker switch around
  line 36, listing/mutating from D1/KV.
- Panel-server (`hub-bus-tools/panel-server.mjs`) doesn't currently
  expose `/api/bridges`. The `/api/bridges` Next route falls back to
  the canonical 3 (`lmstudio-bridge`, `gemini-bridge`, `adam-bridge`)
  with status `unknown`. To unstub, add a route handler in
  panel-server.mjs that introspects the spawned bridge processes.
- `app/components/AdminAuditLogViewer.tsx` (existing chassis component)
  still uses mock data — it would need a `GET /api/admin/audit/list`
  route reading from `AUDIT_KV`. Out of scope; left untouched.
- **`app/(authed)/page.tsx` was created in error and conflicts with
  `app/page.tsx`** (both resolve to `/`). The Write tool cannot delete
  files. The user MUST manually run
  `del app\(authed)\page.tsx` (Windows) or
  `rm "app/(authed)/page.tsx"` (Unix) before `next build` will succeed.
  The file's contents are clearly marked with `!!! DELETE THIS FILE !!!`
  at the top.

### aether-shunt-hub bootstrapped to live + Pattern X AI annotations shipped (2026-05-13)

Session goal: take the workspace from "architecturally interesting but unusable" to a deployable checkpoint with operator-facing button affordances backed by the AI stack.

**SPA realignment (preflight):**
- Default landing tab reverted from `'hub'` to `'shunt'` (`hooks/components/mission_control/MissionControl.tsx:73`). Rail comment in `App.tsx`/`MissionControl.tsx` now documents the architectural framing: SPA = personal text-transform tool (original purpose), Hub/Control/NEXUS tabs = augmentation surfaces. Supersedes `COWORK_HANDOFF §7.5 #7`.
- CLAUDE.md drift diff applied verbatim from handoff §5 (telemetry consolidation, MissionControl tabs section rewrite, BUILD_LOG/HANDBOOK/STATE_SNAPSHOT pointers added).

**aether-shunt-hub bootstrap (Phase 1):**
- `npm install` plus newly-required deps: `@tailwindcss/postcss`, `tailwindcss@^4.1.11`, `autoprefixer`, `tw-animate-css`, `date-fns`.
- Cleared Next 16 build blockers: deleted scaffold `app/page.tsx` (conflicted with `(dashboard)/page.tsx`); removed broken `@import "shadcn/tailwind.css"` from globals.css; stripped stale `webpack:` block + bogus `transpilePackages: ['motion']` from `next.config.ts`; added stub exports for missing `getAuditLogs` / `getPendingOlderThan60sCount` in `lib/audit.ts`.
- Ported `components/layout/Navigation.tsx` forward from `zip/` (the stale snapshot zack had been pointing me at). Wired into `app/layout.tsx`; metadata title corrected from "My Google AI Studio App" to "Aether Shunt — Management Hub".
- `orchestrator/status/route.ts`: ripped the deceptive fake-bridges fallback. Now returns honest `{bridges:[], orchestratorDown:true, reason:...}` 502 when the upstream is unreachable.
- `.env.local` + `.env.example` written with the real keys (PANEL_SERVER_URL, ORCHESTRATOR_URL, WORKER_URL, HUB_API_SECRET, HUB_ADMIN_JIDS, HUB_DEV_JID, HUB_AI_*).
- **`zip/` and `zip.zip` are stale snapshots, not backups.** They are the original AI-Studio-scaffold (`@google/genai` dep, Next 15, 54 files). `aether-shunt-hub/` is the canonical evolution (Next 16, clean deps, 121 files, ~3× the components). Don't restore from `zip*`.

**AI service module (Phase 2):**
- `lib/ai/aiService.ts` — minimal OpenAI-compatible client. **Server-side, env-driven** (HUB_AI_BASE_URL/MODEL/API_KEY/TIMEOUT_MS), because Next route handlers can't read the SPA's localStorage across origins. AbortController timeout, retry-with-backoff on 429/5xx.
- `lib/ai/annotatePrompt.ts` — system + user prompt builder for operator-facing annotations.
- `app/api/ai/annotate/route.ts` — Zod-validated POST endpoint; smoke-verified end-to-end (LM Studio returned a real annotation: "Success. The bridge has been restarted successfully. No action needed.").

**Pattern X — "AI on the output" (Phase 3):**
The architectural decision after a long thread: existing admin/CRUD actions run unchanged, but their results are auto-annotated by an LLM in a collapsible block. Buttons keep their behavior; the AI adds eyes. Distinguished from Pattern Y (AI gates the action).
- `components/ai/ExplainAction.tsx` — primitive client component. Modes: `auto` (fires on result arrival) and `manual` (button). Collapsible, retry, error surfacing.
- Wired into 7 action surfaces: `OrphanRecoveryTrigger`, `CompactionTrigger`, `DLQReplayAction`, `DLQDiscardAction`, `BulkDLQPurge`, `BridgeRunMatrix` (single panel keyed for re-fire across bridges/actions). `PermFailFlip` correctly skipped — pure scaffold stub with no fetch handler to annotate.

**Security (real, not stubs):**
- `lib/auth-headers.ts` rewritten. Was no-op (`{isAdmin: true}` always); now reads `x-is-admin` header that `middleware.ts` stamps based on `HUB_ADMIN_JIDS` + `HUB_DEV_JID`/`?jid=`/`x-auth-email`. **Default-deny.**
- `HUB_DEV_JID=@zack` added to env so admin actions work in loopback dev without query params.
- README now has a **Security / trust model** section documenting what's loopback-trusted (rate-limit stub, no CSRF) vs what's real (identity gating, server-side secrets).
- `.env.local` covered by `.gitignore` (`.env*` with `!.env.example` exception).

**Claude as first-class bus peer:**
- `hub-bus-tools/claude-bridge.mjs` shipped (was missing). Mirrors `gemini-bridge.mjs` pattern. Spawns `claude -p <body>`.
- `orchestrator.mjs` wired with `--no-claude` flag + brightYellow color in the children list.
- Bus is now symmetric: `@claude`, `@gemini`, `@lmstudio`, `@adam`, `@panel-server`, `@retry-daemon`.

**Two-Claude executor/architect pattern in operation:**
This session ran with two Claude Code instances communicating through zack as courier (per handoff §11). Original session = architect/dev; second instance in admin PowerShell = executor running services in background. Verified by both: status board format, fire-word dispatch, copy-paste-friendly replies, no menu bloat.

**Port :7777/:7778 split (operator decision: P-launcher):**
- `panel-server.mjs` stays canonical on `:7777` (bus inspection: `/api/state`, `/api/transcript`, `/api/inbox/`, `/api/envelope/`, `/healthz`).
- `cockpit/launcher.cjs` renumbered `7777 → 7778` (`PORT` const + README ×4 + `HealthPoller` fetch URLs ×2 + `use-transcript-tail` LAUNCHER_URL + Tier3DebugTool error message). Exposes orchestrator API (`/status`, `/start`, `/stop`, `/restart`, registry persistence) + the new `/transcript/tail` widget endpoint.
- aether-shunt-hub `.env.local`: `PANEL_SERVER_URL=http://localhost:7777`, `ORCHESTRATOR_URL=http://localhost:7778`. Both daemons run in parallel; no collision.

**Verified-live state (per executor smoke):**
- Hub boots in ~262ms on `:3003`. All 7 UI routes serve HTML.
- LM Studio `:1234` healthy (model `rpbizkit-v5-12b-lorablated-i1`).
- Orchestrator + 5 children up (lmstudio/gemini/claude/retry/panel) with live heartbeats.
- `:3003/api/ai/annotate` round-trips real text from LM Studio.
- `:3003/api/orchestrator/status` now 200 (was 502) via launcher proxy.

**Open gaps surfaced this session (not closed tonight):**
1. **Bridge state isn't truly observable.** `launcher.cjs /status` returns its own self-status (`{status,running:[],pid}`), not the supervisor's child list. The supervisor (`hub-bus-tools/orchestrator.mjs`) is CLI-only — no HTTP face. BridgeRunMatrix renders "no bridges" (empty, not 502). The real fix is adding an HTTP endpoint to `orchestrator.mjs` exposing children with state/restarts/lastError/lastSeenAt. This is also the natural home for `/restart/:bridge`, `/stop/:bridge`, `/start/:bridge` — completing what `bridge-admin-handler.ts` expects.
2. **claude-bridge has two cooperating bugs** (diagnosed by executor, fix not applied):
   - **Bug 1: Windows shell-mangling.** `USE_NODE_DIRECT` is false on this machine because `claude.exe` is at `C:\Users\Falki\.local\bin\claude.exe` (native installer), not the npm bundle path (`%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\cli.js`) that `resolveClaudeBundle()` checks. Falls to `shell:true` → cmd.exe word-splits the body on punctuation → `claude.exe` receives shredded argv → exits 1. The file's own header comment warns about this exact failure mode.
   - **Bug 2: Missing kind filter.** `handleEnvelope()` processes ALL inbound envelopes (kind=`response`, `error`, etc.), not just `kind=request`. lmstudio's reply gets reprocessed as a new work item by claude-bridge, fails, sends an error back, lmstudio asks the LLM about the error, replies again → infinite ping-pong loop. Bug 1 makes the loop visible (failing); fixing Bug 1 alone would convert it to a SUCCESS loop (still infinite, just chatting).
   - **Surgical fix** (post Bug 2 first — it's the actual loop): right after `validateEnvelope` in `handleEnvelope`, drop non-`request` envelopes via `releaseEnvelope(newPath, 'done')` and return. `gemini-bridge` and `lmstudio-bridge` likely share the same omission — **audit before fixing asymmetrically** (the invariant should be "every bridge filters `kind === 'request'` at intake"). Bug 1 is a separate spawn-path correctness issue; cleanest fix is piping the prompt via stdin instead of argv in the `shell:true` branch.

**Cosmetic remaining (non-blocking):**
- `aether-shunt-hub/middleware.ts` should rename to `proxy.ts` (Next 16 deprecation; auto-shimmed at runtime).
- Stray `C:\Users\Falki\package-lock.json` causes Next's "multiple lockfiles" workspace-root warning. Delete it or set `turbopack.root` in `next.config.ts`.
- `cleanup.bat` written at repo root with list+confirm+delete pattern, awaiting operator double-click for UI/3ui/4ui/features removal.

**Standing fire-word queue at end-of-session** (for the executor's terminal):
`audit-kind-filters` → `stop-loop` → `bridge-state-orch` → `fix-claude-shell` → cosmetic items (`proxy-rename`, `lockfile-clean`, `cleanup`).

### Pattern Z Phase 1 — Preflight baseline (2026-05-14)

Architect: Cowork (Claude Opus 4.7). Executor: Claude Code CLI in admin terminal.

- **Bus :7779** — 5 children running (lmstudio-bridge, gemini-bridge, claude-bridge, retry-daemon, panel-server), restarts=0, uptime 14,882s (~4h since the 2026-05-13 21:58 boot).
- **SPA :3000** — was down at first check; operator launched via `npm run dev`; came up on Vite v6.4.2 in 280ms, HTTP 200.
- **LM Studio :1234** — 37 models loaded, including `rpbizkit-v5-12b-lorablated-i1` (the resolved model the lmstudio-bridge is currently bound to).
- **NEXUS :8000** — `status: healthy`, `dna_version: 1.0.0`, uptime 22,174s. Adam still cycling clean from yesterday's run.
- **Baseline hashes** captured at `pattern-z-baseline-hashes.txt` for 9 files (orchestrator, 3 bridges, aiService.ts, types/index.ts, Settings.tsx, App.tsx, MissionControl.tsx). sha256sum-style format for clean Phase 8 diff. Original `Format-Table | Out-File` attempt was truncated; rewritten with full-width hashes.
- **Note on uptime jump** (14,882s reported by /status when Executor's prior known state was 70s) was a false-alarm wall-clock gap — the Executor terminal was lost yesterday and operator was offline for ~4 hours between baseline-from-last-session and this init. Math reconciles: orchestrator started 2026-05-13T21:58:22Z, status read at 2026-05-14T02:06:56Z, delta ≈ 14,914s ≈ 14,882s reported. Bus is genuinely the same process.
- **Phase 1 §2.1 deviation:** SPA was down at the initial check; per §2.1 rule "If any of the above fails, STOP," Executor halted. Operator authorized `dev-spa` override → SPA started → re-check passed. Phase 1 considered complete only after the re-check. No code touched.

Next: Phase 2 — Multi-LM-Studio bridges (§3 of the build plan).

### Pattern Z Phase 2 — Multi-LM-Studio bridges (2026-05-14)

Architect (Cowork) applied three file changes. Executor verified.

- **`hub-bus-tools/lms-instances.json`** created (seed, version 1). Single slot `@lmstudio-1` with `model: null` so the bridge's `resolveModel()` auto-resolve via `/v1/models` fires on boot.
- **`hub-bus-tools/lmstudio-bridge.mjs`** — `const ME` now reads `process.env.LMSTUDIO_JID || '@lmstudio'`. INBOX_DIR derives from ME, so each instance polls only its own inbox.
- **`hub-bus-tools/orchestrator.mjs`** — `import fs` added; new `loadLmsInstances()` function (with parse-error + missing-file fallbacks); `DEFAULT_CHILDREN` spreads N children from `lms-instances.json`, each with `envOverride: { LMSTUDIO_JID, LMSTUDIO_MODEL? }`; `ChildSupervisor.spawn()` merges `envOverride` into `process.env` for the child only (no parent-env pollution).
- **Verification** — `node --check` silent on both modified files. Bus restarted clean; `/status` shows 5 children running, restarts=0, new PIDs across the board. `lmstudio-bridge-1` registered (replaced the old `lmstudio-bridge` name).
- **Smoke** — `@zack → @lmstudio-1` envelope round-trip succeeded in ~1.8s. Correct `replyTo`, correct `trace`, correct JID source. Envelope mechanics proven end-to-end.

**Two drift findings worth capturing for future verify scripts:**

1. **Wire convention: bridges reply with `kind:response`, NOT `kind:reply`.** The build plan's §3.7 smoke template said `kind:reply`. Executor's first polling filter looked for `kind:reply` and missed the actual reply until the filter widened. The bus has always used `kind:response` per existing transcript history. The Pattern Z aggregator (§4 of the plan) is kind-agnostic on reply collection (matches by `replyTo`), so this doesn't affect Pattern Z behavior at runtime — but any future verify script that filters by `kind` must use `'response'`, not `'reply'`. The build plan itself should be patched to match — flagged for cleanup, not blocking.
2. **The "ask the LLM its own model id" smoke is over-optimistic.** LLMs hallucinate their own identifiers (this run returned `"llmstudio_01"`, not the bridge-resolved `rpbizkit-v5-12b-lorablated-i1`). The substantive Phase 2 proof is the envelope mechanics (replyTo + trace + JID source + roundtrip latency), not body content. A stricter Phase 2 smoke would either use a bridge-internal `kind:ping` that doesn't reach the LLM, or compare per-JID reply latencies / message-id presence. Flagged for future test refinement.

Next: Phase 3 — Aggregator (§4 of the build plan).

### Pattern Z Phase 3 — Aggregator (2026-05-14)

Architect (Cowork) wrote `hub-bus-tools/aggregator.mjs` (~310 lines) and registered it as an orchestrator child. Executor verified.

- **`hub-bus-tools/aggregator.mjs`** created. Imports: `createEnvelope`, `writeEnvelopeToBus`, `readInboxFor` from `./envelope.mjs`; `releaseEnvelope` from `./claim.mjs` (caught during pre-write export inventory; the plan narrative implied envelope.mjs but the file lives in claim.mjs). Bind: `127.0.0.1:7780` loopback. Endpoints: `/healthz`, `/dispatch`, `/participants` GET/PUT, `/lmstudio-models` proxy. Reply collection by `replyTo` (kind-agnostic, matches the actual bus `kind:response` convention).
- **`hub-bus-tools/orchestrator.mjs`** — aggregator entry added to `DEFAULT_CHILDREN` between the lmstudio spread and gemini-bridge, color `brightCyan`.
- **Verification** — node --check silent on both files. Bus restarted cleanly (npm wrapper PID killed via taskkill /T, fresh start spawned 6 children). `/status` shows `aggregator` state=running, restarts=0, 6 children total: lmstudio-bridge-1, aggregator, gemini-bridge, claude-bridge, retry-daemon, panel-server.
- **Endpoint reachability** — `/healthz` returns ok:true. First `GET /participants` correctly seeded `hub-bus/participants.json` from `lms-instances.json` (single @lmstudio-1 slot, model=null; 4 external peers with @claude+@gemini enabled by default). `/lmstudio-models` proxy returned LM Studio's full model catalogue.
- **Smoke dispatch** — `intent: 'smoke.test'`, `prompt: 'Reply with the single word: pong'`, `strategy: 'synthesize'`. Result: `joint_output: "pong"`, `replied_count: 2`, `fanout_count: 2`, elapsed **8.7s** end-to-end. `@gemini` and `@claude` both returned literal "pong" cleanly — round-trip preserves strings without escape mangling.

**Three observations worth capturing:**

1. **@lmstudio-1 filtered exactly as designed.** With `model: null` in the seeded participants, `activePeersFrom(config)` correctly skipped it. Verified by absence from `source_candidates`. The seed-with-null-model pattern works as intended — operator sets a real model id in Phase 4 UI before LM Studio joins fanout.
2. **Synthesizer short-circuit observed.** The 8.7s elapsed is fast for a Claude CLI + Gemini CLI + synthesis chain. Cause: `synthesizeViaPeer` short-circuits to `pickLongestCoherent` when the configured synthesizer JID (`@claude` by default) is itself in the candidate set — to avoid recursive dispatch. In this smoke, @claude WAS in candidates, so no third "synthesize" envelope shipped. **Design implication:** with the default config, "synthesize" strategy effectively degrades to "pick longest coherent" whenever @claude is in the fanout. Real synthesis only fires when @claude is excluded from fanout or `SYNTH_JID` env points to a peer not in candidates. **Not blocking** — pick-best is a reasonable fallback — but worth a design conversation before Phase 5 wires real button intents that expect true synthesis. Options: (a) require fanout to exclude synthesizer, (b) dedicate a non-fanout synthesizer JID, (c) always dispatch synthesis even to a candidate JID (let it merge its own with others'). Defer to operator decision.
3. **String fidelity proven.** Both bridges returned the literal prompt-requested word without quote escaping, JSON-stringification artifacts, or trailing whitespace. The bus + bridges + aggregator path is safe for Phase 5's real prompts (em-dash / ampersand / quote-rich bodies).

Next: Phase 4 — Participants UI in Settings (§5 of the build plan).

### Dev UI boot verification (2026-05-15)

Executor (Claude Code) booted the SPA dev server fresh.

- **No `npm install` needed** — `node_modules/` present, `node_modules/.bin/vite` resolvable, deps intact.
- **`npm run dev` succeeded on first try.** Vite v6.4.2 ready in 217 ms. **No fixes required**, no source edits, no config edits.
- **Port fallback:** configured port 3000 was already occupied by an unrelated node process (PID 4540 — likely a prior dev session that didn't get torn down). Vite auto-fell-through to **`http://127.0.0.1:3001/`**. Loopback bind preserved (vite.config.ts L14 `host: '127.0.0.1'`).
- **Smoke:** `curl http://127.0.0.1:3001/` → HTTP 200, 1168 bytes. `/index.tsx` transforms cleanly through Vite (React + ErrorBoundary + App mount visible in the SSR-less ESM output). No transform errors, no module-resolution failures in the initial fetch.
- **Stale `node_modules/.vite/deps` cache** carried over from prior session (`?v=e2c37736`) and was reused — not invalidated. Acceptable for a clean boot since `package.json` hasn't changed since last dep prebundle.

**Operator note:** the PID-4540 node process holding :3000 is unaccounted-for. If it's a stale dev server from yesterday's session, kill it before the next dev run so the SPA lands on its canonical :3000 port (the inline self-heal in `index.html` and any operator muscle-memory both assume :3000).

#### Connectivity check — LM Studio + bus topology (2026-05-15)

- **LM Studio HTTP API:** reachable on both `/v1/models` and `/api/v0/models`. **One model loaded:** `gemma-3-27b-it-abliterated-normpreserve` (gemma3 arch, Q4_K_M, max_ctx 131072, loaded_ctx 23503). All other ~20 catalogued models report `state: "not-loaded"`.
- **Bus processes:** **none running.** No `hub-bus-tools/orchestrator.mjs`, no `lmstudio-bridge.mjs`, no `aggregator.mjs`, no `claude-bridge.mjs` / `gemini-bridge.mjs`, no `panel-server.mjs`, no `dual.mjs`. Only artifacts found: PID 3456 `cmd /K start/start-nexus-prime.bat` (NEXUS-PRIME launcher window, unrelated to the hub-bus) and the LM Studio renderer process itself. Phase 2/3 work logged above is currently dormant on disk.
- **UI ↔ LM Studio wiring:** **SPA calls LM Studio directly, no bus middleman.** `styles/services/aiService.ts:23` hardcodes `DEFAULT_BASE_URL = 'http://localhost:1234/v1/chat/completions'`; `aiBaseUrl` from `localStorage` overrides it but defaults to the same. The aggregator (`hub-bus-tools/aggregator.mjs`, port 7780) and `panel-server.mjs` (port 7777) are NOT referenced anywhere in the SPA's runtime source — they exist only in the Next.js `aether-shunt-hub/` ops console, which is also not running.
- **Anything wrong:** (1) The SPA will work fine since LM Studio is up and a model is loaded — but it bypasses the Pattern Z aggregator entirely, so Settings UI choices about fanout/synthesis have no effect on the Shunt/Weaver/Foundry buttons. (2) Default model in the SPA is `local-model` — LM Studio's loaded id is `gemma-3-27b-it-abliterated-normpreserve`; operator must set `aiModel` in Settings or the first call will 404 on the model id (LM Studio is strict about model names on `/v1/chat/completions`). (3) If multi-LLM coordination is the goal of this session, the bus needs `npm run bus:start` first.

#### Feature: global Stop-generating button (2026-05-15)

Closes the gap CLAUDE.md flagged: *"There is no `AbortController` integration yet — long-running calls cannot be cancelled."* Operator can now cancel any in-flight AI call from anywhere in the SPA.

- **`styles/services/aiService.ts`** — added module-level `inflightControllers: Set<AbortController>`. `callChatCompletion` creates a controller per call, registers, passes `signal` to `fetch`, removes in `finally`. New public exports: `cancelAllGenerations(): number` (aborts every in-flight call, returns count aborted) and `getInflightCount(): number`. Emits `'ai-inflight-changed'` on the bus with the new count whenever the set size changes. Abort path throws `AiServiceError('Generation cancelled by user.')` — does NOT match the `withRetries` retry patterns (`'network error' | 'fetch failed' | 'rate limit'`), so cancellation doesn't trigger silent retries. Verified by inspecting `apiUtils.ts:35-40`.
- **`lib/eventBus.ts`** — added `'ai-inflight-changed': { count: number }` to `AppEvents`.
- **`hooks/components/StopGenerationButton.tsx`** — new component. Floating fixed-position purple pill bottom-right, z-index 9999. Subscribes to `'ai-inflight-changed'`, only renders when `count > 0`. Click → `cancelAllGenerations()`. Pluralized label: "Stop generating" or "Stop generating (N)" when multiple parallel calls.
- **`App.tsx`** — imports `StopGenerationButton`, renders it inside `AppContent` as a sibling to `<MissionControl />` and `<MiaAssistant />`, wrapped in its own `<ErrorBoundary>` (consistent with the other root-level mounts). Provider stack untouched — the button uses the event bus directly, not React context, so no nesting concerns.

**Scope.** Cancels all in-flight calls globally. Per-tab cancellation deferred (would require threading `AbortSignal` through every call site — much bigger diff).

**Coverage.** Every public function in `aiService.ts` (`performShunt`, `executeModularPrompt`, `gradeOutput`, `synthesizeDocuments`, `generateRawText`, `analyzeImage`, all the Mia helpers, JSON-mode calls via `generateJson`, chat sessions via `startChat`) routes through `callChatCompletion` — so this single change covers every text-transform/chat/analysis call in the SPA.

**Not yet handled.**
1. The inline self-heal script in `index.html` makes its own `fetch` directly to the user's AI endpoint when a module-resolution error fires — it's outside `aiService.ts` and intentionally so (it needs to work when React hasn't mounted). It is NOT cancellable via the Stop button. Acceptable: self-heal calls are short and rare; cancelling them would defeat their purpose.
2. Streaming responses don't exist yet (`sendMessage` is single-shot), so "Stop" cancels the wait but cannot reclaim partial output. Out of scope for this change.
3. Mia's auto-fix `applyFix` / `generateFixAttempt` flows route through `aiService` and ARE cancellable — but the Mia context tracks its own `activePlan` state, which will go stale if the user cancels mid-flow. CLAUDE.md already flags MiaContext as having no mutex; this change doesn't make it worse, but a Mia-aware abort might want to clear `activePlan` on cancel. Future work.

**Verification.** `npx tsc --noEmit` — no new errors. Vite HMR picked up the changes cleanly: `eventBus.ts` triggered a full page reload (correct — not a React component), `aiService.ts` + `App.tsx` hot-updated. Live smoke pending operator: run a Shunt transform, see the button appear bottom-right, click it, confirm the request aborts and the UI surfaces the "Generation cancelled by user." error.

### Repository initialized and pushed (2026-05-16)

Operator confirmed; first commit landed publicly.

- **`git init -b main`** in repo root, `user.email=halkive@gmail.com`, `user.name=Falki` (local config; global config left untouched).
- **`origin`** set to `https://github.com/QFiSouthaven/Shunt_final_V.git` (was an empty repo on GitHub).
- **`.gitignore`** extended on top of the existing Vite-default ignore. New entries cover: `**/.next/`, `**/.turbo/`, `**/.vite/`, `*.tsbuildinfo`, `.wrangler/`, `.claude/settings.local.json`, `Thumbs.db`/`Desktop.ini`, all `hub-bus/` runtime state (`inbox/`, `outbox/`, `.processing/`, `archive/`, `dlq/`, `transcript.jsonl`, `presence.json`, `.presence.*`, `.seq.*`, `*.tmp`), `zip/` + `zip.zip`, `Conversation history/`, `phase-4-tsc.txt`, `pattern-z-baseline-hashes.txt`, and the malformed `CUsers...hub-bus/` ghost dir (matched via ASCII wildcard `C*Users*Falki*shunt-final-v*hub-bus/`).
- **`.claude/settings.json`** created with two allowlist entries (`Bash(npm run dev)`, `Bash(npx tsc --noEmit)`) — **note:** inert under current `defaultMode: bypassPermissions` global, but standing safety net.
- **Initial commit `de9bfcc`** — 439 files, ~5.5 MB. Secret scan (`sk-*`, `ghp_*`, `AIza*`, `xoxb-*`, `aws_secret_access_key`, `BEGIN PRIVATE KEY`) ran clean before commit.
- **Pushed to `origin/main`.** Remote tip matches local: `de9bfcc90c545cc0ad77aaad190f9c13c6de20ec`. Branch tracking set up.

**Operator-relevant items now public on GitHub:**
- Cloudflare account ID (`c6e9f3ff...`), KV namespace ID (`80e03b13...`), D1 database ID (`d04...c7ed24`) — these are resource identifiers, NOT credentials. They don't grant access on their own, but they're enumerable.
- All operational docs (`ADMIN_TERMINAL_KICKOFF_*`, `COWORK_HANDOFF`, `STATE_SNAPSHOT`, `HANDBOOK`, this build log).
- `hub-bus/PROTOCOL.md`, `participants.json` seed, `README.md` — protocol surface is documented.

**Next-step recommendations.** (1) Decide if the repo on GitHub should be public or private — set visibility in repo settings if not already done. (2) For future commits: now that the safety net exists, code changes I make can be reviewed via `git diff` and rolled back atomically instead of re-reading files turn-over-turn. (3) Consider adding a `.github/workflows/typecheck.yml` to run `npx tsc --noEmit` on PRs once the repo gets multi-contributor activity.

### Phase A — Personal SPA polish (2026-05-16)

Operator chose sequenced finish-line: **A (personal SPA) → B (cross-machine hub) → C (P1 hardening)** across 3–4 sessions. Phase A landed in one turn.

**A.1 — Auto-detect default model from `/v1/models`.** `styles/services/aiService.ts`: `resolveModel` is now `async`; when no caller-provided model AND configured `aiModel` is the placeholder `'local-model'`, probes `${baseUrl/v1/models}` once per session (cached per baseUrl, with a single inflight `Promise` per probe to prevent thundering-herd on first call), takes the first id from `data[0].id`. Falls back to `'local-model'` if the probe fails. All 17 call sites that used `model: resolveModel(...)` simplified to either `model: modelName` or `model: undefined` — resolution happens inside `callChatCompletion` now. `generateRawText`'s `modelName: string` widened to `modelName?: string` to allow `undefined`. **Eliminates the "first call 404s on unknown model id" friction** that blocked operator smoke-test in earlier sessions.

**A.2 — Orphan tab pruning.** CLAUDE.md flagged 5 keys not rendered. Audit found 4 actually orphan (`ui_builder`, `orchestrator`, `anthropic_chat`, `serendipity_engine`) and 1 false-flag (`chat` IS lazy-imported and rendered at MissionControl.tsx:92). Removed the 4 keys from `MissionControlTabKey` union in `types/index.ts`. Deleted 8 dead files via `git rm`:
- `hooks/components/ui_builder/UIBuilder.tsx`
- `hooks/components/orchestrator/{CustomOrchestratorNode,NodeDetailsPanel}.tsx` + `nodes/{AudioOutputNode,AudioSourceNode,UIEventNode}.tsx`
- `hooks/components/mission_control/Orchestrator.tsx`
- `types/index.ts.bak.4` (stale backup, was caught in initial commit)
Updated CLAUDE.md to reflect the new state.

**A.3 — Mia mutex.** `styles/services/context/MiaContext.tsx`: added three `useRef<boolean>` re-entry guards — `diagnoseInflightRef`, `generatePlanInflightRef`, `applyFixInflightRef`. Each function returns early if its ref is already true, flips it true after the entry checks, and resets it in `finally`. Refs flip synchronously (state setters are async + batched, so the original `isLoading`/`isGeneratingPlan`/`isApplyingFix` checks couldn't gate fast double-clicks). `applyFix` was also restructured: its body is now wrapped in `try/finally` so the ref always resets even on the early-return file-write error path. Closes the race CLAUDE.md flagged.

**A.4 — Streaming responses.** New `callChatCompletionStream(opts, onToken)` in `aiService.ts`: same controller registration + Stop-button cancellation as the non-streaming path, but consumes SSE chunks from `stream: true`. Buffers and splits on `\n\n` frame boundaries, parses each `data:` line, extracts `choices[0].delta.content`, fires `onToken(delta)` per token. Tolerates malformed frames (some servers send keepalive comments). New `getMiaChatResponseStream(history, message, onToken)` wraps it for Mia. **Wired to MiaContext.sendMessage**: places a placeholder Mia message immediately, mutates its text via `setMessages(prev => ...)` per token. If streaming fails before the first token, falls back to `getMiaChatResponse` (single-shot) so the user still gets a reply. If streaming fails mid-stream, surfaces the error (no fallback — fallback would duplicate the partial output). **Other call sites (Shunt, Weaver, Foundry, etc.) left on single-shot** — they're one-shot transforms, not chat, so streaming has lower UX value there. Hook is in place for future opt-in.

**A.5 — Smoke checklist for operator.** New `docs/PHASE_A_SMOKE_CHECKLIST.md`. Covers boot, Settings, every active tab, Mia, Stop button behavior, and explicit "expected partial" callouts for Hub/Control/A2A/Journal/Goals/Evolution (the tabs that need Phase B's bus + the NEXUS-PRIME backend). Operator runs through it, hands back any failures, Phase A closes when nothing critical is red.

**Verification.** `npx tsc --noEmit` clean after every change (only pre-existing unrelated error in `tools/organize-conversation-history.mjs:684`). Vite HMR picked up all updates. Live smoke pending operator pass-through of the checklist.

**Not done in Phase A (intentionally deferred):**
- Streaming for non-chat call sites (Shunt/Weaver/etc.) — low UX value, defer until requested.
- The hardcoded "3D-artist + Virt-a-Mate JSON preset" in `analyzeImage` (CLAUDE.md flags it as non-generic) — operator-specific feature; rewrite only if it conflicts with smoke-test goals.
- Kill the PID-4540 zombie node on :3000 — operator action; documented in earlier 2026-05-15 entry.

### Phase B — Cross-machine hub: cloud-puller (2026-05-16)

Operator pointed out the receive-side gap: dual-write only POSTs envelopes to the Worker; nothing pulls them back into a remote machine's file-bus. Built the missing piece.

- **`hub-bus-tools/cloud-puller.mjs`** (NEW). Opens one WebSocket per local-owned JID to `wss://hub-relay.halkive.workers.dev/ws?room=#main&jid=<jid>&token=<secret>`. Worker tags the connection with `${TAG_JID_PREFIX}<jid>` so any envelope addressed to that JID gets pushed over the WS. Cloud-puller validates each incoming envelope and writes it into the local file-bus via `writeEnvelopeToBus(env, busDir, { skipDualWrite: true })`. Auto-reconnect with exponential backoff (1s → 30s cap, resets after 60s clean uptime). Self-echo suppression (drops envelopes where `from === <subscribedJid>`). Exits cleanly with code 2 if `WORKER_URL` or `WORKER_SECRET` is missing so the orchestrator marks it permanently_failed (no restart loop).
- **`hub-bus-tools/envelope.mjs`** — `writeEnvelopeToBus(env, busDir, opts)` gained a third `opts.skipDualWrite` param. Cloud-puller passes `true`; all other callers (bridges, send.mjs, aggregator) leave it off. Prevents the obvious loop: A → Worker → B's cloud-puller → B's file-bus → dual-write → Worker → B's cloud-puller → ...
- **`hub-bus-tools/orchestrator.mjs`** — registered `cloud-puller` in `DEFAULT_CHILDREN` with `enabled: false`. Opt-in via `--enable=cloud-puller`. Uses brightMagenta log color.
- **Discovery of already-done work:** `STATE_SNAPSHOT.md §7.2` listed "bridges dual-write to Worker" as outstanding. It was already implemented at `envelope.mjs:412` — gated on env vars. Similarly P1 #2 (WS-upgrade KV presence mirror) was already done at `hub-room.ts:109`. Updating STATE_SNAPSHOT.md is a Phase C cleanup task.

**To enable cross-machine on a host:**
1. Export `WORKER_URL=https://hub-relay.halkive.workers.dev` and `WORKER_SECRET=<HUB_API_SECRET>` in the orchestrator's parent shell.
2. `npm run bus:stop`, then `node hub-bus-tools/orchestrator.mjs --enable=cloud-puller`.
3. Verify `curl http://127.0.0.1:7779/status` shows cloud-puller running.
4. Send a test envelope from another machine; watch local `hub-bus/inbox/<jid>/` for the delivery.

**For aether-shunt-hub Pages deploy** (deferred operator action): `wrangler.toml` is in place with three KV namespace placeholders (`AUDIT_KV`, `AUDIT_FAILURES_KV`, `RATE_LIMIT_KV`). Either use Cloudflare Workers Builds with GitHub integration (recommended; root dir `aether-shunt-hub`, framework Next.js, build `npm install && npm run build`, output `.next`), or install `@cloudflare/next-on-pages` + `wrangler` locally and `wrangler pages deploy`. Either path needs the operator to create the three KV namespaces, fill IDs into wrangler.toml, and set production env vars (`HUB_API_SECRET`, `HUB_ADMIN_JIDS`, `WORKER_URL`).

**Verification.** `node --check` clean on cloud-puller, envelope, orchestrator. Live WS test requires WORKER_SECRET (operator action).

**Not in Phase B (moved to Phase C):**
- Rate limits in Worker (P1 #6)
- Hop counter eviction (P1 #1)
- Per-JID presence files (P1 #3)
- Other P1 hardening items 4–11

**Process note.** Operator surfaced that the project has accumulated 12 plan/runbook/checklist documents across 5 weeks (5,165 lines) and re-planning is masquerading as progress. Saved a session-memory rule: don't write new plan docs; append to BUILD_LOG or just execute. The interrupted `docs/PHASE_B_RUNBOOK.md` was deleted before commit per that rule. `docs/PHASE_A_SMOKE_CHECKLIST.md` was already in the prior commit — leaving it (removing would be more churn), but no successor checklist will be created.

### Phase C — P1 hardening (2026-05-16, ongoing)

Operator greenlit a roll through STATE_SNAPSHOT.md §4 P1 backlog. Atomic commit per item.

#### P1 #6 — per-JID rate limits (Worker)

Single-looped sender could exhaust free-tier ceilings in minutes. Fixed.

- **`hub-cloudflare/src/types.ts`** — `Env` gained two optional vars: `RATE_LIMIT_PER_JID_BURST` (default 30) and `RATE_LIMIT_PER_JID_REFILL_PER_SEC` (default 1.0). Set in `wrangler.toml [vars]` to override.
- **`hub-cloudflare/src/hub-room.ts`** — new `consumeRateLimit(jid)` method. Per-JID token bucket stored at `ratelimit:<jid>` in DO storage. Refills based on time elapsed since last consume, capped at `burst`. First-time senders start with a full bucket so legitimate traffic isn't penalized at session start. Returns `{ allowed, retryAfterMs }`.
- **`routeEnvelope`** — calls `consumeRateLimit` BEFORE the more expensive admin/schema/typesafe/hop logic. Bypasses for: `env.from === '@hub'`, admins in `HUB_ADMIN_JIDS`, and control-plane kinds (`leave`, `presence`) so a flap can't drop its own leave.
- **`handleHttpIngress`** — `RATE_LIMITED` → HTTP 429 with `Retry-After` header (seconds). All other failures still 400.
- **WS path** — return code propagates through the existing structured-error response on `webSocketMessage`; no separate envelope emitted (the WS sender can already see the structured error).

**Scope deliberately limited.** This is per-room (one DO per room). A sender looping across many rooms has separate buckets per room. For a global cap, a separate shared-state DO is needed — deferred. The per-room cap still reduces blast radius significantly (a flood in one room doesn't poison others).

**Verification.** Worker `npx tsc --noEmit` clean. Live deploy is operator action (`cd hub-cloudflare && npx wrangler deploy`). To verify post-deploy: hammer `/send` from a single JID until 429 appears; check `Retry-After` matches the deficit in seconds.

#### P1 #1 — hop counter eviction (Worker)

Hop counters at `trace:<trace>:hops` in DO storage used to leak one row per trace forever. Fixed with an opportunistic sweep.

- **`hub-room.ts`** — new `HopCounterEntry` shape `{ hops, expiresAt }`. The expiresAt is taken from the first envelope in the trace (preserved across hops), and falls back to `now + 5min` if the envelope's expiresAt is unparseable. Old-format entries (bare number) are migrated inline on read.
- **`maybeSweepStaleHopCounters()`** — fires at most once per 60s per DO instance. Lists `trace:` prefix, deletes any entry past expiresAt (or any old-format bare-number entry, which is now unreachable garbage). Capped at 200 deletes per sweep so a backlog doesn't stall hot path. Called fire-and-forget from `routeEnvelope` after the hop write — never gates latency.
- **Memory only** — `lastHopSweepAt` is in-memory; on DO hibernation/wake, the next envelope triggers another sweep, which is the desired behavior.

**Verification.** TS clean. Post-deploy verification: trigger one hop, wait for trace to expire, send another envelope (different trace) to fire a sweep, observe via `wrangler tail` that the trace key disappeared.

#### P1 #4 — deterministic-id includes intent + kind; intent no longer dropped

Two related bugs in one fix.

**Bug A — `computeDeterministicId` in `hub-bus-tools/claim.mjs` hashed only `{from, to, trace, replyTo, body}`.** Same body+from+to+trace with different intent → same id → collapse. Retry with body drift → different id → looks like new event. Fixed by including `kind` and `intent` in the canonical-JSON input. Old/new ids will differ for the same logical envelope; the function was exported but not yet called from any bus tool, so internal impact is zero. External integrators who consumed this need to migrate; noted in the docstring.

**Bug B — `createEnvelope` in `hub-bus-tools/envelope.mjs` silently dropped `intent`.** The destructured params list didn't include intent, so `aggregator.mjs` passing `intent: 'synthesize.candidates'` (and similar) produced envelopes WITHOUT an intent field even though the Worker's Zod validator accepts it. Fixed by accepting intent in the param list and emitting it on the envelope (only when truthy — undefined/null/empty stays omitted so `z.string().optional()` continues to pass).

**Verification.** `node --check` clean on both files. Behavioral: aggregator-originated envelopes will now show `intent` in the transcript. Pre-existing transcript entries are unchanged.

#### P1 #7 — sig/issuer namespaced under `_unverified`

Previously: `sig` and `issuer` were top-level optional fields. Anything reading `env.sig` got a value (or null) and could plausibly believe it was verified. v0.3 hasn't shipped verification yet, so every consumer reading those fields was relying on unverified claims as if they were trusted.

Fix: relocate both fields under `env._unverified.*`. The new namespace is syntactic friction against the mistake — there's no way to write `env._unverified.sig` and believe the value is verified.

- **`hub-cloudflare/src/envelope.ts`** — `EnvelopeShape` drops top-level `sig`/`issuer`, adds optional `_unverified: { sig?, issuer? }`. The preprocess step now also relocates any legacy top-level `sig`/`issuer` into `_unverified` and deletes the top-level keys. Existing `_unverified` is preserved if present (and wins over legacy fields when both exist).
- **`hub-cloudflare/src/transcript.ts`** — D1 inserts now read `env._unverified?.sig` / `env._unverified?.issuer`. D1 column names stay `signature`/`issuer` for back-compat with `migrations/0003_envelope_metadata.sql`.
- **`hub-bus-tools/envelope.mjs`** — `validateEnvelope` mirrors the Worker preprocess: relocates legacy top-level fields, type-checks the `_unverified` shape. `createEnvelope` emits `_unverified` when either field is provided; never emits top-level sig/issuer.

**In-flight envelopes** with top-level `sig`/`issuer` continue to validate — they get auto-namespaced on arrival. No senders need to change before the Worker is redeployed.

**Verification.** Worker `tsc --noEmit` clean. Bus `node --check` clean.

#### P1 #8 — panel CORS lockdown

Panel server emitted `Access-Control-Allow-Origin: *` on every response and preflight. Risk: any web page the operator visits could XHR transcript/inbox/presence data out of `localhost:7777`.

- **`hub-bus-tools/panel-server.mjs`** — `PANEL_ALLOWED_ORIGINS` env var (comma-separated). Default: `http://localhost:*,http://127.0.0.1:*` — covers local dev tooling, blocks public sites. Wildcard support at host prefix only (`https://*.pages.dev`). Set to literal `*` to restore the legacy open behavior (NOT recommended; use only when proxying through Cloudflare Access).
- `corsHeadersFor(reqOrigin)` decides what to send: full ACAO + methods + headers when the origin matches an allowed pattern, just `Vary: Origin` otherwise (the browser blocks the response when ACAO is absent).
- Handler stashes the request origin on `res._reqOrigin` once at entry; `sendJson` reads it without needing 19 call-site updates.

**Operator action:** if Cloudflare Pages is in the deploy plan, add `https://aether-shunt-hub.pages.dev` (or the actual Pages URL) to `PANEL_ALLOWED_ORIGINS` in the orchestrator's environment.

**Verification.** `node --check` clean.

#### P1 #9 — orchestrator `permanently_failed` → presence offline

A bridge that exhausts its restart budget previously stayed "online" in `presence.json` forever — the heartbeat that wrote it was gone, but the last stamp remained. Operators reading the panel believed the bridge was alive.

- **`hub-bus-tools/orchestrator.mjs`** — new helpers:
  - `ownedJidsForSpec(spec)` maps a child spec to JID(s) it owns. Pulls from `envOverride.LMSTUDIO_JID` for the lmstudio-bridge-N variants; falls back to a static map for the named single-JID bridges (`claude-bridge` → `@claude`, etc.). Non-bridge children (aggregator, panel-server, cloud-puller, retry-daemon) return `[]`.
  - `markPresenceOffline(jid, reason)` reads `presence.json` (sync), sets `{ online:false, offlineReason, offlineSince, lastSeenAt }` for the JID, atomic-writes back. Returns `false` silently if the file is missing/malformed so we don't synthesize one (heartbeat owns creation).
- Both PERMANENTLY_FAILED transitions in `ChildSupervisor` (post-exit and the scheduleRestart guard) now invoke `markPresenceOffline` for each owned JID. Post-exit path also emits a red `[orch]` log line.

**Verification.** `node --check` clean. Behavioral: kill a bridge until it exhausts `--max-restarts`; presence.json shows `agents['@<jid>'].online = false` and an `offlineReason: 'permanent_fail'`.

#### P1 #3 — per-JID presence files (kill the merge race)

`heartbeat.mjs` did read-modify-write of the shared `hub-bus/presence.json`. Two bridges heartbeating concurrently could read the same state, both modify, both write — last writer wins and the other's `lastSeenAt` is lost. Fix: each bridge writes its OWN file.

- **`hub-bus-tools/heartbeat.mjs`** — `tickHeartbeat` now writes to `hub-bus/presence/<sanitized-jid>.json` (atomic tmp+rename). Each bridge owns its own filename, so concurrent heartbeats can't clobber each other. New helper `presenceFileNameFor(jid)` strips the leading `@` and replaces anything outside `[A-Za-z0-9_-]` with `_`. A live heartbeat clears stale `offlineReason`/`offlineSince` left by a previous permanent-fail (so a successfully-restarted bridge looks online again).
- **`hub-bus-tools/orchestrator.mjs`** — `markPresenceOffline` from P1 #9 was also racing the heartbeat by writing the shared file. Now it writes to `presence/<jid>.json` too, owning the same file the heartbeat does (mutually exclusive since the heartbeat is dead by the time orchestrator marks offline). Synthesizes a minimal file if heartbeat never created one.
- **`hub-bus-tools/panel-server.mjs`** — `readPresence` now prefers the per-JID dir, merges every `<jid>.json` it finds, and falls back to the legacy `presence.json` when no per-JID dir exists yet (so old checkouts keep working through the migration).
- **`.gitignore`** — added `hub-bus/presence/` (runtime state, same treatment as the inbox/outbox).

**Aggregation semantics.** The shared `presence.json` is no longer authoritative. The panel-server merges per-JID files at read time. A future operator-facing view that needs `{ agents, rooms }` can do the same merge (also documented for `cloud-puller.discoverJids`).

**Verification.** `node --check` clean on all three modified files.

#### P1 #5 — transcript ordering: server-side seq from DO

`hub-bus/transcript.jsonl` was ordered by writer wallclock (first-to-`appendJsonLine` wins line position). D1 `transcripts` is ordered by row insertion. Cross-machine clock skew → the two orderings disagree → consumers can't reconstruct causal order from either alone. Fix: the DO mints a per-room monotonic seq at record time.

- **`migrations/0004_server_seq.sql`** — `ALTER TABLE transcripts ADD COLUMN server_seq INTEGER` + composite index `idx_transcripts_room_server_seq (room, server_seq)`. NULL is permitted for legacy rows (back-fill is a separate operator decision).
- **`hub-cloudflare/src/transcript.ts`** — `recordEnvelope(env, db, room, serverSeq=null)` gains a 4th arg, writes it to the new column.
- **`hub-cloudflare/src/hub-room.ts`** — `nextServerSeq()` reads `config:server_seq` from DO storage, increments, writes back. Single-threaded DO request handling means the RMW can't interleave; no locking needed. Both `routeEnvelope` call sites (the `join` early-return and the main route path) mint a serverSeq before passing it to `recordEnvelope`.

**Authoritative ordering** going forward: `ORDER BY server_seq` (or `ORDER BY room, server_seq`). Existing readers ordering by `ts` continue to work; their ordering is just less reliable across writers.

**Operator action.** Apply the migration before redeploying:
```powershell
cd hub-cloudflare
npx wrangler d1 execute hub_transcripts --remote --file=./migrations/0004_server_seq.sql
npx wrangler deploy
```

**Verification.** Worker `tsc --noEmit` clean.

#### P1 #10 — tunnel URL rotation: no code in tree to change

The risk was "panel hardcodes a `cloudflared` quick-tunnel URL → goes stale on restart." Grepping the tree turned up zero hardcoded tunnel URLs (`trycloudflare`, `cloudflared`, `cfargotunnel`, `TUNNEL_URL`) in any `.ts/.mjs/.tsx/.html` file under `hub-bus-tools/`, `hub-bus-panel/`, `hub-bus-panel-desktop/`, `public/`. The Worker is at the stable workers.dev subdomain (`hub-relay.halkive.workers.dev`); the deployed Pages console will be at `aether-shunt-hub.pages.dev` — neither rotates. The original P1 was relevant only if the operator was tunneling the LOCAL `panel-server :7777` via cloudflared; that pattern isn't currently in tree.

**Operator note (if this scenario ever applies):** create a NAMED tunnel via `cloudflared tunnel create <name>`, get the permanent UUID, route DNS via `cloudflared tunnel route dns <name> <hostname>`, and run `cloudflared tunnel --config <cfg.yml> run <name>`. The Cloudflare named-tunnel URL is stable across restarts.

**No code commit for this item.**

#### P1 #11 — Type-Safe Rooms DSL expansion (Task #17)

Previous DSL only handled object-with-primitive-fields. Couldn't express arrays, unions, refinements, nested objects, records, enums. Full JSON-Schema → Zod converter is v0.3 work; this commit expands the hand-rolled DSL to cover ~80% of practical needs without taking on a new dep.

- **`hub-cloudflare/src/type-safe-rooms.ts`** — `deserializeStoredSchema` refactored: replaced the flat switch with a recursive `buildFieldSchema(def)`. New `$kind` values: `array` (with `items`), `union` (with `options[]`, ≥2), `enum` (with `values[]` strings), `record` (string-keyed map of value), `literal` (primitive). Existing kinds gained refinements: `string` accepts `min`/`max`/`regex`/`enum`; `number` accepts `min`/`max`/`int`. Any kind can carry `optional: true`. The old short-form scalar strings (`"string"`, `"number?"`, etc.) still work at any field position — fully backward compatible with v0.2 schemas already stored in D1.
- The TSR loader/checker (`loadRoomSchema`, `typeSafeCheck`) is unchanged. Self-bricking bypass for `kind:'schema-update'` still load-bearing first check.

**Example expanded schema** (would have been rejected by the v0.2 DSL):
```json
{
  "$kind": "object",
  "fields": {
    "title": { "$kind": "string", "min": 1, "max": 200 },
    "tags": { "$kind": "array", "items": { "$kind": "enum", "values": ["urgent", "draft", "review"] } },
    "metadata": { "$kind": "record", "value": "any", "optional": true },
    "priority": { "$kind": "union", "options": ["number", { "$kind": "literal", "value": "auto" }] }
  }
}
```

**Verification.** Worker `tsc --noEmit` clean.

**Still deferred to v0.3:** full JSON-Schema → Zod converter (cross-field refinements, $ref, allOf/anyOf, conditional schemas). The hand-rolled DSL is now expressive enough for the realistic v0.2/v0.3 room schemas we'd write by hand.

#### Phase C summary — all P1 + Task #17 resolved (2026-05-17)

STATE_SNAPSHOT.md §4 had 11 P1 backlog items; STATE_SNAPSHOT.md §3 had Task #17 pending. Status post-Phase C:

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | Hop counter eviction (DO) | ✅ shipped | `4426bea` |
| 2 | /presence mirrors WS upgrades (KV) | ✅ already done before Phase C (verified at `hub-room.ts:109`) | — |
| 3 | Per-JID presence files (race) | ✅ shipped | `95c166c` |
| 4 | Deterministic-id includes intent + kind | ✅ shipped | `c38b3ed` |
| 5 | Transcript ordering: server-side seq | ✅ shipped | `bd6db65` |
| 6 | Per-JID rate limits | ✅ shipped | `95b44ef` |
| 7 | sig/issuer namespaced under _unverified | ✅ shipped | `9ef1585` |
| 8 | Panel CORS allowlist | ✅ shipped | `06c2628` |
| 9 | permanently_failed → presence offline | ✅ shipped | `4403c1c` |
| 10 | Tunnel URL rotation | ✅ N/A in current arch (no hardcoded tunnel URLs) | — |
| 11 | Type-Safe Rooms DSL (Task #17) | ✅ shipped (subset; v0.3 = full JSON-Schema) | `3078544` |

**STATE_SNAPSHOT §5 cleanup** (`__check_*.mjs`, `envelope.fresh.ts`): verified already deleted from tree.

**Required operator actions before Phase C ships in production:**
1. `cd hub-cloudflare && npx wrangler d1 execute hub_transcripts --remote --file=./migrations/0004_server_seq.sql` (P1 #5).
2. `cd hub-cloudflare && npx wrangler deploy` — pushes the Worker changes (P1 #1, #5, #6, #7, #11).
3. Restart the bus on each host (`npm run bus:stop` then `npm run bus:start`) — picks up P1 #3, #4, #7, #8, #9 in the bridges.

After (2), to verify the Worker layer:
- Hammer `/send` from one JID until HTTP 429 + Retry-After appears (P1 #6).
- Send a few envelopes, query D1 transcripts: `SELECT id, server_seq FROM transcripts ORDER BY server_seq DESC LIMIT 5` should show monotonically increasing per-room seqs (P1 #5).
- Send an envelope with top-level `sig: "x"`; query D1 transcripts to confirm `signature` column populated; check via dashboard or `wrangler tail` that the routed envelope no longer carries top-level `sig`/`issuer` (P1 #7 namespacing).

**STATE_SNAPSHOT.md** is now stale (its §3 + §4 are resolved). Not rewriting in place — BUILD_LOG entries above are the source of truth. Operators reading STATE_SNAPSHOT should cross-reference this section.

### Pattern Z Phase 5+6 — SPA bus dispatch wired (2026-05-17)

Pattern Z Phase 4 (Participants UI in Settings tab) had already been shipped by a prior session — `hooks/components/settings/PatternZPanel.tsx` exists at 288 lines and is imported into Settings.tsx; SettingsContext already carries `patternZEnabled`/`patternZStrategy`/`patternZTimeoutMs` defaults. BUILD_LOG just hadn't recorded it. Phase 5 (basic dispatch + amplify pilot) and Phase 6 (strategy map + helper) were genuinely missing in aiService.ts.

- **`styles/services/patternZStrategies.ts`** (NEW). Type `Strategy = 'vote' | 'pick-best' | 'synthesize' | 'single'`. `DEFAULT_BUTTON_STRATEGIES` maps known intents to strategies (e.g. `shunt.amplify → synthesize`, `imageAnalysis.preset → single`). `strategyFor(intent, settingsDefault, overrides?)` does the lookup with three-level fallback: explicit override → known default → settings default.
- **`styles/services/aiService.ts`**:
  - `isPatternZEnabled()`, `getPatternZStrategy()`, `getPatternZTimeoutMs()` — read from the same `ai-shunt-settings` localStorage key the SettingsContext uses, with safe defaults.
  - `dispatchToBus({intent, prompt, strategy?})` — POSTs to `http://127.0.0.1:7780/dispatch` (the aggregator). Throws on HTTP error or `{ok:false}` response. Refuses `strategy:'single'` defensively.
  - `maybeDispatch(intent, buildPrompt, singleLlmFallback)` — generic wrapper for future call-site adoption: checks `isPatternZEnabled` → checks `strategyFor !== 'single'` → tries `dispatchToBus`, on any error warns and returns single-LLM fallback. Bus path NEVER becomes a hard requirement — every call site fails open.
  - `performShunt` — wired inline (not via `maybeDispatch` because of the existing `stripCodeFences` post-processing for `FORMAT_JSON` / `MAKE_ACTIONABLE` / `GENERATE_VAM_PRESET` actions, which the helper signature doesn't accommodate without bloat). Constructs intent as `shunt.${action-slug}`, dispatches when applicable, falls back to single-LLM on error. Bus result reports `tokenUsage: { ..., model: 'bus:<strategy>' }` since per-LLM tokens aren't aggregated server-side.
- **`hooks/components/settings/Settings.tsx.bak.4`** — deleted (stale backup; the Pattern Z build plan was treated as completed).

**Scope deliberately limited to `performShunt`** — the build plan §6.3 names this as the pilot. The other call sites (`executeModularPrompt`, `gradeOutput`, `generateRawText`, `getMiaChatResponse`) keep the single-LLM path until per-intent dispatch is needed there. `maybeDispatch` is in place as the future wiring helper.

**Behavior summary:**

| Settings | Result |
|---|---|
| `patternZEnabled: false` | Identical to pre-change behavior. No bus calls. |
| `patternZEnabled: true`, aggregator running, Shunt action with non-single strategy | Result comes from the bus (synthesized/voted/picked across @claude + @gemini + @lmstudio peers). |
| `patternZEnabled: true`, aggregator down | One warn in console, single-LLM fallback fires. User sees normal result. |

**Verification.** `npx tsc --noEmit` clean (only the pre-existing `tools/organize-conversation-history.mjs:684` warning). Live smoke pending operator: Settings → Pattern Z → toggle ON; Shunt → Amplify a sentence; check aggregator stdout for the `/dispatch` log line. With bus down, fallback should fire silently.

**Outstanding Pattern Z work:** wire `maybeDispatch` into `executeModularPrompt` / `gradeOutput` / Weaver / Foundry / Oraculum call sites. Build plan §7.3 sketches this — deferred.
