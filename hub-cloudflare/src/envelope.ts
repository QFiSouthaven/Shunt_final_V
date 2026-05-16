// Aether Shunt — Zod envelope schema. Locked decision section 14 fields.
// This is the single source of truth for what the DO accepts.

import { z } from 'zod';
import { canonicalKind } from './kind-map';

/** Coarse routing kind — locked decision section 14. */
export const EnvelopeKindSchema = z.enum([
  'request',
  'reply',
  'event',
  'broadcast',
  'system',
  'join',
  'leave',
  'presence',
  'error',
  // Locked decision section 14: Type-Safe Rooms (Task #11) — schema-update
  // envelopes bypass per-room schema enforcement at the DO. Self-Bricking
  // mitigation: a strict room can always be repaired via this kind even if
  // its body schema is broken. See src/type-safe-rooms.ts typeSafeCheck().
  'schema-update',
]);

/**
 * Schema-drift bridge: the file-bus emits legacy kinds (`task`, `request_aid`,
 * `response`, `deliver`, `summary`, `relay`, `ack`). This wrapper preprocesses
 * an unknown input into a canonical kind via `canonicalKind` before the enum
 * validation runs. Inputs that are already canonical pass through untouched.
 * See src/kind-map.ts for the translation table.
 */
export const KindFieldSchema = z.preprocess(
  (input) => (typeof input === 'string' ? canonicalKind(input) : input),
  EnvelopeKindSchema,
);

/**
 * Canonical envelope shape (post-migration).
 *
 * Section 14 union of fields: id, from, to, room, kind, intent, body, replyTo,
 * trace, seq, ts, expiresAt, capabilities, sig, issuer.
 *
 * `expiresAt` is ABSOLUTE (ISO-8601). It replaces the legacy relative `ttl`
 * from hub-bus/v0.1. Use legacyTtlToExpiresAt() to upgrade in-flight
 * envelopes during the migration window.
 *
 * The exported `EnvelopeSchema` wraps this shape with a preprocess step that
 * fills `expiresAt` from `ttl`+`ts` when missing (read-side migration).
 *
 * `ttl` is tolerated (deprecated) for back-compat with v0.1/v0.2 senders.
 * `sig` and `issuer` are stubbed for v0.2.x; v0.3 will verify them.
 */
const EnvelopeShape = z.object({
  id: z.string().uuid(),
  from: z.string().min(1),
  to: z.string().min(1),
  room: z.string().min(1),
  kind: KindFieldSchema,
  // Application-layer verb. DO routes on `kind` alone (s14); agents read `intent`.
  intent: z.string().optional(),
  // Body is freeform string OR object — Type-Safe Rooms (s14, Task #11)
  // tightens this per-room at the DO via src/type-safe-rooms.ts.
  body: z.union([z.string(), z.record(z.string(), z.unknown())]),
  replyTo: z.string().nullable(),
  trace: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  ts: z.string().datetime(),
  // Absolute expiry. DO drops envelopes past this point.
  expiresAt: z.string().datetime(),
  capabilities: z.array(z.string()).optional(),
  // Deprecated: relative TTL in seconds. Tolerated for back-compat with v0.1
  // and v0.2 senders. New writers should set `expiresAt` directly.
  ttl: z.number().int().positive().optional(),
  // Signature future-proofing — stubbed for v0.2; v0.3 will verify.
  sig: z.string().nullable().optional(),
  issuer: z.string().nullable().optional(),
});

/**
 * Read-side migration preprocessor: when a parsed payload is missing
 * `expiresAt` but carries `ttl` + `ts`, synthesize `expiresAt` before the
 * shape check runs. This lets v0.1/v0.2 envelopes flow through the DO
 * without forcing senders to upgrade in lockstep.
 */
export const EnvelopeSchema = z.preprocess((input) => {
  if (!input || typeof input !== 'object') return input;
  const obj = input as Record<string, unknown>;
  if (
    (obj.expiresAt === undefined || obj.expiresAt === null || obj.expiresAt === '') &&
    typeof obj.ttl === 'number' &&
    typeof obj.ts === 'string'
  ) {
    const base = Date.parse(obj.ts);
    if (!Number.isNaN(base)) {
      return { ...obj, expiresAt: new Date(base + obj.ttl * 1000).toISOString() };
    }
  }
  return obj;
}, EnvelopeShape);

export type Envelope = z.infer<typeof EnvelopeSchema>;

/**
 * Validate an unknown payload as an Envelope.
 * Throws (with Zod's structured error) on invalid input.
 */
export function validateEnvelope(input: unknown): Envelope {
  return EnvelopeSchema.parse(input);
}

/**
 * Returns true if the envelope's absolute expiry has passed.
 *
 * Falls back to computing expiry from the deprecated (`ttl`,`ts`) pair when
 * `expiresAt` is missing — the same lazy migration the schema preprocess
 * applies, but exposed as a runtime helper for code paths that hold an
 * already-parsed envelope.
 */
export function isEnvelopeExpired(env: {
  expiresAt?: string | null;
  ttl?: number;
  ts?: string;
}): boolean {
  let target: number;
  if (typeof env.expiresAt === 'string' && env.expiresAt.length > 0) {
    target = Date.parse(env.expiresAt);
  } else if (typeof env.ttl === 'number' && typeof env.ts === 'string') {
    target = Date.parse(env.ts) + env.ttl * 1000;
  } else {
    return false;
  }
  if (Number.isNaN(target)) return false;
  return Date.now() > target;
}

/**
 * Back-compat helper for the filesystem-bus -> DO migration.
 *
 * The filesystem-bus envelope (see hub-bus-tools/envelope.mjs) carried a
 * relative `ttl: 86400` (seconds). Convert to the absolute `expiresAt` the
 * DO expects.
 *
 * @param ts  ISO-8601 timestamp from the legacy envelope's `ts` field.
 * @param ttl Legacy relative TTL in seconds (86400 = 24h default).
 * @returns ISO-8601 absolute expiry timestamp.
 */
export function legacyTtlToExpiresAt(ts: string, ttl: number): string {
  const base = Date.parse(ts);
  if (Number.isNaN(base)) {
    throw new Error(`legacyTtlToExpiresAt: invalid ts "${ts}"`);
  }
  return new Date(base + ttl * 1000).toISOString();
}
