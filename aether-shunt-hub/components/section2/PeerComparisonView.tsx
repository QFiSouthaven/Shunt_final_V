"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowRightLeft } from "lucide-react";

export function PeerComparisonView() {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4" />
          Peer Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {/* TODO(prompt:section-3-p1): Implementation for peer outbox vs inbox comparison */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded bg-slate-900 border border-slate-800 flex flex-col gap-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Peer A Outbox</span>
            <div className="text-xs font-mono text-slate-600 italic">Endpoint pending...</div>
          </div>
          <div className="p-3 rounded bg-slate-900 border border-slate-800 flex flex-col gap-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Peer B Inbox</span>
            <div className="text-xs font-mono text-slate-600 italic">Endpoint pending...</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
