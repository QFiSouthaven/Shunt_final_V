// Aether Shunt — shared TypeScript types for the hub-relay Worker.
// Locked decision §14: DO per room, hybrid bridges, coarse `kind` + `intent`,
// per-room hop ceiling on `trace`, passive auditor, machine-as-node tunneling.

/**
 * Cloudflare bindings declared in wrangler.toml.
 * Keep in sync with the [[durable_objects.bindings]], [[kv_namespaces]],
 * [[d1_databases]], [[r2_buckets]] entries in wrangler.toml.
 */
export interface Env {
  HUB_ROOM: DurableObjectNamespace;
  HUB_PRESENCE: KVNamespace;
  HUB_TRANSCRIPTS: D1Database;
  HUB_DELIVERIES: R2Bucket;
  // v0.2 auth stop-gap (P0 audit findings 1.1, 1.2, 4.4). Replaced by
  // Cloudflare Access SSO in v0.3.
  // Required Worker Secret — bearer token gating every non-health route.
  // Set via: `npx wrangler secret put HUB_API_SECRET`.
  HUB_API_SECRET: string;
  // Comma-separated list of admin JIDs (e.g. "@zack,@claude"). Plain env var
  // (NOT a secret) configured under [vars] in wrangler.toml. Default empty.
  // Admin gate applies to: PUT /room/:room/schema, kind:'schema-update' envelopes.
  HUB_ADMIN_JIDS: string;
}

/** Agent JID — convention: "@<name>" (mirrors hub-bus filesystem peers). */
export type AgentJID = string;

/** Room identifier — convention: "#main", "#code", "#research", or any "#<name>". */
export type RoomName = string;

/** Coarse routing kind — locked decision §14. DO routes only on `kind`. */
export type EnvelopeKind =
  | 'request'
  | 'reply'
  | 'event'
  | 'broadcast'
  | 'system'
  | 'join'
  | 'leave'
  | 'presence'
  | 'error'
  // Type-Safe Rooms (Task #11) — bypass key for Self-Bricking mitigation.
  | 'schema-update';

/** Capability advertisement — populated only on join/presence envelopes. */
export type Capability = string;

/**
 * Canonical envelope. Validated by Zod (see envelope.ts).
 * Schema fields locked in section 14.
 *
 * Differences from the legacy filesystem-bus envelope:
 *   - `intent` (NEW) — application-layer verb. DO ignores; agents read.
 *   - `seq` (NEW) — per-sender monotonic sequence number for ordering.
 *   - `expiresAt` (NEW) — absolute ISO-8601 timestamp; replaces relative `ttl`.
 *   - `sig`, `issuer` (NEW, optional) — signed-envelope future-proofing.
 */
export interface Envelope {
  id: string;
  from: AgentJID;
  to: AgentJID | RoomName | '*';
  room: RoomName;
  kind: EnvelopeKind;
  intent?: string;
  body: string | Record<string, unknown>;
  replyTo: string | null;
  trace: string;
  seq: number;
  ts: string;
  expiresAt: string;
  capabilities?: Capability[];
  sig?: string;
  issuer?: AgentJID;
}

/** Persisted presence entry (one per JID, stored under DO key `presence:<JID>`). */
export interface PresenceEntry {
  jid: AgentJID;
  caps: Capability[];
  joinedAt: string;
  lastSeenAt: string;
}

/**
 * Per-room runtime config (DO storage key `config:hop_ceiling`).
 * Locked decision section 14: per-room hop ceiling, default 8.
 */
export interface RoomConfig {
  hopCeiling: number;
}

/** Aggregated room view — used by /presence Worker route. */
export interface Room {
  name: RoomName;
  members: PresenceEntry[];
}
