# Cockpit — Systems Operations Console

The singular master UI for the Aether Shunt stack. One screen, three tiers
(per the locked design diagram):

1. **Control Panel** — power knobs for every registered system. Off / starting
   / on / error states, hover for refresh and remove, click a tile to open
   the detail side panel.
2. **Circuit Board** — live dependency graph rendered with React Flow. Nodes
   colored by health, edges show upstream/downstream relationships, click a
   node to inspect it.
3. **Debug Tool** — append-only event stream subscribed to the shared
   `eventBus`. Every start/stop/poll/error lands here in real time.

There are no hidden tabs. There are no nested routes. The whole console is
one page rendered in `app/page.tsx`.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind 4
- `@xyflow/react` (React Flow v12) for the circuit board
- `motion/react` for the side panel
- Plain Node.js `launcher.cjs` for real one-click process spawning
- No vendor LLM SDKs are required; the cockpit does not call any AI directly.

## Running locally

```bash
cd cockpit---systems-operations-console
npm install
npm run dev           # cockpit at http://localhost:3002
```

The dev port is **3002** deliberately — port 3000 is owned by the Aether Shunt
SPA and port 3001 by AnythingLLM. Don't change this without coordinating.

Optionally, in a second terminal, start the launcher daemon so the power
knobs actually spawn local processes:

```bash
npm run daemon        # launcher.cjs on http://localhost:7778
```

When the daemon is up, clicking a power knob will spawn the system's
`startCmd` via `child_process.spawn`. When the daemon is down, clicking a
power knob falls back to **copy-the-command-to-clipboard** mode — you paste
it into a terminal yourself.

## How health checks work

Browsers can't `fetch('http://localhost:1234/v1/models')` directly because
local services (LM Studio, AnythingLLM, NEXUS) don't send
`Access-Control-Allow-Origin` for the cockpit's origin. To work around this
without per-service config:

- The `HealthPoller` calls `/api/proxy?url=<encoded target URL>` instead of
  hitting the target directly.
- That route runs server-side (Node fetch, no CORS), forwards the request,
  and returns a normalized `{ ok, status, latencyMs, body, error? }`.
- The proxy is allowlisted to `localhost` and `127.0.0.1` only — `0.0.0.0`
  is excluded because it resolves to "all interfaces," not loopback. SSRF
  guard; the cockpit only ever needs to talk to processes on the same
  machine. Re-add hosts only with explicit justification (see the comment
  in `app/api/proxy/route.ts`).

If you add a new integration with a non-localhost URL, the proxy will reject
it with `403 NOT_ALLOWED`. Use a tunnel (Cloudflared, ngrok) to expose the
remote service via a localhost-bound port instead.

## Adding a new system

Click the **+ ADD MODULE** tile in the Control Panel. The form takes:

- **SYSTEM_ID** — alphanumeric + hyphens. Used as the registry key.
- **DISPLAY_NAME** — shown on the tile.
- **URL** — optional. Without a URL the system is "simulated" — its power
  knob toggles state without polling.
- **HEALTH_PATH** — optional. Path appended to the URL for the poller's
  GET request.

Custom systems persist to `localStorage` under the `customSystems` key and
appear in every subsequent session. They sit alongside the defaults in
`lib/systemRegistry.ts`.

## Default registry

| id | name | group | url | healthPath |
|---|---|---|---|---|
| `lm-studio` | LM Studio | compute | `http://localhost:1234` | `/v1/models` |
| `host-python` | Host Python | compute | (simulated) | — |
| `anythingllm` | AnythingLLM | knowledge | `http://localhost:3001` | `/api/ping` |
| `nexus` | NEXUS-PRIME | orchestration | `http://localhost:8000` | `/health` |
| `hub-relay` | Hub-Relay | orchestration | (simulated) | — |
| `sfv` | Shunt Factory V | orchestration | (placeholder) | — |
| `aether-spa` | Aether Shunt SPA | interface | `http://localhost:3000` | `/` |
| `splicer-desktop` | Splicer | interface | (simulated) | — |

The `deps[]` field on each registry entry drives the circuit-board edges and
the topological boot order used by **ENGAGE ALL**.

## Architecture

```
Browser (Cockpit @ :3002)
  ├─ HealthProvider context
  │    ├─ systemsRef + statesRef (closure-stable)
  │    └─ Single 10s setInterval → /api/proxy
  ├─ Tier 1 ControlPanel
  ├─ Tier 2 CircuitBoard (React Flow)
  └─ Tier 3 DebugTool (eventBus subscription)
        │
        ▼
   /api/proxy (Next.js server route)
        │
        ├─→ http://localhost:1234  (LM Studio)
        ├─→ http://localhost:3001  (AnythingLLM)
        ├─→ http://localhost:8000  (NEXUS-PRIME)
        ├─→ http://localhost:3000  (Aether Shunt SPA)
        └─→ http://localhost:7778  (launcher.cjs — power on/off)
```

Two web apps run side by side, intentionally:

- **Cockpit** (this, `:3002`) — master ops console.
- **Aether Shunt SPA** (Vite, `:3000`) — the work surface. Registered as
  `aether-spa` in this cockpit. It's one of the things the cockpit operates;
  it is **not** where the cockpit lives.

## Launcher daemon (`launcher.cjs`)

Standalone Node script, zero dependencies. Listens on `127.0.0.1:7778`:

- `GET  /status`         — `{ status: 'ok', running: [id...], pid }`
- `POST /start  { id, cmd }`  — spawn detached, track PID
- `POST /stop   { id }`        — Windows `taskkill` or POSIX `kill -group`

Add it to Windows startup if you want the cockpit to be fully powered
without a manual step:

```powershell
# Once-only setup
shell:startup
# Drop a shortcut to `node C:\Users\Falki\shunt-final-v\cockpit---systems-operations-console\launcher.cjs`
```

## File map

```
app/
├── layout.tsx         Tailwind global wrap
├── page.tsx           The cockpit — three tiers stacked
├── globals.css
└── api/
    └── proxy/
        └── route.ts   Server-side health-check forwarder (CORS escape hatch)

components/
├── HealthPoller.tsx   Context provider — registry, poll loop, start/stop
├── Tier1ControlPanel.tsx
├── Tier2CircuitBoard.tsx
├── Tier3DebugTool.tsx
├── NodeDetailPanel.tsx
├── HubRelayRouting.tsx
└── icons.tsx

lib/
├── systemRegistry.ts  Default registry + topo-sort helper
├── eventBus.ts        Pub-sub used across all three tiers
├── circuitLayout.ts   Node positions for the React Flow graph
├── colorPalette.ts    Single source of truth for health colors
└── utils.ts

launcher.cjs           Local-process launcher daemon
```

## Known gaps / future work

- `HubRelayRouting` currently displays mock bandwidth data — placeholder
  pending wiring to a real traffic source.
- The launcher daemon has no auth. It binds to `127.0.0.1` only, so anyone
  with local shell access can trigger spawns. Acceptable for single-user
  desktop use; revisit if the cockpit is ever exposed beyond loopback.
- No persistent boot state. If the daemon restarts, its child-process map
  resets; you'll need to stop and re-start systems manually to recover.
- No CSRF token on the proxy route. Same risk profile as the launcher —
  same loopback assumption.

## Scheduled (designed, not yet built)

### Q3 — `hub-relay` tile wired to real Worker (deferred until Worker deploys)

When the Cloudflare `hub-relay` Worker is deployed, the cockpit tile should
flip from simulated to live. To preserve the SSRF guard:

- Add `ALLOWED_REMOTE_HOST_SUFFIXES` to `app/api/proxy/route.ts`, e.g.
  `['.workers.dev']`. Match with **exact suffix** semantics —
  `target.hostname === suffix.slice(1) || target.hostname.endsWith(suffix)` —
  not substring, so `evil.workers.devil.attacker.com` can't slip through.
- Per-host method whitelist as a data-driven map:
  `Map<hostSuffix, Set<Method>>`. `*.workers.dev` → `{GET}` only at first.
- Read `process.env.HUB_API_SECRET` server-side in the proxy route. Inject
  `Authorization: Bearer …` before forwarding to remote-allowed hosts. The
  browser never sees the token; `HealthPoller` stays oblivious.

### Q4 — registry persistence on disk via launcher.cjs (greenlit, deferred to batch with Q3)

Move `customSystems` from localStorage to a launcher-managed JSON file so the
registry survives browser profile resets, incognito sessions, and browser
swaps.

- New endpoints on `launcher.cjs`:
  - `GET /registry` — reads `cockpit-registry.json` from `%APPDATA%/AetherShunt/`
    (Windows) or `~/.config/aether-shunt/` (POSIX).
  - `PUT /registry` — atomic write. On Windows, Node 18+'s `fs.promises.rename`
    overwrites by default; verify in CI. Fallback: write to a `.tmp` file and
    use `fs.promises.rename(tmp, final)` after an `unlink(final).catch(...)`.
- Schema: wrap the array in a versioned envelope so future migrations don't
  silently break: `{ version: 1, customSystems: SystemEntry[] }`. On read,
  `launcher.cjs` runs migrations and returns the latest shape.
- HealthPoller startup flow:
  1. On mount, ping `localhost:7778/status`. If up, fetch `/registry` and
     merge with defaults.
  2. If daemon is down, fall back to localStorage (today's behavior).
  3. On first detected daemon-up after a localStorage-only session,
     **migrate** localStorage entries via `PUT /registry`, **read back** to
     confirm, then clear localStorage only on confirmed read. Half-migration
     is the failure mode this avoids — two extra fetches but bulletproof.

### Discretionary — Tier 3 transcript-tail widget (greenlit, scope captured)

Surface live `hub-bus/transcript.jsonl` activity in the Debug Tool without
shipping multi-MB JSONL to the browser:

- New launcher endpoint: `GET /transcript/tail?n=50` — streaming reverse-read
  of the last N lines, returned as JSON array.
- New cockpit hook: `useTranscriptTail` mirrors the `useEventStream` pattern,
  polls the launcher every 5s.
- Render: `[from] → [to] ({kind}): body` rows. Filter UI: dropdown for
  from/to JID, text search on body. Crib the regex from `splicer.html`.
- Note: bridges write **truncated** body previews to transcript. Full
  envelopes live in `hub-bus/inbox/<jid>/*.json`. A `GET /envelope/:id`
  endpoint walking inboxes would surface the full body on row-click — defer
  to v2; tail-with-preview is sufficient for v1.

## Linked docs in this repo

- `C:\Users\Falki\shunt-final-v\CLAUDE.md` — Aether Shunt SPA project notes.
- `C:\Users\Falki\shunt-final-v\hub-cloudflare\README.md` — Hub-Relay Worker
  (Cloudflare + Durable Objects).
- `C:\Users\Falki\shunt-final-v\hub-bus-panel-desktop\` — Splicer Electron
  desktop wrapper.
- `C:\Users\Falki\autogo\docs\V3_REFRAME_PLAN.md` — Shunt Factory V plan
  (the system registered as `sfv` here once built).
