"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ShieldCheck, AlertCircle } from "lucide-react";

export function AdminAuditLogViewer() {
  const [logs, setLogs] = useState<any[]>([]);
  const [pendingWarning, setPendingWarning] = useState(0);
  const [filter, setFilter] = useState("completed");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function fetchAudit() {
      try {
        const res = await fetch(`/api/admin/audit?status=${filter}`);
        if (!res.ok) {
          setErrorMsg(`Error HTTP ${res.status}`);
          setLogs([]);
          if (res.status === 403) {
            setErrorMsg("403 Forbidden: Requires Admin");
          }
          return;
        }
        const data = await res.json();
        setLogs(data.entries || []);
        setPendingWarning(data.pendingOlderThan60s || 0);
        setErrorMsg("");
      } catch (e) {
        setErrorMsg("Fetch Error");
      }
    }
    fetchAudit();
    const inv = setInterval(fetchAudit, 15000);
    return () => clearInterval(inv);
  }, [filter]);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Audit Log
        </CardTitle>
        <select 
          value={filter} 
          onChange={(e) => setFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1 outline-none"
        >
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="all">All</option>
        </select>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
        {pendingWarning > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-2 rounded text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Warning: {pendingWarning} pending audit(s) older than 60s.</span>
          </div>
        )}
        
        {errorMsg ? (
          <div className="text-rose-400 text-xs font-mono">{errorMsg}</div>
        ) : logs.length === 0 ? (
          <div className="text-slate-500 text-xs italic">No logs found.</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log, idx) => (
              <div key={idx} className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span>{new Date(log.timestamp).toISOString()}</span>
                  <span className={`px-1 rounded bg-slate-800 ${log.status === 'failed' ? 'text-rose-400' : 'text-slate-300'}`}>{log.status}</span>
                </div>
                <div className="text-emerald-400">{log.action || 'Unknown Action'}</div>
                {log.details && <div className="text-slate-500 truncate mt-1">{JSON.stringify(log.details)}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
