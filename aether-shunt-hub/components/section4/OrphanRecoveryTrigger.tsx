"use client";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { HeartPulse } from "lucide-react";
import { ExplainAction } from "@/components/ai/ExplainAction";

interface RecoverResult {
  status: "success" | "failed" | "error";
  httpStatus?: number;
  errorMessage?: string;
}

export function OrphanRecoveryTrigger() {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<RecoverResult | null>(null);

  const handleRecover = async () => {
    setStatus("recovering...");
    setResult(null);
    try {
      const res = await fetch("/api/admin/orphan-recover", { method: "POST" });
      if (res.ok) {
        setStatus("success");
        setResult({ status: "success", httpStatus: res.status });
      } else {
        setStatus("failed");
        setResult({ status: "failed", httpStatus: res.status });
      }
    } catch (e: any) {
      setStatus("error");
      setResult({ status: "error", errorMessage: e?.message ?? "unknown" });
    }
    setStep(0);
  };

  return (
    <Card className="bg-[#0a0a0c] h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <HeartPulse className="h-4 w-4" />
          Orphan Recovery
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex-1">
        <div className="flex flex-col items-start gap-4">
          <div className="text-xs text-slate-400">
            Triggers a system-wide sweep for orphaned processes and attempts to recover or terminate them safely.
          </div>
          {step === 0 ? (
             <button onClick={() => setStep(1)} className="bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/30 px-4 py-2 rounded text-xs font-bold transition-all">
               INITIATE RECOVERY
             </button>
          ) : (
             <button onClick={handleRecover} className="bg-emerald-600 text-white hover:bg-emerald-500 px-4 py-2 rounded text-xs font-bold transition-all">
               CONFIRM RECOVERY
             </button>
          )}
          {status && <div className="text-xs font-mono text-slate-500 mt-2">Status: {status}</div>}
          {result && (
            <div className="w-full">
              <ExplainAction
                action="Orphan Recovery sweep"
                inputContext={{ trigger: "operator", endpoint: "/api/admin/orphan-recover" }}
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
