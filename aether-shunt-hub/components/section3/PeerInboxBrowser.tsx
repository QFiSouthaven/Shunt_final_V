"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Inbox, FileJson } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

export function PeerInboxBrowser({ jid }: { jid: string }) {
  const [inboxItems, setInboxItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEnvelope, setSelectedEnvelope] = useState<any>(null);
  const [envelopeLoading, setEnvelopeLoading] = useState(false);

  useEffect(() => {
    async function fetchInbox() {
      try {
        const res = await fetch(`/api/bus/inbox/${encodeURIComponent(jid)}`);
        if (res.ok) {
          const data = await res.json();
          setInboxItems(data.envelopes || data || []);
        }
      } catch (e) { }
      setLoading(false);
    }
    fetchInbox();
  }, [jid]);

  const handleSelect = async (id: string) => {
    setEnvelopeLoading(true);
    setSelectedEnvelope({ id, body: "Loading..." });
    try {
      const res = await fetch(`/api/bus/envelope/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedEnvelope(data);
      }
    } catch (e) {
      setSelectedEnvelope({ id, body: "Failed to load" });
    }
    setEnvelopeLoading(false);
  };

  return (
    <Card className="flex flex-col h-full bg-[#0a0a0c]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Inbox className="h-4 w-4" />
          Inbox
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="text-xs text-slate-500 italic">Loading inbox...</div>
        ) : inboxItems.length === 0 ? (
          <div className="text-xs text-slate-500 italic">Inbox empty.</div>
        ) : (
          <div className="space-y-2">
            {inboxItems.map((env, idx) => (
              <button
                key={idx}
                onClick={() => handleSelect(env.id)}
                className="w-full text-left p-3 rounded bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition-colors flex items-center justify-between"
              >
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-mono text-emerald-400">from: {env.from || 'unknown'}</div>
                  <div className="text-[10px] text-slate-500 font-mono">id: {env.id}</div>
                </div>
                {env.kind && (
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-mono">
                    {env.kind}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <Sheet open={!!selectedEnvelope} onOpenChange={(v) => !v && setSelectedEnvelope(null)}>
          <SheetContent className="bg-[#0f0f12] border-l border-slate-800 text-slate-300 min-w-[500px] overflow-y-auto">
            <SheetHeader className="mb-6">
              <SheetTitle className="text-sm font-mono text-slate-400">Envelope Data</SheetTitle>
            </SheetHeader>
            {selectedEnvelope && (
              <div className="space-y-4">
                <div className="p-3 rounded bg-black/40 border border-slate-800 text-[10px] font-mono text-slate-500 space-y-1">
                  <div>ID: <span className="text-slate-300">{selectedEnvelope.id}</span></div>
                  <div>FROM: <span className="text-slate-300">{selectedEnvelope.from}</span></div>
                  <div>KIND: <span className="text-slate-300">{selectedEnvelope.kind}</span></div>
                </div>
                <div className="p-4 rounded bg-slate-900 border border-slate-800 markdown-body prose prose-invert max-w-none text-sm text-slate-300">
                  <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                    {selectedEnvelope.body || ""}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}
