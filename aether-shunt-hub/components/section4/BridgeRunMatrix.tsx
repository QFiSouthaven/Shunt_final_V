"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Server, Play, Square, RefreshCcw } from "lucide-react";
import { ExplainAction } from "@/components/ai/ExplainAction";

type BridgeAction = "start" | "stop" | "restart";

interface BridgeActionResult {
  ok: boolean;
  httpStatus: number;
  action: BridgeAction;
  bridge: string;
  fallback?: boolean;
  error?: string;
}

export function BridgeRunMatrix() {
  const { data, refetch } = useQuery({
    queryKey: ["bridge-status"],
    queryFn: async () => {
      const res = await fetch("/api/orchestrator/status");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const bridges = data?.bridges || [];
  const [lastResult, setLastResult] = useState<BridgeActionResult | null>(null);

  const handleAction = async (bridge: string, action: BridgeAction) => {
    // Two-step confirm on stop and restart for production bridges
    if ((action === "stop" || action === "restart") && bridge !== "retry-daemon") {
      if (!window.confirm(`Are you sure you want to ${action} ${bridge}?`)) return;
    }

    setLastResult(null);
    try {
      const res = await fetch(`/api/admin/bridge/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bridge })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLastResult({
          ok: false,
          httpStatus: res.status,
          action,
          bridge,
          error: body?.error || `HTTP ${res.status}`,
        });
      } else {
        setLastResult({
          ok: body?.ok !== false,
          httpStatus: res.status,
          action,
          bridge,
          fallback: body?.fallback === true,
        });
      }
    } catch (e: any) {
      setLastResult({
        ok: false,
        httpStatus: 0,
        action,
        bridge,
        error: e?.message || "Network error",
      });
    }
    refetch();
  };

  return (
    <Card className="bg-[#0a0a0c] h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Server className="h-4 w-4" />
          Bridge Matrix
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex-1 overflow-y-auto">
         <div className="space-y-4">
          {bridges.length === 0 && <div className="text-xs text-slate-500">No bridges active.</div>}
          {bridges.map((b: any) => (
            <div key={b.name} className="flex items-center justify-between p-3 rounded bg-slate-900 border border-slate-800">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-mono text-white flex items-center gap-2">
                  {b.name}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold
                    ${b.state === 'running' ? 'bg-emerald-500/20 text-emerald-400' :
                      b.state === 'failed' ? 'bg-rose-500/20 text-rose-400' :
                      'bg-amber-500/20 text-amber-400'}
                  `}>
                    {b.state}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Restarts: {b.restarts} | Seen: {b.lastSeenAt}</div>
                {b.lastError && <div className="text-[10px] text-rose-400/80 max-w-sm truncate">{b.lastError}</div>}
              </div>
              <div className="flex gap-2">
                 <button onClick={() => handleAction(b.name, "start")} className="p-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400" title="Start">
                   <Play className="h-4 w-4" />
                 </button>
                 <button onClick={() => handleAction(b.name, "stop")} className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400" title="Stop">
                   <Square className="h-4 w-4" />
                 </button>
                 <button onClick={() => handleAction(b.name, "restart")} className="p-1.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400" title="Restart">
                   <RefreshCcw className="h-4 w-4" />
                 </button>
              </div>
            </div>
          ))}
         </div>
         {lastResult && (
           <ExplainAction
             key={`${lastResult.action}-${lastResult.bridge}-${lastResult.httpStatus}`}
             action={`Bridge ${lastResult.action.charAt(0).toUpperCase() + lastResult.action.slice(1)}: ${lastResult.bridge}`}
             inputContext={{ bridge: lastResult.bridge, action: lastResult.action }}
             result={lastResult}
             mode="auto"
             className="mt-3"
           />
         )}
      </CardContent>
    </Card>
  );
}
