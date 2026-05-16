# Enhance & Validate Workflow — Design

> **Status:** Design only — no code yet.
> **Author:** chat-Claude with zack, 2026-05-10.
> **Goal:** Single user input becomes a multi-LLM-validated final output via a 5-stage pipeline running on the existing Aether Shunt bus.

## Why this exists

The bus has been built so that AI peers (`@claude`, `@gemini`, `@lmstudio`, `@adam`) can address each other. So far we've only tested point-to-point exchanges. The Enhance & Validate workflow is the first pattern that uses *all peers cooperatively* on a single goal — taking advantage of the fact that the bus exists.

User vision (zack, verbatim): *"run something through the prompt enhancer and then all the LLMs / AI work together to fix final output validating its accurate updated modern output."*

## Pipeline — 5 stages

Each stage is an envelope on the bus with a specific `intent`. All envelopes for one workflow run share a `trace` UUID. The workflow runner orchestrates the order; peers do the work.

| # | Stage | `intent` | Default peer(s) | Output |
|---|---|---|---|---|
| 1 | Enhance | `enhance` | `@lmstudio` (cheapest, fast) | Rewritten prompt with role, constraints, format spec |
| 2 | Multi-peer draft | `draft` | All selected peers in parallel | One draft per peer |
| 3 | Cross-validate | `review` | Each peer reviews the *other* peers' drafts | Structured reviews: agreements, disagreements, factual flags, dated-info flags |
| 4 | Synthesize | `synthesize` | `@claude` (default, strong synthesizer) | One best-of-all output |
| 5 | Modernity & accuracy | `validate` | `@gemini` (has Google's reach via gemini-cli) | Pass/fail + corrections for dates, deprecated APIs, current versions |

User can edit between stages, dismiss a peer's draft, override the synthesis.

## Mode presets

| Mode | Peers | Stages | Time budget |
|---|---|---|---|
| Quick | `@lmstudio` only | 1 → 2 → 5 (skip 3, 4) | ~10s |
| Standard | `@lmstudio` + `@gemini` | All 5 | ~45s |
| Deep | `@claude` + `@gemini` + `@lmstudio` (+ `@adam` if up) | All 5 | ~2 min |

## Architecture

### New components

- **`hub-bus-tools/workflow-runner.mjs`** — daemon that subscribes to `intent: 'workflow-start'` envelopes from `@zack`. Orchestrates stages, handles per-stage timeouts, emits stage-progress envelopes for the UI to subscribe to.
- **Bridge intent-routing additions** — `lmstudio-bridge` and `gemini-bridge` need per-intent system-prompt overrides so `intent: 'enhance'` uses an enhancer prompt, `intent: 'review'` uses a reviewer prompt, etc. (`adam-bridge` already has intent routing.)
- **Chat-room UI tab** — second mode in the existing `hub-bus-panel/index.html` between `[💬 Chat]` and a new `[✨ Enhance & Validate]`. Stage cards collapsible, peers togglable, mode selector, run button.

### Reused components

- File-bus, presence, transcript, claim/release, heartbeat, dual-write to Worker — all unchanged.
- `panel-server.mjs` `POST /api/send` — used to kick off a workflow.
- SSE stream — the UI subscribes to envelopes filtered by `trace` to show live progress.

### Envelope shapes (using existing schema)

```
{ from: '@zack', to: '@workflow-runner', intent: 'workflow-start',
  body: { goal, mode, peers, originalInput }, trace: <uuid> }

{ from: '@workflow-runner', to: '@lmstudio', intent: 'enhance',
  body: <originalInput>, trace: <same> }

{ from: '@lmstudio', to: '@workflow-runner', kind: 'response',
  body: <enhanced>, replyTo: <stage1Id>, trace: <same> }

{ from: '@workflow-runner', to: '@gemini', intent: 'draft',
  body: <enhanced>, trace: <same> }
... (one per peer in parallel)

{ from: '@workflow-runner', to: '@claude', intent: 'review',
  body: { drafts: [<gemini>, <lmstudio>] }, trace: <same> }
... (one per reviewer)

{ from: '@workflow-runner', to: '@claude', intent: 'synthesize',
  body: { enhanced, drafts, reviews }, trace: <same> }

{ from: '@workflow-runner', to: '@gemini', intent: 'validate',
  body: <synthesized>, trace: <same> }

{ from: '@workflow-runner', to: '@zack', kind: 'response',
  body: { final, validations, stages }, trace: <same> }
```

## UI mockup

```
┌─ Chat-room top bar ────────────────────────────────────────────┐
│ [💬 Chat] [✨ Enhance & Validate ●]   floor: open   ⚙ gear     │
├─ Enhance & Validate panel (replaces transcript when active) ──┤
│  Goal:  [make me a website________________________________]   │
│  Mode:  [Quick] [Standard ●] [Deep]                           │
│  Peers: ☑ @claude  ☑ @gemini  ☑ @lmstudio  ☐ @adam            │
│                                                  [▶ Run]      │
├────────────────────────────────────────────────────────────────┤
│  ▾ Stage 1 — Enhance                          ✓ 2.1s          │
│      Enhanced: "Build a single-page React landing page…"      │
│      [edit] [accept]                                           │
│  ▾ Stage 2 — Drafts                          ⏳ 2 of 3 done   │
│      ✓ @gemini    (view 142 words)                            │
│      ✓ @lmstudio  (view  98 words)                            │
│      ⏳ @claude   (generating 14s…)                            │
│  ▸ Stage 3 — Cross-validate                  waiting           │
│  ▸ Stage 4 — Synthesize                      waiting           │
│  ▸ Stage 5 — Modernity & accuracy            waiting           │
├────────────────────────────────────────────────────────────────┤
│  Final output (locked until stage 5 completes)                │
│  [copy] [save as transcript bookmark] [open in Chat]          │
└────────────────────────────────────────────────────────────────┘
```

## Effort estimate

| Component | Time | Notes |
|---|---|---|
| `workflow-runner.mjs` | ~3 hrs sub-agent | New daemon; mirror lmstudio-bridge daemon pattern |
| Bridge intent-routing | ~2 hrs sub-agent | Per-intent system-prompt overrides in lmstudio-bridge + gemini-bridge |
| Chat-room UI tab | ~3 hrs sub-agent | New mode in existing index.html; stage cards |
| Integration test | ~30 min | Round-trip a real goal through all 5 stages |
| **Total** | **~8 hrs** | 3 sub-agents in parallel + final integration |

## Open questions for next iteration

- Stage timeout policy: skip a peer that doesn't respond in N seconds, or fail the workflow?
- Synthesizer choice: hardcode `@claude` or let user pick?
- Stage 5 currency check: how does Gemini actually verify "modern" — by date in the response, by fetching current docs, or by trusting its own knowledge cutoff?
- Workflow templates: prebuilt goal types (write code, write essay, debug error) with different stage configs?
- Persistence: should completed workflows be bookmarked / nameable for replay?

## Implementation order (when authorized)

1. Bridge intent-routing (smallest, unblocks everything else).
2. `workflow-runner.mjs` daemon.
3. Chat-room UI tab.
4. Integration smoke-test with a real goal.

## Status

Design only. Not authorized to build yet.
