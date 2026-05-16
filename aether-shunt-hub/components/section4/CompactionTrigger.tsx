"use client";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Trash2 } from "lucide-react";
import { ExplainAction } from "@/components/ai/ExplainAction";

interface CompactResult {
  status: "success" | "failed" | "error";
  httpStatus?: number;
  errorMessage?: string;
}

export function CompactionTrigger() {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState("");
  const [dryRunRes, setDryRunRes] = useState<any>(null);
  const [result, setResult] = useState<CompactResult | null>(null);
  const [lastDryRun, setLastDryRun] = useState<boolean | null>(null);

  const handleCompact = async (dryRun: boolean) => {
    setStatus(dryRun ? "dry-running..." : "compacting...");
    setResult(null);
    setLastDryRun(dryRun);
    try {
      const res = await fetch("/api/admin/compact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun })
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        if (dryRun) setDryRunRes(data);
        else setStep(0);
        setResult({ status: "success", httpStatus: res.status });
      } else {
        setStatus("error: " + data.error);
        setResult({ status: "failed", httpStatus: res.status, errorMessage: data?.error });
      }
    } catch (e: any) {
      setStatus("error");
      setResult({ status: "error", errorMessage: e?.message ?? "unknown" });
    }
  };

  return (
    <Card className="bg-[#0a0a0c] h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Trash2 className="h-4 w-4" />
          Compaction
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex-1">
        <div className="flex flex-col gap-4">
          <div className="text-xs text-slate-400">
            Reclaims space from dropped and deleted envelopes.
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleCompact(true)} className="bg-slate-800 text-slate-300 hover:bg-slate-700 px-4 py-2 rounded text-xs transition-all">
              DRY RUN
            </button>
            {step === 0 ? (
               <button onClick={() => setStep(1)} className="bg-rose-900/30 text-rose-400 border border-rose-900/50 hover:bg-rose-900/50 px-4 py-2 rounded text-xs font-bold transition-all">
                 RUN COMPACTION
               </button>
            ) : (
               <button onClick={() => handleCompact(false)} className="bg-rose-600 text-white hover:bg-rose-500 px-4 py-2 rounded text-xs font-bold transition-all shadow-md shadow-rose-900/20">
                 CONFIRM RUN
               </button>
            )}
          </div>
          {status && <div className="text-xs font-mono text-slate-500">Status: {status}</div>}
          {dryRunRes && (
            <div className="p-2 rounded bg-black/40 border border-slate-800 text-[10px] font-mono text-slate-400">
              <pre>{JSON.stringify(dryRunRes, null, 2)}</pre>
            </div>
          )}
          {result && (
            <div className="w-full">
              <ExplainAction
                action="Transcript Compaction"
                inputContext={{
                  trigger: "operator",
                  endpoint: "/api/admin/compact",
                  dryRun: lastDryRun ?? undefined,
                }}
                result={result}
                mode="auto"
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
