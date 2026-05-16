// Aether Shunt — hub-relay Worker entrypoint.
// Routes:
//   GET  /ws?room=#main&jid=@claude   — WebSocket upgrade, forwarded to HubRoom DO.
//   POST /send                        — JSON envelope ingress, forwarded to DO.
//   GET  /presence                    — aggregated KV presence read.
//   GET  /health                      — liveness probe.
//   GET  /room/<name>/schema          — Type-Safe Rooms (Task #11) discovery.
//   PUT  /room/<name>/schema          — Type-Safe Rooms (Task #11) admin upsert.
//
// Locked decision section 14: DO per room (idFromName(roomName)) is the routing
// boundary. The Worker is the validator/edge layer; bridges and SPAs talk to
// the Worker, never the DO directly.

import type { Env } from './types.js';
import { type Envelope, validateEnvelope } from './envelope.js';

export { HubRoom } from './hub-room.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health endpoints intentionally bypass auth so uptime probes don't need
    // the shared secret. Everything else MUST present a valid bearer.
    if (url.pathname === '/health' || url.pathname === '/healthz') {
      return jsonOk({ ok: true, ts: new Date().toISOString() });
    }

    // v0.2 auth stop-gap (P0 audit findings 1.1, 1.2, 4.4): every non-health
    // route requires `Authorization: Bearer <HUB_API_SECRET>`. Browsers can't
    // set headers on WS, so /ws additionally accepts `?token=<secret>`.
    // v0.3 will replace this with Cloudflare Access SSO.
    const authResp = requireBearer(request, env, url);
    if (authResp) return authResp;

    switch (url.pathname) {
      case '/ws':
        return forwardToRoom(request, env, url, /*isWs*/ true);

      case '/send':
        if (request.method !== 'POST') {
          return new Response('method not allowed', { status: 405 });
        }
        return handleSend(request, env);

      case '/presence':
        if (request.method !== 'GET') {
          return new Response('method not allowed', { status: 405 });
        }
        return handlePresence(env);
    }

    // Locked decision section 14: Type-Safe Rooms (Task #11) — schema discovery.
    //   GET  /room/<name>/schema  -> bearer-gated read (clients fetch and parse).
    //   PUT  /room/<name>/schema  -> bearer + admin-JID gated upsert (audit 1.2).
    const schemaMatch = url.pathname.match(/^\/room\/([^/]+)\/schema\/?$/);
    if (schemaMatch) {
      // ':room' is URL-encoded; '#main' arrives as '%23main'.
      const room = safeDecode(schemaMatch[1]);
      if (request.method === 'GET') {
        return handleRoomSchemaGet(env, room);
      }
      if (request.method === 'PUT') {
        return handleRoomSchemaPut(env, room, request);
      }
      return new Response('method not allowed', { status: 405 });
    }

    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

// -----------------------------------------------------------------------------
// Auth middleware (v0.2 stop-gap).
//
// Every non-health route requires a shared bearer token:
//     Authorization: Bearer <HUB_API_SECRET>
//
// /ws upgrades from a browser cannot set custom headers, so we additionally
// accept `?token=<secret>` ONLY on the /ws path. Documented limitation:
// query-string tokens leak into HTTP referrers, server logs, and Cloudflare
// Access logs. v0.3 will swap this for CF Access SSO.
//
// `null` return = pass; `Response` return = 401 to send back to caller.
// -----------------------------------------------------------------------------
function requireBearer(
  request: Request,
  env: Env,
  url: URL,
): Response | null {
  const expected = env.HUB_API_SECRET;
  if (typeof expected !== 'string' || expected.length === 0) {
    // Misconfiguration: secret was never set. Refuse all traffic so we never
    // accidentally run wide-open in production.
    return jsonError(
      500,
      'AUTH_MISCONFIGURED',
      'HUB_API_SECRET is not configured on this Worker',
    );
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  let presented = '';
  if (authHeader.startsWith('Bearer ')) {
    presented = authHeader.slice('Bearer '.length).trim();
  }
  // Browser-WS fallback: ?token=... only on /ws (cannot set headers on the
  // WebSocket constructor in the browser).
  if (presented.length === 0 && url.pathname === '/ws') {
    presented = url.searchParams.get('token') ?? '';
  }

  if (presented.length === 0 || !timingSafeEqualStr(presented, expected)) {
    return jsonError(401, 'UNAUTHORIZED', 'missing or invalid bearer token');
  }
  return null;
}

/**
 * Constant-time string equality. Avoids leaking secret length / byte
 * differences via early-exit timing. Falls back to length-mismatch fast path
 * (acceptable: an attacker can already see the response timing differ when
 * the route is missing entirely).
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Parse env.HUB_ADMIN_JIDS ("@zack,@claude") into a set of trimmed JIDs.
 * Empty / missing var → empty set (no admins, all admin routes return 403).
 */
function parseAdminJids(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  if (typeof raw !== 'string' || raw.length === 0) return out;
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed.length > 0) out.add(trimmed);
  }
  return out;
}

/**
 * /ws upgrade — pass-through to the HubRoom DO instance for the requested room.
 * Locked decision section 14: idFromName(roomName) shards by room.
 */
function forwardToRoom(
  request: Request,
  env: Env,
  url: URL,
  isWs: boolean,
): Promise<Response> {
  const room = url.searchParams.get('room') ?? '#main';
  if (isWs && request.headers.get('Upgrade') !== 'websocket') {
    return Promise.resolve(
      new Response('expected upgrade: websocket', { status: 426 }),
    );
  }
  const id = env.HUB_ROOM.idFromName(room);
  const stub = env.HUB_ROOM.get(id);
  // Pass the original request through so DO sees Upgrade headers + query string.
  return stub.fetch(request);
}

/**
 * /send — validate envelope at the edge before forwarding to DO. Saves a DO
 * round-trip on malformed input and gives clearer error responses.
 */
async function handleSend(request: Request, env: Env): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, 'INVALID_JSON', 'request body was not valid JSON');
  }

  let envelope: Envelope;
  try {
    envelope = validateEnvelope(raw);
  } catch (err) {
    return jsonError(
      400,
      'INVALID_ENVELOPE',
      err instanceof Error ? err.message : String(err),
    );
  }

  const id = env.HUB_ROOM.idFromName(envelope.room);
  const stub = env.HUB_ROOM.get(id);
  // Reconstruct a /send request the DO can re-validate (defense in depth).
  const internalUrl = new URL('https://do.internal/send');
  return stub.fetch(
    new Request(internalUrl.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope),
    }),
  );
}

/**
 * /presence — KV aggregate. The DO mirrors per-JID presence into KV on every
 * join so this read does not have to hit any DO instance.
 *
 * Response shape matches the file-bus `hub-bus/presence.json` so panel clients
 * and bridges can use one decoder for either source:
 *   { ok: true, agents: { "@jid": { online, capabilities, transport, ... } },
 *               rooms:  { "#room": { members: [...], owner } } }
 *
 * KV layout:
 *   presence:<JID>     -> JSON { online, capabilities, transport, lastSeenAt, ... }
 *   roster:<roomName>  -> JSON { members: [JID...], owner }
 *
 * For v0.2 we only populate `agents`; the DO does not yet write `roster:`
 * entries (per-room rosters live in DO storage and are queried via /ws).
 * `rooms` is returned as an empty object so the shape is stable.
 */
async function handlePresence(env: Env): Promise<Response> {
  const agents: Record<string, unknown> = {};
  const rooms: Record<string, unknown> = {};

  const presenceList = await env.HUB_PRESENCE.list({ prefix: 'presence:' });
  for (const key of presenceList.keys) {
    const v = await env.HUB_PRESENCE.get(key.name);
    if (!v) continue;
    try {
      const data = JSON.parse(v);
      const jid = key.name.slice('presence:'.length);
      agents[jid] = data;
    } catch {
      // Skip malformed entries.
    }
  }

  // Forward-compat: roster:<room> entries get surfaced when DOs start writing
  // them. v0.2 ships with the listing but it's expected to be empty.
  const rosterList = await env.HUB_PRESENCE.list({ prefix: 'roster:' });
  for (const key of rosterList.keys) {
    const v = await env.HUB_PRESENCE.get(key.name);
    if (!v) continue;
    try {
      const data = JSON.parse(v);
      const room = key.name.slice('roster:'.length);
      rooms[room] = data;
    } catch {
      // Skip malformed entries.
    }
  }

  return jsonOk({ ok: true, agents, rooms });
}

// -----------------------------------------------------------------------------
// Tiny response helpers.
// -----------------------------------------------------------------------------

function jsonOk(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonError(status: number, code: string, error: string): Response {
  return new Response(JSON.stringify({ ok: false, code, error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// -----------------------------------------------------------------------------
// Type-Safe Rooms (Task #11) — schema discovery + admin upsert.
// Locked decision section 14 + 3-AI consensus. See migrations/0002_room_schemas.sql
// and src/type-safe-rooms.ts.
// -----------------------------------------------------------------------------

const SCHEMA_CORS: Record<string, string> = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
};

/** GET /room/<name>/schema — public read, used by clients to validate locally. */
async function handleRoomSchemaGet(env: Env, room: string): Promise<Response> {
  try {
    const row = await env.HUB_TRANSCRIPTS.prepare(
      'SELECT policy, zod_json, updated_at, updated_by FROM room_schemas WHERE room = ?',
    )
      .bind(room)
      .first<{
        policy: string;
        zod_json: string;
        updated_at: string;
        updated_by: string;
      }>();

    if (!row) {
      return new Response(
        JSON.stringify({ ok: false, code: 'NOT_FOUND', room }),
        { status: 404, headers: SCHEMA_CORS },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        room,
        policy: row.policy,
        zod_json: row.zod_json,
        updated_at: row.updated_at,
        updated_by: row.updated_by,
      }),
      { status: 200, headers: SCHEMA_CORS },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: 'D1_ERROR',
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: SCHEMA_CORS },
    );
  }
}

/**
 * PUT /room/<name>/schema — upsert a room's policy + schema blob.
 *
 * Body: { policy: 'strict'|'warn'|'off', zod_json: string, updated_by: string }
 *
 * Auth (v0.2 stop-gap, P0 audit finding 1.2):
 *   - The Worker bearer middleware has already verified HUB_API_SECRET.
 *   - We additionally require `body.updated_by` to be in env.HUB_ADMIN_JIDS.
 *     Without this gate, anyone holding the shared secret could flip every
 *     room to `policy: strict` with a reject-all schema (one-call DoS).
 *
 * TODO(v0.3): swap the JID-allowlist gate for Cloudflare Access JWT
 * verification that ties `updated_by` to the authenticated identity.
 */
async function handleRoomSchemaPut(
  env: Env,
  room: string,
  request: Request,
): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, code: 'INVALID_JSON' }),
      { status: 400, headers: SCHEMA_CORS },
    );
  }
  if (!raw || typeof raw !== 'object') {
    return new Response(
      JSON.stringify({ ok: false, code: 'INVALID_BODY' }),
      { status: 400, headers: SCHEMA_CORS },
    );
  }
  const body = raw as Record<string, unknown>;
  const policy = body.policy;
  const zodJson = body.zod_json;
  const updatedBy = body.updated_by;

  if (
    policy !== 'strict' &&
    policy !== 'warn' &&
    policy !== 'off'
  ) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: 'INVALID_POLICY',
        error: "policy must be one of 'strict' | 'warn' | 'off'",
      }),
      { status: 400, headers: SCHEMA_CORS },
    );
  }
  if (typeof zodJson !== 'string' || zodJson.length === 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: 'INVALID_ZOD_JSON',
        error: 'zod_json must be a non-empty string',
      }),
      { status: 400, headers: SCHEMA_CORS },
    );
  }
  if (typeof updatedBy !== 'string' || updatedBy.length === 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: 'INVALID_UPDATED_BY',
        error: 'updated_by must be a non-empty string (JID)',
      }),
      { status: 400, headers: SCHEMA_CORS },
    );
  }

  // v0.2 admin gate (P0 audit finding 1.2): updated_by must be on the
  // HUB_ADMIN_JIDS allowlist. The bearer is shared so we cannot trust it
  // alone to identify a specific operator.
  const admins = parseAdminJids(env.HUB_ADMIN_JIDS);
  if (!admins.has(updatedBy)) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: 'NOT_ADMIN',
        error: `updated_by '${updatedBy}' is not on the admin allowlist`,
      }),
      { status: 403, headers: SCHEMA_CORS },
    );
  }

  const updatedAt = new Date().toISOString();

  try {
    // SQLite upsert via ON CONFLICT — table PK is `room`.
    await env.HUB_TRANSCRIPTS.prepare(
      `INSERT INTO room_schemas (room, policy, zod_json, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(room) DO UPDATE SET
         policy     = excluded.policy,
         zod_json   = excluded.zod_json,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
      .bind(room, policy, zodJson, updatedAt, updatedBy)
      .run();

    return new Response(
      JSON.stringify({
        ok: true,
        room,
        policy,
        updated_at: updatedAt,
        updated_by: updatedBy,
      }),
      { status: 200, headers: SCHEMA_CORS },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: 'D1_ERROR',
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: SCHEMA_CORS },
    );
  }
}

/** decodeURIComponent that doesn't throw on malformed input. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
