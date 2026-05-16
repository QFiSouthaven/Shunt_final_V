// hub-cloudflare/__test-ws-presence.mjs
//
// Audit-finding-2.6 regression test: assert that the HubRoom Durable Object
// mirrors WS-upgrade presence into HUB_PRESENCE KV, refreshes TTL on every
// envelope from the connected peer, deletes on graceful close, and does NOT
// delete on abnormal close.
//
// Why a homegrown harness:
//   - The DO file is .ts and depends on Cloudflare globals (WebSocketPair,
//     DurableObjectState.acceptWebSocket). vitest + miniflare are NOT wired
//     up in this repo (per CLAUDE.md: "no test runner is configured"). Adding
//     them is out of scope for this fix.
//   - Static source assertions (regex-grep) are the cheapest verification we
//     can do with `node --check`. We pair them with an in-memory simulator
//     that reproduces the helper logic in pure JS — so a future engineer who
//     wires up vitest/miniflare can lift these scenarios directly.
//
// Run: `node hub-cloudflare/__test-ws-presence.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HUB_ROOM_TS = readFileSync(
  join(__dirname, 'src', 'hub-room.ts'),
  'utf8',
);

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

// ---------------------------------------------------------------------------
// In-memory KV mock — mirrors the subset of KVNamespace the DO uses.
// ---------------------------------------------------------------------------
function makeKvMock() {
  const store = new Map(); // key -> { value, expirationTtl }
  const calls = { put: [], get: [], delete: [], list: [] };
  return {
    store,
    calls,
    async put(key, value, opts) {
      calls.put.push({ key, value, opts });
      store.set(key, { value, expirationTtl: opts?.expirationTtl ?? null });
    },
    async get(key) {
      calls.get.push({ key });
      return store.get(key)?.value ?? null;
    },
    async delete(key) {
      calls.delete.push({ key });
      store.delete(key);
    },
    async list({ prefix } = {}) {
      calls.list.push({ prefix });
      const keys = [];
      for (const k of store.keys()) {
        if (!prefix || k.startsWith(prefix)) keys.push({ name: k });
      }
      return { keys };
    },
  };
}

// ---------------------------------------------------------------------------
// JS reproduction of the DO helper logic. If the .ts source ever drifts from
// this, the static-source assertions below catch the divergence.
// ---------------------------------------------------------------------------
async function kvUpsertWsPresence(kv, jid, room) {
  const value = {
    online: true,
    capabilities: [],
    transport: 'ws-direct',
    lastSeenAt: new Date().toISOString(),
    source: 'ws-upgrade',
    room,
  };
  await kv.put(`presence:${jid}`, JSON.stringify(value), { expirationTtl: 90 });
}

async function kvDeletePresence(kv, jid) {
  await kv.delete(`presence:${jid}`);
}

// Simulate the relevant slice of webSocketMessage (TTL-refresh path).
async function simulateWebSocketMessage(kv, tags) {
  const TAG_JID_PREFIX = 'jid:';
  const TAG_ROOM_PREFIX = 'room:';
  const jidTag = tags.find((t) => t.startsWith(TAG_JID_PREFIX));
  const roomTag = tags.find((t) => t.startsWith(TAG_ROOM_PREFIX));
  if (!jidTag) return;
  const wsJid = jidTag.slice(TAG_JID_PREFIX.length);
  const wsRoom = roomTag ? roomTag.slice(TAG_ROOM_PREFIX.length) : '#main';
  await kvUpsertWsPresence(kv, wsJid, wsRoom);
}

// Simulate the relevant slice of webSocketClose (graceful-vs-abnormal branch).
async function simulateWebSocketClose(kv, tags, code, wasClean) {
  const TAG_JID_PREFIX = 'jid:';
  const jidTag = tags.find((t) => t.startsWith(TAG_JID_PREFIX));
  if (!jidTag) return;
  const jid = jidTag.slice(TAG_JID_PREFIX.length);
  if (wasClean || code === 1000) {
    await kvDeletePresence(kv, jid);
  }
}

// ---------------------------------------------------------------------------
// SCENARIO 1: WS upgrade writes KV
// Equivalent miniflare/vitest path:
//   - new Request('https://do/ws?jid=@test-splicer&room=%23main', {
//       headers: { Upgrade: 'websocket' } })
//   - hubRoom.fetch(request)  → handleWebSocketUpgrade
//   - assert env.HUB_PRESENCE.get('presence:@test-splicer') is the placeholder
// ---------------------------------------------------------------------------
console.log('SCENARIO 1: WS upgrade writes KV');
{
  const kv = makeKvMock();
  await kvUpsertWsPresence(kv, '@test-splicer', '#main');

  const stored = kv.store.get('presence:@test-splicer');
  check(
    'KV has presence:@test-splicer key',
    stored !== undefined,
  );
  const parsed = stored ? JSON.parse(stored.value) : {};
  check(
    'value.online === true',
    parsed.online === true,
  );
  check(
    "value.transport === 'ws-direct'",
    parsed.transport === 'ws-direct',
  );
  check(
    "value.source === 'ws-upgrade'",
    parsed.source === 'ws-upgrade',
  );
  check(
    "value.room === '#main'",
    parsed.room === '#main',
  );
  check(
    'value.capabilities is empty array',
    Array.isArray(parsed.capabilities) && parsed.capabilities.length === 0,
  );
  check(
    'value.lastSeenAt is recent ISO',
    typeof parsed.lastSeenAt === 'string' &&
      !Number.isNaN(Date.parse(parsed.lastSeenAt)) &&
      Math.abs(Date.now() - Date.parse(parsed.lastSeenAt)) < 5_000,
  );
  check(
    'expirationTtl === 90',
    stored?.expirationTtl === 90,
  );
}

// ---------------------------------------------------------------------------
// SCENARIO 2: TTL renewal on every message
// Two envelopes from @test-splicer → kv.put called twice, each with ttl 90.
// ---------------------------------------------------------------------------
console.log('SCENARIO 2: TTL renewal on every message');
{
  const kv = makeKvMock();
  // initial upgrade
  await kvUpsertWsPresence(kv, '@test-splicer', '#main');
  // two subsequent envelopes from the connected peer
  const tags = ['jid:@test-splicer', 'room:#main'];
  await simulateWebSocketMessage(kv, tags);
  await simulateWebSocketMessage(kv, tags);

  check(
    'kv.put called 3x (1 upgrade + 2 messages)',
    kv.calls.put.length === 3,
    `actually called ${kv.calls.put.length}x`,
  );
  check(
    'all puts had expirationTtl: 90',
    kv.calls.put.every((c) => c.opts?.expirationTtl === 90),
  );
  check(
    'all puts targeted presence:@test-splicer',
    kv.calls.put.every((c) => c.key === 'presence:@test-splicer'),
  );
}

// ---------------------------------------------------------------------------
// SCENARIO 3: Graceful close deletes KV
// ---------------------------------------------------------------------------
console.log('SCENARIO 3: Graceful close deletes KV');
{
  const kv = makeKvMock();
  await kvUpsertWsPresence(kv, '@test-splicer', '#main');
  const tags = ['jid:@test-splicer', 'room:#main'];

  // 3a: code=1000, wasClean=true (the canonical clean close)
  await simulateWebSocketClose(kv, tags, 1000, true);
  check(
    'kv.delete called on (1000, wasClean=true)',
    kv.calls.delete.length === 1 &&
      kv.calls.delete[0].key === 'presence:@test-splicer',
  );

  // 3b: code != 1000 but wasClean=true (e.g., 1001 going-away with clean
  // close) should also delete — wasClean is the canonical signal.
  const kv2 = makeKvMock();
  await kvUpsertWsPresence(kv2, '@test-splicer', '#main');
  await simulateWebSocketClose(kv2, tags, 1001, true);
  check(
    'kv.delete called on (1001, wasClean=true)',
    kv2.calls.delete.length === 1,
  );
}

// ---------------------------------------------------------------------------
// SCENARIO 4: Abnormal close does NOT delete (TTL handles eviction)
// ---------------------------------------------------------------------------
console.log('SCENARIO 4: Abnormal close does NOT delete');
{
  const kv = makeKvMock();
  await kvUpsertWsPresence(kv, '@test-splicer', '#main');
  const tags = ['jid:@test-splicer', 'room:#main'];

  // code=1006 (abnormal closure: no Close frame received), wasClean=false
  await simulateWebSocketClose(kv, tags, 1006, false);
  check(
    'kv.delete NOT called on (1006, wasClean=false)',
    kv.calls.delete.length === 0,
  );
  check(
    'KV entry still present after abnormal close',
    kv.store.has('presence:@test-splicer'),
  );
}

// ---------------------------------------------------------------------------
// SCENARIO 5: Static source assertions — guard against silent regression
// of the .ts implementation.
// ---------------------------------------------------------------------------
console.log('SCENARIO 5: Static source assertions on src/hub-room.ts');
{
  check(
    'handleWebSocketUpgrade calls kvUpsertWsPresence',
    /handleWebSocketUpgrade[\s\S]*?await this\.kvUpsertWsPresence\(/.test(
      HUB_ROOM_TS,
    ),
  );
  check(
    'webSocketMessage calls kvUpsertWsPresence (heartbeat refresh)',
    /async webSocketMessage[\s\S]*?await this\.kvUpsertWsPresence\(/.test(
      HUB_ROOM_TS,
    ),
  );
  check(
    'webSocketClose conditionally calls kvDeletePresence',
    /async webSocketClose[\s\S]*?if \(wasClean \|\| code === 1000\)[\s\S]*?await this\.kvDeletePresence\(/.test(
      HUB_ROOM_TS,
    ),
  );
  check(
    'kvUpsertWsPresence sets expirationTtl: 90',
    /kvUpsertWsPresence[\s\S]*?expirationTtl:\s*90/.test(HUB_ROOM_TS),
  );
  check(
    "kvUpsertWsPresence value shape includes 'ws-direct' transport",
    /transport:\s*'ws-direct'/.test(HUB_ROOM_TS),
  );
  check(
    "kvUpsertWsPresence value shape includes 'ws-upgrade' source",
    /source:\s*'ws-upgrade'/.test(HUB_ROOM_TS),
  );
  check(
    'kvDeletePresence delegates to env.HUB_PRESENCE.delete',
    /kvDeletePresence[\s\S]*?this\.env\.HUB_PRESENCE\.delete\(/.test(
      HUB_ROOM_TS,
    ),
  );
  check(
    'heartbeat reads JID from connection tag (not env.from)',
    /webSocketMessage[\s\S]*?jidTag = tags\.find[\s\S]*?kvUpsertWsPresence\(wsJid,/.test(
      HUB_ROOM_TS,
    ),
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
console.log(`RESULTS: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('');
  console.log('Failures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
