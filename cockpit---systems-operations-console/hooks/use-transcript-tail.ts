'use client';

import * as React from 'react';

// Envelope summaries written by hub-bus bridges. Body is a TRUNCATED preview;
// the full envelope lives at hub-bus/inbox/<jid>/<id>.json. A future
// GET /envelope/:id can resolve that on row-click — out of scope for v1.
export interface TranscriptRow {
  id?: string;
  ts?: string | number;
  from?: string;
  to?: string;
  kind?: string;
  body?: string;
  [k: string]: unknown;
}

interface TranscriptTailResponse {
  path?: string;
  lines: TranscriptRow[];
  note?: string;
}

interface UseTranscriptTailResult {
  rows: TranscriptRow[];
  loading: boolean;
  error: string | null;
  daemonDown: boolean;
  refresh: () => void;
}

const LAUNCHER_URL = 'http://127.0.0.1:7778';
const DEFAULT_POLL_MS = 3000;

export function useTranscriptTail(
  n: number = 50,
  pollMs: number = DEFAULT_POLL_MS
): UseTranscriptTailResult {
  const [rows, setRows] = React.useState<TranscriptRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [daemonDown, setDaemonDown] = React.useState(false);

  const tickRef = React.useRef(0);
  const tick = React.useCallback(() => {
    tickRef.current += 1;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchTail = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${LAUNCHER_URL}/transcript/tail?n=${n}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as TranscriptTailResponse;
        if (cancelled) return;
        setRows(Array.isArray(json.lines) ? json.lines : []);
        setError(null);
        setDaemonDown(false);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        // Network error (TypeError: Failed to fetch) usually = daemon offline.
        setDaemonDown(msg.toLowerCase().includes('fetch'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const loop = () => {
      fetchTail().finally(() => {
        if (!cancelled) timer = setTimeout(loop, pollMs);
      });
    };

    loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // tickRef.current is the manual refresh trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, pollMs, tickRef.current]);

  return { rows, loading, error, daemonDown, refresh: tick };
}
