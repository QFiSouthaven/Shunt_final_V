"use client";

import { useEffect, useState, useCallback } from "react";
import { Sparkles, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

interface Props {
  action: string;
  inputContext: unknown;
  result: unknown;
  // 'auto': fire as soon as result is non-null; 'manual': require button click.
  mode?: "auto" | "manual";
  className?: string;
}

export function ExplainAction({ action, inputContext, result, mode = "manual", className = "" }: Props) {
  const [annotation, setAnnotation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);

  const fire = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAnnotation(null);
    try {
      const res = await fetch("/api/ai/annotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, inputContext, result }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `AI annotation failed (${res.status})`);
      } else {
        setAnnotation(json.annotation || "(empty response)");
      }
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [action, inputContext, result]);

  useEffect(() => {
    if (mode === "auto" && result !== null && result !== undefined && !loading && annotation === null && error === null) {
      fire();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, mode]);

  const hasContent = annotation !== null || error !== null || loading;

  if (!hasContent && mode === "manual") {
    return (
      <button
        type="button"
        onClick={fire}
        className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-400 transition-colors px-2.5 py-1 rounded ${className}`}
      >
        <Sparkles className="w-3 h-3" />
        Explain
      </button>
    );
  }

  return (
    <div className={`mt-2 border border-amber-500/20 rounded bg-amber-500/5 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-widest text-amber-400/80 hover:text-amber-300"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          AI annotation
        </span>
        <span className="flex items-center gap-2">
          {!loading && (annotation || error) && (
            <RefreshCw
              className="w-3 h-3 hover:text-amber-300"
              onClick={(e) => {
                e.stopPropagation();
                fire();
              }}
            />
          )}
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 text-xs leading-relaxed text-slate-300">
          {loading && <span className="italic text-slate-500">Analyzing…</span>}
          {error && <span className="text-rose-400">[{error}]</span>}
          {annotation && <p className="whitespace-pre-wrap">{annotation}</p>}
        </div>
      )}
    </div>
  );
}
