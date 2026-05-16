"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { ExplainAction } from "@/components/ai/ExplainAction";

interface DiscardResult {
  ok: boolean;
  httpStatus: number;
  error?: string;
}

export function DLQDiscardAction({ id, onComplete }: { id: string, onComplete?: () => void }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmValue, setConfirmValue] = useState("");
  const [result, setResult] = useState<DiscardResult | null>(null);

  const handleAction = async () => {
    if (step === 0) {
      setStep(1);
      return;
    }

    if (confirmValue !== id) {
      setError("ID mismatch");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/dlq/discard", {
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

  if (step === 1) {
    return (
      <div className="flex items-center gap-2">
        <Input 
          className="h-7 w-32 text-[10px] bg-slate-900 border-rose-900 text-rose-200"
          placeholder="Type ID to discard" 
          value={confirmValue}
          onChange={e => setConfirmValue(e.target.value)}
        />
        <Button
          variant="destructive"
          size="sm"
          onClick={handleAction}
          disabled={loading || confirmValue !== id}
          className="h-7 px-2 text-[10px] uppercase font-bold tracking-wider bg-rose-900 hover:bg-rose-800 text-rose-200"
        >
          {loading ? "..." : "Confirm"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStep(0)}
          className="h-7 px-2 text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300"
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 min-w-[160px]">
      <Button
        variant="outline"
        size="sm"
        onClick={handleAction}
        className="h-7 px-2 text-[10px] uppercase font-bold tracking-wider border-slate-800 text-slate-400 bg-transparent hover:bg-rose-950/30 hover:text-rose-400 hover:border-rose-900"
      >
        <Trash2 className="w-3 h-3 mr-1.5" />
        Discard
      </Button>
      {error && <div className="text-[9px] text-rose-500 max-w-[100px] text-right truncate">{error}</div>}
      {result && (
        <ExplainAction
          action="DLQ Discard"
          inputContext={{ envelopeId: id }}
          result={result}
          mode="auto"
          className="w-full"
        />
      )}
    </div>
  );
}
