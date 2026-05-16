// Aether Shunt — legacy kind → canonical kind translation table.
//
// keep in sync with hub-bus-tools/envelope.mjs (KIND_MAP)
//
// The file-bus historically emitted kinds like `task`, `request_aid`,
// `response`, `deliver`, `summary`, `relay`, and `ack`. The Worker's locked
// decision section 14 enum is `request | reply | event | broadcast | system |
// join | leave | presence | error | schema-update`. This map translates
// legacy file-bus kinds into the canonical Worker enum so bridges can
// dual-write without remapping at the bridge layer.

export const KIND_MAP: Record<string, string> = {
  // legacy file-bus kinds → canonical Worker kinds
  task: 'request',
  request_aid: 'request',
  response: 'reply',
  deliver: 'event',
  summary: 'event',
  relay: 'event',

  // pass-through (already canonical)
  request: 'request',
  reply: 'reply',
  event: 'event',
  broadcast: 'broadcast',
  system: 'system',
  join: 'join',
  leave: 'leave',
  presence: 'presence',
  error: 'error',
  'schema-update': 'schema-update',

  // file-bus-only (not in canonical enum) — collapse to `system` so the Worker
  // can ingest bridge-relayed acks without dropping them. Bridges that want a
  // richer representation should remap on their side.
  ack: 'system',
};

/**
 * Returns the canonical Worker `kind` for a possibly-legacy input. Inputs that
 * are already canonical pass through unchanged. Inputs unknown to the map are
 * returned as-is so Zod's enum check produces a clear error downstream rather
 * than this helper silently swallowing typos.
 */
export function canonicalKind(legacyKind: string): string {
  if (typeof legacyKind !== 'string') return legacyKind;
  const mapped = KIND_MAP[legacyKind];
  return mapped !== undefined ? mapped : legacyKind;
}
