// components/control_panel/ControlPanel.tsx
//
// The Control Panel — operator surface, not a chat surface.
//
// Five sections:
//   1. System Health      — green/yellow/red pills for Aether + NEXUS, refreshable
//   2. Adam Control       — read autonomy mode, current goal, cycle stats; change mode; nudge
//   3. Quick Actions      — clear histories, reset sessions (operator-grade housekeeping)
//   4. Endpoint Ping      — manual single-shot pings with latency, useful for "is this thing on?"
//   5. Event Log          — every action's outcome streams in here so you can SEE what happened
//
// Bottom: a collapsible Learning panel with plain-language explanations.
//
// Design principle: every control is reversible or low-stakes. No destructive operations
// (no /evolution/mutate, no /evolution/rollback) until the operator is past v1 of practice.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pingAiEndpoint, isAiConfigured } from '@/styles/services/aiService';
import { audioService } from '@/styles/services/audioService';

// ─── Constants ────────────────────────────────────────────────────────

const NEXUS_BASE_URL =
  (typeof window !== 'undefined' && (window as { __NEXUS_BASE_URL__?: string }).__NEXUS_BASE_URL__) ||
  'http://localhost:8000';

type Health = 'unknown' | 'green' | 'yellow' | 'red';

interface HealthState {
  status: Health;
  latencyMs?: number;
  detail?: string;
  lastCheckedAt?: number;
}

interface AdamStatus {
  running: boolean;
  autonomy_mode: 'observe' | 'propose' | 'autonomous';
  current_phase: string;
  cycle_count: number;
  current_goal: { title?: string; description?: string } | null;
  last_cycle_at: string | null;
  next_cycle_at: string | null;
  uptime_seconds: number;
  goals_in_queue: number;
  journal_entry_count: number;
  last_journal_entry: { timestamp?: string; entry_type?: string; summary?: string } | null;
}

interface LogLine {
  id: string;
  ts: number;
  level: 'info' | 'success' | 'error';
  text: string;
}

const fmtTime = (ts?: number) => (ts ? new Date(ts).toLocaleTimeString() : '—');
const fmtUptime = (s?: number) => {
  if (!s || s <= 0) return '—';
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${Math.floor(s % 60)}s`;
  return `${Math.floor(s)}s`;
};

// ─── Component ────────────────────────────────────────────────────────

const ControlPanel: React.FC = () => {
  const [aether, setAether] = useState<HealthState>({ status: 'unknown' });
  const [nexus, setNexus] = useState<HealthState>({ status: 'unknown' });
  const [adam, setAdam] = useState<AdamStatus | null>(null);
  const [adamError, setAdamError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const autoRefreshTimerRef = useRef<number | null>(null);

  const pushLog = useCallback((level: LogLine['level'], text: string) => {
    setLog((prev) => {
      const next = [
        ...prev,
        { id: `${Date.now()}-${Math.random()}`, ts: Date.now(), level, text },
      ];
      // Cap at 100 lines to keep the panel responsive.
      return next.length > 100 ? next.slice(-100) : next;
    });
  }, []);

  const setBusyFor = useCallback((key: string, value: boolean) => {
    setBusy((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ─── Health checks ────────────────────────────────────────────────

  const checkAether = useCallback(async () => {
    if (!isAiConfigured()) {
      setAether({
        status: 'red',
        detail: 'No AI endpoint configured. Open Settings → AI Provider.',
        lastCheckedAt: Date.now(),
      });
      pushLog('error', 'Aether: no endpoint configured in Settings.');
      return;
    }
    setBusyFor('aether', true);
    const t0 = performance.now();
    try {
      const result = await pingAiEndpoint();
      const ms = Math.round(performance.now() - t0);
      setAether({
        status: result.ok ? 'green' : 'red',
        latencyMs: ms,
        detail: result.message,
        lastCheckedAt: Date.now(),
      });
      pushLog(
        result.ok ? 'success' : 'error',
        `Aether ping: ${result.ok ? 'OK' : 'FAIL'} (${ms}ms) — ${result.message}`
      );
    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      const msg = err instanceof Error ? err.message : String(err);
      setAether({ status: 'red', latencyMs: ms, detail: msg, lastCheckedAt: Date.now() });
      pushLog('error', `Aether ping threw: ${msg}`);
    } finally {
      setBusyFor('aether', false);
    }
  }, [pushLog, setBusyFor]);

  const checkNexus = useCallback(async () => {
    setBusyFor('nexus', true);
    const t0 = performance.now();
    try {
      const res = await fetch(`${NEXUS_BASE_URL}/health`);
      const ms = Math.round(performance.now() - t0);
      if (!res.ok) {
        setNexus({
          status: 'red',
          latencyMs: ms,
          detail: `HTTP ${res.status}`,
          lastCheckedAt: Date.now(),
        });
        pushLog('error', `NEXUS /health: HTTP ${res.status} (${ms}ms)`);
        return;
      }
      const data = (await res.json()) as {
        status: string;
        dna_version?: string;
        uptime_seconds?: number;
      };
      setNexus({
        status: data.status === 'healthy' ? 'green' : 'yellow',
        latencyMs: ms,
        detail: `DNA ${data.dna_version ?? '?'} · up ${fmtUptime(data.uptime_seconds)}`,
        lastCheckedAt: Date.now(),
      });
      pushLog('success', `NEXUS /health: ${data.status} (${ms}ms)`);
    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      const msg = err instanceof Error ? err.message : String(err);
      setNexus({
        status: 'red',
        latencyMs: ms,
        detail: 'Unreachable. Is the backend running on :8000?',
        lastCheckedAt: Date.now(),
      });
      pushLog('error', `NEXUS /health threw: ${msg}`);
    } finally {
      setBusyFor('nexus', false);
    }
  }, [pushLog, setBusyFor]);

  const fetchAdam = useCallback(async () => {
    setBusyFor('adam', true);
    setAdamError(null);
    try {
      const res = await fetch(`${NEXUS_BASE_URL}/adam/status`);
      if (!res.ok) {
        setAdamError(`HTTP ${res.status}`);
        pushLog('error', `Adam status: HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as AdamStatus;
      setAdam(data);
      pushLog(
        'info',
        `Adam: mode=${data.autonomy_mode}, running=${data.running}, cycle=${data.cycle_count}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAdamError(msg);
      pushLog('error', `Adam status threw: ${msg}`);
    } finally {
      setBusyFor('adam', false);
    }
  }, [pushLog, setBusyFor]);

  const refreshAll = useCallback(async () => {
    await Promise.all([checkAether(), checkNexus()]);
    if (nexus.status !== 'red') await fetchAdam();
  }, [checkAether, checkNexus, fetchAdam, nexus.status]);

  // Auto-refresh loop.
  useEffect(() => {
    if (!autoRefresh) {
      if (autoRefreshTimerRef.current !== null) {
        window.clearInterval(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
      return;
    }
    autoRefreshTimerRef.current = window.setInterval(() => {
      void refreshAll();
    }, 5000);
    return () => {
      if (autoRefreshTimerRef.current !== null) {
        window.clearInterval(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    };
  }, [autoRefresh, refreshAll]);

  // First load.
  useEffect(() => {
    void refreshAll();
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Adam controls ────────────────────────────────────────────────

  const setAdamMode = useCallback(
    async (mode: 'observe' | 'propose' | 'autonomous') => {
      if (mode === 'autonomous') {
        const confirmed = window.confirm(
          'AUTONOMOUS mode lets Adam modify files on disk. Guardrails are active ' +
            '(3 files/cycle, verification required), but this is the highest-risk mode. Continue?'
        );
        if (!confirmed) {
          pushLog('info', 'Mode change to AUTONOMOUS cancelled.');
          return;
        }
      }
      setBusyFor('mode', true);
      try {
        const res = await fetch(`${NEXUS_BASE_URL}/adam/mode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        if (!res.ok) {
          pushLog('error', `Set mode: HTTP ${res.status}`);
          return;
        }
        pushLog('success', `Adam mode → ${mode.toUpperCase()}`);
        audioService.playSound('click');
        await fetchAdam();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pushLog('error', `Set mode threw: ${msg}`);
      } finally {
        setBusyFor('mode', false);
      }
    },
    [fetchAdam, pushLog, setBusyFor]
  );

  const nudgeAdam = useCallback(async () => {
    setBusyFor('nudge', true);
    try {
      const res = await fetch(`${NEXUS_BASE_URL}/adam/nudge`, { method: 'POST' });
      if (!res.ok) {
        pushLog('error', `Nudge: HTTP ${res.status}`);
        return;
      }
      pushLog('success', 'Nudged Adam — heartbeat triggered immediately.');
      audioService.playSound('send');
      // Give Adam a moment, then refetch.
      window.setTimeout(() => void fetchAdam(), 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog('error', `Nudge threw: ${msg}`);
    } finally {
      setBusyFor('nudge', false);
    }
  }, [fetchAdam, pushLog, setBusyFor]);

  // ─── Quick actions ───────────────────────────────────────────────

  const clearHubHistories = useCallback(() => {
    if (!window.confirm('Wipe all Hub chat histories (Aether, NEXUS)? This cannot be undone.')) {
      return;
    }
    try {
      localStorage.removeItem('hub-chat-aether');
      localStorage.removeItem('hub-chat-nexus');
      localStorage.removeItem('hub-chat-sfv');
      pushLog('success', 'Cleared Hub chat histories.');
    } catch (err) {
      pushLog('error', `Clear histories failed: ${err}`);
    }
  }, [pushLog]);

  const clearChatTabHistory = useCallback(() => {
    if (!window.confirm('Wipe the legacy Chat tab history?')) return;
    localStorage.removeItem('ai-chat-history');
    pushLog('success', 'Cleared Chat tab history.');
  }, [pushLog]);

  // ─── Render helpers ──────────────────────────────────────────────

  const StatusPill: React.FC<{ status: Health; label: string }> = ({ status, label }) => {
    const palette: Record<Health, string> = {
      unknown: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      green: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      yellow: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      red: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    };
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${palette[status]}`}
      >
        {label}
      </span>
    );
  };

  const Card: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
    title,
    subtitle,
    children,
  }) => (
    <div className="glass-panel rounded-2xl p-4 border border-white/10 bg-black/20">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide">{title}</h3>
          {subtitle && <p className="text-[10px] text-gray-500 uppercase tracking-widest">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );

  const ActionButton: React.FC<{
    onClick: () => void | Promise<void>;
    disabled?: boolean;
    busy?: boolean;
    label: string;
    hint?: string;
    tone?: 'default' | 'danger' | 'accent';
  }> = ({ onClick, disabled, busy: isBusy, label, hint, tone = 'default' }) => {
    const tones = {
      default: 'bg-black/30 border-white/10 text-gray-200 hover:border-white/30 hover:text-white',
      accent:
        'bg-fuchsia-500/15 border-fuchsia-400/40 text-fuchsia-200 hover:bg-fuchsia-500/25',
      danger: 'bg-rose-500/10 border-rose-400/30 text-rose-300 hover:bg-rose-500/20',
    };
    return (
      <button
        onClick={() => void onClick()}
        disabled={disabled || isBusy}
        title={hint}
        className={`
          px-3 py-2 rounded-lg text-xs font-medium border transition-all
          disabled:opacity-40 disabled:cursor-not-allowed
          ${tones[tone]}
        `}
      >
        {isBusy ? '…' : label}
      </button>
    );
  };

  // ─── Layout ──────────────────────────────────────────────────────

  const allHealthy = useMemo(
    () => aether.status === 'green' && nexus.status === 'green',
    [aether.status, nexus.status]
  );

  return (
    <div className="flex flex-col h-full bg-gray-800/30 overflow-y-auto">
      {/* Header */}
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 pb-3 border-b border-white/10 bg-black/30">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Control Panel</h2>
            <p className="text-[11px] text-gray-500">
              Operate and observe your systems. Every action logs to the event stream below.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`
                px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                ${
                  autoRefresh
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                    : 'bg-black/30 border-white/10 text-gray-400 hover:text-white'
                }
              `}
            >
              {autoRefresh ? 'Auto-refresh: ON' : 'Auto-refresh: OFF'}
            </button>
            <button
              onClick={() => void refreshAll()}
              className="px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 bg-black/30 text-gray-200 hover:text-white hover:border-white/30 transition-all"
            >
              Refresh now
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-grow p-4 md:p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Row 1: System Health */}
          <Card title="System Health" subtitle="Are the lights on?">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Aether */}
              <div className="rounded-xl border border-white/10 p-3 bg-black/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-white">Aether (local AI)</span>
                  <StatusPill status={aether.status} label={aether.status} />
                </div>
                <p className="text-[11px] text-gray-400 break-words">
                  {aether.detail ?? 'Not yet checked.'}
                </p>
                <p className="text-[10px] text-gray-500 mt-1">
                  {aether.latencyMs !== undefined ? `${aether.latencyMs} ms` : ''}
                  {aether.lastCheckedAt ? ` · ${fmtTime(aether.lastCheckedAt)}` : ''}
                </p>
                <div className="mt-3">
                  <ActionButton
                    label="Ping Aether"
                    onClick={checkAether}
                    busy={busy.aether}
                    hint="Sends a tiny test message via your configured AI endpoint."
                  />
                </div>
              </div>

              {/* NEXUS */}
              <div className="rounded-xl border border-white/10 p-3 bg-black/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-white">NEXUS-PRIME backend</span>
                  <StatusPill status={nexus.status} label={nexus.status} />
                </div>
                <p className="text-[11px] text-gray-400 break-words">
                  {nexus.detail ?? 'Not yet checked.'}
                </p>
                <p className="text-[10px] text-gray-500 mt-1">
                  {nexus.latencyMs !== undefined ? `${nexus.latencyMs} ms` : ''}
                  {nexus.lastCheckedAt ? ` · ${fmtTime(nexus.lastCheckedAt)}` : ''}
                </p>
                <div className="mt-3">
                  <ActionButton
                    label="Check NEXUS /health"
                    onClick={checkNexus}
                    busy={busy.nexus}
                    hint="Hits http://localhost:8000/health"
                  />
                </div>
              </div>
            </div>
            {!allHealthy && (
              <p className="text-[11px] text-amber-300/80 mt-3">
                One or more systems are offline. The Hub will fall back gracefully — non-green
                targets will return clean error messages in chat, not crashes.
              </p>
            )}
          </Card>

          {/* Row 2: Adam Control */}
          <Card title="Adam (NEXUS-PRIME autonomy)" subtitle="What is the daemon doing?">
            {nexus.status === 'red' || adamError ? (
              <p className="text-[12px] text-gray-400">
                Adam is unreachable while NEXUS is down. Start the backend (
                <code className="text-fuchsia-300">start.bat</code> in the NEXUS repo) and refresh.
                {adamError && <span className="block text-rose-300 mt-1">Reason: {adamError}</span>}
              </p>
            ) : !adam ? (
              <p className="text-[12px] text-gray-400">Loading Adam status…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <Stat label="Mode" value={adam.autonomy_mode.toUpperCase()} accent />
                  <Stat label="Phase" value={adam.current_phase} />
                  <Stat label="Cycle" value={String(adam.cycle_count)} />
                  <Stat label="Queue" value={String(adam.goals_in_queue)} />
                  <Stat label="Journal entries" value={String(adam.journal_entry_count)} />
                  <Stat label="Uptime" value={fmtUptime(adam.uptime_seconds)} />
                  <Stat
                    label="Last cycle"
                    value={adam.last_cycle_at ? new Date(adam.last_cycle_at).toLocaleTimeString() : '—'}
                  />
                  <Stat
                    label="Next cycle"
                    value={adam.next_cycle_at ? new Date(adam.next_cycle_at).toLocaleTimeString() : '—'}
                  />
                </div>

                {adam.current_goal?.title && (
                  <div className="rounded-lg border border-white/10 p-2 bg-black/30 mb-3">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500">
                      Current goal
                    </p>
                    <p className="text-[12px] text-gray-200 font-semibold">
                      {adam.current_goal.title}
                    </p>
                    {adam.current_goal.description && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        {adam.current_goal.description}
                      </p>
                    )}
                  </div>
                )}

                {adam.last_journal_entry?.summary && (
                  <div className="rounded-lg border border-white/10 p-2 bg-black/30 mb-3">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500">
                      Last journal entry
                      {adam.last_journal_entry.entry_type
                        ? ` · ${adam.last_journal_entry.entry_type}`
                        : ''}
                    </p>
                    <p className="text-[11px] text-gray-300 italic">
                      “{adam.last_journal_entry.summary}”
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    label="Mode: OBSERVE"
                    tone={adam.autonomy_mode === 'observe' ? 'accent' : 'default'}
                    onClick={() => setAdamMode('observe')}
                    busy={busy.mode}
                    hint="Safest mode. Adam scans and journals but never modifies files."
                  />
                  <ActionButton
                    label="Mode: PROPOSE"
                    tone={adam.autonomy_mode === 'propose' ? 'accent' : 'default'}
                    onClick={() => setAdamMode('propose')}
                    busy={busy.mode}
                    hint="Adam plans changes and writes proposals to the journal. Still does not execute."
                  />
                  <ActionButton
                    label="Mode: AUTONOMOUS"
                    tone={adam.autonomy_mode === 'autonomous' ? 'accent' : 'danger'}
                    onClick={() => setAdamMode('autonomous')}
                    busy={busy.mode}
                    hint="Full self-modification. Guardrails: 3 files/cycle, verification required, 5 evolutions/hour."
                  />
                  <div className="w-px h-6 bg-white/10 mx-1 self-center" />
                  <ActionButton
                    label="Nudge Adam"
                    tone="accent"
                    onClick={nudgeAdam}
                    busy={busy.nudge}
                    hint="Force an immediate heartbeat cycle instead of waiting for the 5-min timer."
                  />
                  <ActionButton
                    label="Refresh status"
                    onClick={fetchAdam}
                    busy={busy.adam}
                    hint="Re-fetch /adam/status."
                  />
                </div>
              </>
            )}
          </Card>

          {/* Row 3: Quick Actions */}
          <Card title="Quick Actions" subtitle="Housekeeping you can do safely">
            <div className="flex flex-wrap gap-2">
              <ActionButton
                label="Clear Hub histories"
                tone="danger"
                onClick={clearHubHistories}
                hint="Wipes the Aether + NEXUS + SF-V chat histories stored in localStorage."
              />
              <ActionButton
                label="Clear legacy Chat tab"
                tone="danger"
                onClick={clearChatTabHistory}
                hint="Wipes the older Chat tab's history (separate from the Hub)."
              />
            </div>
            <p className="text-[10px] text-gray-500 mt-3">
              Server-side state (Adam's journal, NEXUS sessions) is not touched by these — they
              clear only browser-local data.
            </p>
          </Card>

          {/* Row 4: Event log */}
          <Card title="Event Log" subtitle="Every action you take shows up here">
            <div className="rounded-lg border border-white/10 bg-black/40 p-2 max-h-64 overflow-y-auto font-mono text-[11px]">
              {log.length === 0 && (
                <p className="text-gray-500 italic">Quiet. Click anything above to see it logged here.</p>
              )}
              {log
                .slice()
                .reverse()
                .map((line) => {
                  const tones = {
                    info: 'text-gray-300',
                    success: 'text-emerald-300',
                    error: 'text-rose-300',
                  };
                  return (
                    <div key={line.id} className={`flex gap-2 ${tones[line.level]}`}>
                      <span className="text-gray-500 shrink-0">{fmtTime(line.ts)}</span>
                      <span className="break-words">{line.text}</span>
                    </div>
                  );
                })}
            </div>
            <button
              onClick={() => setLog([])}
              className="text-[10px] text-gray-500 hover:text-gray-300 mt-2"
            >
              Clear log
            </button>
          </Card>

          {/* Learning panel */}
          <details className="glass-panel rounded-2xl border border-white/10 bg-black/20">
            <summary className="cursor-pointer p-4 text-sm font-bold text-white tracking-wide select-none">
              📚 Learning Panel — click to expand
            </summary>
            <div className="px-4 pb-4 text-[12px] text-gray-300 space-y-4 leading-relaxed">
              <section>
                <h4 className="text-fuchsia-300 font-semibold mb-1">What is this control panel?</h4>
                <p>
                  A safe place to operate and observe the two systems you've wired up. Buttons here
                  cause real things to happen on your machine — checking health, switching Adam's
                  autonomy mode, forcing a heartbeat. Everything you click is logged to the Event
                  Log so you can see the cause and effect.
                </p>
              </section>

              <section>
                <h4 className="text-fuchsia-300 font-semibold mb-1">What does Adam do?</h4>
                <p>
                  Adam is the autonomous persona of the NEXUS-PRIME backend. He runs a 5-minute
                  heartbeat loop: scan the codebase, generate goals, plan, optionally execute,
                  verify, journal. He lives at <code>localhost:8000</code> and exposes his state
                  through <code>/adam/status</code>, <code>/adam/journal</code>,{' '}
                  <code>/adam/goals</code>. The Control Panel reads and writes these.
                </p>
              </section>

              <section>
                <h4 className="text-fuchsia-300 font-semibold mb-1">Autonomy modes, explained</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    <strong className="text-emerald-300">OBSERVE</strong> — Adam reads, scans,
                    creates goals, journals. Does <em>not</em> plan or execute. The safest mode and
                    the default.
                  </li>
                  <li>
                    <strong className="text-amber-300">PROPOSE</strong> — Adam also plans. He
                    drafts proposed fixes and writes them to the journal for you to review.
                    Nothing changes on disk.
                  </li>
                  <li>
                    <strong className="text-rose-300">AUTONOMOUS</strong> — Adam plans and
                    executes. Guardrails are active (max 3 files/cycle, max 5 evolutions/hour,
                    verification required, $0.05 cost cap), but this is the highest-risk mode and
                    you'll be asked to confirm before switching to it.
                  </li>
                </ul>
              </section>

              <section>
                <h4 className="text-fuchsia-300 font-semibold mb-1">
                  How do I know if something is broken?
                </h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    Click <em>Refresh now</em>. If both pills go green, you're healthy.
                  </li>
                  <li>
                    If <em>Aether</em> is red, open Settings → AI Provider. Confirm{' '}
                    <code>aiBaseUrl</code> points at a running OpenAI-compatible endpoint
                    (LM Studio on <code>:1234</code> by default).
                  </li>
                  <li>
                    If <em>NEXUS</em> is red, run <code>start.bat</code> in the NEXUS-PRIME
                    repository, or just start the backend half: it listens on{' '}
                    <code>localhost:8000</code>.
                  </li>
                  <li>
                    Watch the Event Log. Errors land there in red and usually tell you what's
                    wrong.
                  </li>
                </ol>
              </section>

              <section>
                <h4 className="text-fuchsia-300 font-semibold mb-1">Glossary</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    <strong>Aether Shunt</strong> — this app, the front end / hub.
                  </li>
                  <li>
                    <strong>NEXUS-PRIME</strong> — the FastAPI backend that hosts Adam.
                  </li>
                  <li>
                    <strong>Adam</strong> — the autonomous persona running in NEXUS-PRIME.
                  </li>
                  <li>
                    <strong>LM Studio</strong> — local LLM server, typically on{' '}
                    <code>localhost:1234</code>. Provides Adam's brain and Aether's default
                    completion endpoint.
                  </li>
                  <li>
                    <strong>Heartbeat</strong> — Adam's recurring async loop. 5 min default.
                  </li>
                  <li>
                    <strong>Nudge</strong> — manually trigger a heartbeat cycle right now instead
                    of waiting.
                  </li>
                  <li>
                    <strong>DNA</strong> — NEXUS-PRIME's versioned config / routing rules. Shown
                    in the health check as <code>dna_version</code>.
                  </li>
                </ul>
              </section>

              <section>
                <h4 className="text-fuchsia-300 font-semibold mb-1">Suggested practice drills</h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Click "Ping Aether" twice. Watch latency in the event log.</li>
                  <li>
                    Stop LM Studio. Click "Ping Aether" again. See the red status and the clean
                    error. Restart LM Studio, re-ping, see green.
                  </li>
                  <li>
                    Switch Adam from OBSERVE → PROPOSE. Click "Nudge Adam". Wait ~10 seconds, hit
                    "Refresh status". You should see <em>cycle</em> tick up by one.
                  </li>
                  <li>
                    Open the Hub, send a message to NEXUS. Come back here, click "Refresh status"
                    — you'll see Adam's journal entry count increase if your message triggered
                    activity.
                  </li>
                  <li>
                    Toggle Auto-refresh on for 30 seconds. Watch Adam's cycle count update on its
                    own. Toggle it off when you're done — polling consumes a small bit of resource.
                  </li>
                </ol>
              </section>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

// ─── Tiny presentational helper ───────────────────────────────────────

const Stat: React.FC<{ label: string; value: string; accent?: boolean }> = ({
  label,
  value,
  accent,
}) => (
  <div className="rounded-lg border border-white/10 p-2 bg-black/30">
    <p className="text-[10px] uppercase tracking-widest text-gray-500">{label}</p>
    <p
      className={`text-[13px] font-bold ${
        accent ? 'text-fuchsia-300' : 'text-gray-100'
      } truncate`}
      title={value}
    >
      {value}
    </p>
  </div>
);

export default ControlPanel;
