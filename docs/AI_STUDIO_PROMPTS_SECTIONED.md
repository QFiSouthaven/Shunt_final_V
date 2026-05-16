# AI Studio Build — Sectioned Prompts for `3ui/`

The full handoff (`AI_STUDIO_HANDOFF.md`) is too large for AI Studio Build to one-shot. This file decomposes the work into nine smaller prompts AI Studio CAN one-shot. Each prompt extends the existing `3ui/` codebase rather than regenerating it.

## How to use this file

- Run prompts in order; each prompt builds on the previous output and assumes the prior diffs are already merged into `3ui/`.
- Before pasting any prompt, give AI Studio the current `3ui/` project tree as the starting codebase (paste the full source, or attach the folder if your AI Studio project supports it). The prompts reference files that already exist there.
- After each AI Studio output, review the diff, commit only the new files into `3ui/`, then move to the next prompt. Reject regenerations of files that already exist.
- Don't skip Prompt 0 — it fixes the two security/deployment bugs that ship in every prior attempt and that the rest of the prompts assume are already fixed.

---

## Prompt 0 — Surgical fixes (CRITICAL, run before any other)

```text
You are making two surgical changes to the existing `3ui/` Next.js project. Do NOT regenerate any other files. Do NOT modify `lib/`, components, pages, or any file not named below. Output only the diffs for the three files mentioned, plus the new `wrangler.toml`.

CHANGE 1 — `middleware.ts`
The current file at `middleware.ts` line 8 reads `const isAdmin = true;`. This is wrong — it makes every visitor an admin. Replace it with a real check:

- Determine the caller's JID from `x-auth-email` on the request, OR from a `?jid=` query param, OR from the `HUB_DEV_JID` environment variable as a local-dev fallback. If none of those resolve to a non-empty string, treat the user as anonymous.
- Look that JID up against `process.env.HUB_ADMIN_JIDS` parsed as a comma-separated list. Match exactly (no fuzzy compare). If the JID is in the list, set `isAdmin = true`; otherwise `false`.
- The middleware still injects identity via `reqHeaders.set('x-auth-email', email)` and `reqHeaders.set('x-is-admin', isAdmin ? '1' : '0')`, then calls `NextResponse.next({ request: { headers: reqHeaders } })`. Do not mutate the request.
- Add a JSDoc comment above `middleware` stating: "v1 trusts the `x-auth-email` header (set from `?jid=` query param or HUB_DEV_JID env). Cloudflare Access SSO replaces this in v2."

CHANGE 2 — `next.config.ts`
The current file has `output: 'standalone'`. Cloudflare Pages with `@cloudflare/next-on-pages` requires the default Next.js output, NOT standalone, NOT export.

- Delete the `output: 'standalone'` line. Do not replace it with anything; the default output is correct.
- Leave every other field in the file untouched (reactStrictMode, headers, images, transpilePackages, webpack hook).

CHANGE 3 — `package.json`
- In `devDependencies`, add `@cloudflare/next-on-pages` at the latest stable major (`^1`).
- In `devDependencies`, REMOVE `firebase-tools` if present. This project does not use Firebase.
- Do not change anything else.

CHANGE 4 — new file `wrangler.toml` at project root
Create a minimal Cloudflare Pages config with:
- `name = "hub-ui"`
- `account_id = "1e28c63e2fd1a82751bd3b9af105f10f"`
- `pages_build_output_dir = ".vercel/output/static"` (this is the next-on-pages convention)
- `compatibility_date` set to a recent date (use 2026-05-01).
- `compatibility_flags = ["nodejs_compat"]`
- Three `[[kv_namespaces]]` entries with bindings `AUDIT_KV`, `AUDIT_FAILURES_KV`, `RATE_LIMIT_KV`. For each, set `id = "REPLACE_AT_DEPLOY_TIME"` as a placeholder so the deploy script substitutes the real KV namespace id.

Done when: tsc passes, the middleware's admin gate respects `HUB_ADMIN_JIDS`, `next build` produces standard Next output (not standalone), and `wrangler.toml` is at the repo root.
```

---

## Prompt 1 — Section 1: Live Status Dashboard

```text
You are extending the existing `3ui/` codebase. Do NOT regenerate `lib/`, `middleware.ts`, `next.config.ts`, `package.json`, or any pages already present (`app/(dashboard)/page.tsx` exists). Add only new component files under `components/section1/` and any new API routes under `app/api/`. The existing `lib/worker-client.ts`, `lib/panel-client.ts`, `lib/envelope-schema.ts`, `lib/kind-map.ts`, `lib/audit.ts`, `lib/rate-limit.ts`, `lib/sse.ts`, and `lib/auth-headers.ts` are the source of truth — import from them, do not duplicate their logic.

Build the nine status tiles for the dashboard. Compose them into the existing `app/(dashboard)/page.tsx`, replacing whatever placeholder is there.

Components (from handoff §1):
- `WorkerHealthTile` (P0). Purpose: green/red indicator for Worker reachability. Endpoint: `GET https://hub-relay.halkive.workers.dev/healthz` (no auth). Server Component, fetched via the existing `app/api/worker/...` proxy or directly server-side using `lib/worker-client.ts`. Output: pill showing "OK" + last-checked timestamp, or "DOWN" + error message. Error handling: any non-200 or fetch throw shows red with the HTTP status; do not surface stack traces.
- `WorkerAuthProbeTile` (P0). Confirms the bearer is valid. Endpoint: `GET /presence` via `workerFetch('/presence')`. Server Component. Output: "Bearer OK" green, or "Bearer rejected" red with status code. Same redaction rules — never include the bearer in any rendered text.
- `FileBusHeartbeatTile` (P0). Flags stale bridges by reading `agents[*].lastSeenAt` from `GET <PANEL_SERVER_URL>/api/state` via `lib/panel-client.ts`. A bridge is stale if `now - lastSeenAt > 90s`. Output: count of fresh bridges / total, plus a list of stale ones.
- `BridgeStateMatrix` (P0). Lights for `lmstudio-bridge`, `gemini-bridge`, `retry-daemon`, `panel-server`. The orchestrator HTTP API does not yet exist — render placeholder cards with `TODO(prompt:section-4)` comments. Each tile must still occupy its grid slot.
- `DLQDepthBadge` (P0). Number badge from `inbox_counts['@dlq']` on `/api/state`. Yellow if > 0, red if > 25, green if 0.
- `TranscriptLineCount` (P1). Total line count plus rotation timestamp. Scaffold only with `TODO(prompt:section-1-p1)`.
- `CFBindingsPanel` (P1). DO/KV/D1/R2 binding states. Scaffold only.
- `CostMeter` (P2). Static $25/mo placeholder.
- `WorkerVersionBadge` (P2). Static "v—" placeholder.

Endpoints already available (do not invent new ones):
- `GET /api/worker/presence` (proxy to Worker `/presence` with bearer, server-side)
- `GET /api/bus/state` (proxy to panel-server `/api/state`)
If a needed proxy route does not yet exist in `app/api/`, add it under `app/api/worker/` or `app/api/bus/`. New API routes must use the existing `workerFetch` / `panelFetch` helpers from `lib/`.

Inviolable rules (short reminder, do not re-explain):
- Server-only secrets — `HUB_API_SECRET` only ever read by `lib/worker-client.ts`.
- Header-based auth — read identity via `lib/auth-headers.ts`; never trust client-supplied admin claims.
- No `dangerouslySetInnerHTML` anywhere in this section.
- This section is read-only — no mutations, so no audit calls needed here.

Page wiring:
- `app/(dashboard)/page.tsx` is a Server Component with `export const revalidate = 30;`. It composes the nine tiles into a CSS grid (Tailwind `grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4`).
- Each tile is its own file under `components/section1/`. Use shadcn `<Card>` from `components/ui/card.tsx` (already exists).

Done when:
- `npx tsc --noEmit` passes.
- All nine tiles render in the dashboard page.
- `WorkerHealthTile`, `WorkerAuthProbeTile`, `FileBusHeartbeatTile`, and `DLQDepthBadge` fetch real data from the listed endpoints. The other five may be scaffolded with TODO comments.
- No client component in section1 imports `process.env.HUB_API_SECRET`.

Output the full new files under `components/section1/`, the new `app/(dashboard)/page.tsx`, and any new `app/api/*/route.ts` files. Do not output any other diff.
```

---

## Prompt 2 — Section 2: Conversation Viewing

```text
You are extending the existing `3ui/` codebase. Do NOT regenerate `lib/`, `middleware.ts`, `next.config.ts`, `package.json`, or any pages already present (`app/transcript/page.tsx` exists; `components/section2/live-transcript.tsx` exists; `components/section2/use-sse-stream.ts` exists). Add only new component files under `components/section2/` and any new API routes under `app/api/bus/` or `app/api/admin/`.

Build the seven conversation-viewing components per handoff §2. The existing `live-transcript.tsx` and `use-sse-stream.ts` cover one component plus its hook — extend those, do not duplicate.

Components:
- `LiveTranscript` (P0). Already exists at `components/section2/live-transcript.tsx`. Verify it consumes the SSE route and renders kind badges, JID-colored avatars (use `lib/jid-color.ts`), filter input, newest-first ordering. If anything is missing, patch in place — do not rewrite.
- `AgentRosterFilter` (P0). Click a peer chip → filters the transcript above it. Derived from `presence.agents` via `/api/worker/presence`. Client component using TanStack Query (or a plain `useEffect` poll at 30s if TanStack Query is not already wired). Selected JID lifts up via a callback prop or shared context.
- `PendingInboxesPane` (P0). Shows `{ jid: count }` from `inbox_counts` on `/api/bus/state`. Click row → drills into the inbox via existing `/api/bus/inbox/[jid]`. Each envelope row links to `/api/bus/envelope/[id]` for the full body.
- `TraceDrillDown` (P1). Pick a `trace` UUID → only that trace's envelopes ordered by `seq`. Use `/api/bus/state` for now and filter client-side. Scaffold the UI; mark filtering logic with `TODO(prompt:section-2-p1)` if it gets large.
- `PeerComparisonView` (P1). Two-column layout: peer A's outbox vs peer B's inbox for a chosen trace. Scaffold only — outbox endpoint does not yet exist (`TODO(prompt:section-3-p1)`).
- `TranscriptReplay` (P2). Timeline scrubber over `GET /api/bus/transcript?since=<iso>`. Scaffold only.
- `AdminAuditLogViewer` (P1). Reads from `lib/audit.ts` via a new `app/api/admin/audit/route.ts` GET handler that:
  - Reads identity from `request.headers.get('x-is-admin')` via `lib/auth-headers.ts`. 403 if not admin.
  - Lists recent audit entries from `AUDIT_KV` filtered to `status='completed'` by default, with a query param `?status=pending|failed|all`.
  - Surfaces a count of `pending` rows older than 60 seconds as a separate field in the response so the UI can show a yellow banner.

Endpoints to use (already exist or trivially wrap):
- `GET /api/worker/presence`
- `GET /api/bus/state`
- `GET /api/bus/inbox/[jid]`
- `GET /api/bus/envelope/[id]`
- `GET /api/bus/stream` (SSE)
- New: `GET /api/admin/audit`

Inviolable rules (short reminder):
- Envelope `body` is adversarial input from peer LLMs. Render via `react-markdown` + `rehype-sanitize` with the default safe schema. Never `dangerouslySetInnerHTML`.
- Server-only secrets remain server-only.
- Identity comes from headers via `lib/auth-headers.ts`.
- The audit GET route must beginAudit/completeAudit-wrap any action that could be construed as a mutation; pure GETs do not need audit, but any future "mark as read" action does.

Page wiring:
- Compose `LiveTranscript`, `AgentRosterFilter`, `PendingInboxesPane`, `AdminAuditLogViewer` into `app/transcript/page.tsx`. Layout: 3-column split (roster left, transcript center, inboxes right) on lg+, stacked on mobile.

Done when:
- `npx tsc --noEmit` passes.
- The transcript page renders. P0 components fetch real data.
- `AdminAuditLogViewer` returns 403 when `x-is-admin !== '1'`.
- `react-markdown` + `rehype-sanitize` are wired for envelope body rendering.

Output only new files plus patched `app/transcript/page.tsx`. Do not modify `lib/`, the existing `live-transcript.tsx` (unless patching for correctness), or any other section's components.
```

---

## Prompt 3 — Section 3: Peer (JID) Management

```text
You are extending the existing `3ui/` codebase. Do NOT regenerate `lib/`, `middleware.ts`, `next.config.ts`, `package.json`, or any pages already present (`app/peers/page.tsx` and `app/peers/[jid]/page.tsx` exist). Add only new component files under `components/section3/` and any new API routes under `app/api/`.

Build the seven peer-management components per handoff §3.

Components:
- `PeerRoster` (P0). Lists all peers from `presence.agents` via `GET /api/worker/presence`. For each peer compute `online = (Date.now() - Date.parse(lastSeenAt)) < 90_000`. Display columns: JID (colored chip via `lib/jid-color.ts`), online dot, last-seen timestamp (relative via `date-fns`), capability count. Server Component on `app/peers/page.tsx`. Each row links to `/peers/<jid>`.
- `CapabilityBadges` (P0). Renders chips for each capability string in `agents[jid].capabilities`. Known caps: `reason`, `code`, `tools:mcp`, `chat`, `local`. Unknown caps render as gray chips. Reusable: import into both `PeerRoster` (compact) and the peer detail page (full).
- `PeerInboxBrowser` (P0). For a given JID, fetches `GET /api/bus/inbox/<addr>` and lists envelopes with id/from/kind preview. Client component since the user clicks rows to drill in. Render in `app/peers/[jid]/page.tsx`. Each envelope opens a sheet via shadcn `<Sheet>` showing the full body fetched from `/api/bus/envelope/<id>`. Body rendering goes through `react-markdown` + `rehype-sanitize` (NEVER `dangerouslySetInnerHTML`).
- `PeerOutboxBrowser` (P1). The outbox endpoint does not yet exist. Scaffold a placeholder card with `TODO(prompt:section-3-p1)` and a note that this component is blocked on a panel-server addition.
- `PeerReadHistory` (P1). Same scaffold pattern.
- `SendAsPeerComposer` (P0). Form: from-JID select (populated from presence), to-JID input, room, kind (dropdown of canonical kinds from `lib/kind-map.ts`), intent, body (textarea). On submit, POST to a new `app/api/worker/send/route.ts` (if it does not already exist) that:
  1. Reads identity via `lib/auth-headers.ts`.
  2. Parses the body with the Zod `EnvelopeSchema` from `lib/envelope-schema.ts` BEFORE forwarding.
  3. Calls `workerFetch('/send', { method: 'POST', body: JSON.stringify(parsed) })`.
  4. Returns `{ ok: true, id }` or the Worker's error envelope `{ ok:false, code, error }`.
  Note: `/send` is rate-limited as a general API route (120 req/min/IP) via `lib/rate-limit.ts`. Wrap the route handler with the rate limiter.
- `PeerRetireAction` (P2). Scaffold only with two-step confirm placeholder.

Endpoints to use (or add):
- `GET /api/worker/presence` (existing or add via `lib/worker-client.ts`)
- `GET /api/bus/inbox/[jid]` (existing)
- `GET /api/bus/envelope/[id]` (existing)
- New if missing: `POST /api/worker/send` (Zod-validated proxy)

Inviolable rules (short reminder):
- Server-only secrets — the bearer never reaches the composer's client component.
- Header-based auth — `SendAsPeerComposer`'s POST is a normal user action, not an admin mutation, so admin gate does not apply; rate limit does.
- No `dangerouslySetInnerHTML` — envelope body previews use `react-markdown` + `rehype-sanitize`.
- Audit-before-mutate — `SendAsPeerComposer` is a mutation that creates an envelope. Wrap the route handler with `beginAudit/completeAudit/failAudit` so the action is logged, even though it is not admin-gated.

Page wiring:
- `app/peers/page.tsx` renders `<PeerRoster />` + `<SendAsPeerComposer />` side-by-side on lg+.
- `app/peers/[jid]/page.tsx` renders the JID's `<CapabilityBadges />` header, then `<PeerInboxBrowser jid={params.jid} />`, then placeholders for outbox/history.

Done when:
- `npx tsc --noEmit` passes.
- All P0 components fetch and render real data.
- `SendAsPeerComposer` round-trips a real envelope through the Worker (Zod-validated server-side, audit-logged).
- No client component imports `process.env.HUB_API_SECRET`.

Output only new files plus patched pages. Do not touch `lib/`.
```

---

## Prompt 4 — Section 4: Bridge & Daemon Control

```text
You are extending the existing `3ui/` codebase. Do NOT regenerate `lib/`, `middleware.ts`, `next.config.ts`, `package.json`, or any pages already present (`app/bridges/page.tsx` exists). Add only new component files under `components/section4/` and the new API routes under `app/api/admin/bridge/` and `app/api/orchestrator/`.

Build the six bridge-control components per handoff §4. The orchestrator (`hub-bus-tools/...`) does not yet expose an HTTP API — these prompts call NEW Next.js API routes that wrap the orchestrator. The Next.js API routes are admin-gated; the orchestrator itself is on localhost (or the configured tunnel URL) and trusted by network position.

Components:
- `BridgeRunMatrix` (P0). Grid of bridges (`lmstudio-bridge`, `gemini-bridge`, `retry-daemon`, `panel-server`). For each: state pill (running / stopped / restarting / failed), restart count, last-error preview, and three buttons: Start / Stop / Restart. Client component with TanStack Query polling `GET /api/orchestrator/status` every 5s. Buttons POST to the matching admin route. Two-step confirm on Stop and Restart for production-class bridges (not on the retry-daemon, which is safe to bounce).
- `TailStdoutViewer` (P0). Live-tail panel with prefixed colored lines per bridge. SSE route `app/api/orchestrator/tail/[bridge]/route.ts` opens a stream to the orchestrator's child stdout. Use `lib/sse.ts`'s `parseSseStream` helper. Auto-reconnect with the same backoff schedule used in section 2 (1s → 2s → 4s → 8s → 16s → 30s cap). `AbortController` set to abort at 50s to dodge Cloudflare Pages' 60s ceiling.
- `RetryCounterTable` (P1). Per-bridge restart counter + backoff state. Reads from `/api/orchestrator/status`. Scaffold the table with TODO comment for backoff column until the orchestrator exposes that field.
- `OrphanRecoveryTrigger` (P1). Single button → POST `/api/admin/orphan-recover`. Two-step confirm. Wrap with `beginAudit/completeAudit/failAudit`.
- `CompactionTrigger` (P1). Two-button widget: Dry-run preview → shows what would compact; Run → POST `/api/admin/compact`. Two-step confirm on Run.
- `PermFailFlip` (P2). Scaffold only.

NEW API routes (this section adds them):
- `GET /api/orchestrator/status` — proxy to `${ORCHESTRATOR_URL}/status` (env `ORCHESTRATOR_URL`, default `http://localhost:7777` since panel-server may co-host it; if separate, use a new `ORCHESTRATOR_URL` env var). Return shape `{ bridges: Array<{ name, state, restarts, lastError, lastSeenAt }> }`. Read-only, no admin gate, but rate-limit as general API.
- `POST /api/admin/bridge/start` — admin-gated. Body `{ bridge: string }` validated by Zod (`bridge` is one of the four known names). beginAudit → POST to orchestrator → completeAudit. 5 req/min/IP via `lib/rate-limit.ts`.
- `POST /api/admin/bridge/stop` — same shape, same audit, two-step confirm on UI side.
- `POST /api/admin/bridge/restart` — same.
- `GET /api/orchestrator/tail/[bridge]/route.ts` — SSE stream. Validate `bridge` against the allowlist in code; reject anything else with 400. No admin gate (read-only) but enforce SSE concurrency limit of 10 per IP (`lib/rate-limit.ts`).
- `POST /api/admin/orphan-recover` — admin-gated, audit-wrapped, two-step confirm.
- `POST /api/admin/compact` — admin-gated, audit-wrapped, body `{ dryRun: boolean }`.

Inviolable rules (short reminder):
- Admin mutations: `request.headers.get('x-is-admin') === '1'` → else 403. Read via `lib/auth-headers.ts`.
- Audit-before-mutate via `beginAudit/completeAudit/failAudit` from `lib/audit.ts`.
- Rate-limit admin routes at 5 req/min/IP, general routes at 120 req/min/IP, SSE at 10 concurrent/IP.
- No `dangerouslySetInnerHTML` — `TailStdoutViewer` renders ANSI-stripped plain text inside `<pre>`.

Page wiring:
- `app/bridges/page.tsx` is a Server Component shell that lazy-loads `<BridgeRunMatrix />` (client) on top, `<TailStdoutViewer />` (client) center, `<RetryCounterTable />` below.

Done when:
- `npx tsc --noEmit` passes.
- `BridgeRunMatrix` and `TailStdoutViewer` render. The matrix surfaces the orchestrator's `/status` response (a stub response is fine if the orchestrator is not yet live).
- All admin POST routes return 403 when `x-is-admin !== '1'`.
- All admin POST routes write a `pending` audit row, then `completed` on success.

Output only new component files, new API routes, and patched `app/bridges/page.tsx`. Do not touch `lib/`.
```

---

## Prompt 5 — Section 5: Room Management

```text
You are extending the existing `3ui/` codebase. Do NOT regenerate `lib/`, `middleware.ts`, `next.config.ts`, `package.json`, or any pages already present (`app/rooms/page.tsx` and `app/rooms/[room]/schema/page.tsx` exist). Add only new component files under `components/section5/` and any new API routes under `app/api/admin/room/`.

Build the seven room-management components per handoff §5.

Components:
- `RoomList` (P1). Lists all rooms. Source: `presence.rooms` from `/api/worker/presence`, plus a future D1 query of `room_schemas` (scaffold the second source with `TODO(prompt:section-5-p1)`). Render rows with room name, member count from presence, and a link to `/rooms/<name>/schema`. URL-encode `#main` as `%23main` when building links.
- `RoomSchemaViewer` (P1). Reads `GET /api/worker/room/[name]/schema` (which proxies to the Worker `GET /room/<name>/schema`). Renders four fields: `policy` (badge), `zod_json` (in a `<pre>` block, plain-text only), `updated_at`, `updated_by`. If the Worker returns 404 with `code: 'NOT_FOUND'`, render an "empty schema" state with a button to switch to the editor.
- `RoomSchemaEditor` (P1). Form with two modes: operator-friendly DSL (scaffold this — `TODO(prompt:section-5-p1)`) and raw JSON pane. The raw JSON pane is the working mode. Submit POSTs to a new `app/api/admin/room/[name]/schema/route.ts` PUT handler that:
  1. Reads identity via `lib/auth-headers.ts`. 403 if not admin.
  2. Parses the body with Zod: `{ policy: 'strict' | 'warn' | 'off', zod_json: string, updated_by: string }`.
  3. Verifies `updated_by` is in `process.env.HUB_ADMIN_JIDS`. 403 if not.
  4. Calls `lib/self-bricking.ts` to validate that the proposed schema would not lock the admin out (see SelfBrickingWarningBanner below). If self-bricking is detected, return 409 with `code: 'WOULD_BRICK'` so the UI can surface the warning. The user can override with `?force=1` query param after explicit two-step confirm in the UI.
  5. beginAudit → `workerFetch(\`/room/${encodeURIComponent(name)}/schema\`, { method: 'PUT', body })` → completeAudit on success, failAudit on throw.
- `RoomPolicySwitch` (P1). Three-way toggle: strict / warn / off. Embedded in `RoomSchemaEditor`. Strict requires two-step confirm before submit.
- `HopCeilingDisplay` (P2). Scaffold only.
- `RoomMembershipEditor` (P2). Scaffold only.
- `SelfBrickingWarningBanner` (P1). Client-side preview of the same simulation done server-side. When the editor's `policy` is `strict`, parse the proposed `zod_json`, locate any `from` allowlist or equivalent constraint on the envelope's `from` field, and simulate it against each JID in `HUB_ADMIN_JIDS` (the UI gets that list from a new `GET /api/admin/admin-jids` route — admin-gated, returns just the list). If no `from` constraint exists, suppress the warning. If at least one admin JID would pass, suppress. Otherwise render a loud red banner: "This schema would reject your own schema-update envelope." Use `lib/self-bricking.ts` (already exists).

Endpoints (existing or add):
- `GET /api/worker/presence`
- `GET /api/worker/room/[name]/schema` (existing or add as a server-side proxy)
- `PUT /api/admin/room/[name]/schema` (NEW — admin-gated, self-bricking check)
- `GET /api/admin/admin-jids` (NEW — admin-gated, returns the parsed `HUB_ADMIN_JIDS` list for UI simulation)

Inviolable rules (short reminder):
- Server-only secrets — bearer stays in `lib/worker-client.ts`.
- Header-based auth via `lib/auth-headers.ts`. PUT route returns 403 unless admin.
- No `dangerouslySetInnerHTML`.
- Audit-before-mutate — every PUT writes a `pending` audit row, then `completed` on success.

Page wiring:
- `app/rooms/page.tsx` renders `<RoomList />`.
- `app/rooms/[room]/schema/page.tsx` renders `<RoomSchemaViewer />` then `<RoomSchemaEditor />` (admin-only, the editor checks the same `x-is-admin` header server-side and renders read-only for non-admins).

Done when:
- `npx tsc --noEmit` passes.
- `RoomList` and `RoomSchemaViewer` fetch real data.
- The PUT route 403s for non-admins, returns 409 `WOULD_BRICK` when self-bricking is detected, and audit-logs every attempt.
- `SelfBrickingWarningBanner` shows only when the simulation actually rejects all admin JIDs.

Output only new component files, new API routes, and patched pages. Do not touch `lib/`.
```

---

## Prompt 6 — Section 6: DLQ + Retry Inspector

```text
You are extending the existing `3ui/` codebase. Do NOT regenerate `lib/`, `middleware.ts`, `next.config.ts`, `package.json`, or any pages already present (`app/dlq/page.tsx` exists). Add only new component files under `components/section6/` and the new API routes under `app/api/admin/dlq/`.

Build the six DLQ components per handoff §6.

Components:
- `DLQBrowser` (P0). Lists `inbox/@dlq/` envelopes via `GET /api/bus/inbox/@dlq`. URL-encode `@dlq` as `%40dlq` if your fetch helper does not already handle that. Each row: envelope id, original to/from, kind, `reason` field if present, age. Click row → drill-in to `DLQEnvelopeDetail`.
- `DLQEnvelopeDetail` (P0). Side sheet (shadcn `<Sheet>`) showing the envelope's full body via `GET /api/bus/envelope/<id>`, plus retry history and last error if available. Body rendered through `react-markdown` + `rehype-sanitize`. NEVER `dangerouslySetInnerHTML`.
- `DLQReplayAction` (P1). Button on each row → POST `/api/admin/dlq/replay` body `{ id: string }`. Two-step confirm. Server route:
  1. Admin gate via `lib/auth-headers.ts`. 403 if not admin.
  2. Zod-validate body.
  3. beginAudit → call orchestrator's replay wrapper (which under the hood runs `claim.mjs::writeEnvelopeIdempotent` with a deterministic id derived from `(orig_id, replay_ts)`) → completeAudit on success.
  4. Rate limit at 5 req/min/IP.
- `DLQDiscardAction` (P1). Button → POST `/api/admin/dlq/discard` body `{ id: string }`. Two-step confirm with type-the-id pattern. Same admin/audit/rate-limit rules. Permanent delete.
- `RetryDaemonState` (P1). Reads `.pending-acks.json` via a new `GET /api/orchestrator/pending-acks` route. Read-only, no admin gate. Scaffold the orchestrator endpoint with a stub if it does not yet exist.
- `BulkDLQPurge` (P2). Form with N-days input → POST `/api/admin/dlq/purge` body `{ olderThanDays: number }`. Two-step confirm with type-the-day-count pattern. Admin/audit/rate-limit.

NEW API routes:
- `POST /api/admin/dlq/replay` — admin-gated, audit-wrapped, rate-limited 5/min/IP.
- `POST /api/admin/dlq/discard` — same.
- `POST /api/admin/dlq/purge` — same.
- `GET /api/orchestrator/pending-acks` — read-only proxy to orchestrator (TODO scaffold if needed).

Endpoints already available:
- `GET /api/bus/inbox/[jid]`
- `GET /api/bus/envelope/[id]`

Inviolable rules (short reminder):
- Admin gate on every mutation route.
- Audit-before-mutate. The audit row's `target` field includes the envelope id being replayed/discarded; `before` snapshots the envelope, `after` snapshots the resulting state (replayed-to inbox or "discarded").
- No `dangerouslySetInnerHTML`.
- Two-step confirm on every destructive operation. Discard and purge require typing the id (or the day count) as the second step, not just clicking a confirm button.

Page wiring:
- `app/dlq/page.tsx` renders `<DLQBrowser />` left, `<DLQEnvelopeDetail />` as a side sheet, `<RetryDaemonState />` at bottom. `<BulkDLQPurge />` is in a collapsible danger-zone panel.

Done when:
- `npx tsc --noEmit` passes.
- `DLQBrowser` and `DLQEnvelopeDetail` fetch real data.
- All three POST routes 403 for non-admins, audit-log every attempt, and rate-limit.
- Two-step confirm UX implemented in the UI for replay, discard, purge.

Output only new component files, new API routes, and patched `app/dlq/page.tsx`. Do not touch `lib/`.
```

---

## Prompt 7 — Section 7: Worker / Cloud Admin

```text
You are extending the existing `3ui/` codebase. Do NOT regenerate `lib/`, `middleware.ts`, `next.config.ts`, `package.json`, or any pages already present (`app/admin/page.tsx` exists; `app/admin/d1-console/page.tsx` and `app/admin/kv-browser/page.tsx` may not — create them as new pages if missing). Add only new component files under `components/section7/` and the new API routes under `app/api/admin/`.

This section is the highest-risk for regressions because every component is an admin mutation against Cloudflare. Be extra careful about audit, rate-limit, and admin-gate on every route.

Build the seven worker/cloud-admin components per handoff §7.

Components:
- `WorkerVersionPanel` (P1). Read-only display of Worker version id + last-deploy timestamp. Source: Cloudflare Workers API (`workers_get_worker` MCP shape). New `GET /api/admin/worker-version` route — admin-gated, but read-only, so rate-limit as general API. Scaffold if Cloudflare API token is not yet configured.
- `RotateAPISecret` (P1). Button → POST `/api/admin/rotate-secret`. Two-step confirm with type "ROTATE" as the second step. Server route:
  1. Admin gate.
  2. beginAudit (with `target: 'HUB_API_SECRET'`, `before: '<redacted>'`).
  3. Generate a new random secret server-side.
  4. Invoke a sidecar (env `SIDECAR_URL`, must be on localhost or trusted tunnel) that runs `wrangler secret put HUB_API_SECRET` with the new value. The sidecar is the only thing with shell access. Browser MUST never see the new or old secret.
  5. Update local config (set the new secret in the Pages app's environment via Cloudflare API or via a manifest file the deploy step picks up).
  6. completeAudit with `after: '<redacted>'`. NEVER log the actual secret.
  7. Rate limit at 1 req/hour/IP for this specific route — secret rotation should be rare.
- `EditAdminJIDs` (P1). Comma-separated input; submit POSTs to `/api/admin/edit-admin-jids` body `{ jids: string[] }`. Validates each JID matches `^@[a-zA-Z0-9_-]+$` via Zod. Two-step confirm. Audit-wrapped. After the route updates the Pages env var via Cloudflare API, it must trigger a redeploy (or document that a manual `wrangler deploy` is required) — surface the redeploy status in the response.
- `D1QueryConsole` (P1). Read-only SELECT against `transcripts` and `room_schemas`. New `POST /api/admin/d1-query` route:
  1. Admin gate.
  2. Zod-validate body `{ sql: string }`.
  3. Reject any SQL that does not match `^\s*SELECT\b` (case-insensitive) — anything else returns 400 `{ code: 'NOT_READONLY' }`.
  4. Reject SQL containing semicolons that are not the trailing terminator (catches stacked queries).
  5. Proxy to Cloudflare D1 API for database id `a87829d1-4d7a-4e4b-b6e7-85fda56286cd`.
  6. Audit-wrapped. Rate-limit 5/min/IP.
  Renders results in a shadcn `<Table>`. Render `app/admin/d1-console/page.tsx` if missing.
- `KVNamespaceBrowser` (P1). Lists keys in `presence:*` and `roster:*` from KV namespace `6db26994bcfd4f6a9f496cf19d8232ba`. New `GET /api/admin/kv-list` and `GET /api/admin/kv-get` routes — admin-gated, audit-wrapped (these are reads but the audit captures who looked at what for compliance). Render `app/admin/kv-browser/page.tsx` if missing.
- `R2StatusPanel` (P2). Scaffold only.
- `WorkerLogsViewer` (P2). Scaffold only — `wrangler tail` requires sidecar with shell access, leave as TODO.

NEW API routes:
- `GET /api/admin/worker-version` — admin-gated.
- `POST /api/admin/rotate-secret` — admin-gated, audit, rate-limit 1/hr/IP.
- `POST /api/admin/edit-admin-jids` — admin-gated, audit.
- `POST /api/admin/d1-query` — admin-gated, SELECT-only, audit.
- `GET /api/admin/kv-list?prefix=<...>` — admin-gated, audit.
- `GET /api/admin/kv-get?key=<...>` — admin-gated, audit.

Inviolable rules (short reminder, this section is where they bite hardest):
- Server-only secrets — `HUB_API_SECRET`, `CLOUDFLARE_API_TOKEN`, and the new secret being rotated all live server-side. Never render any of them.
- Header-based auth — `x-is-admin === '1'` enforced via `lib/auth-headers.ts` on every route.
- No `dangerouslySetInnerHTML`.
- Audit-before-mutate — including reads in this section, since "who looked at the KV at 3am" matters.

Page wiring:
- `app/admin/page.tsx` is the section 7 hub: links to the three sub-pages plus inline `<WorkerVersionPanel />`, `<RotateAPISecret />`, `<EditAdminJIDs />`.
- `app/admin/d1-console/page.tsx` renders `<D1QueryConsole />`.
- `app/admin/kv-browser/page.tsx` renders `<KVNamespaceBrowser />`.

Done when:
- `npx tsc --noEmit` passes.
- All P1 components render. Read-only ones fetch real data when Cloudflare API token is set; scaffold gracefully when it isn't.
- Every admin route 403s for non-admins, audit-logs every attempt, and rate-limits per the schedule above.
- `D1QueryConsole` rejects non-SELECT SQL.
- No client component anywhere imports `process.env.HUB_API_SECRET` or `process.env.CLOUDFLARE_API_TOKEN`.

Output only new component files, new API routes, and patched/new admin pages. Do not touch `lib/`, `middleware.ts`, `next.config.ts`, or `package.json`.
```

---

## Prompt 8 — Section 8: Configuration & Onboarding

```text
You are extending the existing `3ui/` codebase. Do NOT regenerate `lib/`, `middleware.ts`, `next.config.ts`, `package.json`, or any pages already present (`app/settings/page.tsx` exists). Add only new component files under `components/section8/` and the new API routes under `app/api/settings/` and `app/api/admin/cleanup/`.

Build the eight onboarding/configuration components per handoff §8. This section also touches auth boundaries (the wizard sets the secret), so be careful about what crosses the client/server line.

Components:
- `FirstRunWizard` (P0). Multi-step wizard: (1) Worker URL, (2) Bearer secret entry, (3) Cloudflare account selection, (4) Admin JID list, (5) confirmation. The wizard form is fine as a Server Action because it is a USER-FACING form, not an admin mutation. The Server Action writes the entered values to server-side env (or a server-side encrypted manifest the deploy step consumes), then redirects to `/`. Secret values are written but never re-rendered.
- `SecretEntryPane` (P0). Password-style input. Used inside the wizard. Submitted via the wizard's Server Action. The component must NOT read the secret back on subsequent renders — once stored, it shows a "secret set" state with a "Replace" button.
- `TunnelURLConfig` (P0). Field for the `cloudflared` URL that fronts panel-server. Submit POSTs to `/api/settings/tunnel-url` (this is a configuration write, not an admin mutation, but still rate-limit 5/min/IP and audit-wrap because it changes how the UI reaches the bus). Two-step confirm not required.
- `FeatureFlagToggles` (P1). Three toggles: dual-write on/off, sound on/off, theme dark/light. Stored client-side in localStorage (no secrets, so localStorage is fine). Server-side defaults come from `process.env` and are read in a Server Component.
- `EmbeddedHandbook` (P1). Renders the project's `HANDBOOK.md` inline. Use `react-markdown` + `rehype-sanitize` with the default safe schema. NEVER `dangerouslySetInnerHTML`. The markdown source is fetched server-side and passed to the client component as a prop.
- `RecoveryInstructions` (P1). Static "If chat resets" panel. Plain prose; no fetch.
- `CleanupActions` (P2). One-click delete of leftover artifact files. POST `/api/admin/cleanup` admin-gated, audit-wrapped, two-step confirm, rate-limit 5/min/IP. Server route Zod-validates body `{ pattern: string }` against an allowlist of known artifact patterns (e.g. `*.tmp`, `*.bak`) — no glob escapes outside that list.
- `ConnectionDiagnostics` (P0). Runs three monitoring checks from HANDBOOK §5 in order:
  1. `GET /healthz` (no auth) — expect 200 `{ ok:true, ts }`.
  2. `GET /presence` without bearer — expect 401 (proves the Worker IS gating).
  3. `GET /presence` with bearer (via `lib/worker-client.ts`) — expect 200.
  Server Component on the settings page; renders three rows with green/red dots and the response status. If any row fails, render a remediation hint.

NEW API routes:
- `POST /api/settings/tunnel-url` — audit-wrapped, rate-limited 5/min/IP. Validates the URL is `https://*.trycloudflare.com` or `http://localhost:7777` only.
- `POST /api/admin/cleanup` — admin-gated, audit-wrapped, rate-limited 5/min/IP, allowlisted patterns.

Existing helpers to use (do not duplicate):
- `lib/worker-client.ts` for the bearer'd Worker fetches in `ConnectionDiagnostics`.
- `lib/audit.ts` for every mutation.
- `lib/rate-limit.ts` for rate limits.
- `lib/auth-headers.ts` for the cleanup route's admin gate.

Inviolable rules (short reminder, especially relevant here):
- Server-only secrets — `SecretEntryPane` posts to a Server Action that writes the secret to server-side state ONLY. The secret is never sent back to the client, never logged, never included in audit `before`/`after` (use `<redacted>` literally).
- Header-based auth — the wizard runs before SSO is configured, so it depends on either localhost trust or a one-time bootstrap token. Document the bootstrap flow inline in the wizard's prose.
- No `dangerouslySetInnerHTML` — the `EmbeddedHandbook` enforces this rule.
- Audit-before-mutate — wizard, tunnel URL, and cleanup all audit. Wizard's audit `actor` is `'bootstrap'` because no admin JID exists yet.

Page wiring:
- `app/settings/page.tsx` is a Server Component shell. If the wizard has not completed (detect via a server-side flag in env or KV), render `<FirstRunWizard />` exclusively. Otherwise render the rest: `<TunnelURLConfig />`, `<FeatureFlagToggles />`, `<EmbeddedHandbook />`, `<RecoveryInstructions />`, `<ConnectionDiagnostics />`, and a danger-zone collapsible with `<CleanupActions />` (admin-only).

Done when:
- `npx tsc --noEmit` passes.
- All P0 components render. The wizard accepts input and persists it server-side without re-rendering the secret.
- `ConnectionDiagnostics` runs all three checks against the real Worker.
- `EmbeddedHandbook` renders markdown via `react-markdown` + `rehype-sanitize`.
- The cleanup route 403s for non-admins, audit-logs every attempt, and rate-limits.

Output only new component files, new API routes, and patched `app/settings/page.tsx`. Do not touch `lib/`, `middleware.ts`, `next.config.ts`, or `package.json`.
```

---

## After all 9 prompts

- After each section's output, ask AI Studio for "only the new files; do not modify existing files in `3ui/`." If it tries to overwrite an existing file, reject and re-prompt.
- If AI Studio regenerates anything in `lib/`, reject and re-prompt with explicit "do not touch `lib/`. The existing files are the source of truth."
- Sections 7 (admin) and 8 (settings) are highest-risk for regressions because they touch auth — leave them for last; review the diff before integrating each one and re-run Prompt 0's middleware test to confirm the admin gate still works.
