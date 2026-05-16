"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Activity } from "lucide-react";

export function RetryDaemonState() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orchestrator/pending-acks")
      .then(res => res.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className="bg-[#0a0a0c]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Retry Daemon State
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
         {loading ? (
           <div className="text-xs italic text-slate-500">Loading state...</div>
         ) : !data ? (
           <div className="text-xs italic text-slate-500">Could not fetch daemon state.</div>
         ) : (
           <div>
             <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">.pending-acks.json</div>
             <pre className="bg-black/40 border border-slate-800 rounded p-3 text-[10px] font-mono text-emerald-400/90 overflow-x-auto h-32 overflow-y-auto">
               {JSON.stringify(data, null, 2)}
             </pre>
           </div>
         )}
      </CardContent>
    </Card>
  );
}
