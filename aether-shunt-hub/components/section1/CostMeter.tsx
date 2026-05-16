import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

export function CostMeter() {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Est. Cost
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex items-center">
        <div className="text-2xl font-mono text-slate-300">
          $25<span className="text-sm text-slate-500">/mo</span>
        </div>
      </CardContent>
    </Card>
  );
}
