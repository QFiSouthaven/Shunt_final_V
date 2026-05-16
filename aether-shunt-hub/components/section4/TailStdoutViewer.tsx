"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Terminal } from "lucide-react";

import { parseSseStream } from "@/lib/sse";

export function TailStdoutViewer() {
  const [lines, setLines] = useState<string[]>([]);
  const [bridge, setBridge] = useState("all");
  const bottomRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    let abortController = new AbortController();
    let currentBackoff = 1000;
    
    const connect = () => {
      // Create new abort controller for this connection
      abortController = new AbortController();
      
      fetch(`/api/orchestrator/tail/${bridge}`, { signal: abortController.signal })
        .then(async res => {
          if (!res.body) return;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const events = chunk.split('\\n\\n').filter(Boolean);
            
            events.forEach(evt => {
              if (evt.startsWith('data: ')) {
                const data = evt.substring(6);
                const parsed = parseSseStream(data);
                const lineStr = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
                setLines(prev => [...prev, lineStr].slice(-100)); // keep last 100
                currentBackoff = 1000; // reset on success
              }
            });
          }
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
        })
        .finally(() => {
          // Reconnect with backoff
          timeout = setTimeout(() => {
            currentBackoff = Math.min(currentBackoff * 2, 30000);
            connect();
          }, currentBackoff);
        });

      // Avoid CF 60s timeout
      setTimeout(() => abortController.abort(), 50000);
    };

    connect();

    return () => {
      clearTimeout(timeout);
      abortController.abort();
    };
  }, [bridge]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <Card className="bg-[#0a0a0c] h-full flex flex-col border-emerald-900/50">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-emerald-500/80 uppercase tracking-widest flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          Live Stdout
        </CardTitle>
        <select 
          value={bridge} 
          onChange={e => {
            setBridge(e.target.value);
            setLines([]);
          }}
          className="bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1 outline-none"
        >
          <option value="all">All Bridges</option>
          <option value="lmstudio-bridge">lmstudio-bridge</option>
          <option value="gemini-bridge">gemini-bridge</option>
          <option value="retry-daemon">retry-daemon</option>
          <option value="panel-server">panel-server</option>
        </select>
      </CardHeader>
      <CardContent className="p-4 flex-1 bg-black/50 overflow-y-auto mt-2 rounded mx-4 mb-4 border border-slate-800 font-mono text-[10px]">
         {lines.length === 0 && <div className="text-slate-500 italic">Waiting for events...</div>}
         {lines.map((l, i) => (
           <div key={i} className="text-emerald-400/90 whitespace-pre-wrap leading-tight">{l}</div>
         ))}
         <div ref={bottomRef} />
      </CardContent>
    </Card>
  );
}
