# AI Studio Build Handoff — Aether Shunt Hub-Management UI

## How to use

- Open Google AI Studio Build, start a new project, and paste the entire fenced block below as the project prompt.
- AI Studio's preview iframe blocks outbound fetch to arbitrary URLs; ignore those preview errors. The exported / deployed code does not have that restriction.
- After AI Studio generates the project, export it, set the env vars listed in the README it produces (`HUB_API_SECRET`, `HUB_ADMIN_JIDS`, `WORKER_URL`, `PANEL_SERVER_URL`), and deploy with `npx wrangler pages deploy`.

```
You are generating the Aether Shunt Hub-Management UI. Output a complete, runnable Next.js 14+ App Router project with TypeScript strict mode, Tailwind CSS, and shadcn/ui primitives. The deliverable is a single project, not a monorepo. Do not split it into packages. Do not invent third-party libraries — only use what's named in this prompt or what shadcn/ui canonically recommends.

## Top of brief

The project is Aether Shunt: a multi-AI message bus with a local file-bus half and a Cloudflare Worker half. AI peers (Claude, Gemini, LM Studio, etc.) send each other JSON envelopes via the bus. The operator is zack — non-coder owner — and he wants one window where he can see everything (live presence, transcript, DLQ, room schemas, bridges, cloud admin) and run the whole hub without touching a terminal. Success is: zack opens the UI, sees green tiles, watches messages flow, can pause a runaway peer, can replay a DLQ envelope, and never has to read a log file.

The framework is Next.js 14+ App Router, TypeScript strict, Tailwind, shadcn/ui primitives, TanStack Query for client polling, Zod mirroring the Worker's schema at every boundary. Deployment target is Cloudflare Pages via the `@cloudflare/next-on-pages` adapter (same Cloudflare account as the Worker). Do NOT set `output: 'export'` in `next.config.js` — static export is incompatible with Server Actions, dynamic API route segments like `/api/bus/inbox/[jid]`, and SSE responses.

## Live infrastructure to call

These are real, live resources. Use the values exactly as written.

- Worker URL: `https://hub-relay.halkive.workers.dev`
- Cloudflare account ID: `1e28c63e2fd1a82751bd3b9af105f10f`
- KV namespace `HUB_PRESENCE`, id `6db26994bcfd4f6a9f496cf19d8232ba`
- D1 database `hub_transcripts`, id `a87829d1-4d7a-4e4b-b6e7-85fda56286cd`, region ENAM
- Local panel-server (read-side data API): `http://localhost:7777` by default; configurable via env `PANEL_SERVER_URL` (a `cloudflared` tunnel URL when zack is running one)
- Bearer auth: every Worker route except `GET /healthz` and `GET /health` requires `Authorization: Bearer <HUB_API_SECRET>`. Bearer is server-only — it must never reach the browser. Test that with grep before shipping (see Validation).
- Admin allowlist: env var `HUB_ADMIN_JIDS`, comma-separated (e.g. `@zack,@claude`). Required for admin mutations to the Worker (room schema PUT) and required by the UI to gate admin pages locally.

## Real Worker endpoint shapes

(Source: `hub-cloudflare/src/worker.ts`. Mirror these exactly.)

- `GET /healthz` → `200 { ok: true, ts: "<ISO-8601>" }` (no auth)
- `GET /health` → same as `/healthz` (no auth)
- `GET /presence` → `200 { ok: true, agents: { "<jid>": {...} }, rooms: { "<#room>": {...} } }` (bearer required)
- `POST /send` → body is a Zod-validated envelope (see schema below); errors return `{ ok:false, code:'INVALID_ENVELOPE'|'INVALID_JSON', error:string }` (bearer required)
- `GET /ws?room=<name>&jid=<jid>` → WebSocket upgrade. Bearer header OR `?token=<HUB_API_SECRET>` for browsers. Browsers MUST NOT call this directly; the UI proxies through a server-side SSE route.
- `GET /room/:room/schema` → `{ ok:true, room, policy:'strict'|'warn'|'off', zod_json, updated_at, updated_by }` or `404 { ok:false, code:'NOT_FOUND', room }`. URL-encode `#main` as `%23main`. (bearer required)
- `PUT /room/:room/schema` → body `{ policy:'strict'|'warn'|'off', zod_json:string, updated_by:string }`. `updated_by` MUST be in `HUB_ADMIN_JIDS` or the Worker returns `403 { code:'NOT_ADMIN' }`. (bearer + admin JID required)

## Real panel-server endpoint shapes

(Source: `hub-bus-tools/panel-server.mjs`. CORS is open `*` on this server.)

- `GET /healthz` → text "ok"
- `GET /api/state` → `{ presence, recent, inbox_counts }` where `recent` is the last 200 transcript entries and `inbox_counts` is a `{ "<jid>": <number> }` map
- `GET /api/inbox/<addr>` → array of unread envelopes for that JID; returns `400 { error:'bad addr' }` if the addr contains `/`, `\`, or `..`
- `GET /api/envelope/<id>` → single envelope full body, or `404 { error:'not found' }`
- `GET /api/transcript?since=<iso>` → array of envelopes; if `since` is given, filters to `e.ts > since`

## Canonical envelope schema

(Source: `hub-cloudflare/src/envelope.ts`. Mirror this in `lib/envelope-schema.ts` using Zod and use it on every read AND every write.)

Fields:

- `id` — UUID
- `from` — string, min length 1 (a JID, e.g. `@zack`)
- `to` — string, min length 1 (a JID)
- `room` — string, min length 1 (e.g. `#main`)
- `kind` — enum: `'request' | 'reply' | 'event' | 'broadcast' | 'system' | 'join' | 'leave' | 'presence' | 'error' | 'schema-update'`. Preprocess legacy aliases via `KIND_MAP` (mirrored from `hub-cloudflare/src/kind-map.ts`): `task→request`, `request_aid→request`, `response→reply`, `deliver→event`, `summary→event`, `relay→event`, `ack→system`. Pass-through for canonical kinds.
- `intent` — optional string (application-layer verb)
- `body` — string OR `Record<string, unknown>`
- `replyTo` — string or null
- `trace` — UUID
- `seq` — non-negative integer
- `ts` — ISO-8601 datetime string
- `expiresAt` — ISO-8601 datetime string (ABSOLUTE; if a sender provides `ttl:number + ts:string` with no `expiresAt`, synthesize it via `new Date(Date.parse(ts) + ttl*1000).toISOString()`)
- `capabilities` — optional `string[]`
- `ttl` — optional positive integer (deprecated; tolerated for back-compat)
- `sig` — optional nullable string (stub; do NOT trust as verified)
- `issuer` — optional nullable string (stub; do NOT trust as verified)

## The 57 components — distilled

Build all 57. P0 components must be fully wired to their endpoints. P1 and P2 may be scaffolded with `TODO(prompt-section-N)` comments.

### Section 1 — Live status (the dashboard)

A grid of tiles that gives zack a one-glance health view. Server Components with `revalidate: 30` where possible.

- `WorkerHealthTile` — green/red for Worker reachability — P0 — `GET /healthz` (no auth) — server fetch
- `WorkerAuthProbeTile` — confirms bearer is valid — P0 — `GET /presence` with bearer — server fetch
- `FileBusHeartbeatTile` — flags stale bridges via `agents[*].lastSeenAt` — P0 — `GET <PANEL_SERVER_URL>/api/state`
- `BridgeStateMatrix` — lights for lmstudio-bridge, gemini-bridge, retry-daemon, panel-server — P0 — orchestrator state (no API yet — render placeholder + TODO(prompt-section-1))
- `DLQDepthBadge` — count from `inbox_counts['@dlq']` — P0 — `GET <PANEL_SERVER_URL>/api/state`
- `TranscriptLineCount` — total + last rotation timestamp — P1
- `CFBindingsPanel` — DO/KV/D1/R2 binding states — P1
- `CostMeter` — $/mo against $25 commit — P2
- `WorkerVersionBadge` — version + last deploy ts — P2

### Section 2 — Conversation viewing

- `LiveTranscript` — newest-first, kind badges, filter — P0 — server SSE route at `app/api/bus/stream/route.ts` (see Real-time strategy)
- `AgentRosterFilter` — click peer → filter transcript — P0 — derived from `presence.agents`
- `PendingInboxesPane` — per-agent unread counts + drill-in — P0 — `GET <PANEL_SERVER_URL>/api/inbox/<addr>` and `GET <PANEL_SERVER_URL>/api/envelope/<id>`
- `TraceDrillDown` — pick a trace UUID → only its envelopes, ordered by hop — P1
- `PeerComparisonView` — two-column outbox vs inbox for chosen trace — P1
- `TranscriptReplay` — re-render with timeline scrubber — P2 — `GET <PANEL_SERVER_URL>/api/transcript?since=<iso>`
- `AdminAuditLogViewer` — append-only log of every privileged action from this UI — P1 — reads from KV (see Security)

### Section 3 — Peer (JID) management

- `PeerRoster` — all known peers, online/offline derived as `(now - lastSeenAt) < 90s` — P0 — `GET /presence` (bearer, server-side)
- `CapabilityBadges` — chips for `reason`, `code`, `tools:mcp`, `chat`, `local` — P0 — `agents[jid].capabilities`
- `PeerInboxBrowser` — click peer → unread envelopes — P0 — `GET <PANEL_SERVER_URL>/api/inbox/<addr>`
- `PeerOutboxBrowser` — view sent envelopes from `outbox/` — P1 — endpoint TBD
- `PeerReadHistory` — delivered+acked per peer — P1 — endpoint TBD
- `SendAsPeerComposer` — POST envelope to Worker `/send` as chosen JID — P0 — server-side `POST /send` with bearer, never expose composer payload to client without Zod validation
- `PeerRetireAction` — mark peer offline, clear inbox — P2

### Section 4 — Bridge & daemon control

- `BridgeRunMatrix` — start/stop/restart per bridge — P0 — orchestrator API (TBD; placeholder)
- `TailStdoutViewer` — live tail per child with prefixed colored lines — P0 — server SSE route at `app/api/orchestrator/tail/[bridge]/route.ts`
- `RetryCounterTable` — per-bridge restart counter + backoff state — P1
- `OrphanRecoveryTrigger` — runs `recoverOrphans(addr, busDir)` — P1
- `CompactionTrigger` — runs `npm run bus:compact` with dry-run preview — P1
- `PermFailFlip` — acknowledge bridges that exceeded `maxRestarts` — P2

### Section 5 — Room management

- `RoomList` — all rooms from transcript + D1 `room_schemas` — P1 — `GET /presence`.rooms + D1 query proxy
- `RoomSchemaViewer` — show `policy`, `zod_json`, `updated_at`, `updated_by` — P1 — `GET /room/<name>/schema`
- `RoomSchemaEditor` — operator-friendly form OR raw JSON pane — P1 — `PUT /room/<name>/schema` (admin route only)
- `RoomPolicySwitch` — three-way toggle: strict / warn / off — P1
- `HopCeilingDisplay` — effective ceiling (default 8 + overrides) — P2
- `RoomMembershipEditor` — edit `roster:<room>` KV entries — P2
- `SelfBrickingWarningBanner` — alert if a strict-policy edit could brick the room — P1 (see Security: validation logic)

### Section 6 — DLQ + retry inspector

- `DLQBrowser` — list `inbox/@dlq/` with reason field — P0 — `GET <PANEL_SERVER_URL>/api/inbox/@dlq`
- `DLQEnvelopeDetail` — full envelope + retry history + last error — P0 — `GET <PANEL_SERVER_URL>/api/envelope/<id>`
- `DLQReplayAction` — move DLQ file back to recipient inbox under deterministic id — P1 — admin API route
- `DLQDiscardAction` — permanent delete after operator confirm — P1 — admin API route, two-step confirm
- `RetryDaemonState` — show `.pending-acks.json` — P1
- `BulkDLQPurge` — discard older than N days — P2 — admin API route, two-step confirm

### Section 7 — Worker / cloud admin

All of these are admin mutations and live under `app/api/admin/*/route.ts` — NOT Server Actions.

- `WorkerVersionPanel` — version id + deploy timestamp — P1 — Cloudflare API
- `RotateAPISecret` — generate, push via `wrangler secret put`, update local config — P1 — sidecar with shell access; never expose to browser; two-step confirm
- `EditAdminJIDs` — manage `HUB_ADMIN_JIDS` `[vars]` block — P1 — requires `wrangler deploy` after edit; two-step confirm
- `D1QueryConsole` — read-only SELECT against `transcripts` and `room_schemas` — P1 — proxy to Cloudflare D1 API; reject any non-SELECT statement
- `KVNamespaceBrowser` — list `presence:*` and `roster:*` keys — P1
- `R2StatusPanel` — `hub-deliveries` bucket state — P2
- `WorkerLogsViewer` — stream `wrangler tail` output — P2

### Section 8 — Configuration & onboarding

- `FirstRunWizard` — Worker URL, secret entry, account selection — P0 — server actions for the wizard form (this is fine, no admin mutation), with secrets immediately moved into server-side env
- `SecretEntryPane` — password-style input; secret stored server-side, never re-rendered — P0
- `TunnelURLConfig` — set `cloudflared` URL for the panel-server — P0
- `FeatureFlagToggles` — dual-write on/off, sound, theme — P1
- `EmbeddedHandbook` — render `HANDBOOK.md` inline — P1 — render through `react-markdown` + `rehype-sanitize`, NEVER `dangerouslySetInnerHTML`
- `RecoveryInstructions` — static "If chat resets" panel — P1
- `CleanupActions` — one-click delete of leftover artifact files — P2 — admin API route, two-step confirm
- `ConnectionDiagnostics` — runs three monitoring checks (HANDBOOK §5) — P0 — `GET /healthz`, `GET /presence` no-bearer, `GET /presence` with bearer

## File layout (Next.js App Router)

Generate this directory tree exactly. All admin mutations are API routes (`app/api/admin/*/route.ts`), never Server Actions. The `actions/` directory must NOT exist for admin work.

```
app/
  (dashboard)/
    page.tsx                          // section 1 composition
  transcript/
    page.tsx                          // section 2
  peers/
    page.tsx                          // roster
    [jid]/
      page.tsx
      inbox/page.tsx
      outbox/page.tsx
  bridges/
    page.tsx                          // section 4
  rooms/
    page.tsx                          // section 5
    [room]/
      schema/page.tsx
  dlq/
    page.tsx                          // section 6
  admin/
    page.tsx                          // section 7
    d1-console/page.tsx
    kv-browser/page.tsx
  settings/
    page.tsx                          // section 8
  api/
    worker/
      presence/route.ts               // proxies /presence with bearer server-side
      send/route.ts                   // proxies /send (GET 405; POST validates with Zod)
      room/[name]/schema/route.ts     // GET proxy (read-only)
    bus/
      state/route.ts                  // proxies panel-server /api/state
      inbox/[jid]/route.ts
      envelope/[id]/route.ts
      stream/route.ts                 // SSE: subscribes to Worker WS, fans to client
    orchestrator/
      status/route.ts
      tail/[bridge]/route.ts          // SSE child stdout
    admin/
      room/[name]/schema/route.ts     // PUT (admin-gated, audit-wrapped)
      dlq/replay/route.ts             // POST
      dlq/discard/route.ts            // POST
      dlq/purge/route.ts              // POST
      bridge/start/route.ts           // POST
      bridge/stop/route.ts            // POST
      bridge/restart/route.ts         // POST
      cleanup/route.ts                // POST
      rotate-secret/route.ts          // POST
      edit-admin-jids/route.ts        // POST
      audit/route.ts                  // GET — read audit log
  components/                          // shadcn primitives + project-specific
    section1/, section2/, section3/, section4/, section5/, section6/, section7/, section8/
  lib/
    worker-client.ts                  // server-only fetch wrapper; first line: `import 'server-only';`
    panel-client.ts                   // server-only panel-server fetch wrapper
    envelope-schema.ts                // Zod, mirrored from hub-cloudflare/src/envelope.ts
    kind-map.ts                       // mirrored from hub-cloudflare/src/kind-map.ts
    jid-color.ts                      // djb2 hash → HSL hue
    audit.ts                          // beginAudit/completeAudit/failAudit, KV-backed
    rate-limit.ts                     // KV-backed token bucket, fail-open
    self-bricking.ts                  // SelfBricking validator
    sse.ts                            // AsyncGenerator SSE parser
    auth-headers.ts                   // reads x-auth-email / x-is-admin from request.headers
middleware.ts                          // auth gate — injects headers via NextResponse.next({ request: { headers } })
next.config.js                         // headers config; NO `output: 'export'`
```

## Security rules — Wave 1 mandatory, fold inline

These are non-negotiable. Code generation must produce a project that already meets every rule below.

### Secrets are server-only

- `HUB_API_SECRET` lives only in `app/lib/worker-client.ts`, which begins with `import 'server-only';`. No file under `'use client'` may import it. No env var prefixed `NEXT_PUBLIC_` may contain a secret. There must be no `NEXT_PUBLIC_HUB_API_SECRET` anywhere in the codebase.
- `app/lib/worker-client.ts` exposes `workerFetch(path, init)` which sets `Authorization: Bearer ${process.env.HUB_API_SECRET}` and forces the URL prefix to `process.env.WORKER_URL ?? 'https://hub-relay.halkive.workers.dev'`. Reject any `path` that contains `://` to prevent SSRF/open-redirect.
- Same pattern in `app/lib/panel-client.ts` against `PANEL_SERVER_URL`.

### Audit log is a state machine, not a flat append

In `app/lib/audit.ts`:

- `beginAudit({ actor, action, target, before })` writes a row with `status: 'pending'`, returns `auditId`.
- `completeAudit(auditId, after)` flips status to `'completed'`.
- `failAudit(auditId, err)` flips status to `'failed'` with redacted error (strip `Authorization` header, any field named `secret`, `token`, `api_key`).
- Every admin route wraps its mutation: `id = beginAudit(...)`; try { mutate(); completeAudit(id, after); } catch (err) { failAudit(id, err); throw; }
- `AdminAuditLogViewer` queries audit entries filtered to `status='completed'`; surface counts of `pending` rows older than 60s as a yellow-banner health signal. The audit storage backend is a dedicated KV namespace (`AUDIT_KV` binding); each row keyed `audit:<YYYY-MM-DD>:<auditId>`.
- Emergency fallback when KV is unavailable: write to a second KV namespace `AUDIT_FAILURES_KV` with `expirationTtl: 86400`. NEVER write to `/tmp` — `/tmp` on Cloudflare Pages is per-request and won't persist. If both KV writes fail, `console.error` and increment a metric counter — that is the last resort.

### Middleware injects auth via headers, never mutates the Request

`middleware.ts`:

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // v1: bearer-only at the edge; SSO is v2 (out of scope for this prompt).
  // Resolve identity from a cookie/header-based session (placeholder for v1 — TODO(prompt:auth)).
  const email = '';        // wire to SSO in v2
  const isAdmin = false;   // wire to admin JID lookup in v2
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-auth-email', email);
  reqHeaders.set('x-is-admin', isAdmin ? '1' : '0');
  return NextResponse.next({ request: { headers: reqHeaders } });
}
```

Never assign `req.auth = {...}` — `Request` is immutable in App Router. Route handlers read `request.headers.get('x-auth-email')` and `request.headers.get('x-is-admin')` via the helper in `app/lib/auth-headers.ts`.

### No Server Actions for admin mutations

Server Actions cannot read middleware-injected headers reliably. Every mutation in section 7, plus `DLQReplayAction`, `DLQDiscardAction`, `BulkDLQPurge`, `CleanupActions`, `RotateAPISecret`, `EditAdminJIDs`, and the room schema PUT, MUST be implemented as POST handlers in `app/api/admin/*/route.ts` that:

1. Read identity from `request.headers.get('x-auth-email')` / `'x-is-admin'`.
2. Reject if `x-is-admin !== '1'` with `403`.
3. Validate input with Zod (mirroring the Worker's schema where applicable).
4. Call `beginAudit(...)`.
5. Perform the mutation by calling `workerFetch(...)` or the relevant orchestrator endpoint.
6. Call `completeAudit(...)` on success or `failAudit(...)` on throw, then rethrow.
7. Apply two-step confirmation in the UI for destructive operations (rotate secret, edit admin JID list, set room policy=strict, bulk DLQ purge).

### Security headers in `next.config.js`

```js
async headers() {
  const isProd = process.env.NODE_ENV === 'production';
  const hsts = isProd
    ? 'max-age=31536000; includeSubDomains; preload'
    : 'max-age=86400; includeSubDomains'; // no preload — preload is irreversible
  return [{
    source: '/:path*',
    headers: [
      { key: 'Strict-Transport-Security', value: hsts },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=()' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; connect-src 'self' https://hub-relay.halkive.workers.dev; frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ],
  }];
}
```

### Tiered rate limiting

In `app/lib/rate-limit.ts`, KV-backed token bucket:

- General API routes: 120 req/min/IP.
- Admin mutations (`/api/admin/*`): 5 req/min/IP.
- SSE streams: 10 concurrent connections per IP.
- Window keyed `rl:<tier>:<ip>:<minute>` with `expirationTtl` matching the window.
- Fail-open on KV unavailability with a `console.warn`. The rate limiter must never become an outage vector.

### SelfBricking warning logic

In `app/lib/self-bricking.ts`. Used by `SelfBrickingWarningBanner`:

- Parse the proposed `zod_json` for the room.
- Locate any `from` allowlist or equivalent constraint on the envelope's `from` field.
- If no such constraint exists, suppress the warning — there is no allowlist to lock the admin out of.
- If the constraint exists, simulate it against each JID in `HUB_ADMIN_JIDS`. If at least one admin would pass, suppress. If none pass, warn loudly: this schema would reject the admin's own `kind: 'schema-update'` envelope.
- Coarse "always warn on policy=strict" logic is wrong — it false-fires constantly. Implement the simulation.

### XSS, output encoding, untrusted content

- Envelope bodies are adversarial input (peer LLMs are not trusted). Render via `react-markdown` + `rehype-sanitize` with the default safe schema. NEVER use `dangerouslySetInnerHTML` anywhere in the project.
- Every API route validates inbound JSON with Zod before doing anything with it. The same applies to `POST /send` proxy: parse, validate against the mirrored `EnvelopeSchema`, then forward.

## Real-time strategy

`LiveTranscript` and `TailStdoutViewer` use Server-Sent Events end-to-end. Browsers MUST NOT open WebSockets to the Worker (the bearer token would have to leak into the URL as `?token=...` — forbidden). Instead, the SSE route on the Next.js server opens the WebSocket to the Worker server-side and fans the events out as SSE.

`app/api/bus/stream/route.ts`:

- Implements an `AsyncGenerator` over `response.body.getReader()` from the upstream WS-to-SSE shim.
- Decodes each chunk, splits on `\n`, and parses every line beginning with `data:` as JSON. Treat `data: [DONE]` as terminator.
- Uses an `AbortController` set to abort at 50 seconds, dodging Cloudflare Pages' 60-second request ceiling. After abort, the client reconnects.
- Reconnect on the client uses exponential backoff `1s → 2s → 4s → 8s → 16s → 30s (cap)`. The `reconnecting` UI state clears on the FIRST new event after reconnect, NOT on the moment the connect call returns — a connect that succeeds but never receives an event is still effectively offline.

`app/lib/sse.ts` exports the `parseSseStream(reader)` async generator and the client-side `useSseStream(url)` hook.

## Auth (v1) and what's deferred to v2

- v1: bearer auth to the Worker via `HUB_API_SECRET`, held only in server modules. The UI itself has no real user gate in v1 — gate it at the network edge (Cloudflare Access on the Pages app) outside the code's responsibility, OR run it on localhost only.
- v2 (NOT in this build): Cloudflare Access SSO replaces bearer. When wiring v2, also implement: KV-cached JWKS with 5-minute TTL plus `AbortSignal.timeout(5000)`; bounded JOSE retry capped at `MAX_RETRY_ATTEMPTS = 2` only for `kid`-not-found / key-not-found errors; verified `CLOUDFLARE_JWKS_URL` env var (do NOT hardcode any cfl.cdn.cloudflare.net URL — look it up in the actual Access application config and verify in CI). All of these are TODO(v2-sso) — leave clearly-labeled stubs.

## Validation criteria

What "done" looks like:

- `next build` succeeds with the default Next.js output adapter (no `output: 'export'`).
- TypeScript strict mode passes; any `any` is justified by a one-line comment.
- All P0 components render and hit the stated endpoints. P1 and P2 may be scaffolded.
- Every admin mutation calls `beginAudit` before the mutation and `completeAudit` after, or `failAudit` on throw.
- Grep `app/components/` and any file that begins with `'use client'`: there must be ZERO occurrences of `process.env.HUB_API_SECRET`. Also zero occurrences of `NEXT_PUBLIC_HUB_API_SECRET` anywhere.
- Strict-Transport-Security, CSP, X-Frame-Options, Permissions-Policy headers all present in the response.
- SSE reconnect tested by killing and resuming the upstream — UI shows "reconnecting" only until the first new event arrives.

## Prohibited patterns (explicit don'ts)

- `NEXT_PUBLIC_HUB_API_SECRET` or any `NEXT_PUBLIC_*` containing a secret.
- `dangerouslySetInnerHTML`, anywhere.
- Direct `fetch()` from a Client Component to `https://hub-relay.halkive.workers.dev`. Always go through `app/api/*` server routes.
- Server Actions for admin mutations. (Server Actions are fine for the FirstRunWizard and other non-admin user-facing forms.)
- `output: 'export'` in `next.config.js`.
- `React.cache()` for cross-request data — it's per-request only. Use KV.
- `/tmp` for emergency persistence on Cloudflare Pages — it's per-request.
- Hardcoded JWKS URLs without runtime verification (only relevant in v2 anyway).
- Unbounded retry loops. Cap retries at 2 for JOSE errors and at the documented backoff for SSE.
- Storing the bearer in localStorage, cookies readable by JS, or any browser-accessible state.
- Storing tunnel URLs that contain secrets in the query string.

## What to ship

A single Next.js project at the root of the export, ready for `npx wrangler pages deploy`. Include a `README.md` explaining:

- Required env vars: `HUB_API_SECRET` (Worker bearer, server-only), `HUB_ADMIN_JIDS` (comma-separated JIDs), `WORKER_URL` (default `https://hub-relay.halkive.workers.dev`), `PANEL_SERVER_URL` (default `http://localhost:7777`).
- Required KV bindings on Cloudflare Pages: `AUDIT_KV`, `AUDIT_FAILURES_KV`, `RATE_LIMIT_KV`.
- One paragraph on how to run locally: `npm install`, `npm run dev` against a running `panel-server.mjs` on `localhost:7777`.

All 57 components present. P0 fully wired. P1 and P2 scaffolded with `TODO(prompt:section-N)` comments referencing the section they belong to in this prompt.
```
