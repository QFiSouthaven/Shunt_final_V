"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PenTool, AlertCircle } from "lucide-react";
import { RoomPolicySwitch } from "./RoomPolicySwitch";
import { SelfBrickingWarningBanner } from "./SelfBrickingWarningBanner";

export function RoomSchemaEditor({ room }: { room: string }) {
  const [mode, setMode] = useState<"dsl" | "raw">("raw");
  const [policy, setPolicy] = useState("warn");
  const [zodJson, setZodJson] = useState("");
  const [updatedBy, setUpdatedBy] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error" | "would_brick">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Check if user is admin
    fetch("/api/admin/admin-jids").then(res => {
      setIsAdmin(res.ok);
      if (res.ok) {
        res.json().then(d => {
          if (d.jids && d.jids.length > 0) setUpdatedBy(d.jids[0]);
        });
      }
    });

    // Populate initial
    fetch(`/api/worker/room/${encodeURIComponent(room)}/schema`)
      .then(r => r.json())
      .then(d => {
        if (d.zod_json) {
          setZodJson(d.zod_json);
          setPolicy(d.policy || "warn");
        }
      })
      .catch(() => {});
  }, [room]);

  const handleSubmit = async (force = false) => {
    if (policy === 'strict' && step === 0 && !force) {
      setStep(1);
      return;
    }

    setStatus("submitting");
    try {
      const payload = { policy, zod_json: zodJson, updated_by: updatedBy };
      const url = `/api/admin/room/${encodeURIComponent(room)}/schema${force ? '?force=1' : ''}`;
      
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok) {
        setStatus("success");
        setStatusMsg("Schema updated");
        setStep(0);
      } else if (res.status === 409 && data.code === 'WOULD_BRICK') {
        setStatus("would_brick");
        setStatusMsg("Self-bricking detected on server. Override required.");
      } else {
        setStatus("error");
        setStatusMsg(data.error || "Failed");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Network error");
    }
  };

  return (
    <Card className="flex flex-col h-full bg-[#0a0a0c] border-indigo-900/30">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-indigo-400 uppercase tracking-widest flex items-center gap-2">
          <PenTool className="h-4 w-4" />
          Edit Schema
        </CardTitle>
        <div className="flex bg-slate-900 rounded p-1">
           <button onClick={() => setMode("dsl")} className={`px-3 py-1 text-xs rounded ${mode === 'dsl' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>DSL</button>
           <button onClick={() => setMode("raw")} className={`px-3 py-1 text-xs rounded ${mode === 'raw' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>RAW JSON</button>
        </div>
      </CardHeader>
      <CardContent className="p-4 flex-1">
        {!isAdmin ? (
          <div className="text-xs text-slate-500 italic p-4 text-center">Read-only view. You are not an admin.</div>
        ) : (
          <div className="space-y-4">
            <SelfBrickingWarningBanner policy={policy} zodJson={zodJson} />

            <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-end">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase">Policy Enforcement</label>
                <RoomPolicySwitch value={policy} onChange={setPolicy} />
              </div>
              <div className="space-y-1 text-right">
                <label className="text-[10px] text-slate-500 uppercase">Updated By (identity spoof)</label>
                <input 
                  value={updatedBy} 
                  onChange={e => setUpdatedBy(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none block"
                />
              </div>
            </div>

            {mode === 'dsl' ? (
              <div className="p-8 text-center text-xs text-slate-500 italic font-mono border border-slate-800 border-dashed rounded">
                TODO(prompt:section-5-p1): Operator-friendly DSL mode
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase flex justify-between">
                   Zod JSON payload
                </label>
                <textarea
                  value={zodJson}
                  onChange={e => setZodJson(e.target.value)}
                  rows={8}
                  className="w-full bg-black/50 border border-slate-800 text-[10px] text-emerald-400/90 rounded p-3 outline-none focus:border-indigo-500/50 font-mono"
                  placeholder='{ "type": "object", "properties": { ... } }'
                />
              </div>
            )}

            <div className="pt-4 flex items-center justify-between border-t border-slate-800">
               <div className="text-xs font-mono flex items-center gap-2">
                 {status === 'error' && <span className="text-rose-400">{statusMsg}</span>}
                 {status === 'success' && <span className="text-emerald-400">{statusMsg}</span>}
                 {status === 'submitting' && <span className="text-slate-500 italic">Saving...</span>}
                 {status === 'would_brick' && (
                   <span className="text-rose-400 max-w-sm">{statusMsg}</span>
                 )}
               </div>
               
               <div className="flex gap-2">
                 {status === 'would_brick' && (
                    <button 
                      onClick={() => handleSubmit(true)}
                      className="bg-rose-900 text-rose-200 border border-rose-800 hover:bg-rose-800 px-4 py-2 rounded text-xs font-bold transition-all"
                    >
                      FORCE OVERRIDE
                    </button>
                 )}
                 {step === 0 ? (
                    <button 
                      onClick={() => handleSubmit(false)}
                      className="bg-indigo-600 text-white hover:bg-indigo-500 px-6 py-2 rounded text-xs font-bold transition-all"
                    >
                      SAVE
                    </button>
                 ) : (
                    <button 
                      onClick={() => handleSubmit(false)}
                      className="bg-rose-600 text-white hover:bg-rose-500 px-6 py-2 rounded text-xs font-bold transition-all shadow-[0_0_15px_-3px_rgba(225,29,72,0.5)]"
                    >
                      CONFIRM STRICT SAVE
                    </button>
                 )}
               </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
