"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { jidColor } from "@/lib/jid-color";
import { Users } from "lucide-react";

export function AgentRosterFilter({ 
  selectedJid, 
  onSelectJid 
}: { 
  selectedJid?: string, 
  onSelectJid: (jid: string | undefined) => void 
}) {
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    async function fetchPresence() {
      try {
        const res = await fetch("/api/worker/presence");
        if (res.ok) {
          const data = await res.json();
          setAgents(data.agents || []);
        }
      } catch (e) {
        // ignore
      }
    }
    fetchPresence();
    const interval = setInterval(fetchPresence, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Users className="h-4 w-4" />
          Agent Roster
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-2">
        <button 
          onClick={() => onSelectJid(undefined)}
          className={`w-full text-left px-3 py-2 rounded text-xs font-mono transition-colors ${
            !selectedJid ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800"
          }`}
        >
          [ALL AGENTS]
        </button>
        {agents.map((ag) => (
          <button
            key={ag.jid}
            onClick={() => onSelectJid(ag.jid)}
            className={`w-full flex items-center space-x-2 px-3 py-2 rounded text-xs font-mono transition-colors ${
              selectedJid === ag.jid ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800"
            }`}
          >
            <div className={`h-2 w-2 rounded-full ${jidColor(ag.jid)}`} />
            <span className="truncate">{ag.jid}</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
