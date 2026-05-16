import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Database } from "lucide-react";

export function CFBindingsPanel() {
  const bindings = ["DO", "KV", "D1", "R2"];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Database className="h-4 w-4" />
          CF Bindings
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* TODO(prompt:section-1-p1): Implement CFBindingsPanel checking */}
        <div className="flex gap-2 mt-1">
          {bindings.map(b => (
            <div key={b} className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-500 font-mono text-[10px]">
              {b}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
