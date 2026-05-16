import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Network } from "lucide-react";

export function BridgeStateMatrix() {
  const nodes = [
    { name: "lmstudio-bridge" },
    { name: "gemini-bridge" },
    { name: "retry-daemon" },
    { name: "panel-server" }
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Network className="h-4 w-4" />
          State Matrix
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* TODO(prompt:section-4): Implement orchestrator HTTP API fetch */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          {nodes.map((node) => (
            <div key={node.name} className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 font-mono truncate mr-2" title={node.name}>{node.name}</span>
              <div className="h-2 w-2 rounded-full bg-slate-600 shrink-0"></div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
