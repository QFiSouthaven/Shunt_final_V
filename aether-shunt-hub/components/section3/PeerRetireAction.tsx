"use client";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skull } from "lucide-react";

export function PeerRetireAction({ jid }: { jid: string }) {
  const [step, setStep] = useState(0);

  return (
    <Card className="flex flex-col h-full bg-[#0a0a0c] border-rose-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-rose-500/80 uppercase tracking-widest flex items-center gap-2">
          <Skull className="h-4 w-4" />
          Retire Peer
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 text-center">
        <div className="bg-rose-950/20 border border-rose-900/30 p-4 flex flex-col gap-3 rounded items-center">
          <div className="text-xs text-rose-400/80 max-w-sm">
            Retiring <span className="font-mono text-rose-300 font-bold">{jid}</span> will sever connection and drop all pending envelopes.
          </div>
          {step === 0 ? (
            <button 
              onClick={() => setStep(1)}
              className="mt-2 bg-rose-900/30 hover:bg-rose-800 text-rose-300 text-xs px-3 py-1.5 rounded font-mono border border-rose-800 transition-colors"
            >
              INITIATE RETIRE
            </button>
          ) : (
            <button 
              onClick={() => {}}
              className="mt-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-1.5 rounded font-mono transition-colors shadow-[0_0_15px_-3px_rgba(225,29,72,0.5)]"
            >
              CONFIRM RETIRE
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
