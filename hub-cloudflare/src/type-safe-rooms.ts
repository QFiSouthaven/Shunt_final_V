// Aether Shunt — Type-Safe Rooms (Task #11).
// Locked decision §14 + 3-AI consensus (BUILD_LOG "Type-Safe Rooms partial
// synthesis"):
//   - Schemas live in D1 `room_schemas` table (migrations/0002_room_schemas.sql).
//   - Per-room policy is one of 'strict' | 'warn' | 'off'.
//   - Unknown rooms gracefully default to `{ policy: 'off' }`.
//   - Self-Bricking mitigation: envelopes with `kind === 'schema-update'`
//     bypass enforcement at the DO so a strict room is never uneditable.
//
// v0.3 will swap the JSON-blob → live ZodSchema deserialization in
// `loadRoomSchema()` once a stable JSON-Schema → Zod converter is picked.
// For now the column is held as text and the runtime check parses on demand.

import { z, type ZodTypeAny } from 'zod';
import type { Envelope } from './envelope.js';

/** Per-room schema enforcement policy. */
export type RoomPolicy = 'strict' | 'warn' | 'off';

/**
 * Result of looking up a room's schema entry in D1.
 * `schema` is `null` when the room has no row OR when the stored blob could
 * not be deserialized into a runtime Zod schema (graceful fallback to 'off').
 */
export interface LoadedRoomSchema {
  policy: RoomPolicy;
  schema: ZodTypeAny | null;
}

/**
 * Result of `typeSafeCheck`. `policy` echoes the configured policy, OR the
 * synthetic value `'bypass'` for `schema-update` envelopes (Self-Bricking
 * mitigation), OR `'off'` when graceful-migration applies (no row, or schema
 * blob couldn't be deserialized).
 */
export interface TypeSafeResult {
  pass: boolean;
  policy: RoomPolicy | 'bypass';
  reason?: string;
}

/**
 * Load a room's schema entry from D1.
 *
 * Graceful migration: if no row exists for the room, OR the stored JSON
 * cannot be deserialized into a runtime schema, return
 * `{ policy: 'off', schema: null }`. The caller treats this as "no
 * enforcement" — Locked decision Q4.
 *
 * The Worker `GET /room/:room/schema` endpoint reads the same table and
 * returns the raw `zod_json` blob to clients (clients parse it themselves).
 * That HTTP path does NOT use this loader, see worker.ts.
 *
 * @param db   D1 binding (env.HUB_TRANSCRIPTS — same DB as transcripts)
 * @param room Room name, e.g. "#main"
 */
export async function loadRoomSchema(
  db: D1Database,
  room: string,
): Promise<LoadedRoomSchema> {
  try {
    const row = await db
      .prepare('SELECT policy, zod_json FROM room_schemas WHERE room = ?')
      .bind(room)
      .first<{ policy: string; zod_json: string }>();

    if (!row) {
      // Graceful migration — unknown room behaves as policy:off.
      return { policy: 'off', schema: null };
    }

    const policy = normalizePolicy(row.policy);
    if (policy === 'off') {
      return { policy: 'off', schema: null };
    }

    const schema = deserializeStoredSchema(row.zod_json);
    if (schema === null) {
      // Stored blob couldn't be turned into a runtime schema: degrade to off
      // rather than failing the room. Logged for forensics.
      console.error(
        JSON.stringify({
          level: 'room_schema_deserialize_failed',
          room,
        }),
      );
      return { policy: 'off', schema: null };
    }

    return { policy, schema };
  } catch (err) {
    // Never block routing on a D1 read failure — fail open.
    console.error(
      JSON.stringify({
        level: 'room_schema_load_error',
        room,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return { policy: 'off', schema: null };
  }
}

/**
 * Run the per-room type-safety check on an inbound envelope.
 *
 * Order of operations (LOAD-BEARING):
 *   1. If `env.kind === 'schema-update'` → bypass (Self-Bricking mitigation).
 *      MUST come before any other check so a wrecked schema can be repaired
 *      via the same bus.
 *   2. Load room schema. If policy=='off' or schema is null → pass.
 *   3. `schema.safeParse(env.body)`:
 *        - success → `{ pass: true, policy }`.
 *        - fail + policy=='warn'   → `{ pass: true, policy: 'warn',  reason }`.
 *        - fail + policy=='strict' → `{ pass: false, policy: 'strict', reason }`.
 *
 * @param env Validated envelope (already passed generic Zod EnvelopeSchema).
 * @param db  D1 binding (env.HUB_TRANSCRIPTS).
 */
export async function typeSafeCheck(
  env: Envelope,
  db: D1Database,
): Promise<TypeSafeResult> {
  // 1. Self-Bricking mitigation — MUST be first.
  if (env.kind === 'schema-update') {
    return { pass: true, policy: 'bypass' };
  }

  // 2. Load + graceful fallback.
  const { policy, schema } = await loadRoomSchema(db, env.room);
  if (policy === 'off' || schema === null) {
    return { pass: true, policy: 'off' };
  }

  // 3. Validate body.
  const parsed = schema.safeParse(env.body);
  if (parsed.success) {
    return { pass: true, policy };
  }

  const reason = formatZodIssues(parsed.error);
  if (policy === 'warn') {
    return { pass: true, policy: 'warn', reason };
  }
  // policy === 'strict'
  return { pass: false, policy: 'strict', reason };
}

/**
 * Pass-through serializer for the GET /room/:room/schema endpoint.
 * The stored blob IS the wire format; clients deserialize on their side.
 *
 * TODO(v0.3): once a stable JSON-Schema → Zod converter (e.g. zod-from-json-schema)
 * is picked, deserialize here so the Worker can hand back a normalized form
 * AND pre-validate edits in PUT /room/:room/schema.
 */
export function serializeSchemaForJSON(zodJson: string): string {
  return zodJson;
}

// -----------------------------------------------------------------------------
// Internals.
// -----------------------------------------------------------------------------

function normalizePolicy(value: string): RoomPolicy {
  if (value === 'strict' || value === 'warn' || value === 'off') return value;
  // Unrecognized stored value — degrade to off rather than throw.
  return 'off';
}

/**
 * Turn the stored `zod_json` blob into a runtime Zod schema.
 *
 * v0.2.2 contract (P1 #11 expansion, 2026-05-17). Each field-def is one of:
 *
 *   Scalars (short form): `"string" | "number" | "boolean" | "any"`,
 *     with optional trailing `?` to mark the field optional. Backward-
 *     compatible with the v0.2 contract.
 *
 *   Object form: `{ "$kind": <kind>, ...refinements }` where `<kind>` is:
 *
 *     - "string"   — refinements: min, max, regex (string), enum (string[])
 *     - "number"   — refinements: min, max, int (boolean)
 *     - "boolean"  — no refinements
 *     - "any"      — no refinements
 *     - "object"   — required: fields: { <key>: <fieldDef> }
 *     - "array"    — required: items: <fieldDef>
 *     - "union"    — required: options: <fieldDef>[]
 *     - "enum"     — required: values: string[]
 *     - "record"   — required: value: <fieldDef> (keys are strings)
 *     - "literal"  — required: value: string | number | boolean
 *
 *   On any object form, `"optional": true` marks the field optional.
 *
 * Backward-compat: the old `{ $kind: "object", fields: { k: "string" } }`
 * still works because scalar string short-forms are accepted at any field
 * position. Top-level scalar `{ "$kind": "string" }` still works.
 *
 * v0.3 will swap this for a full JSON-Schema → Zod converter (planned dep:
 * zod-from-json-schema). Until then this covers ~80% of practical needs.
 *
 * Anything unrecognized returns `null`, which the loader treats as
 * graceful-off.
 */
function deserializeStoredSchema(zodJson: string): ZodTypeAny | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(zodJson);
  } catch {
    return null;
  }
  return buildFieldSchema(parsed);
}

/** Recursive: turn a single field-def into a ZodTypeAny. Returns null on any malformed input. */
function buildFieldSchema(def: unknown): ZodTypeAny | null {
  // Short-form scalar: "string" / "number?" / "any" / etc.
  if (typeof def === 'string') {
    return scalarFromName(def);
  }
  if (!def || typeof def !== 'object') return null;
  const obj = def as Record<string, unknown>;
  const kind = obj['$kind'];
  if (typeof kind !== 'string') return null;

  let t: ZodTypeAny | null = null;
  switch (kind) {
    case 'string': {
      let s = z.string();
      const min = obj['min'];
      const max = obj['max'];
      const regex = obj['regex'];
      const enums = obj['enum'];
      if (typeof min === 'number') s = s.min(min);
      if (typeof max === 'number') s = s.max(max);
      if (typeof regex === 'string') {
        try { s = s.regex(new RegExp(regex)); } catch { return null; }
      }
      if (Array.isArray(enums) && enums.every((v) => typeof v === 'string') && enums.length > 0) {
        // z.enum requires a non-empty readonly tuple of literal strings.
        t = z.enum(enums as [string, ...string[]]);
      } else {
        t = s;
      }
      break;
    }
    case 'number': {
      let n = z.number();
      const min = obj['min'];
      const max = obj['max'];
      if (typeof min === 'number') n = n.min(min);
      if (typeof max === 'number') n = n.max(max);
      if (obj['int'] === true) n = n.int();
      t = n;
      break;
    }
    case 'boolean':
      t = z.boolean();
      break;
    case 'any':
      t = z.any();
      break;
    case 'object': {
      const fields = obj['fields'];
      if (!fields || typeof fields !== 'object') return null;
      const shape: Record<string, ZodTypeAny> = {};
      for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
        const inner = buildFieldSchema(v);
        if (inner === null) return null;
        shape[k] = inner;
      }
      t = z.object(shape);
      break;
    }
    case 'array': {
      const items = buildFieldSchema(obj['items']);
      if (items === null) return null;
      t = z.array(items);
      break;
    }
    case 'union': {
      const opts = obj['options'];
      if (!Array.isArray(opts) || opts.length < 2) return null;
      const built: ZodTypeAny[] = [];
      for (const o of opts) {
        const inner = buildFieldSchema(o);
        if (inner === null) return null;
        built.push(inner);
      }
      // z.union expects at least 2 options; cast as the required tuple type.
      t = z.union(built as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
      break;
    }
    case 'enum': {
      const values = obj['values'];
      if (!Array.isArray(values) || values.length === 0) return null;
      if (!values.every((v) => typeof v === 'string')) return null;
      t = z.enum(values as [string, ...string[]]);
      break;
    }
    case 'record': {
      const value = buildFieldSchema(obj['value']);
      if (value === null) return null;
      t = z.record(z.string(), value);
      break;
    }
    case 'literal': {
      const value = obj['value'];
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        return null;
      }
      t = z.literal(value);
      break;
    }
    default:
      return null;
  }
  return obj['optional'] === true ? t.optional() : t;
}

function scalarFromName(name: string): ZodTypeAny | null {
  const optional = name.endsWith('?');
  const base = optional ? name.slice(0, -1) : name;
  let t: ZodTypeAny;
  switch (base) {
    case 'string':
      t = z.string();
      break;
    case 'number':
      t = z.number();
      break;
    case 'boolean':
      t = z.boolean();
      break;
    case 'any':
      t = z.any();
      break;
    default:
      return null;
  }
  return optional ? t.optional() : t;
}

/** Compact "<path>: <message>; ..." rendering of a ZodError. */
function formatZodIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.join('.') || '<root>';
      return `${path}: ${i.message}`;
    })
    .join('; ');
}
