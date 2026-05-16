// components/nexus/Evolution.tsx
//
// Evolution engine controls. This page IS DANGEROUS — /evolution/mutate
// modifies files on disk and /evolution/rollback restores them from backups.
// Both flows confirm explicitly before firing.
//
// Endpoints:
//   GET  /evolution/backups?target_path=X          → { backups: [...] }
//   POST /evolution/rollback { target_path, backup_id }
//   POST /evolution/mutate   { target_path, instruction, test_command? }

import React, { useCallback, useState } from 'react';

const NEXUS_BASE_URL =
  (typeof window !== 'undefined' && (window as { __NEXUS_BASE_URL__?: string }).__NEXUS_BASE_URL__) ||
  'http://localhost:8000';

interface Backup {
  backup_id?: string;
  id?: string;
  timestamp?: string;
  size_bytes?: number;
  [k: string]: unknown;
}

interface MutateResult {
  status?: string;
  message?: string;
  backup_id?: string;
  test_passed?: boolean;
  [k: string]: unknown;
}

const fmtBytes = (n?: number) => {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const fmtTime = (iso?: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const Evolution: React.FC = () => {
  const [targetPath, setTargetPath] = useState('');
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  // Mutate form
  const [mutateInstruction, setMutateInstruction] = useState('');
  const [mutateTestCmd, setMutateTestCmd] = useState('');
  const [mutating, setMutating] = useState(false);

  const pushLog = useCallback((s: string) => {
    setLog((prev) => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${s}`]);
  }, []);

  const fetchBackups = useCallback(async () => {
    if (!targetPath.trim()) {
      setBackups([]);
      return;
    }
    setLoadingBackups(true);
    setError(null);
    try {
      const res = await fetch(
        `${NEXUS_BASE_URL}/evolution/backups?target_path=${encodeURIComponent(targetPath.trim())}`
      );
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        setBackups([]);
        return;
      }
      const data = (await res.json()) as { backups?: Backup[] };
      setBackups(Array.isArray(data?.backups) ? data.backups : []);
      pushLog(`Loaded ${data?.backups?.length ?? 0} backups for ${targetPath.trim()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBackups([]);
    } finally {
      setLoadingBackups(false);
    }
  }, [targetPath, pushLog]);

  const rollback = useCallback(
    async (backup: Backup) => {
      const bId = backup.backup_id ?? backup.id ?? '';
      if (!bId || !targetPath.trim()) return;
      const ok = window.confirm(
        `Restore "${targetPath.trim()}" to backup "${bId}"?\n\nThis OVERWRITES the current file on disk.`
      );
      if (!ok) return;
      try {
        const res = await fetch(`${NEXUS_BASE_URL}/evolution/rollback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_path: targetPath.trim(), backup_id: bId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          pushLog(`Rollback OK → ${bId}`);
        } else {
          pushLog(`Rollback FAIL HTTP ${res.status}: ${JSON.stringify(data)}`);
        }
        await fetchBackups();
      } catch (err) {
        pushLog(`Rollback threw: ${err}`);
      }
    },
    [targetPath, fetchBackups, pushLog]
  );

  const mutate = useCallback(async () => {
    if (!targetPath.trim() || !mutateInstruction.trim()) return;
    const ok = window.confirm(
      `EVOLVE "${targetPath.trim()}" — this asks Adam's LLM to modify the file based on your instruction.\n\n` +
        `A backup is created first; if the optional test command fails, rollback is automatic. ` +
        `Verify your test command is correct before continuing.\n\nProceed?`
    );
    if (!ok) return;
    setMutating(true);
    try {
      const res = await fetch(`${NEXUS_BASE_URL}/evolution/mutate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_path: targetPath.trim(),
          instruction: mutateInstruction.trim(),
          test_command: mutateTestCmd.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as MutateResult;
      if (res.ok) {
        pushLog(
          `Mutate ${data.status ?? '?'} · backup ${data.backup_id ?? '?'} · test_passed=${
            data.test_passed ?? '?'
          }`
        );
      } else {
        pushLog(`Mutate FAIL HTTP ${res.status}: ${JSON.stringify(data)}`);
      }
      await fetchBackups();
    } catch (err) {
      pushLog(`Mutate threw: ${err}`);
    } finally {
      setMutating(false);
    }
  }, [targetPath, mutateInstruction, mutateTestCmd, fetchBackups, pushLog]);

  return (
    <div className="flex flex-col h-full bg-gray-800/30 overflow-y-auto">
      {/* Header */}
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 pb-3 border-b border-white/10 bg-black/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-lg font-bold text-white">Evolution</h2>
          <p className="text-[11px] text-gray-500">
            Manual access to NEXUS's self-modification primitives. Both flows modify files on disk
            and ask for confirmation.
          </p>
        </div>
      </div>

      <div className="flex-grow p-4 md:p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Warning */}
          <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-[12px] text-amber-200">
            <strong>Heads up.</strong> "Evolve" asks the LLM to rewrite the target file based on your
            instruction. "Rollback" overwrites the current file with a chosen backup. Both are
            irreversible without another rollback. Use OBSERVE mode in the Control Panel if you'd
            rather Adam not do this on his own.
          </div>

          {/* Path selector */}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500">
              Target file path
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
                placeholder="backend/adam/curiosity.py"
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-500 focus:border-fuchsia-400/60 outline-none"
              />
              <button
                onClick={() => void fetchBackups()}
                disabled={!targetPath.trim() || loadingBackups}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-black/30 border border-white/10 text-gray-200 hover:border-white/30 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loadingBackups ? 'Loading…' : 'Load backups'}
              </button>
            </div>
            <p className="text-[10px] text-gray-500">
              Path is relative to the NEXUS-PRIME repo root.
            </p>
          </div>

          {/* Backups list */}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-bold text-white mb-2">Backups</h3>
            {error && (
              <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-2 text-[11px] text-rose-300 mb-2">
                {error}
              </div>
            )}
            {backups.length === 0 ? (
              <p className="text-[12px] text-gray-500 italic">
                {targetPath.trim()
                  ? 'No backups for that path (or path not found).'
                  : 'Enter a target file path above and click "Load backups".'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {backups.map((b, i) => {
                  const bId = b.backup_id ?? b.id ?? `?${i}`;
                  return (
                    <div
                      key={bId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-[12px] text-white font-mono truncate">{bId}</p>
                        <p className="text-[10px] text-gray-500">
                          {fmtTime(b.timestamp)} · {fmtBytes(b.size_bytes)}
                        </p>
                      </div>
                      <button
                        onClick={() => void rollback(b)}
                        className="shrink-0 px-2 py-1 text-[10px] rounded border border-amber-400/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                      >
                        Rollback to this
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mutate form */}
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/5 p-4 space-y-2">
            <h3 className="text-sm font-bold text-white">Evolve (mutate this file)</h3>
            <p className="text-[11px] text-gray-400">
              Adam's evolution engine reads the file, the LLM proposes a change, the engine writes
              the file, runs your test command (if given), and rolls back automatically if the test
              fails. A backup is always created before the change.
            </p>
            <textarea
              value={mutateInstruction}
              onChange={(e) => setMutateInstruction(e.target.value)}
              placeholder="Instruction — what should the file do differently? Be specific (e.g. 'Add an `is_recent` helper that returns True when timestamp is within 24h.')"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-rose-400/60 outline-none min-h-[80px] resize-y"
              disabled={mutating}
            />
            <input
              type="text"
              value={mutateTestCmd}
              onChange={(e) => setMutateTestCmd(e.target.value)}
              placeholder="Test command (optional but STRONGLY recommended, e.g. pytest tests/test_journal.py)"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-500 focus:border-rose-400/60 outline-none"
              disabled={mutating}
            />
            <div className="flex items-center justify-end">
              <button
                onClick={() => void mutate()}
                disabled={mutating || !targetPath.trim() || !mutateInstruction.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-rose-500/20 border border-rose-400/60 text-rose-100 hover:bg-rose-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {mutating ? 'Evolving…' : 'Evolve'}
              </button>
            </div>
          </div>

          {/* Event log */}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-white">Event log</h3>
              {log.length > 0 && (
                <button
                  onClick={() => setLog([])}
                  className="text-[10px] text-gray-500 hover:text-gray-300"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="rounded-lg border border-white/10 bg-black/40 p-2 max-h-48 overflow-y-auto font-mono text-[11px] text-gray-300">
              {log.length === 0 ? (
                <p className="text-gray-500 italic">Quiet.</p>
              ) : (
                log
                  .slice()
                  .reverse()
                  .map((line, i) => <div key={i}>{line}</div>)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Evolution;
