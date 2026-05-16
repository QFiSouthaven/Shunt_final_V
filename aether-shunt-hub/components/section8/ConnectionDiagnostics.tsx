import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Activity, CheckCircle2, XCircle } from "lucide-react";
import { workerFetch } from "@/lib/worker-client";

export async function ConnectionDiagnostics() {
  const workerBase = process.env.WORKER_URL || "http://localhost:8787";
  
  let healthOk = false;
  let authRejectOk = false;
  let authAcceptOk = false;
  
  let overrideHint = null;

  try {
    const r1 = await fetch(`${workerBase}/healthz`, { cache: 'no-store' });
    if (r1.ok) {
      const d = await r1.json();
      if (d.ok === true) healthOk = true;
    }
  } catch (e: any) {
    overrideHint = "Worker is unreachable. Verify WORKER_URL and ensure the proxy is running.";
  }

  if (healthOk) {
    try {
      const r2 = await fetch(`${workerBase}/presence`, { cache: 'no-store' });
      if (r2.status === 401) {
        authRejectOk = true;
      }
    } catch {
      //
    }

    if (authRejectOk) {
      try {
        const r3 = await workerFetch(`/presence`, { cache: 'no-store' });
        if (r3.ok) {
          authAcceptOk = true;
        }
      } catch {
        //
      }
    }
  }

  const items = [
    { name: "GET /healthz (No Auth)", ok: healthOk },
    { name: "GET /presence (Unauthenticated)", ok: authRejectOk },
    { name: "GET /presence (Worker Bearer)", ok: authAcceptOk },
  ];

  const anyFailed = !healthOk || !authRejectOk || !authAcceptOk;

  return (
    <Card className="bg-[#0a0a0c]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Connection Diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="space-y-2">
           {items.map((it, i) => (
             <div key={i} className="flex justify-between items-center bg-black/40 border border-slate-800 p-2 rounded">
               <span className="text-xs font-mono text-slate-400">{it.name}</span>
               {it.ok ? (
                 <CheckCircle2 className="w-4 h-4 text-emerald-500" />
               ) : (
                 <XCircle className="w-4 h-4 text-rose-500" />
               )}
             </div>
           ))}
        </div>

        {anyFailed && (
          <div className="p-3 bg-amber-950/20 border border-amber-900/50 rounded text-xs text-amber-400/80 leading-relaxed">
            {overrideHint || "One or more connection checks failed. Verify the Bearer token in the configuration matches the Worker's expected token, and check if the Worker process is actively running."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
