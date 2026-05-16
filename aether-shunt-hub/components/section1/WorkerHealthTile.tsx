import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Activity, AlertCircle, CheckCircle } from "lucide-react";

export async function WorkerHealthTile() {
  let ok = false;
  let statusText = "";
  
  try {
    const res = await fetch('https://hub-relay.halkive.workers.dev/healthz', { cache: 'no-store' });
    if (res.ok) {
      ok = true;
      statusText = "OK";
    } else {
      statusText = `HTTP ${res.status}`;
    }
  } catch (error) {
    statusText = "Fetch Error";
  }

  const timestamp = new Date().toLocaleTimeString();

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Worker Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mt-1">
          {ok ? (
            <div className="flex items-center gap-2 px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-bold">{statusText}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-bold">DOWN - {statusText}</span>
            </div>
          )}
          <span className="text-xs text-slate-500 font-mono">{timestamp}</span>
        </div>
      </CardContent>
    </Card>
  );
}
