import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { GitMerge } from "lucide-react";

export function HopCeilingDisplay() {
  return (
    <Card className="bg-[#0a0a0c] h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <GitMerge className="h-4 w-4" />
          Hop Ceiling
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex-1 flex items-center justify-center text-center">
        <div className="text-xs font-mono text-slate-500 italic">
          TODO(prompt:section-5-p2): Scaffold for hop ceiling display
        </div>
      </CardContent>
    </Card>
  );
}
