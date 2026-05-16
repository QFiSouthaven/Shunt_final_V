"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bomb, AlertTriangle } from "lucide-react";
import { ExplainAction } from "@/components/ai/ExplainAction";

interface PurgeResult {
  ok: boolean;
  httpStatus: number;
  error?: string;
  purgedCount?: number;
  olderThanDays: number;
}

export function BulkDLQPurge() {
  const [days, setDays] = useState("30");
  const [step, setStep] = useState(0);
  const [confirmValue, setConfirmValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<PurgeResult | null>(null);

  const handleAction = async () => {
    if (step === 0) {
      setStep(1);
      return;
    }

    if (confirmValue !== days) {
      setStatus("Number mismatch");
      return;
    }

    const olderThanDays = parseInt(days, 10);
    setLoading(true);
    setStatus(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/dlq/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ olderThanDays }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || `HTTP ${res.status}`;
        setResult({ ok: false, httpStatus: res.status, error: msg, olderThanDays });
        throw new Error(msg);
      }
      setResult({
        ok: true,
        httpStatus: res.status,
        purgedCount: typeof data.purgedCount === "number" ? data.purgedCount : undefined,
        olderThanDays,
      });
      setStep(0);
      setConfirmValue("");
      setStatus("Purge successful");
    } catch (e: any) {
      setStatus(e.message);
      setStep(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-rose-950/20 border-rose-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-rose-500 uppercase tracking-widest flex items-center gap-2">
          <Bomb className="h-4 w-4" />
          Bulk Purge
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {step === 0 ? (
          <div className="flex items-end gap-4">
            <div className="space-y-1 flex-1 sm:max-w-[200px]">
              <label className="text-[10px] text-slate-500 uppercase">Older than (Days)</label>
              <Input
                type="number"
                value={days}
                onChange={e => setDays(e.target.value)}
                min="0"
                className="h-8 bg-black/40 border-slate-800 text-slate-300 font-mono text-xs"
              />
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleAction}
              className="h-8 text-xs uppercase font-bold tracking-wider bg-rose-900 hover:bg-rose-800 text-rose-200"
            >
              Start Purge
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-wider bg-rose-950/50 p-2 rounded">
              <AlertTriangle className="h-4 w-4" />
              <span>Permanent action. Type "{days}" to confirm.</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Input
                value={confirmValue}
                onChange={e => setConfirmValue(e.target.value)}
                className="h-8 w-24 bg-black/40 border-rose-900 text-rose-300 font-mono text-xs text-center"
                placeholder={days}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleAction}
                  disabled={loading || confirmValue !== days}
                  className="h-8 text-xs uppercase font-bold tracking-wider bg-rose-600 hover:bg-rose-500 shadow-[0_0_15px_-3px_rgba(225,29,72,0.5)]"
                >
                  {loading ? "..." : "CONFIRM PURGE"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setStep(0); setConfirmValue(""); }}
                  className="h-8 text-xs uppercase tracking-wider text-slate-500 hover:text-slate-300"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {status && (
          <div className={`mt-4 text-xs font-mono ${status.includes('success') ? 'text-emerald-500' : 'text-rose-500'}`}>
            {status}
          </div>
        )}

        {result && (
          <ExplainAction
            action="Bulk DLQ Purge"
            inputContext={{ olderThanDays: result.olderThanDays, scope: "all-dlq-envelopes" }}
            result={result}
            mode="auto"
            className="w-full"
          />
        )}
      </CardContent>
    </Card>
  );
}
