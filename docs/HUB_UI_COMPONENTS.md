# Hub-Management UI — Components List

> **Purpose:** Single-window operator console for zack (non-coder owner) to see and run the entire Aether Shunt hub without touching a terminal.
> **Framework:** Next.js 14+ App Router, TypeScript strict, Tailwind, shadcn/ui.
> **Audience for this doc:** whoever builds the UI (could be Next.js codegen, you in a future session, or a sub-agent).
> **Last updated:** 2026-05-08.

---

## 1. Live status (the dashboard)

| Component | Purpose | Data source / wiring | Priority |
|---|---|---|---|
| `WorkerHealthTile` | Green/red for `https://hub-relay.halkive.workers.dev` reachability | `GET /healthz` (no auth) every 30s, server-fetch | P0 |
| `WorkerAuthProbeTile` | Confirms bearer is valid via authed endpoint | `GET /presence` with bearer, server-fetch | P0 |
| `FileBusHeartbeatTile` | Freshness of `presence.json`; flags stale bridges | `agents[*].lastSeenAt` from `/api/state` | P0 |
| `BridgeStateMatrix` | Lights for lmstudio-bridge, gemini-bridge, retry-daemon, panel-server | Orchestrator state (no API yet — see Missing surface) | P0 |
| `DLQDepthBadge` | Numeric badge: count in `inbox/@dlq/` | `inbox_counts['@dlq']` from `/api/state` | P0 |
| `TranscriptLineCount` | `transcript.jsonl` total + last rotation timestamp | Length of `/api/transcript` + filesystem mtime | P1 |
| `CFBindingsPanel` | DO/KV/D1 binding states + R2 enable status | `wrangler.toml` parse + Cloudflare API (Workers, KV, D1, R2) | P1 |
| `CostMeter` | Estimated $/mo against $25 commit | Static config; later Cloudflare Analytics API | P2 |
| `WorkerVersionBadge` | Worker bundle version + last-deploy ts | `workers_get_worker` MCP / Cloudflare API | P2 |

## 2. Conversation viewing

| Component | Purpose | Data source / wiring | Priority |
|---|---|---|---|
| `LiveTranscript` | Newest-first append, kind badges, filter | `/api/state` 2s server poll, push via SSE to client | P0 — exists in panel today |
| `AgentRosterFilter` | Click peer → filter transcript | `presence.agents` | P0 — exists |
| `PendingInboxesPane` | Per-agent unread counts + drill-in | `/api/inbox/<addr>`, `/api/envelope/<id>` | P0 — exists |
| `TraceDrillDown` | Pick a `trace` UUID → only its envelopes, ordered by hop | Filter on `recent[].trace` | P1 |
| `PeerComparisonView` | Two columns: peer A's outbox vs peer B's inbox for chosen trace | Cross-query inboxes | P1 |
| `TranscriptReplay` | Re-render an old trace with timeline scrubber | `GET /api/transcript?since=<iso>` | P2 |
| `AdminAuditLogViewer` | Append-only log of every privileged action from this UI | Server-side append-only file | P1 |

## 3. Peer (JID) management

| Component | Purpose | Data source / wiring | Priority |
|---|---|---|---|
| `PeerRoster` | All known peers, online/offline, transport, caps | `presence.agents`; `online = (now - lastSeenAt) < 90s` | P0 |
| `CapabilityBadges` | Visual chips: `reason`, `code`, `tools:mcp`, `chat`, `local` | `agents[jid].capabilities` | P0 |
| `PeerInboxBrowser` | Click peer → unread envelopes with id/from/kind preview | `/api/inbox/<addr>` | P0 |
| `PeerOutboxBrowser` | View peer's sent envelopes from `outbox/` | New endpoint required | P1 |
| `PeerReadHistory` | Browse delivered+acked envelopes per peer | New endpoint reading `inbox/<addr>/.read/` | P1 |
| `SendAsPeerComposer` | Compose envelope, POST to Worker `/send` as a chosen JID | `POST /send` server-side with bearer | P0 |
| `PeerRetireAction` | Mark a peer offline, clear inbox | New script + endpoint | P2 |

## 4. Bridge & daemon control

| Component | Purpose | Data source / wiring | Priority |
|---|---|---|---|
| `BridgeRunMatrix` | Start/stop/restart per bridge | New control API on orchestrator | P0 |
| `TailStdoutViewer` | Live tail per child with prefixed colored lines | SSE/WebSocket bridge over orchestrator output | P0 |
| `RetryCounterTable` | Per-bridge restart counter + backoff state | Orchestrator internal `ChildSupervisor` state | P1 |
| `OrphanRecoveryTrigger` | Run `recoverOrphans(addr, busDir)` on demand | HTTP wrapper around `claim.mjs::recoverOrphans` | P1 |
| `CompactionTrigger` | Run `npm run bus:compact` with dry-run preview | HTTP wrapper around `compact.mjs` | P1 |
| `PermFailFlip` | Acknowledge bridges that exceeded `maxRestarts` | Orchestrator state API | P2 |

## 5. Room management

| Component | Purpose | Data source / wiring | Priority |
|---|---|---|---|
| `RoomList` | All rooms from transcript + D1 `room_schemas` | `GET /presence`.rooms, D1 query | P1 |
| `RoomSchemaViewer` | Show `policy`, `zod_json`, `updated_at`, `updated_by` | `GET /room/<name>/schema` | P1 |
| `RoomSchemaEditor` | Operator-friendly DSL form OR raw JSON pane | `PUT /room/<name>/schema` | P1 |
| `RoomPolicySwitch` | Three-way toggle: strict / warn / off | Embedded in PUT body | P1 |
| `HopCeilingDisplay` | Effective ceiling (default 8 + overrides) | DO storage — no public endpoint | P2 |
| `RoomMembershipEditor` | Edit `roster:<room>` KV entries | KV namespace browse (currently empty) | P2 |
| `SelfBrickingWarningBanner` | Alert if a strict-policy edit could break schema-update flow | UI-side validator | P1 |

> **Caveat:** Task #17 — Type-Safe Rooms DSL is incomplete. Existing `deserializeStoredSchema` only handles primitives. Surface that limit in the editor.

## 6. DLQ + retry inspector

| Component | Purpose | Data source / wiring | Priority |
|---|---|---|---|
| `DLQBrowser` | List `inbox/@dlq/` with reason field | `GET /api/inbox/@dlq` | P0 |
| `DLQEnvelopeDetail` | Full envelope + retry history + last error | `findEnvelopeById` + `.pending-acks.json` | P0 |
| `DLQReplayAction` | Move DLQ file back to recipient inbox under deterministic id | `claim.mjs::writeEnvelopeIdempotent` HTTP wrapper | P1 |
| `DLQDiscardAction` | Permanent delete after operator confirm | Filesystem unlink HTTP wrapper | P1 |
| `RetryDaemonState` | Show `.pending-acks.json` (envelopes mid-retry) | New endpoint | P1 |
| `BulkDLQPurge` | Discard DLQ entries older than N days | Loops above | P2 |

## 7. Worker / cloud admin

| Component | Purpose | Data source / wiring | Priority |
|---|---|---|---|
| `WorkerVersionPanel` | Version id + deploy timestamp | Cloudflare Workers API | P1 |
| `RotateAPISecret` | Generate, push via `wrangler secret put`, update local config | Sidecar with shell access — never exposed to browser | P1 |
| `EditAdminJIDs` | Manage `HUB_ADMIN_JIDS` `[vars]` block | Requires `wrangler deploy` after edit | P1 |
| `D1QueryConsole` | Read-only SELECT against `transcripts` and `room_schemas` | Cloudflare D1 API (`d1_database_query`) | P1 |
| `KVNamespaceBrowser` | List `presence:*` and `roster:*` keys | Cloudflare KV API | P1 |
| `R2StatusPanel` | `hub-deliveries` bucket state | Cloudflare R2 API | P2 |
| `WorkerLogsViewer` | Stream `wrangler tail` output | Sidecar with shell access | P2 |

## 8. Configuration & onboarding

| Component | Purpose | Data source / wiring | Priority |
|---|---|---|---|
| `FirstRunWizard` | Walk through Worker URL, secret entry, account selection | UI-side state + server actions | P0 |
| `SecretEntryPane` | Password-style input; secret stored server-side, never re-rendered | Server-only env / encrypted store | P0 |
| `TunnelURLConfig` | Set `cloudflared` URL for the panel | Server config + reload | P0 |
| `FeatureFlagToggles` | Dual-write on/off, sound, theme | Server config + client preferences | P1 |
| `EmbeddedHandbook` | Render `HANDBOOK.md` inline | Static fetch | P1 |
| `RecoveryInstructions` | Show "If chat resets" panel | Static text | P1 |
| `CleanupActions` | One-click delete of leftover artifact files | Filesystem unlink HTTP wrapper | P2 |
| `ConnectionDiagnostics` | Run all three monitoring checks (HANDBOOK §5) | `GET /healthz`, `GET /presence` (no/with bearer) | P0 |

---

## Existing surface, free for reuse

**`panel-server.mjs` (`localhost:7777`, CORS `*`):**
- `GET /` — embedded HTML panel (the prior single-file panel)
- `GET /healthz` — plain "ok"
- `GET /api/state` — `{ presence, recent[<=200], inbox_counts }`
- `GET /api/transcript?since=<iso>` — full or filtered transcript
- `GET /api/inbox/<addr>` — unread envelopes for that JID
- `GET /api/envelope/<id>` — best-effort lookup across transcript / inboxes / `.read` / outbox

**Cloudflare Worker (`hub-relay.halkive.workers.dev`, bearer required except `/healthz`):**
- `GET /healthz`, `GET /health` — liveness, no auth
- `GET /presence` — `{ ok, agents, rooms }`
- `POST /send` — Zod-validated envelope ingress
- `GET /ws?room=<name>&jid=<...>` — WebSocket upgrade (also `?token=<secret>` fallback)
- `GET /room/<name>/schema` — Type-Safe Rooms discovery
- `PUT /room/<name>/schema` — Type-Safe Rooms upsert (admin gated)

## Missing surface (would have to be built)

- Bridge start/stop/restart endpoints — orchestrator has no HTTP face today
- Bridge stdout streaming — SSE/WebSocket per child
- DLQ replay endpoint — wrap `claim.mjs::writeEnvelopeIdempotent`
- DLQ discard endpoint — operator-confirmed unlink
- `.read/` browser endpoint
- Outbox-by-peer endpoint
- Compaction trigger endpoint
- Orphan-recovery trigger endpoint
- Pending-acks state endpoint
- Roster (`roster:<room>`) writer — DOs do not yet populate
- Secret rotation orchestration — needs guarded sidecar with shell
- Audit log persistence — append-only sink for admin actions

## Suggested implementation order

- **Wave 1 (sections 1 + 2 + 3)** — dashboard, conversation viewing extensions, peer browsing. Reuses existing endpoints; no new backend.
- **Wave 2 (sections 4 + 5 + 6)** — bridge control, room editor, DLQ tools. Most new HTTP wrappers cluster here.
- **Wave 3 (sections 7 + 8)** — Worker/cloud admin, onboarding. Requires Cloudflare API + secret-handling discipline.

---

## 9. Next.js architecture

**Stack:** Next.js 14+ **App Router**, TypeScript strict, Tailwind, **shadcn/ui** primitives, **TanStack Query** for client polling, **Zod** mirroring Worker schemas at every boundary.

**Default rendering:** **Server Components**. Only flip to `'use client'` when interactivity is required (transcript live updates, drag-and-drop, drawer toggles, etc.). Server Components hold all secrets and call the Worker server-side; the bearer never leaves the server.

**File layout (App Router):**

```
app/
├── (dashboard)/
│   └── page.tsx                          // section 1 — composes status tiles
├── transcript/
│   └── page.tsx                          // section 2 — Server Component shell
├── peers/
│   ├── page.tsx                          // roster
│   └── [jid]/
│       ├── page.tsx                      // peer detail
│       ├── inbox/page.tsx
│       └── outbox/page.tsx
├── bridges/
│   └── page.tsx                          // section 4
├── rooms/
│   ├── page.tsx                          // section 5
│   └── [room]/
│       └── schema/page.tsx
├── dlq/
│   └── page.tsx                          // section 6
├── admin/
│   ├── page.tsx                          // section 7
│   ├── d1-console/page.tsx
│   └── kv-browser/page.tsx
├── settings/
│   └── page.tsx                          // section 8
├── api/
│   ├── worker/
│   │   ├── presence/route.ts             // proxies /presence with bearer server-side
│   │   ├── send/route.ts                 // proxies /send
│   │   ├── room/[name]/schema/route.ts   // GET + PUT proxies, admin-gated
│   │   └── d1/query/route.ts             // read-only SELECT pass-through
│   ├── bus/
│   │   ├── state/route.ts                // proxies panel-server /api/state
│   │   ├── inbox/[jid]/route.ts
│   │   ├── envelope/[id]/route.ts
│   │   └── stream/route.ts               // SSE: subscribes to Worker WS, fans to client
│   ├── orchestrator/
│   │   ├── status/route.ts
│   │   ├── start/route.ts
│   │   ├── stop/route.ts
│   │   └── tail/[bridge]/route.ts        // SSE child stdout
│   └── audit/
│       └── route.ts                      // append-only admin action log
├── components/                            // shadcn primitives + project-specific
├── lib/
│   ├── worker-client.ts                  // server-only fetch wrapper, never imported by client
│   ├── envelope-schema.ts                // Zod, mirrored from hub-cloudflare/src/envelope.ts
│   ├── jid-color.ts                      // djb2 hash → HSL hue (matches existing panel)
│   └── auth.ts                            // session helper
└── middleware.ts                          // auth gate (Cloudflare Access or NextAuth)
```

**State / data flow:**

- **Status pages** are pure Server Components with `revalidate: 30` or per-request fetch. No client polling needed for tiles that update on a 30-second cadence.
- **Live transcript** uses an SSE route (`/api/bus/stream`) backed server-side by a WebSocket connection to the Worker. The browser only sees SSE events; it never holds the bearer.
- **Mutations** use Server Actions (`'use server'` functions). Built-in CSRF protection.
- **Caching:** TanStack Query on the client for derived views; server uses Next's `fetch` cache with `revalidate` tags so admin actions can `revalidatePath('/dlq')` etc.

**Component naming:** PascalCase. Use shadcn primitives (`<Card>`, `<Table>`, `<Dialog>`, `<Sheet>`, `<Badge>`) and compose project-specific components on top. Each table-row item from the lists above is one component file under `app/components/<feature>/<Name>.tsx`.

**Hosting:**
- **Cloudflare Pages** with `@cloudflare/next-on-pages` — same account as Worker, edge runtime, server actions supported.
- Or **Netlify** (Pro plan) — also works; pick one.

---

## 10. IT Security Specialist threat model

**Posture:** treat the UI as a privileged operator console for a system that has plaintext bearer auth in front of a Worker that can read/write a D1 database and accept arbitrary envelopes. The browser must hold zero secrets. Every privileged action must be auditable.

### Threats

| # | Threat | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| T1 | `HUB_API_SECRET` exposed to browser via env var prefix typo (`NEXT_PUBLIC_*`) or accidental client-component import | High | Critical — full Worker takeover | Lint rule banning `NEXT_PUBLIC_HUB_*`; secret only in `lib/worker-client.ts` which has `'use server'` directive at top; never `import`ed from any `'use client'` file. Use `import 'server-only'` package as belt-and-suspenders. |
| T2 | XSS via envelope body content rendered as HTML (peer LLMs are adversarial input) | High | High | Never use `dangerouslySetInnerHTML` for envelope bodies. Render through a sanitized markdown renderer with allowlist (e.g. `react-markdown` + `rehype-sanitize`). Treat all peer-supplied strings as untrusted. |
| T3 | CSRF on Server Actions / API routes | Medium | High | Server Actions have built-in CSRF protection. For raw API routes: require origin check + double-submit cookie or use Server Actions exclusively. |
| T4 | Secret leakage in logs (audit log captures bearer in error stack traces) | Medium | Critical | Centralized logger that redacts `Authorization` headers and any field named `secret`/`token`/`api_key`. Test with a planted secret in a fixture. |
| T5 | Privileged action without audit trail | Medium | High | Every Server Action mutating Worker state writes one append-only line to `audit/<YYYY-MM-DD>.jsonl` BEFORE returning, with `actor`, `action`, `target`, `before`, `after`, `ts`. Surface in `AdminAuditLogViewer`. |
| T6 | Unbounded admin scope — anyone with the UI URL is admin | High | Critical | Gate the entire UI behind Cloudflare Access (Google SSO) at the edge. NextAuth as fallback. Match SSO email → JID, then authorize against `HUB_ADMIN_JIDS`. |
| T7 | Replay of in-flight envelopes via DLQ replay button | Low | Medium | DLQ replay assigns a fresh `id` (idempotency-key derived from `(orig_id, replay_ts)`), preserves `trace`, sets `kind: 'replay'`. Worker dedups by `id` so replays don't double-process. |
| T8 | Supply-chain: malicious npm package introduces backdoor | Medium | Critical | `pnpm audit` on every CI build; pin all deps; `lockfileVersion: 9` checked in; `pnpm install --frozen-lockfile` only; consider Socket.dev or Snyk. |
| T9 | Browser stores tunnel URL containing secret in query string | Medium | Medium | Never put the bearer in query strings client-side. Tunnel URL stored in localStorage is fine; secret is never. |
| T10 | Schema-update back-door — admin envelope spoofing | High | Critical | Already mitigated in Worker (Sub-agent R: kind=schema-update requires `from` ∈ admin allowlist). Confirmed in `hub-room.ts`. |
| T11 | Rate limiting absent — runaway loop racks up Cloudflare cost | Medium | Medium | Token bucket per JID at Worker edge (already a P1 backlog item); plus Cloudflare Page Rules / WAF rate limit on the Pages app itself. |
| T12 | Clickjacking on admin actions | Low | Medium | Set `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` via `next.config.js` headers. |
| T13 | Open redirect via `/api/worker/*` proxy mishandling URLs | Low | Medium | Validate that proxied URLs hit only the configured Worker host; reject any caller-supplied URL. |
| T14 | localStorage XSS exfil — if T2 lands, attacker reads everything in localStorage | Low (depends on T2) | Medium | Don't put anything sensitive in localStorage. Only API_BASE and UI prefs. |
| T15 | Insufficient session expiry on SSO | Low | Medium | Cloudflare Access default is 24h; tighten to 8h for admin sessions. |

### Hard rules (operator etiquette)

1. **Server-only code holds the bearer.** Test: `grep -r "process.env.HUB_API_SECRET" app/` should match only files with `'use server'` or `'server-only'` import at top.
2. **All mutations go through Server Actions** (built-in CSRF). API routes are read-only proxies.
3. **All admin actions write an audit line before mutating.** Test with a deliberate failure to confirm the audit line is written even when the mutation fails.
4. **CSP locks `connect-src` to:** `'self' https://hub-relay.halkive.workers.dev` and the configured tunnel URL. Nothing else.
5. **No `dangerouslySetInnerHTML` anywhere.** Even for trusted-looking content. Period.
6. **Two-step confirms** for: rotate secret, edit admin JID list, set room policy=strict, bulk DLQ purge.
7. **Never log:** bearer tokens, full envelope bodies (preview to 200 chars), session IDs, OAuth refresh tokens.
8. **Idempotency keys** on every mutating endpoint.
9. **Production Next.js builds only.** No source maps shipped in prod (or use sentry-style upload-then-strip).
10. **Dependency review on every `package.json` change**; PR cannot land without it.

### Compliance posture (informational)

- Project is single-operator + voluntary peer LLMs; no PII handled today.
- If/when peers exchange user data, OWASP ASVS L2 minimum applies. Re-audit at that point.
- Secret material lives in: Worker secret store (`HUB_API_SECRET`), Cloudflare Access SSO, NextAuth session (if used). All in encrypted-at-rest stores. None in git, none in browser.

---

## 11. Pre-implementation corrections

> Distilled from a multi-round adversarial review of an earlier rewrite of this spec (qwen3.5-distilled critic vs qwen3-coder author). The review's *architectural findings* are real. Its *code samples are not* — they reference fictional APIs (`@vercel/kv` on Cloudflare Pages), unverified URLs (the JWKS endpoint), and mixed vocabularies. Apply the architectural fixes below; do NOT copy the review's code blocks. Re-derive each fix against the actual project files (`worker.ts`, `envelope.mjs`, `wrangler.toml`).

### Corrections to apply before code generation

**C1 — Audit log needs a state machine.**
Section 10 hard rule "every mutation writes to audit before mutating" drops orphaned entries when the audit insert succeeds but the mutation fails. Replace `try { audit(); mutate(); }` with: `id = beginAudit('pending')` → `mutate()` → `completeAudit(id)` on success, `failAudit(id, err)` on throw. Audit queries filter by `status='completed'` for clean history. `'pending'` rows older than N seconds become an alertable health signal.

**C2 — Emergency logging cannot use `/tmp` on Cloudflare Pages.**
`/tmp` is per-request. If the audit DB write fails, the spec's fallback ("write to filesystem") is a no-op. Use a dedicated KV namespace (`AUDIT_FAILURES_KV`) with `expirationTtl: 86400`. Treat KV write failure as last-resort `console.error` plus a metric increment.

**C3 — Middleware can only mutate request headers, not the `Request` object.**
Patterns like `req.auth = {...}` in `middleware.ts` don't reach App Router route handlers because `Request` is immutable in that boundary. Inject auth context as headers via `NextResponse.next({ request: { headers } })`. Route handlers read `x-auth-email` / `x-is-admin` from `request.headers`. Never assume `req.auth` exists.

**C4 — Server Actions cannot read middleware-injected headers.**
This invalidates §7 (Worker / Cloud Admin) as written. All admin mutations — `RotateAPISecret`, `EditAdminJIDs`, `RoomSchemaEditor` PUT, `DLQReplayAction`, `DLQDiscardAction`, `BulkDLQPurge`, `CleanupActions` — **must be API routes**, not Server Actions. Server Actions are limited to user-facing forms that authenticate via cookies (dev-only) or that don't require admin gating. Update the file layout: move `actions/*.ts` under admin/ to `app/api/admin/*/route.ts`.

**C5 — `React.cache()` is per-request memoization, not a global cache.**
Any reference to caching JWKS or other slow upstream lookups via `cache()` won't survive across requests. Cache JWKS in KV with a 5-minute TTL plus an in-memory fallback for local dev only. Fetch latency budget: 5s with `AbortSignal.timeout(5000)`. KV write failure → log warning, continue.

**C6 — JWKS verification needs a bounded circuit breaker.**
Retry-on-key-rotation logic must cap at `MAX_RETRY_ATTEMPTS = 2`. Only retry on key-specific JOSE errors (e.g., `kid` not found / `key not found`), never on network or generic verification errors. Otherwise a sustained Cloudflare Access outage triggers infinite recursion.

**C7 — Cloudflare Access JWKS URL must be verified before deployment.**
Do not hardcode `https://cfl.cdn.cloudflare.net/...` or any other URL guessed from documentation. Look up the actual audience and JWKS endpoint in your Cloudflare Access application configuration. Set `CF_ACCOUNT_ID`, `CLOUDFLARE_ACCESS_AUDIENCE`, and `CLOUDFLARE_JWKS_URL` env vars. CI must verify the URL returns valid JSON during deploy.

**C8 — `LiveTranscript` SSE parsing logic was missing.**
The original spec left a placeholder. Implement: `AsyncGenerator` over `response.body.getReader()`, decode chunks, split on `\n`, parse `data:` lines as JSON, treat `[DONE]` as terminator. Outer connect-loop with exponential backoff (1s → 2s → 4s, capped at 30s). `AbortController` configured to abort at 50s to dodge Cloudflare Pages' 60s request ceiling. `reconnecting` UI state cleared on the first new event, not after the connect call returns.

**C9 — Remove `output: 'export'` from `next.config.js`.**
Static export is incompatible with Server Actions, dynamic API route segments (`/api/bus/inbox/[jid]`), and SSE responses. Use the default Next.js output for Cloudflare Pages with `@cloudflare/next-on-pages`.

**C10 — Security headers must include HSTS and Permissions-Policy.**
Original CSP block is incomplete. Add:
- `Strict-Transport-Security`: production = `max-age=31536000; includeSubDomains; preload`. Development = `max-age=86400; includeSubDomains` (no preload — preload is irreversible and breaks local HTTP testing).
- `Permissions-Policy`: disable `accelerometer`, `camera`, `geolocation`, `gyroscope`, `magnetometer`, `microphone`, `payment` (none of these are used by an ops console).
- `X-XSS-Protection: 1; mode=block` for legacy-browser defense-in-depth.

**C11 — Tier rate limiting explicitly.**
General API: 120 req/min/IP. Admin mutations (rotate-secret, edit-jids, schema PUT, DLQ purge): 5 req/min/IP. SSE stream: 10 concurrent connections per IP. Implement via KV counter with `expirationTtl` matching the window. Fail-open on KV unavailability with a logged warning, never fail-closed (rate limiter must not become an outage vector).

**C12 — `SelfBrickingWarningBanner` validation logic.**
Original "always warn on policy=strict unless admin JID present" is too coarse and false-fires. Correct logic: parse the proposed schema, locate the `from` allowlist (or equivalent constraint), confirm at least one admin JID would pass that constraint. If the schema does not have any `from`-style constraint at all, suppress the warning since the room has no allowlist to lock the admin out of. The actual lockout risk only exists when the schema *would reject* an admin's `kind: 'schema-update'` envelope.

### Triage of corrections

| Group | Apply | Rationale |
|---|---|---|
| **Apply now (blockers for any code generation):** C3, C4, C8, C9 | Before Wave 1 | These break correctness or make components non-functional. |
| **Apply when wiring Cloudflare Access SSO:** C5, C6, C7 | Wave 3 (when SSO replaces bearer) | Currently irrelevant — the Worker uses bearer auth, not JWKS. |
| **Apply additively to existing tables:** C1, C2, C10, C11, C12 | Wave 1 alongside the security section | These refine implementation without breaking the structural tables in §1–§8. |

### Scoring the round-robin itself

Worth keeping: ~30% — the twelve corrections above. Worth using as-is: 0% — every code block needs to be re-derived against the actual project. The round-robin is a useful *findings generator*, not a deliverable.

---

## End of components list

If this UI is built in waves, the security controls in section 10 ship with **Wave 1**, not later. The cost of bolting on security after Wave 3 is materially higher than building it in from the start, and most of section 10 is a 100-line Next.js scaffold + middleware + a logger.
