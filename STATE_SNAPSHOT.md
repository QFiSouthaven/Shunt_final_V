# Aether Shunt — State Snapshot

> **Snapshot date:** 2026-05-08
> **Milestone:** v0.2 hardening complete (auth + schema unification deployed and smoke-tested live)
> **Companion docs:** `HANDBOOK.md` (how to operate) · `BUILD_LOG.md` (chronological history) · `docs/HUB_BLUEPRINT.md` (architecture, locked decisions §14)

This file is a freeze of "what state is the project in right now". If you come back in a month and don't remember where you left off, this is the single page that tells you. Append `STATE_SNAPSHOT_<date>.md` files when you want subsequent snapshots; don't overwrite this one unless the user says so.

---

## 1. Live cloud state (verified working)

| Resource | Identifier | State | Last verified |
|---|---|---|---|
| Cloudflare account | `1e28c63e2fd1a82751bd3b9af105f10f` (Runing Runway) | Active | 2026-05-08 |
| Worker URL | `https://hub-relay.halkive.workers.dev` | Live | 2026-05-08 |
| Worker version | `5f1d40c5-6f18-42c5-8f0e-bf3c40f08756` | Current | 2026-05-08 |
| Worker bundle size | 152.72 KiB / 27.32 KiB gzip / 7 ms startup | OK | 2026-05-08 |
| Durable Object class | `HubRoom` | Bound, hibernation enabled | 2026-05-08 |
| KV namespace | `HUB_PRESENCE` (id `6db26994bcfd4f6a9f496cf19d8232ba`) | Bound, empty | 2026-05-08 |
| D1 database | `hub_transcripts` (id `a87829d1-4d7a-4e4b-b6e7-85fda56286cd`, region ENAM) | Bound, schema applied | 2026-05-08 |
| D1 migrations applied | `0001_init.sql`, `0002_room_schemas.sql`, `0003_envelope_metadata.sql` | All success | 2026-05-08 |
| Worker secret | `HUB_API_SECRET` | Set (value not stored anywhere readable; user knows it) | 2026-05-08 |
| Admin allowlist | `HUB_ADMIN_JIDS = "@zack"` (in `[vars]`) | Bound | 2026-05-08 |
| R2 bucket | `hub-deliveries` | **NOT** created — R2 not enabled on account | n/a |

### Smoke-test results (live, post-auth-deploy)

| Endpoint | Auth | Result |
|---|---|---|
| `GET /healthz` | none | 200 `{ ok: true, ts: "..." }` |
| `GET /presence` | no bearer | 401 `{ ok: false, code: 'UNAUTHORIZED', error: 'missing or invalid bearer token' }` |
| `GET /presence` | Bearer `<HUB_API_SECRET>` | 200 `{ ok: true, agents: {}, rooms: {} }` |

Auth gate confirmed firing; canonical shape confirmed; KV/D1 reads confirmed working.

---

## 2. Local code state

All under `C:\Users\Falki\shunt-final-v\`:

### File-bus

| Component | File | Notes |
|---|---|---|
| Envelope schema | `hub-bus-tools/envelope.mjs` | Async `createEnvelope` with seq counter; emits `expiresAt` not `ttl`; exports `KIND_MAP`/`canonicalKind` |
| Send/poll CLIs | `hub-bus-tools/send.mjs`, `poll.mjs` | Async-aware |
| LM Studio bridge | `hub-bus-tools/lmstudio-bridge.mjs` | Claim/release, heartbeat, retry, async-envelope |
| Gemini bridge | `hub-bus-tools/gemini-bridge.mjs` | Same + `node.exe + bundle.js` invocation + `stdio: ['inherit',...]` (do not change) |
| Retry daemon | `hub-bus-tools/retry-daemon.mjs` | Watches `.pending-acks.json`; backs off; DLQs |
| Heartbeat | `hub-bus-tools/heartbeat.mjs` | 30s interval; updates `presence.json` |
| Atomic claim | `hub-bus-tools/claim.mjs` | Race-safe, orphan recovery, idempotency |
| Ack/retry helpers | `hub-bus-tools/ack-retry.mjs` | `sendWithAck`, `writeAck` |
| Compaction | `hub-bus-tools/compact.mjs` | `bus:compact` and `bus:compact:dry` npm scripts |
| Orchestrator | `hub-bus-tools/orchestrator.mjs` | `npm run bus:start` watchdog |
| Panel server (data API) | `hub-bus-tools/panel-server.mjs` | localhost:7777, CORS open, HTML embedded |
| File-bus directory | `hub-bus/` | Inboxes per peer, outbox, transcript, presence, DLQ |
| Protocol doc | `hub-bus/PROTOCOL.md` | v0.2.1 envelope shape, ack semantics |

### Cloudflare Worker

| Component | File | Notes |
|---|---|---|
| Worker entry | `hub-cloudflare/src/worker.ts` | Bearer auth, admin gate on schema PUT, route table |
| Durable Object | `hub-cloudflare/src/hub-room.ts` | Per-room, WS hibernation, hop ceiling, Type-Safe Rooms enforcement, schema-update admin gate |
| Envelope Zod | `hub-cloudflare/src/envelope.ts` | `kind` preprocess via `KIND_MAP`; expiresAt absolute |
| Kind map | `hub-cloudflare/src/kind-map.ts` | Shared with file-bus copy via "keep in sync" comment |
| Type-Safe Rooms | `hub-cloudflare/src/type-safe-rooms.ts` | `loadRoomSchema`, `typeSafeCheck`; DSL stub (Task #17) |
| Passive Auditor | `hub-cloudflare/src/passive-auditor.ts` | console.log → wrangler tail |
| Transcript | `hub-cloudflare/src/transcript.ts` | D1 helper |
| Types | `hub-cloudflare/src/types.ts` | Env interface incl. HUB_API_SECRET, HUB_ADMIN_JIDS |
| Worker config | `hub-cloudflare/wrangler.toml` | Account, bindings, vars |
| D1 migrations | `hub-cloudflare/migrations/0001_init.sql`, `0002_room_schemas.sql`, `0003_envelope_metadata.sql` | All applied to live D1 |

### Panel website

| Component | File | Notes |
|---|---|---|
| Panel HTML | `hub-bus-panel/index.html` | Single file, ~24.8 KB, dark theme, 3-column, diff-update |
| Pages config | `hub-bus-panel/wrangler.toml` | Cloudflare Pages |
| Headers | `hub-bus-panel/_headers` | no-store on index.html |
| Panel readme | `hub-bus-panel/README.md` | Local-first + deploy instructions |

### Documentation

| File | Purpose |
|---|---|
| `HANDBOOK.md` | Operator handbook (this user-facing reference) |
| `BUILD_LOG.md` | Chronological history of every decision and milestone |
| `STATE_SNAPSHOT.md` | This file — point-in-time freeze |
| `docs/HUB_BLUEPRINT.md` | Architecture spec; §14 lists locked decisions |
| `hub-bus/README.md` | File-bus protocol, layout, npm scripts |
| `hub-bus/PROTOCOL.md` | Envelope schema details |
| `hub-cloudflare/README.md` | Worker deploy + auth notes |

---

## 3. Task slate

| # | Title | Status |
|---|---|---|
| 1 | Stand up local file-bus | completed |
| 2 | Promote bus to Cloudflare KV + Worker | completed |
| 3 | Recruit second AI to consult on hub design | completed |
| 4 | Sub-agent A: build envelope/send/poll CLI tools | completed |
| 5 | Sub-agent B: build LM Studio bridge daemon | completed |
| 6 | Sub-agent C: extend dual.mjs with /bus commands | completed |
| 7 | Sub-agent D: independent design critique | completed |
| 8 | Apply Plan-agent's HIGH-priority pre-promotion fixes | completed |
| 9 | Sub-agent E: build gemini-bridge.mjs + retire dual.mjs CLI mode | completed |
| 10 | Add loop-detection at central validator | completed (in deployed Worker) |
| 11 | Type-Safe Rooms (per-room Zod schema enforcement) | completed (DSL stub, see #17) |
| 12 | Build live broadcast panel for the bus | completed |
| 13 | Bus orchestrator / bridge watchdog | completed |
| 14 | Sub-agent D2 audit of v0.2 live state | completed |
| 15 | Fix-group A: schema unification | completed |
| 16 | Fix-group B: shared-secret auth on Worker | completed |
| 17 | Fix-group C: real Zod schema serialization for Type-Safe Rooms | **pending** (axiomatic but not blocking) |

---

## 4. Known open issues (P1 backlog from Sub-agent D2 audit)

Not blocking, ordered by impact:

1. **Hop counter never deleted from DO storage** — leaks one row per trace forever. Fix: TTL eviction via `expiresAt`-based alarm.
2. **`/presence` doesn't mirror WS upgrades to KV** — peers that connect via `/ws` but never send a `kind: 'join'` envelope don't appear. Fix: `handleWebSocketUpgrade` calls `kvUpsertPresence`.
3. **Presence merge race** — concurrent heartbeats may clobber `lastSeenAt`. Fix: per-JID files instead of one shared `presence.json`.
4. **Deterministic-id excludes intent and kind** — same body + same trace + different intent → collapse to one id; retries with body drift → different id. Fix: include `intent` and `kind` in the id input.
5. **Transcript ordering divergence** — `transcript.jsonl` ordered by writer wallclock, D1 `transcripts` ordered by DO arrival. Cross-machine clock skew makes them disagree. Fix: server-side seq from DO.
6. **No rate limits anywhere** — one looped sender hits free-tier ceilings in minutes. Fix: token bucket per JID in the Worker.
7. **`sig`/`issuer` accepted but unverified** — anything reading them assumes truth. Fix: namespace under `_unverified` until v0.3 signing ships.
8. **Panel CORS `*`** — once published, any web page the user visits can fetch transcript history. Fix: restrict to deployed origins.
9. **Orchestrator `permanently_failed` doesn't flip presence offline** — bridge can be dead while presence still shows online. Fix: wire the failure state.
10. **Tunnel URL rotation** — quick `cloudflared tunnel` URL changes per restart; deployed panel's hardcoded default goes stale. Fix: named tunnel + DNS.
11. **Type-Safe Rooms DSL too limited** (Task #17) — only handles primitives; can't express arrays, unions, refinements. Replace with JSON-Schema → Zod converter.

---

## 5. Cleanup pending

These files are leftover artifacts from sub-agent verification workarounds. Not imported anywhere. Safe to delete from PowerShell:

```powershell
Remove-Item C:\Users\Falki\shunt-final-v\hub-bus-tools\__check_*.mjs
Remove-Item C:\Users\Falki\shunt-final-v\hub-cloudflare\src\envelope.fresh.ts
```

---

## 6. Cost commitments (monthly)

| Service | Plan | Cost |
|---|---|---|
| Cloudflare Workers Paid | required for Durable Objects | $5 / mo |
| Netlify Pro | optional | $20 / mo |
| **Total committed** | | **$25 / mo** |

Cloudflare Workers Paid is load-bearing. Netlify Pro is currently optional value (Identity SSO if enabled).

---

## 7. Pending user actions (next session, optional)

If you want to keep moving when you come back, here are the highest-value follow-ups in rough order:

1. **Deploy the panel** to Netlify Pro (`netlify deploy --prod --dir=.`) and/or Cloudflare Pages (`npx wrangler pages deploy hub-bus-panel`). Get the public URLs.
2. **Bridges dual-write to the Worker.** Add a `WORKER_URL` env var to bridges so they `POST /send` each envelope (with `Authorization: Bearer ...` header) in addition to writing to the file-bus. Hub becomes truly cross-machine.
3. **Cloudflare Access** to replace the bearer token (cleaner, no shared secret).
4. **Enable R2** on the Cloudflare account if you ever want `kind: deliver` envelopes with large file payloads.
5. **Cleanup** the artifact files in section 5.
6. **Address P1 backlog** items 1–11 in priority order.

---

## 8. How to recover from a chat reset

Paste this into a fresh Claude session:

```
Read these files in order, then ask what I want to work on next:
1. C:\Users\Falki\shunt-final-v\STATE_SNAPSHOT.md   (this file — most current state)
2. C:\Users\Falki\shunt-final-v\HANDBOOK.md
3. C:\Users\Falki\shunt-final-v\BUILD_LOG.md
4. C:\Users\Falki\shunt-final-v\docs\HUB_BLUEPRINT.md (especially §14)
```

The combination of those four files + the live Cloudflare resources is enough to fully restore context for any new session.

---

## End of snapshot

If something here is wrong or out of date, fix it directly. This file is yours.
