# Aether Shunt — Management Hub

A Next.js (App Router) operations console for the Aether Shunt hub-bus.
Button-driven UI for transcript, peers, bridges, rooms, DLQ, and admin actions
against the local `panel-server.mjs` and the Cloudflare `hub-relay` Worker.

## Stack

- Next 16 (App Router, server components + client islands)
- React 19
- Tailwind 4 (via `@tailwindcss/postcss`)
- `@tanstack/react-query` for client-side polling
- `@radix-ui/*` for primitives
- `zod` for input validation on admin routes
- AI annotation calls go through `/api/ai/annotate` (server-side, env-driven config — see `lib/ai/`)

## Running locally

Prerequisites: Node 18+, an LM Studio (or other OpenAI-compatible) endpoint
on `127.0.0.1:1234`, the hub-bus tools running (`node hub-bus-tools/orchestrator.mjs` and `node hub-bus-tools/panel-server.mjs`).

```
cd aether-shunt-hub
npm install
cp .env.example .env.local   # then edit
npm run dev -- -p 3003
```

Open `http://localhost:3003`. Default port is 3000 — pass `-p 3003` to avoid
collision with the SPA (which owns `:3000`) and cockpit (which owns `:3002`).

## Environment

See `.env.example` for the full list. Key variables:

| Variable | Purpose | Default |
|---|---|---|
| `PANEL_SERVER_URL` | Local file-bus reader (transcript, inbox, presence) | `http://localhost:7777` |
| `ORCHESTRATOR_URL` | Local orchestrator (bridge start/stop/restart/status) | `http://localhost:7777` |
| `WORKER_URL` | Cloudflare `hub-relay` Worker — leave blank until deployed | _empty_ |
| `HUB_API_SECRET` | Bearer for Worker auth | _empty_ |
| `HUB_ADMIN_JIDS` | Comma-separated admin JIDs (e.g. `@zack`) | `@zack` |
| `HUB_AI_BASE_URL` | OpenAI-compatible chat-completions endpoint for `/api/ai/annotate` | `http://localhost:1234/v1/chat/completions` |
| `HUB_AI_MODEL` | Model identifier | `local-model` |
| `HUB_AI_API_KEY` | Optional bearer for AI endpoint | _empty_ |

Note: `panel-server.mjs` and `cockpit-.../launcher.cjs` both want port `7777`.
Run them one at a time, or renumber the cockpit launcher.

## Required KV bindings on Cloudflare Pages (for production deploy)

- `AUDIT_KV`
- `AUDIT_FAILURES_KV`
- `RATE_LIMIT_KV`

In local dev these are stubbed in `lib/audit.ts` / `lib/rate-limit.ts`.

## Security / trust model

This UI is built for **loopback-only deployment** (127.0.0.1). Its security
posture reflects that assumption — running it on a public-internet interface
without changes is unsafe.

- **Identity** — `middleware.ts` resolves the caller's JID from `x-auth-email`
  (header), `?jid=` (query), or `HUB_DEV_JID` (env), then stamps `x-is-admin`
  if the JID is in `HUB_ADMIN_JIDS`. `lib/auth-headers.ts:getIdentity()` reads
  those headers; admin routes 403 on `isAdmin === false`. **Default-deny** —
  no identity inputs means anonymous, which means no admin.
- **Rate limiting** — `lib/rate-limit.ts:checkRateLimit()` is currently a
  no-op stub (`{ success: true }`). Loopback has no DoS surface so this is
  intentional; a real implementation belongs in the production Cloudflare
  Pages deploy where it's backed by `RATE_LIMIT_KV`.
- **Worker auth** — `HUB_API_SECRET` is server-side only. It is forwarded
  to the Cloudflare `hub-relay` Worker as a bearer token via
  `lib/auth-headers.ts` adjacent helpers (server-only); never sent to the
  client bundle.
- **AI annotation traffic** — `inputContext` and `result` payloads sent
  to `/api/ai/annotate` are forwarded to `HUB_AI_BASE_URL`. If that
  endpoint is loopback (LM Studio), nothing leaves the host. **If you
  point it at a cloud LLM (OpenAI, Anthropic, Cloudflare Workers AI),
  bus envelope summaries leave the host.** Pick the endpoint deliberately.
- **`.env.local`** — gitignored. `.env.example` is the published template.
- **No CSRF protection** on POST routes — loopback origin is trusted.
  Add origin checks before any non-loopback deployment.

## Architecture notes

- All admin actions go through `/api/admin/*` Next route handlers that
  validate input with Zod, check rate limits, audit-log, and delegate
  to the orchestrator/Worker. See `lib/bridge-admin-handler.ts` for the
  shared pattern.
- AI annotation is **server-side** (env-driven), separate from the SPA's
  client-side localStorage approach. The hub UI cannot read the SPA's
  AI config across origins — set `HUB_AI_*` env vars here independently.
- DLQ, bridges, peers each have their own rich `components/section*/`
  trees. The page files are thin compositions.

## Status

Bootstrapped 2026-05-13. AI annotation (`<ExplainAction>`) wired into
DLQ and bridges. Other panels TBD. Cloud Admin page deferred.
