# Claude Code Kickoff — Aether Shunt workspace

Paste this as your first message to Claude Code in Antigravity IDE.
Or read it yourself and forward the key pieces in your own words.

---

You're picking up a multi-project workspace from a previous Cowork (Claude
desktop) session. A handoff log was written to make this transfer safe. **Do
not execute any code or refactors until you've read it and run the preflight.**

## Read in this order

1. **`COWORK_HANDOFF_2026-05-11.md`** at this repo root.
   Priority sections (read first):
   - **§0** — How to use this doc
   - **§9.5** — Cowork's coverage map (what's trustworthy vs inferred)
   - **§7.5** — DO NOT rails (15 items you must not trip)
   - **§12** — Last known good state + preflight instructions
   - **§5** — Recent fixes + the verbatim CLAUDE.md diff to apply
   Then the rest as needed.

2. **`CLAUDE.md`** at repo root — SPA conventions. Has two known drifts
   (telemetry consolidation, missing Nexus tab list). The diff to fix
   both lives in handoff §5; apply verbatim, do NOT re-derive.

3. **`cockpit---systems-operations-console/README.md`** — single source of
   truth for the cockpit's deferred designs (Q3, Q4, Tier 3 widget).
   The handoff §6 points here; the README is canonical.

## Preflight — run this BEFORE any fire-word

```bash
cd C:\Users\Falki\shunt-final-v
npm run dev
# expected: Vite boots at http://127.0.0.1:3000, "Network:" line absent
# click through Hub, Control, Journal, Goals, A2A, Evolution → no white-screens
```

```bash
cd C:\Users\Falki\shunt-final-v\cockpit---systems-operations-console
npm run dev
# expected: Next boots at http://localhost:3002 (port 3002, not 3000)
grep '@google/genai' package-lock.json
# expected: zero matches
```

If any step fails, stop and report. Don't fix-and-execute in one breath.

## Operating mode

I (zack) dispatch with **fire-words** from the punch-list in handoff §5.
Active fire-words right now:

- `cleanup` — generate `cleanup.bat` (UI/, 3ui/, 4ui/, features/; SKIP zip/ and zip.zip pending verdict)
- `claudemd` — apply the CLAUDE.md drift diff from handoff §5
- `tail-now` / `tail-batch` — Tier 3 transcript-tail widget (start now or batch with Q3+Q4)
- `audit` — investigate the 2 moderate npm audit advisories (report only, no auto-fix)

When you see a fire-word, execute that item. Otherwise propose and wait.

## Inline rails (already in place)

Six code-site comments cite `COWORK_HANDOFF §7.5 #N` at the booby-trap
sites: provider stack order in `App.tsx`, default tab in
`MissionControl.tsx`, polling deps in `HealthPoller.tsx`, allowlist in
`route.ts`, sync direction in `public/splicer.html`, host binding in
`vite.config.ts`. Reading the code triggers the warning automatically.

## Two-instance pattern

Cowork (Claude desktop) and you (Claude Code in Antigravity) may both be
involved on the same project. I relay between you. Keep replies tight and
copy-paste-friendly so I can pass them back. Verifier-and-executor split
is the working model; either side may take either role.

## Standing prefs

Master Systems Architect framing on strategic asks. Externalize reasoning.
Inverse analysis (failure conditions first). Cross-domain leap when
problems are ambiguous. Skip the protocol on mechanical fixes. Make calls
and proceed when ambiguity is benign — don't halt to confirm every step.

## What to do right now

1. Read the handoff in the order above.
2. Run the preflight.
3. Report green/red.
4. Wait for my first fire-word.
