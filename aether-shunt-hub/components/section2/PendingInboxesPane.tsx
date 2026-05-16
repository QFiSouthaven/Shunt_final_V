"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Inbox, ChevronRight, FileJson } from "lucide-react";

export function PendingInboxesPane() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [inboxItems, setInboxItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchState() {
      try {
        const res = await fetch("/api/bus/state");
        if (res.ok) {
          const data = await res.json();
          setCounts(data.inbox_counts || {});
        }
      } catch (e) { }
    }
    fetchState();
    const int = setInterval(fetchState, 30000);
    return () => clearInterval(int);
  }, []);

  const handleSelectJid = async (jid: string) => {
    if (selectedJid === jid) {
      setSelectedJid(null);
      setInboxItems([]);
      return;
    }
    setSelectedJid(jid);
    setLoading(true);
    try {
      const res = await fetch(`/api/bus/inbox/${encodeURIComponent(jid)}`);
      if (res.ok) {
        const data = await res.json();
        setInboxItems(data.envelopes || data || []);
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Inbox className="h-4 w-4" />
          Pending Inboxes
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-1">
          {Object.entries(counts).map(([jid, count]) => (
            <div key={jid} className="flex flex-col">
              <button
                onClick={() => handleSelectJid(jid)}
                className={`flex items-center justify-between p-2 rounded text-xs font-mono transition-colors ${
                  selectedJid === jid ? "bg-slate-800 text-white" : "bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800"
                }`}
              >
                <span className="truncate">{jid}</span>
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded font-bold ${count > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500"}`}>
                    {count}
                  </span>
                  <ChevronRight className={`h-3 w-3 transition-transform ${selectedJid === jid ? "rotate-90" : ""}`} />
                </div>
              </button>
              
              {selectedJid === jid && (
                <div className="pl-4 pr-2 py-2 space-y-2 border-l-2 border-slate-800 ml-2 mt-1">
                  {loading && <div className="text-xs text-slate-500 italic">Loading...</div>}
                  {!loading && inboxItems.length === 0 && <div className="text-xs text-slate-500 italic">Inbox empty.</div>}
                  {!loading && inboxItems.map((env, idx) => (
                    <a 
                      key={idx}
                      href={`/api/bus/envelope/${env.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-[10px] font-mono text-slate-400 hover:text-emerald-400 p-1.5 rounded bg-black/20 border border-slate-800 hover:border-emerald-500/30 transition-colors"
                    >
                      <FileJson className="h-3 w-3 shrink-0" />
                      <span className="truncate">{env.id || 'unknown'}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          {Object.keys(counts).length === 0 && (
            <div className="text-xs text-slate-500 italic">No pending inboxes.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
