# Aether Shunt Bus Protocol — addendum (acks, retries, DLQ)

This document extends `README.md` with the WRITE-side delivery guarantees added
in the ack/retry/DLQ hardening pass.

## New envelope kind: `ack`

Receivers signal back to senders with an `ack` envelope. The body is fixed:

```json
{
  "id": "<uuid>",
  "kind": "ack",
  "from": "@receiver",
  "to": "@sender",
  "room": "<same as original>",
  "body": {
    "ackOf": "<id of envelope being acked>",
    "status": "received | processed | rejected"
  },
  "replyTo": "<id of envelope being acked>",
  "trace": "<original.trace>",
  "ttl": 86400,
  "ts": "<iso8601>",
  "capabilities": []
}
```

Status meanings:

- `received` — receiver has the envelope on disk and intends to handle it. Sent
  as soon as practical (e.g. when a daemon picks up the file).
- `processed` — receiver has finished handling. Final, success.
- `rejected` — receiver refuses the envelope (validation, policy, capability
  mismatch). Final, failure. No retry should follow.

Receivers SHOULD send `received` quickly, then `processed` (or `rejected`) when
work is done. Senders MUST treat `rejected` and `processed` as terminal.

## New optional envelope field: `attempt`

Resent envelopes carry an `attempt` field (`0` for the original, `1+` for
retries). The retry id is derived deterministically from the original id and
the attempt number, so duplicates are detectable.

## DLQ mailbox: `@dlq`

The directory `hub-bus/inbox/@dlq/` is the dead-letter queue. Envelopes that
exhaust their retry budget are moved here for human review. The DLQ is just
another inbox shape — pollers can read it like any other address.

## Sender contract — `sendWithAck`

`sendWithAck(env, busDir, { timeoutMs, maxRetries, backoffBase, myJID })`:

1. Writes the envelope via `writeEnvelopeToBus` and records a `.pending-acks.json`
   entry.
2. Watches `inbox/<myJID>/`, `.read/`, and `.processing/` for an ack with
   `body.ackOf === env.id`.
3. On `received`: keeps waiting for `processed` or `rejected` until `timeoutMs`
   elapses; returns whichever final state was reached, or `acked` if only
   `received` was seen.
4. On `timeoutMs` with no ack: resends with a new deterministic id and an
   incremented `attempt`, with exponential backoff `backoffBase * 2^attempt`.
5. After `maxRetries + 1` attempts with no ack: moves the most recently sent
   envelope to `inbox/@dlq/` and returns `{ status: 'timeout' }`.

Return shape:

```ts
{ status: 'acked' | 'processed' | 'rejected' | 'timeout',
  latencyMs: number,
  attempts: number,
  finalEnvelope?: object }
```

## Receiver contract

A well-behaved receiver:

1. Picks up an envelope from `inbox/<me>/`.
2. Calls `writeAck(env, busDir, 'received', '@me')`.
3. Does the work. On success calls `writeAck(env, busDir, 'processed', '@me')`.
   On policy/validation failure calls `writeAck(env, busDir, 'rejected', '@me')`.
4. Moves the original envelope to `.read/` (existing `markRead` helper).

Receivers MUST NOT ack their own ack envelopes (no recursion).

## Optional retry daemon

`retry-daemon.mjs` watches `.pending-acks.json` and resends or DLQs entries
without keeping a long-running JS process for each `sendWithAck` call. It is
optional — `sendWithAck` itself handles the in-process retry path. The daemon
is useful when the sender process exits before its envelope is acked.

## Envelope schema v0.2.1

Plan-agent HIGH-priority fixes (Task #8 leftovers): the envelope grew four
new fields. The filesystem bus (`hub-bus-tools/envelope.mjs`) and the
Cloudflare Worker (`hub-cloudflare/src/envelope.ts`) move in lockstep.

### New fields

| Field | Type | Status | Meaning |
|---|---|---|---|
| `expiresAt` | ISO-8601 string | Required (new writers) | Absolute expiry. Receivers MUST drop envelopes past this point. |
| `ttl`       | number (seconds) | **Deprecated** | Legacy relative TTL. Still emitted by `createEnvelope` for back-compat with v0.1/v0.2 readers. Will be removed in v0.3. |
| `sig`       | string \| null | Stubbed | Signature placeholder. v0.3 will require and verify. |
| `issuer`    | string \| null | Stubbed | Issuing JID placeholder. v0.3 will require and verify. |

### Read-side migration

Because not every writer can be upgraded simultaneously, both implementations
perform a lazy migration when ingesting an envelope that has `ttl` + `ts` but
no `expiresAt`:

- `hub-bus-tools/envelope.mjs::validateEnvelope` synthesizes `expiresAt` from
  `ttl` + `ts` and attaches it to the envelope before returning.
- `hub-bus-tools/envelope.mjs::migrateLegacyEnvelope(env)` returns a copy of
  the envelope with `expiresAt` filled, without mutating the input.
- `hub-bus-tools/envelope.mjs::isExpired(env)` honors `expiresAt` first and
  falls back to `ttl`+`ts`.
- `hub-cloudflare/src/envelope.ts` wraps `EnvelopeShape` in a `z.preprocess`
  that fills `expiresAt` from `ttl`+`ts` before the shape check runs.
- `hub-cloudflare/src/envelope.ts::isEnvelopeExpired(env)` is the runtime
  equivalent of `isExpired` for the Worker side.
- `hub-cloudflare/src/envelope.ts::legacyTtlToExpiresAt(ts, ttl)` is the
  one-shot helper for code that needs to convert without going through the
  full schema.
- `hub-cloudflare/src/transcript.ts::recordEnvelope` writes `expires_at` and
  `issuer` columns added by `migrations/0003_envelope_metadata.sql`,
  backfilling `expires_at` via `legacyTtlToExpiresAt` when the inbound
  envelope only has `ttl`.

### Forward path (v0.3)

- `ttl` will be removed from new writes; readers will continue to migrate
  legacy envelopes for one more minor version, then strict-fail.
- `sig` and `issuer` move from stubs to required + verified. The DO will
  reject envelopes whose signature does not match the issuer's published key.

## Dual-write to Worker (v0.3)

The local file-bus is the authoritative write path on a single machine.
Starting with v0.3, `hub-bus-tools/envelope.mjs::writeEnvelopeToBus` ALSO
posts each envelope to the deployed Cloudflare Worker's `/send` endpoint
after the local writes succeed. This is the moment the bus becomes truly
cross-machine: peers connected to the Worker (panel, other bridges, future
SPA clients) receive the envelope without anyone polling shared
filesystem state.

### How to enable

Set two environment variables on every bridge / sender process:

| Var | Purpose |
|---|---|
| `WORKER_URL` | Base URL of the deployed Worker, e.g. `https://hub-relay.halkive.workers.dev`. Trailing slash is tolerated. Unset or empty = dual-write OFF (v0.2 single-machine behavior is preserved exactly). |
| `WORKER_SECRET` | The shared bearer token (`HUB_API_SECRET` value on the Worker side). Sent as `Authorization: Bearer <secret>`. If `WORKER_URL` is set but `WORKER_SECRET` is empty, a single warning is logged per process and the post is skipped — the local write still succeeds. |
| `WORKER_DUAL_WRITE_TIMEOUT_MS` | Optional. Per-POST timeout in ms (default `5000`). Implemented via `AbortController`. |
| `WORKER_DUAL_WRITE_VERBOSE` | Optional. Set to `1` to log a one-line debug message on every successful post. Off by default to keep bridge logs quiet. |

Env vars are read at call time (not at module load), so toggling dual-write
does NOT require a process restart on a long-running bridge.

### What gets sent

The exact local envelope object, JSON-stringified — no transformation. The
file-bus emits `kind` values like `task`, `request_aid`, `response`, etc.;
the Worker's Zod schema runs `canonicalKind()` on ingress and accepts these
as-is (see `hub-cloudflare/src/envelope.ts`).

### Guarantees

- **Local write:** durable. Every successful return from `writeEnvelopeToBus`
  means the inbox file, outbox copy, and transcript line are on disk.
- **Cloud post:** best-effort. 4xx, 5xx, network errors, and timeouts are
  logged as warnings and swallowed — they do NOT throw and do NOT change
  the return value of `writeEnvelopeToBus`. The bus must not flap when the
  Worker hiccups.

If a peer is on the file-bus and another peer is on the Worker, the local
bus will deliver the message to local subscribers and the Worker will fan
it out to remote subscribers. Bridges that read from BOTH sources need to
deduplicate by envelope `id` (already idempotent thanks to
`writeEnvelopeIdempotent`).

## Adam (NEXUS-PRIME) integration

The peer `@adam` is the NEXUS-PRIME backend (`backend/main.py`), a FastAPI
daemon that runs Adam's autonomous nervous system: heartbeat, goals,
introspection, journal, and a multi-tier LLM brain (LM Studio primary, cloud
fallback). Adam is wired onto this bus via `hub-bus-tools/adam-bridge.mjs`,
which polls `inbox/@adam/`, forwards each envelope to a NEXUS-PRIME endpoint
(by `intent`), and writes the response back as a reply envelope.

### Capabilities

`@adam` advertises in `presence.json`:
`reason`, `autonomous`, `heartbeat`, `journal`, `introspection`, `research`,
`verify`, `act`, `tools:fastapi`, `tools:lmstudio`. It is a member of `#main`,
`#design`, and `#critique`.

### Optional envelope field: `intent`

When sending to `@adam`, an envelope MAY include an `intent` field that
selects which NEXUS-PRIME endpoint handles it. The bridge maps:

| `intent`       | NEXUS-PRIME endpoint  | Purpose |
|----------------|-----------------------|---------|
| `research`     | `POST /llm/research`  | Research-optimized query |
| `reason`       | `POST /llm/reason`    | Reasoning-optimized query |
| `verify`       | `POST /llm/verify`    | Verification query |
| `act`          | `POST /llm/act`       | Autonomous agent execution |
| `inject-goal`  | `POST /adam/goals`    | Inject a human-authored goal into Adam's queue |
| `nudge`        | `POST /adam/nudge`    | Force an immediate heartbeat cycle |
| _missing/other_ | `POST /llm/chat`     | Default fallback: direct chat |

The HTTP body posted by the bridge is
`{ message: envelope.body, from: envelope.from, trace: envelope.trace }`.
The HTTP response — string or JSON object — becomes the reply envelope's
`body` verbatim. The reply has `from: '@adam'`, `to: <original.from>`,
`kind: 'response'`, `replyTo: <original.id>`, and inherits the original
`trace` and `room`.

### Bridge config (env vars)

`adam-bridge.mjs` reads:

| Var | Default | Purpose |
|---|---|---|
| `ADAM_URL` | `http://localhost:8000` | NEXUS-PRIME base URL |
| `ADAM_TIMEOUT_MS` | `60000` | Per-request timeout |
| `POLL_INTERVAL_MS` | `2000` | Inbox poll cadence |
| `BUS_DIR` | `C:\Users\Falki\shunt-final-v\hub-bus` | Bus root |
| `ADAM_INTENT_OVERRIDE` | _(unset)_ | Force a single endpoint regardless of `envelope.intent`. Useful for testing. |

### Direction of integration

This is wired one-way: `bus → NEXUS-PRIME`. The bridge is a pure consumer
of `inbox/@adam/` and a producer of replies. NEXUS-PRIME exposes its own
`/proxy/shunt` route that allows it to push envelopes back the other way
when it wants to talk to Aether Shunt; bidirectional integration through
that route can be added later. For now, anything on the bus that wants to
talk to Adam writes to `inbox/@adam/`, and anything Adam wants to say comes
back as a `kind: 'response'` reply on the same trace.
