// components/nexus/Journal.tsx
//
// Adam's journal — paginated, filterable viewer over GET /adam/journal.
// Each entry is one of: observation, goal_created, plan, action, result,
// reflection, idle, error, wakeup.
//
// Schema (from backend/adam/models.py JournalEntry):
//   { id, timestamp, entry_type, title, content, related_goal_id?,
//     related_files[], cycle_number?, metrics? }

import React, { useCallback, useEffect, useMemo, useState } from 'react';

const NEXUS_BASE_URL =
  (typeof window !== 'undefined' && (window as { __NEXUS_BASE_URL__?: string }).__NEXUS_BASE_URL__) ||
  'http://localhost:8000';

const ENTRY_TYPES = [
  'all',
  'observation',
  'goal_created',
  'plan',
  'action',
  'result',
  'reflection',
  'idle',
  'error',
  'wakeup',
] as const;
type EntryType = (typeof ENTRY_TYPES)[number];

interface JournalEntry {
  id: string;
  timestamp: string;
  entry_type: string;
  title: string;
  content: string;
  related_goal_id?: string | null;
  related_files?: string[];
  cycle_number?: number | null;
  metrics?: Record<string, unknown> | null;
}

const TYPE_PALETTE: Record<string, string> = {
  observation: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
  goal_created: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/40',
  plan: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  action: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40',
  result: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  reflection: 'bg-purple-500/15 text-purple-300 border-purple-400/30',
  idle: 'bg-gray-500/15 text-gray-400 border-gray-400/20',
  error: 'bg-rose-500/15 text-rose-300 border-rose-400/40',
  wakeup: 'bg-teal-500/15 text-teal-300 border-teal-400/30',
};

const PAGE_SIZE = 50;

const fmt = (iso: string) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const Journal: React.FC = () => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [filterType, setFilterType] = useState<EntryType>('all');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchEntries = useCallback(
    async (nextOffset: number, type: EntryType) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(nextOffset));
        if (type !== 'all') params.set('entry_type', type);
        const res = await fetch(`${NEXUS_BASE_URL}/adam/journal?${params.toString()}`);
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          setEntries([]);
          return;
        }
        const data = (await res.json()) as JournalEntry[];
        setEntries(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchEntries(offset, filterType);
  }, [fetchEntries, offset, filterType]);

  const onFilterChange = useCallback((t: EntryType) => {
    setFilterType(t);
    setOffset(0);
  }, []);

  const canPageBack = offset > 0;
  const canPageForward = entries.length === PAGE_SIZE;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entries) c[e.entry_type] = (c[e.entry_type] ?? 0) + 1;
    return c;
  }, [entries]);

  return (
    <div className="flex flex-col h-full bg-gray-800/30 overflow-y-auto">
      {/* Header */}
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 pb-3 border-b border-white/10 bg-black/30">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Adam · Journal</h2>
            <p className="text-[11px] text-gray-500">
              Adam's own words about what he saw, planned, did, and learned. Page {offset / PAGE_SIZE + 1}.
            </p>
          </div>
          <button
            onClick={() => void fetchEntries(offset, filterType)}
            className="px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 bg-black/30 text-gray-200 hover:text-white hover:border-white/30 transition-all"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex-shrink-0 px-4 md:px-6 py-3 border-b border-white/5 bg-black/10">
        <div className="max-w-5xl mx-auto flex flex-wrap gap-1.5">
          {ENTRY_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => onFilterChange(t)}
              className={`
                px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider border transition-all
                ${
                  filterType === t
                    ? 'bg-fuchsia-500/20 border-fuchsia-400/60 text-fuchsia-200'
                    : 'bg-black/30 border-white/10 text-gray-400 hover:text-white hover:border-white/30'
                }
              `}
            >
              {t}
              {counts[t] !== undefined && (
                <span className="ml-1 opacity-60">·{counts[t]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-grow p-4 md:p-6">
        <div className="max-w-5xl mx-auto space-y-2">
          {error && (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              Could not read journal: {error}. Is NEXUS-PRIME running on{' '}
              <code>localhost:8000</code>?
            </div>
          )}

          {!error && entries.length === 0 && !loading && (
            <div className="rounded-lg border border-white/10 p-4 text-sm text-gray-400 bg-black/20">
              No entries for this filter. {filterType !== 'all' && 'Try widening to "all".'}
            </div>
          )}

          {entries.map((e) => {
            const isOpen = !!expanded[e.id];
            const palette = TYPE_PALETTE[e.entry_type] ?? 'bg-black/20 text-gray-400 border-white/10';
            return (
              <div
                key={e.id}
                className="rounded-lg border border-white/10 bg-black/20 p-3 hover:border-white/20 transition-all"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${palette}`}
                  >
                    {e.entry_type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-sm font-semibold text-white truncate">{e.title}</h3>
                      <span className="shrink-0 text-[10px] text-gray-500 font-mono">
                        {fmt(e.timestamp)}
                      </span>
                    </div>
                    <p
                      className={`text-[12px] text-gray-300 mt-1 whitespace-pre-wrap cursor-pointer ${
                        isOpen ? '' : 'line-clamp-3'
                      }`}
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [e.id]: !isOpen }))
                      }
                    >
                      {e.content}
                    </p>
                    {(e.cycle_number || e.related_goal_id || (e.related_files?.length ?? 0) > 0) && (
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-500 font-mono">
                        {e.cycle_number !== null && e.cycle_number !== undefined && (
                          <span>cycle {e.cycle_number}</span>
                        )}
                        {e.related_goal_id && <span>goal {e.related_goal_id}</span>}
                        {(e.related_files ?? []).map((f) => (
                          <span key={f} className="truncate max-w-[200px]">
                            📄 {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {(canPageBack || canPageForward) && (
          <div className="max-w-5xl mx-auto mt-4 flex items-center justify-between">
            <button
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              disabled={!canPageBack || loading}
              className="px-3 py-1.5 rounded-lg text-xs border border-white/10 bg-black/30 text-gray-200 hover:border-white/30 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              ← Newer
            </button>
            <span className="text-[10px] text-gray-500 font-mono">
              offset {offset} · showing {entries.length}
            </span>
            <button
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              disabled={!canPageForward || loading}
              className="px-3 py-1.5 rounded-lg text-xs border border-white/10 bg-black/30 text-gray-200 hover:border-white/30 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Older →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Journal;
