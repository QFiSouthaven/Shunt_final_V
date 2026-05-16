import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Inbox, AlertCircle } from "lucide-react";
import { panelFetch } from "@/lib/panel-client";

export async function DLQDepthBadge() {
  let dlqCount = 0;
  let errorMsg = "";

  try {
    const res = await panelFetch('/api/state', { cache: 'no-store' });
    if (!res.ok) {
      errorMsg = `HTTP ${res.status}`;
    } else {
      const data = await res.json();
      const inboxCounts = data.inbox_counts || {};
      dlqCount = inboxCounts['@dlq'] || 0;
    }
  } catch (error) {
    errorMsg = "Fetch Error";
  }

  let colorClass = "text-emerald-400";
  let bgClass = "bg-emerald-500/10 border-emerald-500/20";
  
  if (dlqCount > 25) {
    colorClass = "text-rose-400";
    bgClass = "bg-rose-500/10 border-rose-500/20";
  } else if (dlqCount > 0) {
    colorClass = "text-amber-400";
    bgClass = "bg-amber-500/10 border-amber-500/20";
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Inbox className="h-4 w-4" />
          DLQ Depth
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center">
        {errorMsg ? (
          <div className="text-rose-400 text-sm font-mono flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> {errorMsg}
          </div>
        ) : (
          <div className={`self-start inline-flex items-center justify-center px-4 py-2 rounded-lg border ${bgClass} ${colorClass}`}>
            <span className="text-3xl font-bold font-mono leading-none">
              {dlqCount}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
