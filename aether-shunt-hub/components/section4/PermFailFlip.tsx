import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ToggleRight } from "lucide-react";

export function PermFailFlip() {
  return (
    <Card className="bg-[#0a0a0c] h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <ToggleRight className="h-4 w-4" />
          Perm-Fail Flip
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex-1 flex items-center justify-center">
        <div className="text-xs font-mono text-slate-500 italic text-center">
          TODO(prompt:section-4-p2): Scaffold for perm fail flip
        </div>
      </CardContent>
    </Card>
  );
}
