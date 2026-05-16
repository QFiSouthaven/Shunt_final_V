"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { ExplainAction } from "@/components/ai/ExplainAction";

interface ReplayResult {
  ok: boolean;
  httpStatus: number;
  error?: string;
}

export function DLQReplayAction({ id, onComplete }: { id: string, onComplete?: () => void }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReplayResult | null>(null);

  const handleAction = async () => {
    if (step === 0) {
      setStep(1);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/dlq/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error || `HTTP ${res.status}`;
        setResult({ ok: false, httpStatus: res.status, error: msg });
        throw new Error(msg);
      }
      setResult({ ok: true, httpStatus: res.status });
      setStep(0);
      onComplete?.();
    } catch (e: any) {
      setError(e.message);
      setStep(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1 min-w-[160px]">
      <Button
        variant={step === 0 ? "outline" : "default"}
        size="sm"
        onClick={handleAction}
        disabled={loading}
        className={`h-7 px-2 text-[10px] uppercase font-bold tracking-wider ${
          step === 1 ? "bg-amber-600 text-white hover:bg-amber-500 border-transparent shadow-[0_0_10px_-2px_rgba(217,119,6,0.8)]" : "border-slate-800 text-slate-400 bg-transparent hover:bg-slate-800"
        }`}
      >
        <RotateCcw className="w-3 h-3 mr-1.5" />
        {loading ? "..." : step === 0 ? "Replay" : "Confirm"}
      </Button>
      {error && <div className="text-[9px] text-rose-500 max-w-[100px] text-right truncate">{error}</div>}
      {result && (
        <ExplainAction
          action="DLQ Replay"
          inputContext={{ envelopeId: id }}
          result={result}
          mode="auto"
          className="w-full"
        />
      )}
    </div>
  );
}
