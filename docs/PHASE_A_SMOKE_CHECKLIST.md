# Phase A — SPA Smoke Checklist

> **For operator at http://127.0.0.1:3001/ (or :3000 once PID 4540 is killed).**
> Run with LM Studio up on `localhost:1234` and `gemma-3-27b-it-abliterated-normpreserve` loaded.
> Each line should pass cold (no special Settings tweaks required) thanks to the 2026-05-16 auto-detect-model change. Tick boxes, jot the failures, hand back to Claude.

## 0. Boot

- [ ] http://127.0.0.1:3001/ returns the purple dashboard within 2s
- [ ] Browser console clean — no red errors on first paint
- [ ] Nexus dock visible at the left/top edge; default tab is **Shunt**

## 1. Settings tab — sanity

- [ ] Open **Settings → AI Provider**
- [ ] Base URL shows `http://localhost:1234/v1/chat/completions`
- [ ] Model field can be left blank (auto-detect picks the loaded LM Studio model). Or paste `gemma-3-27b-it-abliterated-normpreserve` explicitly to test the explicit-config path.
- [ ] **Ping** button (if present) returns ok
- [ ] Theme/background/animations toggles change the UI without console errors

## 2. Shunt tab (default landing)

- [ ] Paste 2–3 sentences of mixed-quality prose into the input
- [ ] Click any transform action (e.g. "Tighten" / "Format JSON" / first available action)
- [ ] **Stop-generating button appears bottom-right** while the call is in flight (purple pill, z-index 9999)
- [ ] Click Stop mid-flight on one run → "Generation cancelled by user." surfaces, no console crash
- [ ] Let one run finish → result text appears, no truncation, no stray code-fence wrappers
- [ ] Run "Format JSON" against the result → output validates as JSON

## 3. Mia (the floating assistant, bottom-right)

- [ ] Open Mia panel
- [ ] Type "Hello, what tab am I on?" → reply **streams in token-by-token** (not all-at-once). This is the 2026-05-16 streaming wiring; if it appears all-at-once your server may be ignoring `stream: true`.
- [ ] Click "Diagnose Last Error" with no errors → Mia replies "I couldn't find any recent critical errors to analyze."
- [ ] Force an error (e.g. break the Base URL in Settings, run a Shunt transform, switch back) → "Diagnose Last Error" produces an analysis message
- [ ] Double-click "Diagnose" quickly → only ONE analysis runs (mutex from 2026-05-16)

## 4. Weaver

- [ ] Enter a topic/seed
- [ ] Run a generation → output appears, Stop button works
- [ ] No console errors about model resolution or `stream` field rejection

## 5. Foundry

- [ ] Pick an action; provide source text
- [ ] Run → output appears; Stop works
- [ ] No grade/synthesis steps fail

## 6. Oraculum / Chronicle / Image Analysis / Mod / ToolforAI / Framework

- [ ] Each tab loads without runtime error on first open
- [ ] Each tab's primary action triggers an AI call (Stop button appears) and surfaces a result
- [ ] **Image Analysis** is hardcoded to a 3D-artist + Virt-a-Mate preset (per CLAUDE.md) — only smoke-test if that's relevant; otherwise flag and move on

## 7. Chat tab

- [ ] Send a message → response streams in (uses the same `AiChat` path as Mia)
- [ ] History persists across tab switch back to Chat
- [ ] Stop button works mid-stream

## 8. Subscription / Documentation / Diagnostics

- [ ] These are mostly static — verify they render without console errors. No AI calls expected.

## 9. Tabs that need the bus/NEXUS backend

These are expected to be **partially functional** until Phase B (cross-machine hub) and the NEXUS-PRIME backend on :8000:

- **Hub** — iframes splicer.html; needs `npm run bus:start` + `hub-relay` worker; flag what works
- **Control / Journal / Goals / A2A / Evolution** — need NEXUS-PRIME at :8000; flag what works

## 10. Stop button + retries

- [ ] Start two AI calls in different tabs simultaneously → Stop button shows "Stop generating (2)"
- [ ] Click Stop → both abort; the count goes to 0; the button disappears
- [ ] withRetries does NOT retry after an explicit cancel (would show as duplicate fires)

## Reporting back

For each unchecked or failed item, copy the row + the browser console message (if any). Hand back. Claude triages and either fixes or files into the Phase B/C punch lists.
