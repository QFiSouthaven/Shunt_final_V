'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import { SystemEntry, defaultRegistry } from '@/lib/systemRegistry';
import { eventBus } from '@/lib/eventBus';

export type HealthStatus = 'unknown' | 'running' | 'error' | 'starting' | 'stopped';

export interface SystemState {
  status: HealthStatus;
  latency?: number;
  lastChecked?: number;
  version?: string;
  error?: string;
  rawJson?: unknown;
}

interface HealthContextType {
  systems: SystemEntry[];
  setSystems: React.Dispatch<React.SetStateAction<SystemEntry[]>>;
  addSystem: (system: SystemEntry) => void;
  removeSystem: (id: string) => void;
  healthStates: Record<string, SystemState>;
  startSystem: (id: string) => void;
  stopSystem: (id: string) => void;
  startAllSystems: () => void;
  forceRefreshSystem: (id: string) => Promise<void>;
  selectedSystemId: string | null;
  setSelectedSystemId: (id: string | null) => void;
}

const HealthContext = createContext<HealthContextType | undefined>(undefined);

const POLL_INTERVAL_MS = 10_000;
const CUSTOM_SYSTEMS_KEY = 'customSystems';

/**
 * Forward a health check through the server-side proxy at /api/proxy.
 * This bypasses CORS because the Node runtime performs the actual fetch.
 *
 * Returns the normalized shape the route emits:
 *   { ok, status, latencyMs, body, error? }
 */
async function proxiedHealthCheck(targetUrl: string): Promise<{
  ok: boolean;
  status: number;
  latencyMs?: number;
  body?: unknown;
  error?: string;
}> {
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return { ok: false, status: res.status, error: `proxy HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      ok: boolean;
      status: number;
      latencyMs?: number;
      body?: unknown;
      error?: string;
    };
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      error: isAbort ? 'proxy timeout' : err instanceof Error ? err.message : String(err),
    };
  }
}

export function HealthProvider({ children }: { children: ReactNode }) {
  const [systems, setSystems] = useState<SystemEntry[]>(defaultRegistry);
  const [healthStates, setHealthStates] = useState<Record<string, SystemState>>({});
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);

  // Refs so the single stable poll interval can read current state without
  // re-mounting whenever state changes. Updating a ref is synchronous and
  // does NOT trigger re-render.
  const systemsRef = useRef(systems);
  const statesRef = useRef(healthStates);

  useEffect(() => {
    systemsRef.current = systems;
  }, [systems]);

  useEffect(() => {
    statesRef.current = healthStates;
  }, [healthStates]);

  // ───────────────────────────────────────────────────────────────────
  // Load custom systems from localStorage on mount.
  // ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(CUSTOM_SYSTEMS_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as SystemEntry[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setSystems((prev) => [...prev, ...parsed]);
      }
    } catch (e) {
      console.error('Failed to parse custom systems', e);
    }
  }, []);

  // Initialize state for newly added systems.
  useEffect(() => {
    setHealthStates((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const sys of systems) {
        if (!next[sys.id]) {
          next[sys.id] = { status: 'stopped' };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [systems]);

  // Persist user-added systems on change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const defaultIds = new Set(defaultRegistry.map((s) => s.id));
    const customSystems = systems.filter((s) => !defaultIds.has(s.id));
    localStorage.setItem(CUSTOM_SYSTEMS_KEY, JSON.stringify(customSystems));
  }, [systems]);

  // ───────────────────────────────────────────────────────────────────
  // Polling loop — single stable interval, empty deps array.
  // Reads current state via refs to avoid the closure-staleness trap.
  // `tickInFlightRef` prevents overlapping ticks when the proxy is slow or
  // the registry grows beyond what a single 10s window can comfortably poll.
  // A skipped tick is the right behavior here — better than racing on
  // setHealthStates.
  //
  // ⚠ DO NOT add `systems` or `healthStates` to this effect's deps array.
  // Doing so re-mounts the interval on every state change (the bug we just
  // fixed). The refs above are how we read current state safely. See
  // COWORK_HANDOFF_2026-05-11.md §7.5 #5.
  // ───────────────────────────────────────────────────────────────────
  const tickInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const pollOne = async (sys: SystemEntry) => {
      const current = statesRef.current[sys.id];
      if (!current || current.status === 'stopped') return;
      if (!sys.url || !sys.healthPath) return; // simulated systems stay as-is

      const target = sys.url.replace(/\/$/, '') + sys.healthPath;
      const result = await proxiedHealthCheck(target);
      if (cancelled) return;

      const wasRunning = current.status === 'running';
      const nowRunning = result.ok;

      setHealthStates((prev) => ({
        ...prev,
        [sys.id]: {
          ...prev[sys.id],
          status: nowRunning ? 'running' : 'error',
          latency: result.latencyMs,
          lastChecked: Date.now(),
          rawJson: result.body,
          error: nowRunning ? undefined : result.error ?? `HTTP ${result.status}`,
        },
      }));

      // Edge-triggered eventBus emissions (only on state transitions).
      if (!wasRunning && nowRunning) {
        eventBus.emit(sys.id, 'info', 'System is now responsive', result.body);
      } else if (wasRunning && !nowRunning) {
        eventBus.emit(
          sys.id,
          'warn',
          `Health check failed: ${result.error ?? `HTTP ${result.status}`}`
        );
      }
    };

    const tick = async () => {
      if (tickInFlightRef.current) return; // skip if previous tick still running
      tickInFlightRef.current = true;
      try {
        // Fire all polls in parallel — they share no state.
        await Promise.allSettled(systemsRef.current.map(pollOne));
      } finally {
        tickInFlightRef.current = false;
      }
    };

    // Kick off immediately so the first cycle isn't 10s in the dark.
    void tick();
    const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []); // empty deps — interval is created once, refs handle freshness

  // ───────────────────────────────────────────────────────────────────
  // Imperative actions
  // ───────────────────────────────────────────────────────────────────

  const addSystem = useCallback((system: SystemEntry) => {
    setSystems((prev) => [...prev, system]);
    eventBus.emit('system', 'info', `Added new integration: ${system.name}`);
  }, []);

  const removeSystem = useCallback((id: string) => {
    setSystems((prev) => prev.filter((s) => s.id !== id));
    eventBus.emit('system', 'info', `Removed integration: ${id}`);
  }, []);

  const startSystem = useCallback(async (id: string) => {
    const sys = systemsRef.current.find((s) => s.id === id);
    if (!sys) return;

    setHealthStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], status: 'starting', error: undefined },
    }));
    eventBus.emit(id, 'info', `Starting ${sys.name}…`);

    // Try the launcher daemon first (real spawn).
    let daemonStarted = false;
    try {
      const res = await fetch('http://localhost:7778/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, cmd: sys.startCmd }),
      });
      if (res.ok) {
        daemonStarted = true;
        eventBus.emit(id, 'info', 'Sent start command to launcher daemon');
      }
    } catch {
      /* daemon not running — fall through to manual mode */
    }

    if (!daemonStarted) {
      // Manual mode: copy the command to the clipboard for the user to paste.
      if (sys.startCmd) {
        try {
          await navigator.clipboard.writeText(sys.startCmd);
          eventBus.emit(id, 'info', `Copied start command to clipboard: ${sys.startCmd}`);
        } catch {
          eventBus.emit(id, 'warn', `Clipboard copy failed; start command: ${sys.startCmd}`);
        }
      }
    }

    // Systems without a health URL can't be verified by the poller (pollOne
    // returns early when !sys.url). Advance to 'running' after a short delay
    // so the UI doesn't stick at 'starting' forever — applies in BOTH daemon
    // and manual modes. Without this, the hub-relay mock tile (no URL) hangs
    // in 'starting' whenever the daemon is up.
    if (!sys.url) {
      setTimeout(() => {
        setHealthStates((prev) => ({
          ...prev,
          [id]: { ...prev[id], status: 'running' },
        }));
        eventBus.emit(
          sys.id,
          'info',
          `${sys.name} is now running (simulated — no health URL)`
        );
      }, 2000);
    }
  }, []);

  const stopSystem = useCallback(async (id: string) => {
    const sys = systemsRef.current.find((s) => s.id === id);
    setHealthStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], status: 'stopped', latency: undefined },
    }));
    eventBus.emit(id, 'info', `Stopped ${sys?.name ?? id}`);

    try {
      await fetch('http://localhost:7778/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch {
      /* daemon not running; UI-only stop */
    }
  }, []);

  const forceRefreshSystem = useCallback(async (id: string) => {
    const sys = systemsRef.current.find((s) => s.id === id);
    if (!sys || !sys.url || !sys.healthPath) return;

    const target = sys.url.replace(/\/$/, '') + sys.healthPath;
    const result = await proxiedHealthCheck(target);

    setHealthStates((prev) => ({
      ...prev,
      [sys.id]: {
        ...prev[sys.id],
        status: result.ok ? 'running' : 'error',
        latency: result.latencyMs,
        lastChecked: Date.now(),
        rawJson: result.body,
        error: result.ok ? undefined : result.error ?? `HTTP ${result.status}`,
      },
    }));
  }, []);

  const startAllSystems = useCallback(() => {
    eventBus.emit('system', 'info', 'Initiating sequence start for all systems…');
    const states = statesRef.current;
    // Fire in registry order; topological dep-sort is in systemRegistry if you
    // want to enforce strict order later.
    for (const s of systemsRef.current) {
      if (states[s.id]?.status !== 'running') {
        void startSystem(s.id);
      }
    }
  }, [startSystem]);

  return (
    <HealthContext.Provider
      value={{
        systems,
        setSystems,
        addSystem,
        removeSystem,
        healthStates,
        startSystem,
        stopSystem,
        startAllSystems,
        forceRefreshSystem,
        selectedSystemId,
        setSelectedSystemId,
      }}
    >
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth() {
  const context = useContext(HealthContext);
  if (!context) throw new Error('useHealth must be used within HealthProvider');
  return context;
}
