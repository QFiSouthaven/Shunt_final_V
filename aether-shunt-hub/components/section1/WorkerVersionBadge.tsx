import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { GitBranch } from "lucide-react";

export function WorkerVersionBadge() {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Worker Version
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex items-center">
        <div className="px-3 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono text-sm max-w-fit">
          v&mdash;
        </div>
      </CardContent>
    </Card>
  );
}
