// Aether Shunt — Passive Auditor.
// Locked decision §14: log loop/divergence anomalies WITHOUT blocking. v0.3 may
// promote this to active rejection; the call site will then swap the import.

import type { Envelope } from './envelope.js';

/**
 * Emit a structured audit log line for an envelope passing through the DO.
 * Pure function: never throws, never blocks routing.
 *
 * Surfaces in `wrangler tail` as JSON. If hops > ceiling/2 we tag
 * `audit_warning` so a downstream log filter can alarm before hop ceiling
 * actually kicks in.
 */
export function audit(env: Envelope, hops: number, ceiling: number): void {
  const halfway = Math.floor(ceiling / 2);
  const level = hops > halfway ? 'audit_warning' : 'audit';
  // Single console.log so wrangler tail / Logpush ingests one structured event.
  console.log(
    JSON.stringify({
      level,
      kind: env.kind,
      intent: env.intent ?? null,
      from: env.from,
      to: env.to,
      room: env.room,
      trace: env.trace,
      seq: env.seq,
      hops,
      ceiling,
      ts: env.ts,
    }),
  );
}
