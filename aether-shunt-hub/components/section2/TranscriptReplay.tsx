"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { History } from "lucide-react";

export function TranscriptReplay() {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <History className="h-4 w-4" />
          Transcript Replay
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Scaffold for Transcript Replay */}
        <div className="flex items-center space-x-2">
          <input 
            type="range" 
            className="flex-1 accent-emerald-500" 
            disabled 
          />
          <span className="text-xs font-mono text-slate-500">Live</span>
        </div>
        <div className="text-[10px] text-slate-600 font-mono italic text-center">
          Scrubber over GET /api/bus/transcript?since=&lt;iso&gt; pending...
        </div>
      </CardContent>
    </Card>
  );
}
