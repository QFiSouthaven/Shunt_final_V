import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { jidColor } from "@/lib/jid-color";
import { CapabilityBadges } from "./CapabilityBadges";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export async function PeerRoster() {
  let agents: any[] = [];
  try {
    const res = await fetch("http://localhost:3000/api/worker/presence", { cache: 'no-store' }); // Use absolute URL if possible, or relative if client-side. Wait, it's server side.
    if (res.ok) {
      const data = await res.json();
      agents = data.agents || [];
    }
  } catch (e) {
    //
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Users className="h-4 w-4" />
          Roster
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-2">
        {agents.length === 0 && (
          <div className="text-xs text-slate-500 italic">No agents active.</div>
        )}
        {agents.map(ag => {
          const lastSeen = new Date(ag.lastSeenAt || 0).getTime();
          const online = (Date.now() - lastSeen) < 90_000;
          return (
            <Link 
              key={ag.jid} 
              href={`/peers/${encodeURIComponent(ag.jid)}`}
              className="flex items-center justify-between p-3 rounded bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className={`h-8 w-8 rounded-full ${jidColor(ag.jid)}`} />
                  <div className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-slate-900 ${online ? "bg-emerald-500" : "bg-slate-500"}`} />
                </div>
                <div>
                  <div className="text-sm font-mono text-white mb-1">{ag.jid}</div>
                  <CapabilityBadges capabilities={ag.capabilities} />
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <div className="text-[10px] text-slate-500 uppercase">Last Seen</div>
                <div className="text-xs font-mono text-slate-400">
                  {ag.lastSeenAt ? formatDistanceToNow(lastSeen, { addSuffix: true }) : "never"}
                </div>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
