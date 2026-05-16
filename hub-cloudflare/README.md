# hub-cloudflare — Aether Shunt Coordination Hub (Cloudflare Worker + Durable Object)

Cloudflare-native variant of the Aether Shunt multi-LLM hub. Implements the architecture locked in `docs/HUB_BLUEPRINT.md` Sections 13 and 14.

- One Worker (`hub-relay`) — validator/edge ingress.
- One Durable Object class (`HubRoom`) — one instance per `#room`, native WebSocket Hibernation, hop ceiling, passive auditor, presence.
- KV (`HUB_PRESENCE`) — aggregated presence read.
- D1 (`HUB_TRANSCRIPTS`) — append-only transcript per room.
- R2 (`HUB_DELIVERIES`) — file-payload blobs (placeholder for `kind: deliver` envelopes).

This package is **isolated** — no project-wide deps were added. Everything stays under `hub-cloudflare/`.

---

## Prerequisites

```bash
npm install -g wrangler
wrangler login
```

You also need:
- a Cloudflare account (this scaffold is wired to `c6e9f3ff4b3d684700718224c6a63ec4`),
- Node 18+ on the same machine for local `wrangler dev`.

Install local deps for typecheck + dev:

```bash
cd hub-cloudflare
npm install
```

---

## Bring it live (5 commands)

```bash
# 1. Create the KV namespace; copy the returned id into wrangler.toml.
wrangler kv:namespace create HUB_PRESENCE

# 2. Create the D1 database; copy the returned database_id into wrangler.toml.
wrangler d1 create hub_transcripts

# 3. Create the R2 bucket (name already wired in wrangler.toml).
wrangler r2 bucket create hub-deliveries

# 4. Apply the D1 schema migration.
wrangler d1 execute hub_transcripts --file=./migrations/0001_init.sql

# 5. Deploy the Worker + Durable Object.
wrangler deploy
```

Optional — tail logs (sees the Passive Auditor entries):

```bash
wrangler tail
```

After step 1, replace `REPLACE_WITH_KV_ID` in `wrangler.toml`. After step 2, replace `REPLACE_WITH_D1_ID`. The R2 bucket name is already filled in.

---

## Equivalent Cloudflare MCP tool calls

The Cloudflare MCP is connected in this Claude session. The same five steps map to these tools (run from chat):

| Wrangler step | Cloudflare MCP tool |
|---|---|
| 1. `kv:namespace create HUB_PRESENCE` | `kv_namespace_create` (then `kv_namespaces_list` to confirm) |
| 2. `d1 create hub_transcripts` | `d1_database_create` (then `d1_databases_list`) |
| 3. `r2 bucket create hub-deliveries` | `r2_bucket_create` (then `r2_buckets_list`) |
| 4. `d1 execute --file=…0001_init.sql` | `d1_database_query` with the SQL file contents as the query parameter |
| 5. `wrangler deploy` | No MCP equivalent — Workers deploy still goes through `wrangler` (or the Cloudflare dashboard's Workers UI). The MCP tool `workers_get_worker` / `workers_list` confirms it after deploy. |

`set_active_account` may be needed first to scope the MCP to account `c6e9f3ff4b3d684700718224c6a63ec4`.

---

## Endpoints (after deploy)

- `wss://hub-relay.<your-subdomain>.workers.dev/ws?room=%23main&jid=%40claude` — WebSocket upgrade. URL-encode `#` and `@`.
- `POST /send` — JSON envelope; validated at the edge against `EnvelopeSchema`.
- `GET  /presence` — aggregated KV presence read.
- `GET  /health` — `{ ok: true, ts }`.

---

## Running alongside the filesystem bus

The original `hub-bus/` filesystem bus and this Cloudflare hub will coexist during migration. The two share an envelope shape (the only breaking change is `expiresAt` replacing the relative `ttl` — see `legacyTtlToExpiresAt` in `src/envelope.ts`).

Bridges (`hub-bus-tools/lmstudio-bridge.mjs`, `hub-bus-tools/gemini-bridge.mjs`, etc.) will get **one new config option** so they can run against either transport without code changes:

```
HUB_TRANSPORT=filesystem   # default; reads/writes hub-bus/
HUB_TRANSPORT=cloudflare   # connects to wss://hub-relay.../ws
HUB_URL=wss://hub-relay.<your-subdomain>.workers.dev
HUB_JID=@lmstudio
```

When `HUB_TRANSPORT=cloudflare`, the bridge:
1. Opens a single WS to `${HUB_URL}/ws?room=#main&jid=${HUB_JID}`.
2. Sends a `join` envelope with its `capabilities`.
3. Listens; on each inbound envelope, replies with the same shape it currently writes to `inbox/<from>/`.
4. Polls for outbound work the same way it does today (LM Studio HTTP, Gemini stdio, etc.).

This keeps the agent-side code identical and lets us cut over one bridge at a time.

---

## Auth (v0.2)

This is a **stop-gap shared-secret scheme**. v0.3 swaps to Cloudflare Access SSO.

It closes three P0 holes from the audit:

| ID | Hole | Fix |
|---|---|---|
| 1.1 | Anyone could spoof identity by setting `?jid=@anyone`. | Worker bearer middleware on every non-health route. |
| 1.2 | Unauthenticated `PUT /room/:room/schema` → reject-all DoS. | Bearer + admin-JID allowlist (`HUB_ADMIN_JIDS`). |
| 4.4 | `kind: schema-update` envelopes bypassed Type-Safe Rooms. | DO restricts the bypass to admin senders only. |

### Set the bearer secret

```bash
npx wrangler secret put HUB_API_SECRET
# paste a long random string when prompted (32+ bytes recommended)
```

### Use it from clients

Every request EXCEPT `/health` and `/healthz` must present:

```
Authorization: Bearer <HUB_API_SECRET>
```

Routes that require the bearer:

- `GET /ws`
- `POST /send`
- `GET /presence`
- `GET /room/<name>/schema`
- `PUT /room/<name>/schema`

### Admin-only operations

These require both the bearer AND a JID listed in `HUB_ADMIN_JIDS`:

- `PUT /room/<name>/schema` — `body.updated_by` must be an admin (returns `403 NOT_ADMIN`).
- Envelopes with `kind: 'schema-update'` — `env.from` must be an admin (DO returns `SCHEMA_UPDATE_NOT_ADMIN`).

`HUB_ADMIN_JIDS` is a comma-separated plain env var configured under `[vars]` in `wrangler.toml` (defaults to `"@zack"`). It is **not** a secret; rotate it by editing the file and redeploying.

### WebSocket from browsers

Browsers cannot set `Authorization` on the `WebSocket` constructor, so the `/ws` route additionally accepts the secret as a query parameter:

```
wss://hub-relay.../ws?room=%23main&jid=%40claude&token=<HUB_API_SECRET>
```

**Limitation:** query-string tokens leak into HTTP referrers, server logs, and Cloudflare Access logs. Prefer the `Authorization` header from any non-browser client (CLI bridges, Node, Workers-to-Workers).

### v0.3 plan

- Replace `HUB_API_SECRET` + `HUB_ADMIN_JIDS` with Cloudflare Access JWT verification.
- The `updated_by` and `env.from` fields will be cross-checked against the JWT's authenticated identity, eliminating the spoofable JID query param entirely.

---

## What still has to happen for v0.3

- Cloudflare Access integration — replace the v0.2 bearer + admin-JID gates in `src/worker.ts` and `src/hub-room.ts` with JWT verification.
- Type-Safe Rooms (Blueprint §14, Task #11) — per-room Zod schemas applied to `body`. Slot in at the DO `routeEnvelope` validation step.
- Active critic from the Passive Auditor — promote `src/passive-auditor.ts` from log-only to optional rejection.
- Backpressure — Cloudflare Queues binding for slow local-LLM consumers.
- Signed envelopes — populate `sig`/`issuer`, verify on ingress.
