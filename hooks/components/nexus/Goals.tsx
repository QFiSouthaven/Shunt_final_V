// components/nexus/Goals.tsx
//
// Goal queue viewer + human goal injection.
//
// Endpoints:
//   GET  /adam/goals?status=X            → List[Goal]
//   POST /adam/goals { title, description, priority, verification_command? }
//   POST /adam/goals/{id}/complete { outcome }
//   POST /adam/goals/{id}/fail     { reason }

import React, { useCallback, useEffect, useMemo, useState } from 'react';

const NEXUS_BASE_URL =
  (typeof window !== 'undefined' && (window as { __NEXUS_BASE_URL__?: string }).__NEXUS_BASE_URL__) ||
  'http://localhost:8000';

interface Goal {
  id: string;
  title: string;
  description: string;
  source: string;
  priority: number;
  status: string;
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  outcome_summary?: string | null;
  files_changed?: string[];
  attempts?: number;
  max_attempts?: number;
  estimated_effort?: string;
  verification_command?: string | null;
}

const STATUS_FILTERS = ['all', 'pending', 'in_progress', 'completed', 'failed'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_PALETTE: Record<string, string> = {
  pending: 'bg-gray-500/15 text-gray-300 border-gray-400/30',
  in_progress: 'bg-amber-500/20 text-amber-200 border-amber-400/50',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  failed: 'bg-rose-500/15 text-rose-300 border-rose-400/40',
};

const SOURCE_LABEL: Record<string, string> = {
  curiosity: 'curiosity scan',
  error_pattern: 'error pattern',
  performance: 'performance',
  scheduled: 'scheduled',
  user_injected: 'human',
  todo_file: 'TODO file',
};

const fmt = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const Goals: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Injection form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(0.7);
  const [verCmd, setVerCmd] = useState('');
  const [injecting, setInjecting] = useState(false);
  const [injectMsg, setInjectMsg] = useState<string | null>(null);

  const fetchGoals = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const url =
        status === 'all'
          ? `${NEXUS_BASE_URL}/adam/goals`
          : `${NEXUS_BASE_URL}/adam/goals?status=${encodeURIComponent(status)}`;
      const res = await fetch(url);
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        setGoals([]);
        return;
      }
      const data = (await res.json()) as Goal[];
      setGoals(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGoals(statusFilter);
  }, [fetchGoals, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of goals) c[g.status] = (c[g.status] ?? 0) + 1;
    return c;
  }, [goals]);

  const sortedGoals = useMemo(
    () =>
      [...goals].sort((a, b) => {
        // pending/in_progress first, then by priority desc
        const aActive = a.status === 'pending' || a.status === 'in_progress';
        const bActive = b.status === 'pending' || b.status === 'in_progress';
        if (aActive !== bActive) return aActive ? -1 : 1;
        return (b.priority ?? 0) - (a.priority ?? 0);
      }),
    [goals]
  );

  const inject = useCallback(async () => {
    if (!title.trim() || !description.trim()) {
      setInjectMsg('Title and description are required.');
      return;
    }
    setInjecting(true);
    setInjectMsg(null);
    try {
      const res = await fetch(`${NEXUS_BASE_URL}/adam/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priority,
          verification_command: verCmd.trim() || null,
        }),
      });
      if (!res.ok) {
        setInjectMsg(`Inject failed: HTTP ${res.status}`);
        return;
      }
      const g = (await res.json()) as Goal;
      setInjectMsg(`Injected goal ${g.id} — "${g.title}"`);
      setTitle('');
      setDescription('');
      setVerCmd('');
      await fetchGoals(statusFilter);
    } catch (err) {
      setInjectMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setInjecting(false);
    }
  }, [title, description, priority, verCmd, fetchGoals, statusFilter]);

  const completeGoal = useCallback(
    async (g: Goal) => {
      const outcome = window.prompt(`Outcome summary for "${g.title}"?`, 'Completed manually.');
      if (outcome === null) return;
      const res = await fetch(`${NEXUS_BASE_URL}/adam/goals/${encodeURIComponent(g.id)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      });
      if (res.ok) await fetchGoals(statusFilter);
    },
    [fetchGoals, statusFilter]
  );

  const failGoal = useCallback(
    async (g: Goal) => {
      const reason = window.prompt(`Reason for failing "${g.title}"?`, 'Cancelled manually.');
      if (reason === null) return;
      const res = await fetch(`${NEXUS_BASE_URL}/adam/goals/${encodeURIComponent(g.id)}/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) await fetchGoals(statusFilter);
    },
    [fetchGoals, statusFilter]
  );

  return (
    <div className="flex flex-col h-full bg-gray-800/30 overflow-y-auto">
      {/* Header */}
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 pb-3 border-b border-white/10 bg-black/30">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Adam · Goals</h2>
            <p className="text-[11px] text-gray-500">
              Self-generated, scheduled, error-driven, and human-injected goals. Inject below.
            </p>
          </div>
          <button
            onClick={() => void fetchGoals(statusFilter)}
            className="px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 bg-black/30 text-gray-200 hover:text-white hover:border-white/30 transition-all"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex-grow p-4 md:p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Inject form */}
          <div className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/5 p-4">
            <h3 className="text-sm font-bold text-white mb-2">Inject a goal</h3>
            <p className="text-[11px] text-gray-400 mb-3">
              Adam will pick it up on the next heartbeat. Set priority high (close to 1.0) to bump it
              ahead of self-generated work.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (e.g. Add CSV export to dashboard)"
                className="md:col-span-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-fuchsia-400/60 outline-none"
                disabled={injecting}
              />
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-widest text-gray-500">
                  Priority
                </label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={priority}
                  onChange={(e) => setPriority(Number.parseFloat(e.target.value) || 0)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-fuchsia-400/60 outline-none"
                  disabled={injecting}
                />
              </div>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description — what Adam should do, in his terms. Be specific."
              className="mt-2 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-fuchsia-400/60 outline-none min-h-[80px] resize-y"
              disabled={injecting}
            />
            <input
              type="text"
              value={verCmd}
              onChange={(e) => setVerCmd(e.target.value)}
              placeholder="Verification command (optional, e.g. pytest tests/test_dashboard.py)"
              className="mt-2 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-500 focus:border-fuchsia-400/60 outline-none"
              disabled={injecting}
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-[11px] text-gray-400">{injectMsg}</span>
              <button
                onClick={() => void inject()}
                disabled={injecting || !title.trim() || !description.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-fuchsia-500/20 border border-fuchsia-400/60 text-fuchsia-100 hover:bg-fuchsia-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {injecting ? 'Injecting…' : 'Inject goal'}
              </button>
            </div>
          </div>

          {/* Status filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`
                  px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider border transition-all
                  ${
                    statusFilter === s
                      ? 'bg-fuchsia-500/20 border-fuchsia-400/60 text-fuchsia-200'
                      : 'bg-black/30 border-white/10 text-gray-400 hover:text-white hover:border-white/30'
                  }
                `}
              >
                {s}
                {counts[s] !== undefined && <span className="ml-1 opacity-60">·{counts[s]}</span>}
              </button>
            ))}
          </div>

          {/* List */}
          {error && (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              Could not read goals: {error}. Is NEXUS-PRIME running on{' '}
              <code>localhost:8000</code>?
            </div>
          )}

          {!error && goals.length === 0 && !loading && (
            <div className="rounded-lg border border-white/10 p-4 text-sm text-gray-400 bg-black/20">
              No goals for this filter.
            </div>
          )}

          <div className="space-y-2">
            {sortedGoals.map((g) => {
              const statusPal = STATUS_PALETTE[g.status] ?? 'bg-black/20 text-gray-400 border-white/10';
              const isActive = g.status === 'pending' || g.status === 'in_progress';
              return (
                <div
                  key={g.id}
                  className="rounded-lg border border-white/10 bg-black/20 p-3 hover:border-white/20 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${statusPal}`}
                    >
                      {g.status}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-sm font-semibold text-white truncate">{g.title}</h3>
                        <span className="shrink-0 text-[10px] text-gray-500 font-mono">
                          prio {g.priority.toFixed(2)} · {SOURCE_LABEL[g.source] ?? g.source}
                        </span>
                      </div>
                      <p className="text-[12px] text-gray-300 mt-1 whitespace-pre-wrap">
                        {g.description}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-500 font-mono">
                        <span>id {g.id}</span>
                        <span>created {fmt(g.created_at)}</span>
                        {g.started_at && <span>started {fmt(g.started_at)}</span>}
                        {g.completed_at && <span>finished {fmt(g.completed_at)}</span>}
                        {g.attempts !== undefined && (
                          <span>
                            attempts {g.attempts}/{g.max_attempts ?? 3}
                          </span>
                        )}
                        {g.estimated_effort && <span>effort {g.estimated_effort}</span>}
                      </div>
                      {g.outcome_summary && (
                        <p className="mt-2 text-[11px] text-gray-400 italic">
                          Outcome: {g.outcome_summary}
                        </p>
                      )}
                      {g.verification_command && (
                        <p className="mt-1 text-[11px] text-amber-300/80 font-mono">
                          $ {g.verification_command}
                        </p>
                      )}
                    </div>
                    {isActive && (
                      <div className="shrink-0 flex flex-col gap-1">
                        <button
                          onClick={() => void completeGoal(g)}
                          className="px-2 py-1 text-[10px] rounded border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => void failGoal(g)}
                          className="px-2 py-1 text-[10px] rounded border border-rose-400/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                        >
                          Fail
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Goals;
