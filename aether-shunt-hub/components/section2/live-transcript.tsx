"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useSseStream } from "./use-sse-stream";
import { jidColor } from "@/lib/jid-color";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

export function LiveTranscript({ filterJid }: { filterJid?: string }) {
  const { messages } = useSseStream("/api/bus/stream");
  
  const filteredMessages = filterJid 
    ? messages.filter(m => m.from === filterJid || m.to === filterJid)
    : messages;

  return (
    <Card className="flex-1 flex flex-col min-h-0">
      <CardHeader className="pb-2 flex shrink-0 items-center justify-between border-b border-slate-800">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest">
          Live Transcript
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-4 p-4">
        {filteredMessages.map((msg, idx) => (
          <div key={idx} className="flex flex-col space-y-1 p-3 rounded bg-slate-900 border border-slate-800">
            <div className="flex items-center space-x-2">
              <div className={`h-2 w-2 rounded-full ${jidColor(msg.from)}`} />
              <span className="text-xs font-mono text-slate-400">{msg.from || 'unknown'}</span>
              <span className="text-xs text-slate-600">→</span>
              <span className="text-xs font-mono text-slate-400">{msg.to || 'unknown'}</span>
              {msg.kind && (
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-mono">
                  {msg.kind}
                </span>
              )}
            </div>
            <div className="text-sm text-slate-300 markdown-body prose prose-invert max-w-none">
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                {msg.body || ""}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {filteredMessages.length === 0 && (
          <div className="text-center text-sm text-slate-500 italic mt-4">Waiting for messages...</div>
        )}
      </CardContent>
    </Card>
  );
}
