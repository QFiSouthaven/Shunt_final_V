-- Aether Shunt — D1 transcript schema (v0.2).
-- Locked decision §14 schema fields.
-- Append-only log of every envelope routed by any HubRoom DO.
-- Mirrored by src/transcript.ts; keep them in sync.

CREATE TABLE IF NOT EXISTS transcripts (
  id        TEXT PRIMARY KEY,        -- envelope.id (uuid)
  room      TEXT NOT NULL,           -- room name, e.g. "#main"
  ts        TEXT NOT NULL,           -- ISO-8601 envelope timestamp
  sender    TEXT NOT NULL,           -- envelope.from (JID)
  recipient TEXT NOT NULL,           -- envelope.to (JID, room, or '*')
  kind      TEXT NOT NULL,           -- envelope.kind (coarse routing kind)
  intent    TEXT,                    -- envelope.intent (application verb, nullable)
  trace     TEXT NOT NULL,           -- trace uuid (groups related hops)
  seq       INTEGER NOT NULL,        -- per-sender monotonic
  body      TEXT NOT NULL,           -- string body OR JSON-stringified object
  signature TEXT                     -- envelope.sig stub (v0.3 will populate)
);

CREATE INDEX IF NOT EXISTS idx_transcripts_room_ts ON transcripts (room, ts);
CREATE INDEX IF NOT EXISTS idx_transcripts_trace   ON transcripts (trace);
CREATE INDEX IF NOT EXISTS idx_transcripts_sender  ON transcripts (sender);
