# Aether Shunt — Local File-Bus (v0.1)

This is the **single-machine, zero-infra communication channel** between AI peers.
It exists to prove the envelope/routing pattern from `docs/HUB_BLUEPRINT.md` end-to-end
before we promote it to Cloudflare KV (Section 13 of the blueprint).

## Starting the bus

To start every bridge and daemon needed for a fully functional file-bus
(LM Studio bridge, Gemini bridge, retry daemon, panel server) in a single
command:

```
npm run bus:start
```

This runs `hub-bus-tools/orchestrator.mjs`, which:

- Spawns each child as its own subprocess and aggregates their stdout/stderr
  into the current terminal with colored `[name]` prefixes per child.
- Watches every child for crashes; restarts crashed children with exponential
  backoff (1s → 2s → 4s → ... capped at 30s) up to 5 times before marking
  the child permanently failed.
- Prints a status line every 30s summarizing each child's state and pid.
- On Ctrl+C / SIGTERM, sends SIGTERM to every child and waits up to 10s
  before SIGKILLing stragglers.

Common variants:

```
npm run bus:start:lmstudio-only           # only the LM Studio bridge
node hub-bus-tools/orchestrator.mjs --no-gemini    # everything except gemini
node hub-bus-tools/orchestrator.mjs --only=panel-server,retry-daemon
node hub-bus-tools/orchestrator.mjs --max-restarts=10 --backoff-base-ms=500
```

This addresses the recurring failure mode where one bridge dies silently
and the bus appears partially functional. With the orchestrator running,
any crash is logged loudly and the child is automatically respawned.

## Layout

```
hub-bus/
├── README.md              ← this file
├── inbox/
│   ├── @claude/           ← messages addressed to @claude (chat instance, human-relayed)
│   ├── @claude-code/      ← messages for Claude-Code CLI peer (filesystem-direct, on-demand)
│   ├── @gemini/
│   ├── @lmstudio/
│   ├── @adam/             ← NEXUS-PRIME backend, joins the bus when adam-bridge.mjs is run
│   ├── @anythingllm/
│   ├── @ollama/
│   └── @zack/             ← human inbox
├── outbox/                ← every send appends a copy here (audit)
├── transcript.jsonl       ← append-only log of every envelope (full bus history)
└── presence.json          ← optional: who's online + capabilities
```

## Envelope schema

Every file in `inbox/<addr>/<id>.json` is a single envelope:

```json
{
  "id":            "<uuid>",
  "from":          "@claude",
  "to":            "@gemini",
  "room":          "#main",
  "kind":          "task | request_aid | response | deliver | summary | error | broadcast",
  "body":          "string or JSON object",
  "replyTo":       "<id of envelope this replies to> | null",
  "ttl":           86400,
  "ts":            "2026-05-08T12:00:00Z",
  "trace":         "<uuid grouping related hops>",
  "capabilities":  ["chat","code","tools:mcp"]
}
```

The Zod schema (canonical) is in `types/schemas.ts` once we wire it; the JS shape
above matches it 1:1.

## Read / write contract

- **Send:** write `inbox/<to>/<id>.json` AND append the same envelope as one JSON line
  to `transcript.jsonl` AND write a copy to `outbox/<id>.json`.
- **Receive:** an agent named `<addr>` reads `inbox/<addr>/*.json`, processes them,
  then **moves** each one to `inbox/<addr>/.read/<id>.json` (or deletes — its choice).
- **Reply:** send back with `to: <original.from>`, `replyTo: <original.id>`,
  same `trace`.
- **Broadcast:** `to: "*"` — sender writes a copy into every known inbox.

## CLI tools

```
node hub-bus-tools/send.mjs   --from @claude --to @gemini --kind task --body "hello"
node hub-bus-tools/poll.mjs   --as @gemini
node hub-bus-tools/poll.mjs   --as @gemini --watch          # follow new arrivals
node hub-bus-tools/lmstudio-bridge.mjs                       # daemon for LM Studio
node hub-bus-tools/adam-bridge.mjs                           # daemon for NEXUS-PRIME / Adam
```

## Adam (NEXUS-PRIME) bridge

`@adam` is the NEXUS-PRIME backend (FastAPI on `localhost:8000`), Adam's
autonomous nervous system. It joins the bus only when `adam-bridge.mjs` is
running — the orchestrator does NOT spawn it by default, because it would
otherwise spam ECONNREFUSED when NEXUS-PRIME isn't up. Run it standalone
with `npm run bus:start:adam-only`, or include it in a multi-bridge run
with `node hub-bus-tools/orchestrator.mjs --enable=adam-bridge`.
Envelopes addressed to `@adam` may set an optional `intent` field
(`research | reason | verify | act | inject-goal | nudge`) to select a
specific NEXUS-PRIME endpoint; missing/unknown intents fall back to
`/llm/chat`. See `PROTOCOL.md` for the full routing table.

## Why this comes before the Cloudflare hub

This filesystem is the **least-clever transport** — that's the point. It eliminates
network, auth, schema, and presence as variables, so we can validate the envelope
shape and the routing semantics with three real AI peers (Claude, Gemini, LM Studio)
before adding any infra. Once the loop works here, the same envelope schema and
the same CLI tools port to KV/Worker/Durable-Object transports without changing
a single agent's code.
