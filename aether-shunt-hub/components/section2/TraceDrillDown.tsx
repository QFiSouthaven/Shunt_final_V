"use client";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { GitMerge } from "lucide-react";

export function TraceDrillDown() {
  const [traceId, setTraceId] = useState("");

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <GitMerge className="h-4 w-4" />
          Trace Drill-Down
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <input 
          type="text" 
          placeholder="Enter Trace UUID..."
          value={traceId}
          onChange={(e) => setTraceId(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 text-xs text-white px-3 py-2 rounded focus:outline-none focus:border-emerald-500/50"
        />
        <div className="bg-black/20 border border-slate-800 rounded p-4 text-center">
          {traceId ? (
            <div className="text-xs text-slate-500 font-mono italic">
              {/* TODO(prompt:section-2-p1): Implementation for filtering envelopes by traceId goes here */}
              Searching state for trace: {traceId}...
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">No trace selected.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
