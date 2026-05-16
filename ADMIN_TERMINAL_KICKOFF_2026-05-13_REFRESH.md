# Admin Terminal Kickoff — REFRESH 2026-05-13

**For:** Fresh Claude Code session in a new admin PowerShell terminal.
**Previous session:** lost (terminal closed). This file replaces the morning
kickoff. The morning file (`ADMIN_TERMINAL_KICKOFF_2026-05-13.md`) is now
**historical context**, not the active brief.
**From:** Cowork (Claude on zack's desktop).
**Operator:** zack — relaying between us.

---

## 1. Who you are, who I am, the working pattern

You are the **executor** — shell access, file write access, can spawn /
kill processes. I am **Cowork** — file edits + audits, no shell. zack
pastes my replies into your terminal and yours into mine. We never write
to the same file in the same turn.

When you finish a task: tight status report, end in silence. No menus.

---

## 2. State of the world, RIGHT NOW

### Bus (file-bus + Cloudflare Worker + 4 bridges)

- **Worker `hub-relay`** live at `https://hub-relay.halkive.workers.dev` (deployed 2026-05-08, untouched since).
- **Orchestrator** running locally with HTTP admin face on `:7779`. 5 children: `lmstudio-bridge`, `gemini-bridge`, `claude-bridge`, `retry-daemon`, `panel-server`. Zero restarts as of last report.
- **Adam bridge** intentionally absent (default off; opt in via `--enable=adam-bridge`).
- **`stop-loop` filter shipped** on all four bridges — they release non-`kind:request` envelopes immediately. The pre-existing ping-pong loop is dead.
- **`fix-claude-shell` + `claude-exe-direct` shipped** on `claude-bridge.mjs`. Three-mode spawn:
  - Mode A: `USE_NODE_DIRECT` (npm bundle.js path) — unchanged.
  - Mode C (new): direct `.exe` spawn when `CLAUDE_CMD_RESOLVED` ends in `.exe` — no shell, no DEP0190.
  - Mode B (last resort): shell:true fallback for `.cmd` / `.bat` shims — prompt via stdin, NOT argv.
- **`dual-exe-direct` shipped** on `dual.mjs` — same Mode B/C split.
- **DLQ archived**: 149 stale envelopes from the pre-stop-loop ping-pong loop moved to `hub-bus/archive/dlq-2026-05-13/` with a README. `hub-bus/inbox/@dlq/` is now empty.
- **Verified end-to-end**: a punctuation-heavy `kind:request` round-tripped through `@claude` and back as a clean `kind:reply`. Em-dash + ampersand + parens survived intact.

### NEXUS-PRIME backend

- **Venv rebuilt against Python 3.12.0** (was pinned to uninstalled 3.13.11). All requirements reinstalled.
- **`start_backend.py` fixed** — was `os.chdir(r"E:\websiteAgents\backend")` (dead drive), now `os.chdir(Path(__file__).parent / "backend")`.
- **Booted clean** as of last report. Application startup complete. `/health` returns 200, `dna_version=1.0.0`.
- **Subsystems initialized**: `dna_cache`, `reflex_router (5 patterns)`, `a2a_engine`, `health_monitor`, `evolution_engine`, `adam_brain (3 models / 10GB VRAM budget)`, `journal (entry_count=877)`, `adam_heartbeat (mode=autonomous, interval=300s)`, LM Studio detected on `:1234`.
- **One real bug found post-boot**: Adam heartbeat crashed every cycle with `No module named 'adam.todo_progress'`. **Fixed by Cowork** — recreated `backend/adam/todo_progress.py` (the file was lost in the E:\ → C:\ migration; a stale `.pyc` remained but the source did not).
- **Heartbeat cycle observation still pending** — last fix shipped just before the previous terminal died. Verify the cycle clears the `adam_heartbeat_error` on the next 5-min tick.
- **`nexus-p1` (AdamJournal kwarg)** was a phantom — every caller in `backend/adam/*.py` already uses `entry_type=`. No fix needed.

### Frontends

- **Aether Shunt SPA** (`:3000`, Vite) — vite.config.ts tightened to `host: '127.0.0.1'` this morning (loopback-only). Not currently running unless you start it.
- **Cockpit** (`:3002`, Next 15) — not currently running. `package.json` scripts include `-p 3002`. No collision with SPA on `:3000`.
- **Aether Shunt Hub admin** (`:3003`, Next 16) — running before terminal died, status unknown now. **MUST be restarted** to pick up the new `.env.local` (see consumer-wiring below).

### Three completed cosmetic items

- `:5173` NEXUS frontend stripped from `websiteAgents/websiteAgents/start.bat`.
- `LAUNCH-NOW.md` replaced — was 200 lines of Astro portfolio cruft, now NEXUS launch instructions.
- `aether-shunt-hub/proxy.ts` created (renamed from `middleware.ts` for Next 16 deprecation closure). **Old `middleware.ts` still on disk — needs `Remove-Item`.**

### Two stale `middleware.ts` situation

Critical for your first action below: `aether-shunt-hub/` currently has BOTH `middleware.ts` AND `proxy.ts`. They contain identical logic. Next will register both or emit an ambiguity warning. **Delete the old `middleware.ts` before restarting the admin hub.**

---

## 3. YOUR FIRST ACTIONS (in order)

```powershell
# 1. Verify bus is still alive and three frontends if they were running.
cd C:\Users\Falki\shunt-final-v
Get-Process node -ErrorAction SilentlyContinue | Format-Table Id,ProcessName,StartTime

# 2. Hit orchestrator status to confirm bridges are up
Invoke-RestMethod http://localhost:7779/status

# 3. Hit NEXUS health
Invoke-RestMethod http://localhost:8000/health

# 4. VERIFY behavioral equivalence before deleting anything.
#    proxy.ts has a richer file header / JSDoc than middleware.ts had — fc.exe
#    WILL show diffs, but they should be in COMMENTS ONLY. If executable code
#    (imports or the `export function middleware(...)` body) differs, STOP
#    and report — that means proxy-rename was not a clean copy.
fc.exe C:\Users\Falki\shunt-final-v\aether-shunt-hub\middleware.ts `
       C:\Users\Falki\shunt-final-v\aether-shunt-hub\proxy.ts

# 5. If verify shows comment-only diffs (expected), complete the proxy-rename
#    half. This deletes the OLD file at aether-shunt-hub/ (the Next 16 admin
#    command center on :3003), NOT the main Aether Shunt SPA at repo root.
#    proxy.ts (already on disk) carries the same exported `middleware`
#    function — no behavior change, just the Next 16 canonical filename.
Remove-Item C:\Users\Falki\shunt-final-v\aether-shunt-hub\middleware.ts

# 6. Confirm proxy.ts is there
Test-Path C:\Users\Falki\shunt-final-v\aether-shunt-hub\proxy.ts
```

Report green/red on each. If bus is down, you'll need to restart it:

```powershell
cd C:\Users\Falki\shunt-final-v
npm run bus:start
```

If frontends are down and you want them visible:

```powershell
# Terminal A — Aether Shunt SPA (already at 127.0.0.1:3000)
cd C:\Users\Falki\shunt-final-v && npm run dev

# Terminal B — Cockpit
cd C:\Users\Falki\shunt-final-v\cockpit---systems-operations-console && npm run dev

# Terminal C — Aether Shunt Hub admin (Pattern X surfaces, BridgeRunMatrix)
cd C:\Users\Falki\shunt-final-v\aether-shunt-hub && npm run dev
```

The hub at `:3003` will now pull from orchestrator's `:7779` (consumer-wiring completed earlier today — `.env.local` already has `ORCHESTRATOR_URL=http://localhost:7779`).

---

## 4. Active queue (what's left)

### Executor-side (your shell)

| Item | Effort | Notes |
|---|---|---|
| **Delete `middleware.ts`** (proxy-rename completion) | <1min | Critical, see "First Actions" |
| **Observe Adam heartbeat cycle** | 5min wait | Should clear `adam_heartbeat_error` now that `todo_progress.py` exists. If still erroring, paste the stack — Cowork audits |
| `bus:compact` — rotate transcript.jsonl (342KB, 155 kind:error entries from the dead loop) | 1min | `npm run bus:compact` or `node hub-bus-tools/compact.mjs` |
| Sweep 8 legacy debug artifacts at NEXUS root | 5min | **IMPORTANT:** diff `temp_heartbeat.txt` against `backend/adam/heartbeat.py` BEFORE deleting — if unique content exists, preserve. Other 7 are clearly E:\-era trash safe to delete: `startup_error*.txt`, `short_failure_report*.txt`, `single_failure*.txt`, `nul` (literal 0-byte file) |
| Grep repo for remaining `E:\` paths | 2min | `Get-ChildItem -Recurse | Select-String 'E:\\' -SimpleMatch -List` |
| Delete stray `C:\Users\Falki\package-lock.json` | <1min | Causes Next's "multiple lockfiles" warning |
| Double-click `cleanup.bat` at repo root | 30s | Removes dead `UI/`, `3ui/`, `4ui/`, `features/` dirs after list-confirm prompt |
| LM Studio "Model unloaded" auto-reload | medium | Design pending. Bridge sees HTTP 400 with `{"error":"Model unloaded."}` after idle. Either reload + retry in bridge, or surface clearer envelope, or document config (LM Studio idle-unload OFF) |

### Cowork-eligible (file edits, ping me)

- Pattern Z prerequisites are now satisfied. The actual Pattern Z build (multi-LLM collaboration on button presses → joint output) hasn't started — that's the next major arc, not a small fire-word.

### Deferred / accepted-as-noise

- MCP servers `mata-mcp:8001`, `nws-mcp:8002` unreachable — Memphis-specific tools, not blocking
- Log race in NEXUS boot: `local_llm_initialized_httpx available=True` then `local_llm_available=False` 4 lines later — cosmetic, defer

---

## 5. The bigger vision (Pattern Z)

zack's mission (verbatim from BUILD_LOG §1):

> "Steer Aether Shunt from a single-user text-transformation SPA into a
> multi-LLM coordination hub where local LLMs (LM Studio, AnythingLLM,
> Ollama) and frontier agents (Claude, Gemini) message each other
> bidirectionally as peers, addressable across machines via Cloudflare.
> The project is a breeding ground for more capable agents requesting aid
> from each other."

**Pattern Z** — explicitly stated by zack: when a user presses a button in
the Aether Shunt SPA, ALL the LLMs collaborate to produce a joint output
better than any single one. NOT shipped yet. The prerequisites just
finished:

- Bridges filter properly (`audit-kind-filters` + `stop-loop`)
- Bus is stable (no loop bug)
- Claude bridge handles arbitrary punctuation (`fix-claude-shell` + `claude-exe-direct`)
- Orchestrator observable (`bridge-state-orch`)

What Pattern Z still needs:

1. SPA's `aiService.ts` learns to dispatch envelopes to the bus instead of POSTing single-LLM.
2. Synthesizer/aggregator role on the bus (Adam, dedicated `@synthesizer`, or the orchestrator).
3. Per-button strategy (ensemble / debate / round-robin reviewers / synthesis-merge).
4. Timeout + correlation handling (envelope schema already has `trace`/`replyTo`).

This is the next major arc. Don't sneak it in as a fire-word — it deserves
explicit scope discussion with zack before any code lands.

---

## 6. Fire-word protocol

zack dispatches one word; you execute. Examples used today:
`consumer-wiring`, `verify-claude-bridge`, `dlq-archive`, `nexus-p0`, `nexus-p1`,
`todo-progress`, `claude-exe-direct`, `dual-exe-direct`, `launch-now-replace`,
`proxy-rename`, `cleanup`, `audit`. After execution: tight status, end in
silence. No menus, no "want me to also...".

---

## 7. Two-instance verifier pattern

When Cowork and you are both active:

- **One audits** (read-only, proposes patches, doesn't write).
- **Other executes** (applies patches, runs processes, smoke-tests).
- zack relays.

Today Cowork was on file edits and you (the previous instance) were on
shell ops. Same split likely continues unless context forces otherwise.

---

## 8. File-location cheat sheet (recently relevant)

| Need | Path |
|---|---|
| Project journal — read this first | `C:\Users\Falki\shunt-final-v\BUILD_LOG.md` |
| Root SPA conventions | `C:\Users\Falki\shunt-final-v\CLAUDE.md` |
| Morning's kickoff (historical) | `C:\Users\Falki\shunt-final-v\ADMIN_TERMINAL_KICKOFF_2026-05-13.md` |
| **This refresh (active brief)** | `C:\Users\Falki\shunt-final-v\ADMIN_TERMINAL_KICKOFF_2026-05-13_REFRESH.md` |
| Multi-day handoff with rails | `C:\Users\Falki\shunt-final-v\COWORK_HANDOFF_2026-05-11.md` (§9.5 coverage map, §7.5 DO-NOT rails) |
| Bridges shipped today | `C:\Users\Falki\shunt-final-v\hub-bus-tools\{claude,gemini,lmstudio,adam}-bridge.mjs` |
| Orchestrator with new HTTP face | `C:\Users\Falki\shunt-final-v\hub-bus-tools\orchestrator.mjs` |
| dual.mjs shipped today | `C:\Users\Falki\shunt-final-v\dual.mjs` |
| NEXUS backend root | `C:\Users\Falki\websiteAgents\websiteAgents\` |
| New `todo_progress.py` | `C:\Users\Falki\websiteAgents\websiteAgents\backend\adam\todo_progress.py` |
| Fixed `start_backend.py` | `C:\Users\Falki\websiteAgents\websiteAgents\start_backend.py` |
| Updated NEXUS launcher | `C:\Users\Falki\websiteAgents\websiteAgents\start.bat` (no longer launches :5173) |
| Updated NEXUS launch doc | `C:\Users\Falki\websiteAgents\websiteAgents\LAUNCH-NOW.md` |
| DLQ archive | `C:\Users\Falki\shunt-final-v\hub-bus\archive\dlq-2026-05-13\` |
| Active inboxes | `C:\Users\Falki\shunt-final-v\hub-bus\inbox\@{claude,gemini,lmstudio,adam,zack}\` |
| Bus transcript (needs rotation) | `C:\Users\Falki\shunt-final-v\hub-bus\transcript.jsonl` |
| Presence | `C:\Users\Falki\shunt-final-v\hub-bus\presence.json` |

---

## 9. Port map

| Port | Service |
|---|---|
| 1234 | LM Studio |
| 3000 | Aether Shunt SPA (loopback-only) |
| 3001 | AnythingLLM if running |
| 3002 | Cockpit |
| 3003 | Aether Shunt Hub admin |
| 7777 | panel-server.mjs (bus inspection) |
| 7778 | cockpit/launcher.cjs |
| 7779 | orchestrator.mjs HTTP admin (NEW — shipped today via `bridge-state-orch`) |
| 8000 | NEXUS-PRIME backend |

---

## 10. DO NOT rails (compressed; full version in COWORK_HANDOFF §7.5)

1. **Do not reintroduce `@google/genai`** anywhere. CLAUDE.md root rule.
2. **Do not run `npm audit fix --force`**. Transitive bumps can break things silently.
3. **Do not re-broaden the cockpit proxy allowlist** beyond `localhost` + `127.0.0.1`.
4. **Do not change the provider order in `App.tsx`**. Settings → Telemetry → MCP → Mailbox → Mia → Subscription → UndoRedo.
5. **Do not refactor `HealthPoller` polling** without preserving `systemsRef` + `statesRef` + `tickInFlightRef`.
6. **Do not merge Cockpit into the SPA**. Separate apps by design.
7. **Do not change MissionControl default tab** away from `'shunt'`. The parallel session correctly reverted from `'hub'` earlier; the inline comment cites this decision.
8. **Do not edit `public/splicer.html` directly** — canonical is `hub-bus-panel-desktop/splicer.html`, one-way sync.
9. **Do not delete `zip/` or `zip.zip`** without zack's verdict.
10. **Do not blind `rmdir /s /q`**. Use list-confirm-delete pattern.
11. **Do not re-add `'task'` to bridge kind filters**. The kind-map preprocesses `'task'` → `'request'` upstream; bridges filter on `'request'` only.
12. **Do not pass prompt as argv in claude-bridge's Mode B (`shell:true` fallback)**. cmd.exe word-splits. Use stdin.
13. **Do not bind orchestrator HTTP to non-loopback** without bearer auth. Default is `127.0.0.1` deliberately.
14. **Do not delete `temp_heartbeat.txt`** before diffing against `backend/adam/heartbeat.py`. If it has unique content, preserve.

---

## 11. Sibling docs to read in order

If you have 5 minutes, read these:

1. **This file** (you're reading it).
2. `BUILD_LOG.md` last entry first, then scroll up — most recent decisions at the bottom of "Lessons learned" section.
3. `COWORK_HANDOFF_2026-05-11.md` §9.5 (coverage map — what's Cowork-verified vs inherited) and §7.5 (DO-NOT rails verbatim).
4. `CLAUDE.md` at root — provider stack, aiService contract, conventions.

If you have only 60 seconds: this file's §2 (state of the world) + §3 (first actions) + §10 (rails).

---

*End of refresh.*
*Cowork, 2026-05-13.*
*Supersedes `ADMIN_TERMINAL_KICKOFF_2026-05-13.md` as the active brief; that file is preserved as morning history.*
