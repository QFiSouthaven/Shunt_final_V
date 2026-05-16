import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { workerFetch } from "@/lib/worker-client";

export async function WorkerAuthProbeTile() {
  let ok = false;
  let statusText = "Bearer rejected";
  
  try {
    const res = await workerFetch('/presence', { cache: 'no-store' });
    if (res.ok) {
      ok = true;
      statusText = "Bearer OK";
    } else {
      statusText = `Bearer rejected (HTTP ${res.status})`;
    }
  } catch (error) {
    statusText = "Bearer rejected (Fetch Error)";
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Auth Probe
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mt-1">
          {ok ? (
            <div className="flex items-center gap-2 px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-sm font-bold">{statusText}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <ShieldAlert className="h-4 w-4" />
              <span className="text-sm font-bold">{statusText}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
