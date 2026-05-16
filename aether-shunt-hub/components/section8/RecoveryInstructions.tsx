import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LifeBuoy } from "lucide-react";

export function RecoveryInstructions() {
  return (
    <Card className="bg-amber-950/20 border-amber-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-amber-500 uppercase tracking-widest flex items-center gap-2">
          <LifeBuoy className="h-4 w-4" />
          If Chat Resets
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <p className="text-xs text-slate-400 leading-relaxed">
          If the context window gets flushed or the code editor loses state:
        </p>
        <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1">
          <li>Check `<code className="text-slate-300">HANDBOOK.md</code>` for the canonical architecture.</li>
          <li>Look in `<code className="text-slate-300">.pending-acks.json</code>` for orphaned orchestrator locks.</li>
          <li>Never re-run the scaffolding commands without checking existing files first.</li>
        </ul>
      </CardContent>
    </Card>
  );
}
