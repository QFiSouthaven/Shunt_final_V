"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MailQuestion, Clock } from "lucide-react";
import { DLQReplayAction } from "./DLQReplayAction";
import { DLQDiscardAction } from "./DLQDiscardAction";

function timeAgo(ts: number) {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function DLQBrowser({ onSelect }: { onSelect: (id: string) => void }) {
  const [envelopes, setEnvelopes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEnvelopes = () => {
    setLoading(true);
    fetch("/api/bus/inbox/%40dlq")
      .then(res => res.json())
      .then(d => {
        if (d.messages) setEnvelopes(d.messages);
        else if (Array.isArray(d)) setEnvelopes(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEnvelopes();
  }, []);

  return (
    <Card className="flex flex-col h-full bg-[#0a0a0c]">
      <CardHeader className="pb-2 flex flex-row items-center justify-between shrink-0 border-b border-slate-800">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <MailQuestion className="h-4 w-4" />
          Inbox / @dlq
        </CardTitle>
        <button onClick={fetchEnvelopes} className="text-[10px] text-slate-500 hover:text-indigo-400 uppercase tracking-widest">
          Refresh
        </button>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-xs italic text-slate-500">Loading envelopes...</div>
        ) : envelopes.length === 0 ? (
          <div className="p-4 text-xs italic text-slate-500">DLQ is empty.</div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {envelopes.map((env, i) => {
              const data = env.envelope || env;
              const ts = env.ts || Date.now();
              return (
                <div key={data.id || i} className="p-4 hover:bg-slate-900/50 transition-colors group flex gap-4">
                  <div className="flex-1 cursor-pointer" onClick={() => data.id && onSelect(data.id)}>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xs font-mono text-indigo-400">#{data.id?.substring(0, 8)}...</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                        {data.kind || 'unknown'}
                      </span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1 ml-auto">
                        <Clock className="w-3 h-3" />
                        {timeAgo(ts)}
                      </span>
                    </div>
                    
                    <div className="text-[10px] font-mono text-slate-400 truncate max-w-md">
                      {data.from} <span className="text-slate-600">→</span> {data.to}
                    </div>
                    
                    {(data.reason || data.last_error) && (
                      <div className="mt-1.5 text-[10px] font-mono text-rose-500/80 truncate max-w-md bg-rose-950/20 px-1.5 py-0.5 rounded inline-block">
                        {data.reason || data.last_error}
                      </div>
                    )}
                  </div>
                  
                  <div className="shrink-0 flex flex-col gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <DLQReplayAction id={data.id!} onComplete={fetchEnvelopes} />
                    <DLQDiscardAction id={data.id!} onComplete={fetchEnvelopes} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
