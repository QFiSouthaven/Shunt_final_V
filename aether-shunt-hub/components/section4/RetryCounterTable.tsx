"use client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Activity } from "lucide-react";

export function RetryCounterTable() {
  const { data } = useQuery({
    queryKey: ["bridge-status"],
    queryFn: async () => {
      const res = await fetch("/api/orchestrator/status");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const bridges = data?.bridges || [];

  return (
    <Card className="bg-[#0a0a0c] h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Retry Counters
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="py-2 text-xs font-medium text-slate-400">Bridge</th>
              <th className="py-2 text-xs font-medium text-slate-400">Restarts</th>
              <th className="py-2 text-xs font-medium text-slate-400">Backoff State</th>
            </tr>
          </thead>
          <tbody>
            {bridges.length === 0 && (
               <tr className="border-b border-slate-800">
                 <td colSpan={3} className="py-2 text-center text-slate-500 italic text-xs">No bridges found</td>
               </tr>
            )}
            {bridges.map((b: any) => (
              <tr key={b.name} className="border-b border-slate-800">
                <td className="py-2 font-mono text-xs text-slate-200">{b.name}</td>
                <td className="py-2 font-mono text-xs text-amber-400">{b.restarts}</td>
                <td className="py-2 font-mono text-xs text-slate-500 italic">
                  TODO: wait for orchestrator exponse backoff
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
