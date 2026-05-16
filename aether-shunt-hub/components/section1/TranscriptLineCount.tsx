import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export function TranscriptLineCount() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Transcript Lines
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* TODO(prompt:section-1-p1): Implement TranscriptLineCount fetch */}
        <div className="flex flex-col gap-1 mt-1 text-slate-500 font-mono text-sm">
          <span>Total Lines: <span className="text-slate-400">---</span></span>
          <span className="text-[10px] mt-1 space-x-1">
            <span className="uppercase">Last Rotation:</span>
            <span className="text-slate-400">---</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
