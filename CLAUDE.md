# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Aether Shunt** (`shunt-final-v`) — Vite + React 18 + TypeScript SPA. AI-driven text transformation, agent orchestration, and dev tooling. All AI calls flow through a single OpenAI-compatible HTTP endpoint (`styles/services/aiService.ts`); the project no longer depends on any vendor SDK.

## Commands

- `npm install` — install dependencies
- `npm run dev` — Vite dev server on `http://127.0.0.1:3000` (loopback-only as of 2026-05; was `0.0.0.0` historically)
- `npm run build` — production build (target `esnext`)
- `npm run preview` — preview built bundle
- `npm run dual` — run [`dual.mjs`](dual.mjs): Claude CLI and Gemini CLI as subprocesses in the current terminal, with a built-in `/relay` command. See README for the command list.
- `npx tsc --noEmit` — typecheck (no test runner or linter is configured)
- `node fix_imports.cjs` — codemod to normalize legacy relative imports under `hooks/` and `styles/services/` to use the `@/*` alias.

## Dual CLI script (`dual.mjs`)

`dual.mjs` is a ~150-line standalone script at the repo root. It spawns the `claude` and `gemini` CLIs as child processes, interleaves their output in the current terminal with `[C]` / `[G]` prefixes, and exposes slash commands for routing input and relaying replies between them.

It is intentionally **not** a browser feature, **not** a service, and has **no dependencies** beyond Node's standard library. Override the resolved binaries with `CLAUDE_CMD` / `GEMINI_CMD` env vars if needed. CLIs install via:

```
npm install -g @anthropic-ai/claude-code @google/gemini-cli
```

## Configuration (no env vars)

There is **no `.env` file in use.** AI provider config is set at runtime in **Settings → AI Provider** and persisted to `localStorage` under the key `ai-shunt-settings`. The fields are:

- `aiBaseUrl` — Chat Completions endpoint (default: `http://localhost:1234/v1/chat/completions`)
- `aiModel` — model identifier (default: `local-model`)
- `aiApiKey` — optional bearer token (blank for LM Studio / Ollama)

`aiService.ts` reads these per-call. The inline self-heal script in `index.html` reads the same key directly from `localStorage` so it works without React being mounted.

## Path alias

`@/*` resolves to repo root (configured in both `tsconfig.json` `paths` and `vite.config.ts` `resolve.alias`). Always prefer `@/types`, `@/utils/...`, `@/styles/services/...`, `@/hooks/...`, `@/lib/...` over deep relative paths.

## Architecture

### Entry & provider stack

`index.tsx` → `setupGlobalErrorHandlers()` + `initializeTelemetry()` → mounts `<App />` inside `<React.StrictMode>` and a top-level `<ErrorBoundary>`.

`App.tsx` wraps `<AppContent />` in this fixed nesting order. **The order is load-bearing — downstream contexts depend on upstream ones**:

```
SettingsProvider
└─ TelemetryProvider          (seeds GlobalTelemetryContext: userID/sessionID from localStorage/sessionStorage)
   └─ MCPProvider
      └─ MailboxProvider      (depends on TelemetryContext)
         └─ MiaProvider       (depends on MCPContext)
            └─ SubscriptionProvider
               └─ UndoRedoProvider
                  └─ AppContent  (renders <MissionControl /> and <MiaAssistant />, each in its own ErrorBoundary)
```

`AppContent` also pushes a few settings into globals via `useEffect`: `--mia-font-color` CSS var, `document.body.style.backgroundColor/Image`, the `animations-enabled` body class, and `audioService.setMuted(...)`.

### Top-level layout

- `App.tsx`, `index.tsx`, `index.html` — entry. `index.html` is **not** a typical CRA shell: it loads Tailwind, ReactFlow CSS, Pyodide, and Mermaid from CDNs, and contains an inline self-heal protocol that POSTs to the user's configured AI endpoint when `window.onerror` catches a module-resolution failure. Treat the inline script as part of the runtime contract.
- `hooks/` — confusingly, this is **not just React hooks**. It also holds nearly all UI components under `hooks/components/` (Mission Control, Mia, Shunt, Weaver, Foundry, Chat, Oraculum, Chronicle, settings, etc.), plus standalone hooks (`useShuntProcessor`, `useJobManager`, `useValidation`, etc.). Convention: place new components under `hooks/components/<feature>/`.
- `styles/services/` — despite the name, this holds business logic and React contexts, not styles. Includes `aiService.ts`, `telemetry.ts`, `telemetry.service.ts`, `versionControl.service.ts`, `codeExecutor.ts` (Pyodide), `diagramService.ts`, `governanceApi.ts`, `prompts.ts`, etc., plus the entire `styles/services/context/` directory of React Contexts.
- `styles/globals.css` — actual CSS lives here.
- `types/` — barrel `types/index.ts`, plus `mcp.ts`, `schemas.ts` (Zod), `telemetry.ts`, `autonomous.ts`. Root `types.ts` is a re-export shim — kept for module resolution.
- `utils/` — `errorLogger.ts`, `security.ts`, `storage.ts`.
- `lib/eventBus.ts` — global `appEventBus` used to decouple cross-feature messages.
- `prompts/system/` — markdown system-prompt fragments (reference content; not loaded at runtime).

### MissionControl tabs

`hooks/components/mission_control/MissionControl.tsx` is the main shell. Each tab is **lazy-loaded** via `React.lazy` + `<Suspense>`, keyed by `MissionControlTabKey`. Lazy components remount on each tab switch — local component state is not preserved across navigation.

**Default landing tab is `shunt`** — the SPA's original purpose is the personal text-transform tool (Shunt + Weaver/Foundry/Oraculum/Chronicle/ImageAnalysis/MIA), all calling `aiService.ts` directly against the user's configured endpoint. The Hub / Control / NEXUS tabs are coordination surfaces that augment the personal tool alongside it; they're reachable from the dock but are not the front door. (Update 2026-05-12: this supersedes the original Hub-as-front-door decision that assumed the Cloudflare `hub-relay` Worker would ship in the same window.)

Active tabs (rendered in MissionControl's switch):

- **Shunt** — default landing; text-transform actions through `aiService.performShunt`
- **Weaver**, **Foundry**, **ImageAnalysis**, **Oraculum**, **Chronicle**, **Mod**, **ToolforAI**, **Framework**, **SystemDiagnostics**, **Subscription**, **Documentation**, **Settings** — original work surfaces, all going SPA → `aiService.ts` → user endpoint
- **Hub** — multi-agent coordination station; iframes `public/splicer.html` (the Aether Splicer WebSocket bus client). Requires the deployed `hub-cloudflare/` Worker to be useful.
- **Control** — operator surface: health checks, Adam mode toggle, event log, learning panel
- **Journal**, **Goals**, **A2A**, **Evolution** — the NEXUS suite, absorbed from the retired `:5173` frontend; depend on the NEXUS-PRIME backend at `localhost:8000`

Orphan keys previously in `MissionControlTabKey` were pruned 2026-05-16: `ui_builder`, `orchestrator`, `anthropic_chat`, `serendipity_engine`. Their component dirs (`hooks/components/ui_builder/`, `hooks/components/orchestrator/`, `hooks/components/mission_control/Orchestrator.tsx`) were deleted. The `chat` key is **not** an orphan — it lazy-imports `hooks/components/chat/Chat.tsx` and renders in MissionControl.

### AI service contract — `styles/services/aiService.ts`

Single OpenAI-compatible client. All call sites import from here. Public surface:

- `performShunt(text, action, modelName, ...)` — text-transform actions.
- `executeModularPrompt`, `gradeOutput`, `synthesizeDocuments`, `generateRawText` — general text generation. `generateRawText` accepts `string | ContentPart[]` (multimodal).
- `generateRealTimeCorrection`, `generateOraculumInsights`, `generateOrchestratorReport`, `generatePerformanceReport` — specialized text generators.
- `getAIChatResponseWithContextFlag`, `generateDevelopmentPlan`, `generateCodeFixPlan` — structured-output calls. These use `generateJson(systemPrompt, userPrompt, zodSchema)`, which tries `response_format: { type: 'json_object' }` first and falls back to plain prompt-and-parse if the server rejects `response_format`. Output is Zod-validated before return.
- `analyzeImage(prompt, { base64Data, mimeType })` — multimodal via OpenAI `image_url` content blocks. Note: this function's prompt template is hardcoded to demand a 3D-artist analysis + Virt-a-Mate JSON preset. It's not generic.
- `startChat(history?)` returns an `AiChat` instance with `.sendMessage({ message })`. Replaces the old Gemini `Chat`. **No streaming yet** — `sendMessage` is single-shot.
- `getMiaChatResponse`, `getMiaErrorAnalysis`, `generateCodeFixPlan` — Mia-specific helpers (formerly in `miaService.ts`, consolidated here).
- `isAiConfigured`, `pingAiEndpoint` — diagnostics.

`callChatCompletion` is the private HTTP layer. It reads `aiBaseUrl`/`aiModel`/`aiApiKey` from `localStorage` per-call (so settings changes propagate without restart). `withRetries` from `apiUtils.ts` retries on 429/5xx/network errors. There is **no `AbortController` integration yet** — long-running calls cannot be cancelled.

`resolveModel(requested?)` ignores any model name matching `^gemini[-/]/i` (legacy migration safeguard) and falls back to the configured `aiModel`. Pass `''` (empty string) at call sites to use the configured model.

### Identity & telemetry

User and session IDs are minted in `App.tsx` (uuid v4, persisted to `localStorage`/`sessionStorage`) and seeded into `TelemetryProvider` as `GlobalTelemetryContext`. Telemetry init runs once from `index.tsx`.

Telemetry is consolidated into `styles/services/telemetry.service.ts` (class-based, used by `TelemetryContext`). The old module-scoped `telemetry.ts` has been removed. (Update 2026-05: consolidation completed; this paragraph previously documented the duplicate.)

### Error handling & self-healing

- `setupGlobalErrorHandlers()` wired at startup.
- `index.html` inline script catches `window.onerror` and triggers a recovery overlay only on module-resolution failures (`Failed to resolve module specifier`, `Failed to fetch dynamically imported module`, `Importing a module script failed`, `blocked by a null value`). Recovery posts the error to the user's AI endpoint with `response_format: json_object` and asks for a fix plan.
- `MiaContext` exposes `diagnoseLastError`, `generateFixAttempt`, `applyFix` for in-app diagnosis. **No mutex** — overlapping calls can clobber `activePlan`.

## Conventions

- **No relative climbs across top-level dirs.** Use the `@/...` alias.
- **Lazy-load heavy tabs/features** following the MissionControl pattern.
- **All AI calls go through `aiService.ts`.** Never instantiate a vendor SDK or call `fetch` to an AI endpoint directly. Never reintroduce `@google/genai` or any other vendor SDK.
- **Pass `''` for model parameters at call sites.** `resolveModel` will use the user's configured model. Hardcoded vendor model names (e.g., `'gemini-2.5-flash'`, `'gpt-4'`) will be ignored or cause confusion.
- **Provider order in `App.tsx` is load-bearing.** New contexts that depend on Settings/Telemetry/MCP/Mailbox/Mia must nest inside, not above them.
- **Structured output uses Zod.** Define the schema in `types/schemas.ts`, pass to `generateJson` or use one of the typed wrappers.
- **Multimodal:** when building `ContentPart[]`, use `{ text }` and `{ inlineData: { data, mimeType } }`. `aiService` collapses to plain string content when no image part is present (some text-only OpenAI-compatible servers reject array-form content).
- **Do not respond with multiple answers or solutions that funnel down to the same answer.** If the options converge on the same conclusion, pick one and commit. Parallel choices are only useful when the paths and outcomes are genuinely distinct — otherwise they pad the response and signal indecision. Applies to strategy questions, design tradeoffs, and fire-word dispatch alike.

## Reference docs (read-only)

- `security.md` — historical analysis of Google AI Studio's "Build" agent. **Not** a security policy for this repo. Keep as architectural context for the prompt-engineering choices in `prompts.ts`.
- `migrated_prompt_history/` — frozen artifacts from the AI Studio migration. Not loaded at runtime.
- `prompts/system/*.md` — reference prompts; not loaded at runtime.
- `BUILD_LOG.md` — append-only build journal. Read this for context on hub-bus and Worker decisions.
- `HANDBOOK.md`, `STATE_SNAPSHOT.md` — operator onboarding and current-state snapshots.
