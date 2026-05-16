-- Aether Shunt — Envelope metadata extension (schema v0.2.1).
-- Adds the absolute-expiry and issuer columns required by the Plan-agent
-- HIGH-priority schema fixes (Task #8 leftovers). The `signature` column
-- already exists from 0001_init.sql.
--
-- Apply via:
--   wrangler d1 execute hub_transcripts --remote --file=./migrations/0003_envelope_metadata.sql
-- OR via Cloudflare MCP `d1_database_query` against database id
--   d0466d8d-8c02-4497-90db-7d0c4e7ced24
-- (account c6e9f3ff4b3d684700718224c6a63ec4).

ALTER TABLE transcripts ADD COLUMN expires_at TEXT;
ALTER TABLE transcripts ADD COLUMN issuer     TEXT;

CREATE INDEX IF NOT EXISTS idx_transcripts_expires_at ON transcripts (expires_at);
