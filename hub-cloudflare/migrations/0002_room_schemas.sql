-- Aether Shunt — D1 room schemas table (v0.3 / Task #11 Type-Safe Rooms).
-- Locked decision §14 + 3-AI consensus (BUILD_LOG "Type-Safe Rooms partial synthesis"):
--   Q1 schemas live in D1 `room_schemas` table (dashboard-editable by non-coders).
--   Q2 per-room policy: 'strict' | 'warn' | 'off'.
--   Q3 schema discovery via `GET /room/<name>/schema` public endpoint.
--   Q4 graceful migration — unknown rooms default to `policy: off` at the
--      runtime layer (see src/type-safe-rooms.ts loadRoomSchema()).
--
-- Self-Bricking mitigation (locked): envelopes with `kind = 'schema-update'`
-- bypass per-room enforcement at the DO. See src/type-safe-rooms.ts
-- typeSafeCheck().
--
-- HOW TO APPLY THIS MIGRATION (one of):
--   1. Wrangler CLI:
--        npx wrangler d1 execute hub_transcripts --remote \
--          --file=./migrations/0002_room_schemas.sql
--   2. Cloudflare MCP `d1_database_query` against database
--      d0466d8d-8c02-4497-90db-7d0c4e7ced24 (account c6e9f3ff…).
--
-- Mirrored by src/type-safe-rooms.ts; keep them in sync.

CREATE TABLE IF NOT EXISTS room_schemas (
  room       TEXT PRIMARY KEY,        -- room name, e.g. "#main", "#code"
  policy     TEXT NOT NULL CHECK (policy IN ('strict','warn','off')),
  zod_json   TEXT NOT NULL,           -- JSON-Schema (or zod-json) blob; clients parse
  updated_at TEXT NOT NULL,           -- ISO-8601
  updated_by TEXT NOT NULL            -- JID of the editor (for audit)
);

CREATE INDEX IF NOT EXISTS idx_room_schemas_policy ON room_schemas (policy);
