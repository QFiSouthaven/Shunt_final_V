import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Send } from "lucide-react";

export function PeerOutboxBrowser() {
  return (
    <Card className="flex flex-col h-full bg-[#0a0a0c]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Send className="h-4 w-4" />
          Outbox
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex items-center justify-center p-8">
        <div className="text-xs text-slate-500 italic text-center text-balance font-mono">
          TODO(prompt:section-3-p1): Outbox endpoint does not yet exist. Blocked on panel-server addition.
        </div>
      </CardContent>
    </Card>
  );
}
