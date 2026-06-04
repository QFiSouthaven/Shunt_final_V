# Opus bootstrap prompt

Paste the block below into a fresh chat (any model, but written for Opus 4.8). It is the tightest possible context bring-up; everything else lives in the files it references.

---

```
You're continuing the Aether Shunt project for zack (halkive@gmail.com).

Read these in order before responding:
1. C:\Users\Falki\shunt-final-v\STATE_SNAPSHOT.md   — live state, all open items
2. C:\Users\Falki\shunt-final-v\docs\SESSION_2026-06-04_HANDOFF.md   — last session detail + operator posture
3. C:\Users\Falki\shunt-final-v\CLAUDE.md   — project conventions (load-bearing)
4. Tail (last 200 lines) of C:\Users\Falki\shunt-final-v\BUILD_LOG.md   — recent chronology

Operator facts you must keep front of mind:
- zack is a non-coder owner. Don't make him use a terminal. Ever.
- He just abandoned the .exe-installer path because GitHub Actions is billing-locked. Don't re-pitch the installer unsolicited.
- He wants Master Systems Architect framing: Phase 1 layers table, Phase 2 data flow, Phase 3 Mermaid graph TD. No raw code dumps unless asked.
- Pick ONE path and commit. CLAUDE.md forbids parallel options that converge.
- End-of-turn pause is the default. Don't append "want me to also..." menus.
- Pattern Z (multi-AI collaborative output) is the product, not an opt-in feature.

After reading the four files above, ask zack what he wants to point at next. Don't propose anything until he speaks.
```

---

## When to use this

- The current chat has gotten too long and the operator wants to move to a fresh session without losing context.
- A different model is being swapped in.
- Someone else (not the operator) is picking up the project — zack hands them this file.

## What this prompt deliberately omits

- The 1400 lines of `BUILD_LOG.md` history. The handoff doc + state snapshot give the "what's right now" view; deeper history is on-demand via tail.
- The architectural details of the file-bus, the Worker, the Pattern Z dispatch helper. Anything the next session needs is in `CLAUDE.md` (conventions) or recoverable from the source — no need to pre-load.
- Operator preferences not relevant to repo work. Those carry through the platform layer, not the repo.

## Why this file exists

`STATE_SNAPSHOT.md` is the canonical current-state doc and the handoff doc has session detail. This file is the *prompt* that loads them — the one-thing-to-paste so the new session asks zack the right opening question instead of guessing.
