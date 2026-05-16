"use client";

import { useState } from "react";
import { DLQBrowser } from "@/components/section6/DLQBrowser";
import { DLQEnvelopeDetail } from "@/components/section6/DLQEnvelopeDetail";
import { RetryDaemonState } from "@/components/section6/RetryDaemonState";
import { BulkDLQPurge } from "@/components/section6/BulkDLQPurge";
import { MailQuestion, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

export default function DLQPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDanger, setShowDanger] = useState(false);

  return (
    <div className="p-6 flex flex-col h-screen overflow-hidden">
      <div className="shrink-0 mb-6 flex justify-between items-center">
        <h2 className="text-xl font-bold font-mono text-white tracking-wide flex items-center gap-2">
          <MailQuestion className="h-5 w-5 text-rose-500" />
          DEAD LETTER QUEUE
        </h2>
        
        <button 
          onClick={() => setShowDanger(!showDanger)}
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-500 bg-rose-950/20 hover:bg-rose-950/40 px-3 py-1.5 rounded border border-rose-900/50 transition-colors"
        >
          <AlertTriangle className="h-4 w-4" />
          Danger Zone
          {showDanger ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>
      
      {showDanger && (
        <div className="shrink-0 mb-6 animate-in slide-in-from-top-2 fade-in">
          <BulkDLQPurge />
        </div>
      )}
      
      <div className="flex-1 grid grid-cols-1 gap-6 min-h-0 overflow-y-auto pb-6">
        <div className="min-h-[400px] h-[60vh]">
          <DLQBrowser onSelect={id => setSelectedId(id)} />
        </div>
        
        <div className="shrink-0">
          <RetryDaemonState />
        </div>
      </div>

      <DLQEnvelopeDetail 
        envelopeId={selectedId} 
        open={!!selectedId} 
        onClose={() => setSelectedId(null)} 
      />
    </div>
  );
}
