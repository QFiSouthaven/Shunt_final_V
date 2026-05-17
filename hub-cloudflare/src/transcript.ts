// Aether Shunt — D1 transcript writer.
// Append-only per-room log of every routed envelope. Schema mirrored in
// migrations/0001_init.sql; keep them in sync.

import { type Envelope, legacyTtlToExpiresAt } from './envelope.js';

/**
 * Insert one envelope row into the transcripts table.
 * Body is JSON-stringified to keep schema flat; queryable fields are pulled
 * out into top-level columns.
 *
 * Failure modes: D1 write errors are swallowed (logged via console.error).
 * Locked decision §14: the DO is the routing boundary; it must never block on
 * audit/transcript I/O.
 *
 * Schema v0.2.2: writes `server_seq` column added by
 * `migrations/0004_server_seq.sql`. Caller is responsible for minting the
 * `serverSeq` value via per-room monotonic counter in DO storage; the
 * transcript writer just persists it. NULL is permitted for legacy rows.
 */
export async function recordEnvelope(
  env: Envelope,
  db: D1Database,
  room: string,
  serverSeq: number | null = null,
): Promise<void> {
  try {
    let expiresAt: string | null = env.expiresAt ?? null;
    if (!expiresAt && typeof env.ttl === 'number') {
      try {
        expiresAt = legacyTtlToExpiresAt(env.ts, env.ttl);
      } catch {
        expiresAt = null;
      }
    }
    await db
      .prepare(
        `INSERT INTO transcripts (
          id, room, ts, sender, recipient, kind, intent, trace, seq, body,
          signature, expires_at, issuer, server_seq
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        env.id,
        room,
        env.ts,
        env.from,
        env.to,
        env.kind,
        env.intent ?? null,
        env.trace,
        env.seq,
        typeof env.body === 'string' ? env.body : JSON.stringify(env.body),
        // P1 #7 — sig/issuer are now under env._unverified.* (unverified claims
        // namespace). The D1 column names stay `signature`/`issuer` for back-compat
        // with the migration SQL; only the source-of-truth field path changed.
        env._unverified?.sig ?? null,
        expiresAt,
        env._unverified?.issuer ?? null,
        // P1 #5 — per-room monotonic seq minted by the DO at routeEnvelope time.
        // Authoritative ordering independent of writer wallclock / clock skew.
        serverSeq,
      )
      .run();
  } catch (err) {
    // Non-fatal — transcript is for forensics, not delivery.
    console.error(
      JSON.stringify({
        level: 'transcript_error',
        room,
        id: env.id,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
