import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { HeartPulse, AlertTriangle } from "lucide-react";
import { panelFetch } from "@/lib/panel-client";

export async function FileBusHeartbeatTile() {
  let freshCount = 0;
  let totalCount = 0;
  let staleAgents: string[] = [];
  let errorMsg = "";

  try {
    const res = await panelFetch('/api/state', { cache: 'no-store' });
    if (!res.ok) {
      errorMsg = `HTTP ${res.status}`;
    } else {
      const data = await res.json();
      const agents = data.agents || [];
      totalCount = agents.length;
      
      const now = Date.now();
      agents.forEach((agent: any) => {
        const lastSeen = new Date(agent.lastSeenAt || 0).getTime();
        const diffInSeconds = (now - lastSeen) / 1000;
        if (diffInSeconds > 90) {
          staleAgents.push(agent.name || agent.id || 'Unknown Bridge');
        } else {
          freshCount++;
        }
      });
    }
  } catch (error) {
    errorMsg = "Fetch Error";
  }

  const hasStale = staleAgents.length > 0;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <HeartPulse className="h-4 w-4" />
          Bus Heartbeat
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center">
        {errorMsg ? (
          <div className="text-rose-400 text-sm font-mono flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {errorMsg}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-end gap-2">
              <span className={`text-4xl font-bold font-mono ${hasStale ? 'text-amber-400' : 'text-emerald-400'}`}>
                {freshCount}
              </span>
              <span className="text-slate-500 font-mono mb-1">/ {totalCount} alive</span>
            </div>
            
            {hasStale && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 text-xs flex flex-col gap-1">
                <span className="text-amber-500 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Stale Bridges
                </span>
                {staleAgents.map((name, i) => (
                  <span key={i} className="text-amber-400/80 font-mono">- {name}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
