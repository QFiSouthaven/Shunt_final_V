// Aether Shunt — HubRoom Durable Object.
// Locked decision section 14: DO per room is the central routing boundary;
// native WS hibernation; coarse `kind`-based routing; per-room hop ceiling on
// `trace`; passive auditor (no blocking).
//
// WebSocket Hibernation API reference:
// https://developers.cloudflare.com/durable-objects/api/websockets/

import type { Env, PresenceEntry } from './types.js';
import { type Envelope, validateEnvelope } from './envelope.js';
import { audit } from './passive-auditor.js';
import { recordEnvelope } from './transcript.js';
import { typeSafeCheck } from './type-safe-rooms.js';

/** Default hop ceiling — Locked decision s14: per-room hop ceiling, default 8. */
const DEFAULT_HOP_CEILING = 8;

/** WS tag prefix used to identify a connection by JID after hibernation. */
const TAG_JID_PREFIX = 'jid:';

/** WS tag prefix used to identify the room a connection joined. */
const TAG_ROOM_PREFIX = 'room:';

/** Min interval between hop-counter garbage sweeps per DO instance (ms). */
const HOP_SWEEP_INTERVAL_MS = 60_000;
/** Max keys deleted per sweep — keep the operation bounded. */
const HOP_SWEEP_MAX_DELETES = 200;

/** P1 #1 — hop counter row now stores its own expiry so it can be evicted. */
interface HopCounterEntry {
  hops: number;
  /** ms since epoch — past this, the trace is dead and the row sweepable. */
  expiresAt: number;
}

/**
 * One DO instance per `#room` (the Worker calls
 * `env.HUB_ROOM.idFromName(roomName)`). Holds connected JIDs, presence, and
 * per-trace hop counters in DO storage.
 */
export class HubRoom implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  // In-memory cache of hop ceiling — refreshed lazily from storage.
  private hopCeilingCache: number | null = null;
  // P1 #1 — last time we ran the stale-hop-counter sweep (ms since epoch).
  // In-memory only; on hibernation/wakeup, the sweep runs again as soon as
  // an envelope arrives, which is exactly what we want.
  private lastHopSweepAt: number = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  // -------------------------------------------------------------------------
  // HTTP entry — invoked by the Worker for both WS upgrades and POST /send.
  // -------------------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      return this.handleWebSocketUpgrade(request, url);
    }
    if (url.pathname === '/send' && request.method === 'POST') {
      return this.handleHttpIngress(request);
    }
    if (url.pathname === '/presence' && request.method === 'GET') {
      return this.handlePresenceRead();
    }
    return new Response('not found', { status: 404 });
  }

  // -------------------------------------------------------------------------
  // WebSocket upgrade. Uses Hibernation API: state.acceptWebSocket(ws, tags).
  // -------------------------------------------------------------------------
  private async handleWebSocketUpgrade(
    request: Request,
    url: URL,
  ): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected upgrade: websocket', { status: 426 });
    }

    const room = url.searchParams.get('room') ?? '#main';
    // JID is provided by the Worker layer (auth stub for v0.2). Without one
    // we reject — joins must be addressable.
    const jid = url.searchParams.get('jid');
    if (!jid) {
      return new Response('missing ?jid=@<name>', { status: 400 });
    }

    // Locked decision s14: hibernation-friendly accept.
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Tags survive hibernation — used in webSocketMessage / webSocketClose.
    this.state.acceptWebSocket(server, [
      `${TAG_JID_PREFIX}${jid}`,
      `${TAG_ROOM_PREFIX}${room}`,
    ]);

    // Best-effort presence registration; broadcast presence to everyone in room.
    const entry: PresenceEntry = {
      jid,
      caps: [],
      joinedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    await this.state.storage.put(`presence:${jid}`, entry);
    await this.broadcastPresenceChange(room, jid, entry, 'join');

    // P0 audit finding 2.6 fix: mirror presence into the HUB_PRESENCE KV namespace
    // so the Worker's /presence aggregation route (which reads only KV) can see
    // peers connected via /ws. Without this, splicer.html and the chat-room panel
    // never observe WS-only peers. The shape here matches what the panel decoder
    // expects (online/capabilities/transport/lastSeenAt/source/room). Capabilities
    // are an empty placeholder; if the peer follows up with a `kind:'join'`
    // envelope, the existing join-handler path overwrites this entry via
    // kvUpsertPresence() with the actual capability list.
    //
    // TTL=90s. The DO refreshes this entry (resetting TTL) on every subsequent
    // envelope from the peer (see webSocketMessage below). If the peer
    // disconnects without a graceful `leave`, KV auto-evicts within 90 seconds.
    await this.kvUpsertWsPresence(jid, room);

    return new Response(null, { status: 101, webSocket: client });
  }

  // -------------------------------------------------------------------------
  // HTTP ingress (/send) — for non-WS clients (CLI bridges, MCP servers).
  // -------------------------------------------------------------------------
  private async handleHttpIngress(request: Request): Promise<Response> {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return new Response('invalid json', { status: 400 });
    }

    let env: Envelope;
    try {
      env = validateEnvelope(raw);
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'INVALID_ENVELOPE',
          error: err instanceof Error ? err.message : String(err),
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }

    const result = await this.routeEnvelope(env);
    // P1 #6 — map RATE_LIMITED to HTTP 429 (with Retry-After header in seconds)
    // so a courteous client can back off correctly. Everything else stays 400.
    let status: number;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (result.ok) {
      status = 202;
    } else if (result.code === 'RATE_LIMITED') {
      status = 429;
      if (typeof result.retryAfterMs === 'number') {
        headers['Retry-After'] = String(Math.max(1, Math.ceil(result.retryAfterMs / 1000)));
      }
    } else {
      status = 400;
    }
    return new Response(JSON.stringify(result), { status, headers });
  }

  // -------------------------------------------------------------------------
  // Presence read.
  // -------------------------------------------------------------------------
  private async handlePresenceRead(): Promise<Response> {
    const list = await this.state.storage.list<PresenceEntry>({
      prefix: 'presence:',
    });
    const entries: PresenceEntry[] = [];
    for (const value of list.values()) entries.push(value);
    return new Response(JSON.stringify({ ok: true, members: entries }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // =========================================================================
  // Hibernation handlers — these are called by the runtime after a WS message
  // arrives or a connection closes, even if the DO had been hibernated.
  // =========================================================================

  async webSocketMessage(
    ws: WebSocket,
    message: ArrayBuffer | string,
  ): Promise<void> {
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      this.sendError(ws, 'INVALID_JSON', 'message was not valid JSON');
      return;
    }

    let env: Envelope;
    try {
      env = validateEnvelope(raw);
    } catch (err) {
      this.sendError(
        ws,
        'INVALID_ENVELOPE',
        err instanceof Error ? err.message : String(err),
      );
      return;
    }

    // P0 audit finding 2.6 fix: heartbeat refresh of HUB_PRESENCE KV entry.
    // Re-writing the key resets its 90s TTL; without this, an idle WS peer
    // would silently disappear from /presence after 90 seconds even though
    // the connection is alive. Pull JID and room from the connection's tags
    // (survives hibernation) rather than from the envelope, so a peer cannot
    // refresh another JID's entry by spoofing env.from.
    const tags = this.state.getTags(ws);
    const jidTag = tags.find((t) => t.startsWith(TAG_JID_PREFIX));
    const roomTag = tags.find((t) => t.startsWith(TAG_ROOM_PREFIX));
    if (jidTag) {
      const wsJid = jidTag.slice(TAG_JID_PREFIX.length);
      const wsRoom = roomTag ? roomTag.slice(TAG_ROOM_PREFIX.length) : '#main';
      await this.kvUpsertWsPresence(wsJid, wsRoom);
    }

    const result = await this.routeEnvelope(env);
    if (!result.ok) {
      this.sendError(ws, result.code ?? 'ROUTING_ERROR', result.error ?? 'unknown');
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    _reason: string,
    wasClean: boolean,
  ): Promise<void> {
    const tags = this.state.getTags(ws);
    const jidTag = tags.find((t) => t.startsWith(TAG_JID_PREFIX));
    const roomTag = tags.find((t) => t.startsWith(TAG_ROOM_PREFIX));
    if (!jidTag) return;
    const jid = jidTag.slice(TAG_JID_PREFIX.length);
    const room = roomTag ? roomTag.slice(TAG_ROOM_PREFIX.length) : '#main';

    await this.state.storage.delete(`presence:${jid}`);
    await this.broadcastPresenceChange(room, jid, null, 'leave');

    // P0 audit finding 2.6 fix: graceful-close cleanup of the KV mirror.
    // Graceful close (1000 normal, or wasClean) → explicit KV delete so
    // /presence stops listing the peer immediately. Abnormal close (1006 or
    // any non-clean disconnect) → leave the entry; the 90s TTL set by
    // kvUpsertWsPresence() will evict it on its own. This keeps short
    // network blips from flapping presence and avoids new edge cases.
    if (wasClean || code === 1000) {
      await this.kvDeletePresence(jid);
    }
  }

  async webSocketError(_ws: WebSocket, _err: unknown): Promise<void> {
    // Soft-fail: rely on webSocketClose for cleanup.
  }

  // =========================================================================
  // Routing core.
  // =========================================================================

  /**
   * Validate, enforce hop ceiling, audit, route, and persist.
   * Returns a structured result for HTTP/WS callers.
   */
  private async routeEnvelope(env: Envelope): Promise<{
    ok: boolean;
    code?: string;
    error?: string;
    delivered?: number;
    retryAfterMs?: number;
  }> {
    // Drop expired envelopes (absolute expiresAt — s14).
    if (Date.parse(env.expiresAt) <= Date.now()) {
      return { ok: false, code: 'EXPIRED', error: 'envelope past expiresAt' };
    }

    // P1 #6 — per-JID token bucket rate limit. Cheap consumable check
    // BEFORE the more expensive admin/schema/typesafe/hop logic. Admin
    // JIDs and the internal '@hub' sender bypass. Also bypass control-plane
    // kinds (presence/leave) so a flap doesn't drop their own leave.
    const isControl = env.kind === 'leave' || env.kind === 'presence';
    if (!isControl && env.from !== '@hub') {
      const admins = parseAdminJids(this.env.HUB_ADMIN_JIDS);
      if (!admins.has(env.from)) {
        const rl = await this.consumeRateLimit(env.from);
        if (!rl.allowed) {
          return {
            ok: false,
            code: 'RATE_LIMITED',
            error: `sender ${env.from} exceeded rate limit; retry in ${Math.ceil(rl.retryAfterMs / 1000)}s`,
            retryAfterMs: rl.retryAfterMs,
          };
        }
      }
    }

    // v0.2 admin gate (P0 audit finding 4.4): Self-Bricking bypass for
    // `kind:'schema-update'` (see typeSafeCheck) is restricted to admins.
    // A non-admin posting `kind:'schema-update'` would otherwise skip
    // Type-Safe Rooms entirely. Loop:
    //   - schema-update from admin     → bypass TSR, route normally.
    //   - schema-update from non-admin → reject here (do NOT fall through to
    //     TSR, which would also bypass for any 'schema-update' env).
    if (env.kind === 'schema-update') {
      const admins = parseAdminJids(this.env.HUB_ADMIN_JIDS);
      if (!admins.has(env.from)) {
        const errEnv = {
          id: crypto.randomUUID(),
          from: '@hub',
          to: env.from,
          room: env.room,
          kind: 'error' as const,
          intent: 'schema_update_not_admin',
          body: {
            code: 'SCHEMA_UPDATE_NOT_ADMIN',
            reason: `sender '${env.from}' is not on the admin allowlist`,
            rejectedTrace: env.trace,
            rejectedId: env.id,
          },
          replyTo: env.id,
          trace: env.trace,
          seq: 0,
          ts: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
        const errText = JSON.stringify(errEnv);
        const target = `${TAG_JID_PREFIX}${env.from}`;
        for (const ws of this.state.getWebSockets(target)) {
          this.safeSend(ws, errText);
        }
        return {
          ok: false,
          code: 'SCHEMA_UPDATE_NOT_ADMIN',
          error: `schema-update sender '${env.from}' is not an admin`,
        };
      }
    }

    // Locked decision section 14: Type-Safe Rooms (Task #11). Per-room body
    // schema policy enforcement runs BEFORE hop ceiling so a malformed body
    // never consumes hop budget. `kind: 'schema-update'` from an admin
    // bypasses TSR (Self-Bricking mitigation). See src/type-safe-rooms.ts.
    const tsResult = await typeSafeCheck(env, this.env.HUB_TRANSCRIPTS);
    if (!tsResult.pass) {
      // Strict reject: emit a structured error envelope to the sender's WS
      // (best-effort) AND log an audit_warning line. Do NOT route.
      const reason = tsResult.reason ?? 'body did not match room schema';
      console.log(
        JSON.stringify({
          level: 'audit_warning',
          subkind: 'schema_reject',
          policy: tsResult.policy,
          room: env.room,
          from: env.from,
          to: env.to,
          trace: env.trace,
          seq: env.seq,
          reason,
          ts: env.ts,
        }),
      );
      // Best-effort: send an error envelope back over the sender's WS if
      // they are still connected on this DO. HTTP /send callers see the
      // structured response below.
      const errEnv = {
        id: crypto.randomUUID(),
        from: '@hub',
        to: env.from,
        room: env.room,
        kind: 'error' as const,
        intent: 'schema_reject',
        body: {
          code: 'SCHEMA_REJECT',
          policy: 'strict',
          reason,
          rejectedTrace: env.trace,
          rejectedId: env.id,
        },
        replyTo: env.id,
        trace: env.trace,
        seq: 0,
        ts: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
      const errText = JSON.stringify(errEnv);
      const target = `${TAG_JID_PREFIX}${env.from}`;
      for (const ws of this.state.getWebSockets(target)) {
        this.safeSend(ws, errText);
      }
      return {
        ok: false,
        code: 'SCHEMA_REJECT',
        error: reason,
      };
    }
    if (tsResult.policy === 'warn' && tsResult.reason) {
      // Warn-mode: log audit_warning but continue routing.
      console.log(
        JSON.stringify({
          level: 'audit_warning',
          subkind: 'schema_warn',
          policy: 'warn',
          room: env.room,
          from: env.from,
          to: env.to,
          trace: env.trace,
          seq: env.seq,
          reason: tsResult.reason,
          ts: env.ts,
        }),
      );
    }

    // Locked decision s14: per-room hop ceiling on `trace`. Default 8.
    // P1 #1 — hop counters used to leak one row per trace forever. Now stored
    // with the envelope's expiresAt and opportunistically swept by
    // sweepStaleHopCounters() (rate-limited to 1/min per DO instance).
    const ceiling = await this.getHopCeiling();
    const hopKey = `trace:${env.trace}:hops`;
    const storedHop = await this.state.storage.get<HopCounterEntry | number>(hopKey);
    // Back-compat: pre-2026-05-16 entries were stored as a bare number. Detect
    // and migrate inline. (The sweep also deletes any old-format entry that
    // happens to still be sitting around.)
    const currentHops =
      typeof storedHop === 'number'
        ? storedHop
        : storedHop && typeof storedHop.hops === 'number'
          ? storedHop.hops
          : 0;
    if (currentHops >= ceiling) {
      audit(env, currentHops + 1, ceiling);
      return {
        ok: false,
        code: 'HOP_CEILING_EXCEEDED',
        error: `trace ${env.trace} exceeded hop ceiling ${ceiling}`,
      };
    }
    const nextHops = currentHops + 1;
    // Preserve the FIRST envelope's expiresAt for the trace if we already have
    // it; otherwise stamp with this envelope's expiresAt. Either way, the
    // counter expires whenever the trace's envelopes do.
    const existingExpiresAt =
      typeof storedHop === 'object' && storedHop !== null && typeof storedHop.expiresAt === 'number'
        ? storedHop.expiresAt
        : null;
    const nextEntry: HopCounterEntry = {
      hops: nextHops,
      expiresAt: existingExpiresAt ?? (Date.parse(env.expiresAt) || Date.now() + 5 * 60_000),
    };
    await this.state.storage.put(hopKey, nextEntry);

    // Opportunistic sweep — at most once per minute per DO, runs after the
    // write so it doesn't gate hot-path latency.
    this.maybeSweepStaleHopCounters().catch(() => { /* swallow; best-effort */ });

    // Passive Auditor — locked decision s14. Never blocks; always logs.
    audit(env, nextHops, ceiling);

    // Special-case `join`: register presence + capabilities.
    if (env.kind === 'join') {
      const entry: PresenceEntry = {
        jid: env.from,
        caps: env.capabilities ?? [],
        joinedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };
      await this.state.storage.put(`presence:${env.from}`, entry);
      await this.broadcastPresenceChange(env.room, env.from, entry, 'join');
      // Best-effort persistence of the join itself.
      await recordEnvelope(env, this.env.HUB_TRANSCRIPTS, env.room);
      // Mirror to KV for cross-room aggregate /presence queries.
      await this.kvUpsertPresence(env.from, entry);
      return { ok: true, delivered: 1 };
    }

    // Route by `to`. Locked decision s14: DO routes only on `kind`/addressing.
    const text = JSON.stringify(env);
    let delivered = 0;

    if (env.to === '*') {
      // Broadcast to every WS in this room except sender.
      for (const ws of this.state.getWebSockets()) {
        const tags = this.state.getTags(ws);
        const jidTag = tags.find((t) => t.startsWith(TAG_JID_PREFIX));
        const jid = jidTag ? jidTag.slice(TAG_JID_PREFIX.length) : null;
        if (jid && jid !== env.from) {
          this.safeSend(ws, text);
          delivered++;
        }
      }
    } else if (env.to.startsWith('#')) {
      // Room broadcast — addressed to the room itself.
      for (const ws of this.state.getWebSockets()) {
        this.safeSend(ws, text);
        delivered++;
      }
    } else {
      // Direct addressing — find WS whose tag matches the JID.
      const target = `${TAG_JID_PREFIX}${env.to}`;
      for (const ws of this.state.getWebSockets(target)) {
        this.safeSend(ws, text);
        delivered++;
      }
    }

    // Append to transcript regardless of delivery success.
    await recordEnvelope(env, this.env.HUB_TRANSCRIPTS, env.room);

    return { ok: true, delivered };
  }

  // =========================================================================
  // Helpers.
  // =========================================================================

  private async getHopCeiling(): Promise<number> {
    if (this.hopCeilingCache !== null) return this.hopCeilingCache;
    const stored = await this.state.storage.get<number>('config:hop_ceiling');
    this.hopCeilingCache = typeof stored === 'number' ? stored : DEFAULT_HOP_CEILING;
    return this.hopCeilingCache;
  }

  /**
   * P1 #1 — opportunistic sweep of expired hop-counter rows. Bounded by:
   *   - HOP_SWEEP_INTERVAL_MS — at most one sweep per minute per DO instance
   *   - HOP_SWEEP_MAX_DELETES — at most 200 keys deleted per sweep
   *
   * Both an envelope's `expiresAt` (typical ~minutes) and the per-room hop
   * ceiling bound trace lifetime, so a sweep every minute is plenty. The
   * sweep is fire-and-forget from routeEnvelope — never gates hot-path latency.
   */
  private async maybeSweepStaleHopCounters(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHopSweepAt < HOP_SWEEP_INTERVAL_MS) return;
    this.lastHopSweepAt = now;

    const list = await this.state.storage.list<HopCounterEntry | number>({
      prefix: 'trace:',
    });
    const toDelete: string[] = [];
    for (const [key, value] of list) {
      // Old-format entries (bare number) have no expiresAt — collect them
      // anyway; they're unreachable garbage on the new code path.
      if (typeof value === 'number') {
        toDelete.push(key);
      } else if (value && typeof value.expiresAt === 'number' && value.expiresAt <= now) {
        toDelete.push(key);
      }
      if (toDelete.length >= HOP_SWEEP_MAX_DELETES) break;
    }
    if (toDelete.length > 0) {
      await this.state.storage.delete(toDelete);
    }
  }

  /**
   * P1 #6 — per-JID token bucket rate limiter (DO-storage backed).
   *
   * Reads `ratelimit:<jid>` from DO storage. Refills tokens based on elapsed
   * time since the last consumption (capped at `burst`), then attempts to
   * consume one token. Writes the new state back.
   *
   * Defaults: burst=30 envelopes, refill=1.0 envelope/sec (i.e. 60/min
   * sustained, 30-envelope burst). Override via env `RATE_LIMIT_PER_JID_BURST`
   * and `RATE_LIMIT_PER_JID_REFILL_PER_SEC` (set in wrangler.toml [vars]).
   *
   * Note this is per-room (one DO instance per room). A sender looping across
   * many rooms has separate buckets per room. For a global cap, the Worker
   * would need a separate shared-state DO; v0.2 chooses the per-room blast
   * radius reduction as good-enough.
   */
  private async consumeRateLimit(jid: string): Promise<{ allowed: boolean; retryAfterMs: number }> {
    const burst = (() => {
      const raw = this.env.RATE_LIMIT_PER_JID_BURST;
      const n = raw ? Number.parseFloat(raw) : NaN;
      return Number.isFinite(n) && n > 0 ? n : 30;
    })();
    const refillPerSec = (() => {
      const raw = this.env.RATE_LIMIT_PER_JID_REFILL_PER_SEC;
      const n = raw ? Number.parseFloat(raw) : NaN;
      return Number.isFinite(n) && n > 0 ? n : 1;
    })();

    const key = `ratelimit:${jid}`;
    const now = Date.now();
    const stored = await this.state.storage.get<{ tokens: number; lastRefillAt: number }>(key);
    let tokens: number;
    let lastRefillAt: number;
    if (stored && typeof stored.tokens === 'number' && typeof stored.lastRefillAt === 'number') {
      const elapsedSec = Math.max(0, (now - stored.lastRefillAt) / 1000);
      tokens = Math.min(burst, stored.tokens + elapsedSec * refillPerSec);
      lastRefillAt = now;
    } else {
      // First-time sender: start with a full bucket so legitimate traffic
      // isn't penalized at the start of a session.
      tokens = burst;
      lastRefillAt = now;
    }

    if (tokens >= 1) {
      tokens -= 1;
      await this.state.storage.put(key, { tokens, lastRefillAt });
      return { allowed: true, retryAfterMs: 0 };
    }
    // Tokens < 1. Don't decrement (so the refill timer keeps catching up).
    // Persist the (rejected) read so a flood doesn't keep re-creating state
    // from scratch.
    await this.state.storage.put(key, { tokens, lastRefillAt });
    const deficit = 1 - tokens;
    const retryAfterMs = Math.ceil((deficit / refillPerSec) * 1000);
    return { allowed: false, retryAfterMs };
  }

  private safeSend(ws: WebSocket, text: string): void {
    try {
      ws.send(text);
    } catch {
      // Connection probably closed mid-iteration; close handler will clean up.
    }
  }

  private sendError(ws: WebSocket, code: string, error: string): void {
    const errEnv = {
      kind: 'error',
      code,
      error,
      ts: new Date().toISOString(),
    };
    this.safeSend(ws, JSON.stringify(errEnv));
  }

  /** Synthesize and broadcast a presence envelope to all room members. */
  private async broadcastPresenceChange(
    room: string,
    jid: string,
    entry: PresenceEntry | null,
    flavor: 'join' | 'leave',
  ): Promise<void> {
    const presenceEnv = {
      id: crypto.randomUUID(),
      from: jid,
      to: room,
      room,
      kind: 'presence' as const,
      intent: flavor,
      body: entry ?? { jid, gone: true },
      replyTo: null,
      trace: crypto.randomUUID(),
      seq: 0,
      ts: new Date().toISOString(),
      // Presence pings expire fast — receivers should treat as ephemeral.
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      capabilities: entry?.caps,
    };
    const text = JSON.stringify(presenceEnv);
    for (const ws of this.state.getWebSockets()) {
      this.safeSend(ws, text);
    }
  }

  /** Mirror a presence entry into KV for cross-room /presence queries. */
  private async kvUpsertPresence(
    jid: string,
    entry: PresenceEntry,
  ): Promise<void> {
    try {
      await this.env.HUB_PRESENCE.put(`presence:${jid}`, JSON.stringify(entry));
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'kv_error',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  /**
   * P0 audit finding 2.6: WS-upgrade and per-message presence mirror into KV.
   *
   * The shape here matches what splicer.html / the chat-room panel expects on
   * the /presence aggregation route: { online, capabilities, transport,
   * lastSeenAt, source, room }. This is intentionally distinct from the
   * PresenceEntry shape kvUpsertPresence() writes — that one is the richer
   * post-`kind:'join'` record (with capabilities populated). The WS-upgrade
   * write is a placeholder; if a real join envelope arrives, kvUpsertPresence()
   * overwrites this entry with the capability-bearing version.
   *
   * TTL=90s: long enough that idle peers stay listed across the heartbeat
   * refresh (any envelope re-writes the key and resets TTL), short enough that
   * an abnormal disconnect (1006) evicts within 90s without explicit cleanup.
   */
  private async kvUpsertWsPresence(jid: string, room: string): Promise<void> {
    const value = {
      online: true,
      capabilities: [] as string[],
      transport: 'ws-direct' as const,
      lastSeenAt: new Date().toISOString(),
      source: 'ws-upgrade' as const,
      room,
    };
    try {
      await this.env.HUB_PRESENCE.put(
        `presence:${jid}`,
        JSON.stringify(value),
        { expirationTtl: 90 },
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'kv_error',
          subkind: 'ws_presence_upsert',
          jid,
          room,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  /**
   * P0 audit finding 2.6: explicit KV delete on graceful close.
   * Called only from webSocketClose when wasClean or code===1000. Abnormal
   * disconnects rely on the 90s TTL set by kvUpsertWsPresence().
   */
  private async kvDeletePresence(jid: string): Promise<void> {
    try {
      await this.env.HUB_PRESENCE.delete(`presence:${jid}`);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'kv_error',
          subkind: 'ws_presence_delete',
          jid,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}

/**
 * Parse env.HUB_ADMIN_JIDS ("@zack,@claude") into a Set of trimmed JIDs.
 * Empty / missing var → empty set (no admins; all admin-gated paths reject).
 * Mirrors the helper in worker.ts; kept local so the DO module is standalone.
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
