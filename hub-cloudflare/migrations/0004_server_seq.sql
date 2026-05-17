-- Aether Shunt — Server-side sequence numbers (schema v0.2.2).
-- P1 #5 fix: writer wallclock + cross-machine clock skew was making
-- transcript.jsonl (file-bus) and D1 transcripts disagree on order. The
-- DO now assigns a per-room monotonic `server_seq` at record time, giving
-- consumers a deterministic ordering independent of clocks.
--
-- Apply via:
--   wrangler d1 execute hub_transcripts --remote --file=./migrations/0004_server_seq.sql
-- OR via Cloudflare MCP `d1_database_query` against database id
--   d0466d8d-8c02-4497-90db-7d0c4e7ced24
-- (account c6e9f3ff4b3d684700718224c6a63ec4).

ALTER TABLE transcripts ADD COLUMN server_seq INTEGER;

-- Composite index for the canonical "next page within a room" query.
-- Sparse on existing rows (server_seq is null until the new code path
-- writes them); SQLite handles partial indexes implicitly by skipping
-- nulls in queries that range-filter on the column.
CREATE INDEX IF NOT EXISTS idx_transcripts_room_server_seq
  ON transcripts (room, server_seq);
