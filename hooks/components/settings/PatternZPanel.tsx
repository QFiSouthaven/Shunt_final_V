// components/settings/PatternZPanel.tsx
//
// Pattern Z bus-participants panel rendered inside Settings.
// Reads / writes hub-bus/participants.json via the aggregator's HTTP face
// at :7780. The aggregator owns the config; this UI is just a view + form.
// Toggling a peer or changing a model and saving triggers a server-side
// reconcile of orchestrator bridges within ~5s.
//
// The enable/strategy/timeout toggles use the AppSettings React context
// (persisted to localStorage under 'ai-shunt-settings'). aiService reads
// the same localStorage key on every dispatch — single source of truth.

import React, { useCallback, useEffect, useState } from 'react';
import { useSettings } from '@/styles/services/context/SettingsContext';

const AGGREGATOR_BASE_URL = 'http://127.0.0.1:7780';

interface LmsSlot {
  jid: string;
  model: string | null;
  enabled: boolean;
}

interface ExtPeer {
  jid: string;
  enabled: boolean;
}

interface Participants {
  version: number;
  updated_at?: string;
  updated_by?: string;
  lm_studio_slots: LmsSlot[];
  external_peers: ExtPeer[];
}

const PatternZPanel: React.FC = () => {
  const { settings, updateSetting } = useSettings();

  const [participants, setParticipants] = useState<Participants | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [pRes, mRes] = await Promise.all([
        fetch(`${AGGREGATOR_BASE_URL}/participants`),
        fetch(`${AGGREGATOR_BASE_URL}/lmstudio-models`),
      ]);
      if (!pRes.ok) throw new Error(`participants HTTP ${pRes.status}`);
      const p = (await pRes.json()) as Participants;
      setParticipants(p);
      if (mRes.ok) {
        const m = await mRes.json();
        const ids = Array.isArray(m?.data)
          ? m.data.map((x: { id?: string }) => x.id).filter(Boolean) as string[]
          : [];
        setAvailableModels(ids);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!participants) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${AGGREGATOR_BASE_URL}/participants`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(participants),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedAt(Date.now());
      // Re-load to reflect any server-side normalization
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [participants, load]);

  const setSlot = useCallback(
    (idx: number, patch: Partial<LmsSlot>) => {
      setParticipants((prev) => {
        if (!prev) return prev;
        const next = { ...prev, lm_studio_slots: [...prev.lm_studio_slots] };
        next.lm_studio_slots[idx] = { ...next.lm_studio_slots[idx], ...patch };
        return next;
      });
    },
    []
  );

  const setPeer = useCallback(
    (idx: number, patch: Partial<ExtPeer>) => {
      setParticipants((prev) => {
        if (!prev) return prev;
        const next = { ...prev, external_peers: [...prev.external_peers] };
        next.external_peers[idx] = { ...next.external_peers[idx], ...patch };
        return next;
      });
    },
    []
  );

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
      <h3 className="font-semibold text-lg text-gray-200 mb-1">
        Pattern Z — Multi-LLM bus dispatch
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        When enabled, action buttons can fan out to multiple LLMs via the
        aggregator and synthesize a joint output. Per-button strategy is
        chosen in <code className="text-gray-400">patternZStrategies.ts</code>;
        the default strategy below is used as a fallback.
      </p>

      {/* Master toggle + strategy + timeout */}
      <div className="space-y-3 mb-5">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-gray-300 text-sm">
            Enable Pattern Z bus dispatch
          </span>
          <input
            type="checkbox"
            checked={settings.patternZEnabled}
            onChange={(e) =>
              updateSetting('patternZEnabled', e.target.checked)
            }
            className="h-4 w-4 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500"
          />
        </label>

        <div>
          <label htmlFor="patternZStrategy" className="block text-sm font-medium text-gray-400">
            Default strategy
          </label>
          <select
            id="patternZStrategy"
            value={settings.patternZStrategy}
            onChange={(e) =>
              updateSetting(
                'patternZStrategy',
                e.target.value as 'vote' | 'pick-best' | 'synthesize'
              )
            }
            className="mt-1 w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-200 font-mono text-sm"
          >
            <option value="synthesize">synthesize (LLM merges all candidates)</option>
            <option value="pick-best">pick-best (longest coherent)</option>
            <option value="vote">vote (most common; v1 falls back to pick-best)</option>
          </select>
        </div>

        <div>
          <label htmlFor="patternZTimeoutMs" className="block text-sm font-medium text-gray-400">
            Timeout (ms)
          </label>
          <input
            type="number"
            id="patternZTimeoutMs"
            min={5000}
            max={300000}
            step={1000}
            value={settings.patternZTimeoutMs}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(n) && n > 0) {
                updateSetting('patternZTimeoutMs', n);
              }
            }}
            className="mt-1 w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-200 font-mono text-sm"
          />
        </div>
      </div>

      {/* Participants — fetched from aggregator */}
      <div className="border-t border-gray-700/50 pt-4">
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">
          Bus participants (saved to aggregator)
        </p>

        {error && (
          <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-300 mb-3">
            Aggregator unreachable: {error}. Start the bus (`npm run bus:start`) and reload.
          </div>
        )}

        {!participants && !error && (
          <p className="text-sm text-gray-400">Loading…</p>
        )}

        {participants && (
          <>
            <div className="mb-3">
              <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">
                LM Studio slots
              </p>
              {participants.lm_studio_slots.map((slot, i) => (
                <div key={slot.jid} className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={slot.enabled}
                    onChange={(e) => setSlot(i, { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500"
                  />
                  <span className="text-xs text-gray-300 font-mono w-28 shrink-0">
                    {slot.jid}
                  </span>
                  <select
                    value={slot.model ?? ''}
                    onChange={(e) => setSlot(i, { model: e.target.value || null })}
                    className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 font-mono"
                  >
                    <option value="">(unset — slot won't participate)</option>
                    {availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {availableModels.length === 0 && (
                <p className="text-[10px] text-gray-500 mt-1">
                  No LM Studio models loaded — start LM Studio and reload.
                </p>
              )}
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">
                External peers
              </p>
              {participants.external_peers.map((peer, i) => (
                <label key={peer.jid} className="flex items-center gap-2 mb-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={peer.enabled}
                    onChange={(e) => setPeer(i, { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500"
                  />
                  <span className="text-xs text-gray-300 font-mono">{peer.jid}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => void save()}
                disabled={saving}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-fuchsia-600 text-white hover:bg-fuchsia-500 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving…' : 'Save participants'}
              </button>
              <button
                onClick={() => void load()}
                disabled={saving}
                className="text-xs text-gray-400 hover:text-white"
              >
                Reload
              </button>
              {savedAt && (
                <span className="text-[10px] text-emerald-400">
                  Saved {new Date(savedAt).toLocaleTimeString()} — bridges
                  reconcile within ~5s
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PatternZPanel;
