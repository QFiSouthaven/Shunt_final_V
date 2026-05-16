"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, AlertOctagon } from "lucide-react";

export function CleanupActions() {
  const [step, setStep] = useState(0);
  const [pattern, setPattern] = useState("*.tmp");
  const [confirmValue, setConfirmValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleAction = async () => {
    if (step === 0) {
      setStep(1);
      return;
    }

    if (confirmValue !== pattern) {
      setStatus("Pattern mismatch");
      return;
    }

    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      
      setStep(0);
      setConfirmValue("");
      setStatus("Cleanup successful");
    } catch (e: any) {
      setStatus(e.message);
      setStep(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-rose-950/20 border border-rose-900/50 rounded-lg p-6">
      <h3 className="text-sm font-medium text-rose-500 uppercase tracking-widest flex items-center gap-2 mb-4">
        <AlertOctagon className="h-4 w-4" />
        Artifact Cleanup
      </h3>
      
      <p className="text-xs text-rose-400/80 max-w-xl mb-4">
        Permanently delete leftover background files matching known artifact patterns.
        This action is audited and restricted to hub-admins.
      </p>

      {step === 0 ? (
        <div className="flex items-end gap-4">
          <div className="space-y-1">
            <label className="text-[10px] text-rose-500/70 uppercase">Pattern</label>
            <Input
              value={pattern}
              onChange={e => setPattern(e.target.value)}
              className="h-8 bg-black/40 border-rose-900 text-rose-300 font-mono text-xs w-40"
            />
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleAction}
            className="h-8 text-xs uppercase font-bold tracking-wider bg-rose-900 hover:bg-rose-800 text-rose-200"
          >
            <Trash2 className="w-3 h-3 mr-2" />
            Sweep Files
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-rose-400 text-xs font-bold uppercase tracking-wider bg-rose-950/50 p-3 rounded">
            Type "{pattern}" to confirm irreversible deletion.
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={confirmValue}
              onChange={e => setConfirmValue(e.target.value)}
              className="h-8 w-40 bg-black/40 border-rose-900 text-rose-300 font-mono text-xs"
              placeholder={pattern}
            />
            <Button
              variant="destructive"
              size="sm"
              onClick={handleAction}
              disabled={loading || confirmValue !== pattern}
              className="h-8 text-xs uppercase font-bold tracking-wider bg-rose-600 hover:bg-rose-500 shadow-[0_0_15px_-3px_rgba(225,29,72,0.5)]"
            >
              {loading ? "..." : "CONFIRM SWEEP"}
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
      )}
      
      {status && (
        <div className={`mt-4 text-xs font-mono ${status.includes('success') ? 'text-emerald-500' : 'text-rose-500'}`}>
          {status}
        </div>
      )}
    </div>
  );
}
