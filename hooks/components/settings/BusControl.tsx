// components/settings/BusControl.tsx
//
// Operator-facing control panel for the hub-bus orchestrator. Polls the
// orchestrator's HTTP admin face on http://127.0.0.1:7779 (started by
// `npm run bus:start` or `node hub-bus-tools/orchestrator.mjs`).
//
// What this can do:
//   - Live status: which children are running, restart counts, last error
//   - Per-child start/stop/restart via the existing /start/:name etc routes
//
// What this CAN'T do (intentional): start the orchestrator itself. The browser
// can't spawn a node process. When the orchestrator is down, this shows a
// "Bus is not running" state with a copy-to-clipboard PowerShell command so
// the operator can launch it with one paste.
//
// Refresh cadence: 5s when running, 8s when down (less aggressive when nothing
// is going to change without operator action).

import React, { useCallback, useEffect, useRef, useState } from 'react';

const ORCH_BASE_URL = 'http://127.0.0.1:7779';
const POLL_INTERVAL_UP_MS = 5000;
const POLL_INTERVAL_DOWN_MS = 8000;

// Wire format from orchestrator's /status endpoint (hub-bus-tools/orchestrator.mjs
// ChildSupervisor.toJSON). Field names are snake_case to match the existing
// consumers (aether-shunt-hub, cockpit) — don't rename here.
interface ChildStatus {
  name: string;
  state: 'running' | 'restarting' | 'permanently_failed' | 'stopped';
  pid: number | null;
  restarts: number;
  max_restarts: number;
  restart_due_at: string | null;
  started_at: string | null;
  last_exit_code: number | null;
  last_exit_signal: string | null;
  last_error: string | null;
  manually_stopped: boolean;
  required: boolean;
  color: string | null;
}

interface OrchStatus {
  ok: boolean;
  children: ChildStatus[];
}

const LAUNCH_COMMAND =
  'cd C:\\Users\\Falki\\shunt-final-v; npm run bus:start';

function relativeUptime(startedAtIso: string | null): string {
  if (!startedAtIso) return '—';
  const t = Date.parse(startedAtIso);
  if (Number.isNaN(t)) return '—';
  const secs = Math.floor((Date.now() - t) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

const STATE_COLORS: Record<ChildStatus['state'], string> = {
  running: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30',
  restarting: 'text-amber-300 bg-amber-500/10 border-amber-400/30',
  permanently_failed: 'text-rose-300 bg-rose-500/10 border-rose-400/30',
  stopped: 'text-gray-400 bg-gray-500/10 border-gray-500/30',
};

const BusControl: React.FC = () => {
  const [status, setStatus] = useState<OrchStatus | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null); // null = initial, before first poll
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInflight, setActionInflight] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      // AbortController with a 2s budget — the orchestrator is loopback-only;
      // anything slower than 2s means it's wedged or down.
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch(`${ORCH_BASE_URL}/status`, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) {
        setReachable(false);
        return;
      }
      const data = (await res.json()) as OrchStatus;
      setStatus(data);
      setReachable(true);
    } catch {
      setReachable(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const schedule = () => {
      const interval = reachable ? POLL_INTERVAL_UP_MS : POLL_INTERVAL_DOWN_MS;
      timerRef.current = window.setTimeout(async () => {
        await fetchStatus();
        schedule();
      }, interval);
    };
    schedule();
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchStatus, reachable]);

  const childAction = async (name: string, verb: 'start' | 'stop' | 'restart') => {
    setActionError(null);
    setActionInflight(`${verb}:${name}`);
    try {
      const res = await fetch(`${ORCH_BASE_URL}/${verb}/${encodeURIComponent(name)}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        setActionError(`${verb} ${name} → HTTP ${res.status}${txt ? `: ${txt.slice(0, 120)}` : ''}`);
      }
      await fetchStatus();
    } catch (e) {
      setActionError(`${verb} ${name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionInflight(null);
    }
  };

  const copyLaunchCommand = async () => {
    try {
      await navigator.clipboard.writeText(LAUNCH_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setActionError('Clipboard write was blocked. Copy the command manually.');
    }
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
      <h3 className="font-semibold text-lg text-gray-200 mb-1">Hub Bus</h3>
      <p className="text-xs text-gray-500 mb-4">
        Multi-LLM coordination layer for Pattern Z. The bus must be running for
        the aggregator on :7780 to handle button fan-out.
      </p>

      {reachable === null && (
        <p className="text-sm text-gray-400">Probing {ORCH_BASE_URL}…</p>
      )}

      {reachable === false && (
        <div className="space-y-3">
          <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-300">
            Bus is not running. The orchestrator's HTTP admin face on{' '}
            <code className="font-mono text-xs">{ORCH_BASE_URL}</code> isn't responding.
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">
              Start it from a terminal
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-xs font-mono text-gray-200 overflow-x-auto whitespace-nowrap">
                {LAUNCH_COMMAND}
              </code>
              <button
                onClick={() => void copyLaunchCommand()}
                className="px-3 py-2 text-xs font-semibold rounded-md bg-fuchsia-500/20 border border-fuchsia-400/60 text-fuchsia-100 hover:bg-fuchsia-500/30"
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-2">
              The browser can't launch processes directly. Paste this into PowerShell.
              The page will detect the bus within ~8s once it's up.
            </p>
          </div>
        </div>
      )}

      {reachable === true && status && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Orchestrator running · {status.children.length} child{status.children.length === 1 ? '' : 'ren'}
            </span>
            <button
              onClick={() => void fetchStatus()}
              className="text-[11px] text-gray-400 hover:text-white"
            >
              Refresh
            </button>
          </div>

          <div className="space-y-1.5">
            {status.children.map((c) => {
              const stateClass = STATE_COLORS[c.state] ?? STATE_COLORS.stopped;
              const isStopped = c.state === 'stopped' || c.state === 'permanently_failed';
              const restartLabel = actionInflight === `restart:${c.name}` ? '…' : 'Restart';
              const stopLabel = actionInflight === `stop:${c.name}` ? '…' : 'Stop';
              const startLabel = actionInflight === `start:${c.name}` ? '…' : 'Start';
              return (
                <div
                  key={c.name}
                  className="flex items-center gap-2 text-xs bg-black/20 border border-white/5 rounded px-2 py-1.5"
                >
                  <span className="font-mono w-44 truncate text-gray-200" title={c.name}>
                    {c.name}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wider font-mono ${stateClass}`}
                  >
                    {c.state}
                  </span>
                  <span className="text-gray-500 font-mono w-20">
                    pid {c.pid ?? '—'}
                  </span>
                  <span className="text-gray-500 w-20">↻ {c.restarts}</span>
                  <span className="text-gray-500 w-20">{relativeUptime(c.started_at)}</span>
                  <span className="flex-1" />
                  {isStopped ? (
                    <button
                      onClick={() => void childAction(c.name, 'start')}
                      disabled={actionInflight !== null}
                      className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 text-[10px] hover:bg-emerald-500/25 disabled:opacity-40"
                    >
                      {startLabel}
                    </button>
                  ) : (
                    <button
                      onClick={() => void childAction(c.name, 'stop')}
                      disabled={actionInflight !== null}
                      className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-400/40 text-rose-200 text-[10px] hover:bg-rose-500/25 disabled:opacity-40"
                    >
                      {stopLabel}
                    </button>
                  )}
                  <button
                    onClick={() => void childAction(c.name, 'restart')}
                    disabled={actionInflight !== null}
                    className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/40 text-amber-200 text-[10px] hover:bg-amber-500/25 disabled:opacity-40"
                  >
                    {restartLabel}
                  </button>
                </div>
              );
            })}
          </div>

          {status.children.some((c) => c.last_error) && (
            <details className="text-[11px] text-gray-400">
              <summary className="cursor-pointer hover:text-white">Recent errors</summary>
              <ul className="mt-2 space-y-1">
                {status.children
                  .filter((c) => c.last_error)
                  .map((c) => (
                    <li key={c.name} className="font-mono">
                      <span className="text-gray-500">{c.name}:</span> {c.last_error}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {actionError && (
        <p className="mt-3 text-xs text-rose-300">{actionError}</p>
      )}
    </div>
  );
};

export default BusControl;
