"use client";

import { useState, useEffect } from "react";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { FileWarning, Clock } from "lucide-react";

export function DLQEnvelopeDetail({
  envelopeId,
  open,
  onClose,
}: {
  envelopeId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (envelopeId && open) {
      setLoading(true);
      fetch(`/api/bus/envelope/${envelopeId}`)
        .then((res) => res.json())
        .then((d) => setData(d))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [envelopeId, open]);

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="bg-[#0a0a0c] border-l border-slate-800 text-slate-300 w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-rose-400 flex items-center gap-2 font-mono uppercase tracking-widest text-sm">
            <FileWarning className="w-4 h-4" />
            Envelope Detail
          </SheetTitle>
          <SheetDescription className="text-slate-500 font-mono text-xs">
            {envelopeId}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="text-xs italic text-slate-500">Loading envelope...</div>
        ) : !data ? (
          <div className="text-xs italic text-slate-500">No data found.</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">From</div>
                <div className="text-xs font-mono truncate">{data.from || "unknown"}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">To</div>
                <div className="text-xs font-mono truncate">{data.to || "unknown"}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Kind</div>
                <div className="text-xs font-mono">{data.kind || "unknown"}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Last Error</div>
                <div className="text-xs font-mono text-rose-400 truncate">{data.reason || data.last_error || "none"}</div>
              </div>
            </div>

            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Retry History
              </div>
              {data.retries && data.retries.length > 0 ? (
                <ul className="space-y-1">
                  {data.retries.map((r: any, i: number) => (
                    <li key={i} className="text-[10px] font-mono flex justify-between bg-black/40 p-1.5 rounded">
                      <span className="text-slate-500">{r.ts}</span>
                      <span className="text-rose-400">{r.error}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-slate-600 italic">No retry history recorded.</div>
              )}
            </div>

            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Body (Markdown)</div>
              <div className="bg-black/40 border border-slate-800 rounded p-4 text-xs font-mono text-slate-300 prose prose-invert max-w-none overflow-x-auto">
                <Markdown rehypePlugins={[rehypeSanitize]}>
                  {typeof data.payload === "string"
                    ? data.payload
                    : JSON.stringify(data.payload, null, 2)}
                </Markdown>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
