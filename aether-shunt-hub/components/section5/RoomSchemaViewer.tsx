"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FileCode2 } from "lucide-react";

export function RoomSchemaViewer({ room, setEmptyState }: { room: string, setEmptyState?: (isEmpty: boolean) => void }) {
  const [schema, setSchema] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSchema() {
      try {
        const res = await fetch(`/api/worker/room/${encodeURIComponent(room)}/schema`);
        const data = await res.json();
        if (!res.ok) {
          if (data.code === 'NOT_FOUND') {
            setSchema(null);
            setEmptyState?.(true);
          }
        } else {
          setSchema(data);
          setEmptyState?.(false);
        }
      } catch (e) {
      }
      setLoading(false);
    }
    fetchSchema();
  }, [room, setEmptyState]);

  return (
    <Card className="flex flex-col h-full bg-[#0a0a0c]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <FileCode2 className="h-4 w-4" />
          Active Schema
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex-1">
        {loading ? (
          <div className="text-xs text-slate-500 italic">Loading schema...</div>
        ) : !schema ? (
          <div className="text-xs text-slate-500 italic">No schema configured for this room.</div>
        ) : (
          <div className="flex flex-col gap-4">
             <div className="flex gap-4 border-b border-slate-800 pb-4">
               <div>
                 <div className="text-[10px] text-slate-500 uppercase">Policy</div>
                 <div className={`mt-1 text-xs font-bold uppercase px-2 py-0.5 inline-block rounded 
                   ${schema.policy === 'strict' ? 'bg-rose-500/20 text-rose-400' : 
                     schema.policy === 'warn' ? 'bg-amber-500/20 text-amber-400' : 
                     'bg-slate-500/20 text-slate-400'}`
                 }>
                   {schema.policy}
                 </div>
               </div>
               <div>
                 <div className="text-[10px] text-slate-500 uppercase">Updated By</div>
                 <div className="mt-1 text-xs font-mono text-slate-300">{schema.updated_by}</div>
               </div>
               <div>
                 <div className="text-[10px] text-slate-500 uppercase">Updated At</div>
                 <div className="mt-1 text-xs font-mono text-slate-300">{schema.updated_at || 'unknown'}</div>
               </div>
             </div>
             
             <div>
               <div className="text-[10px] text-slate-500 uppercase mb-2">Zod JSON</div>
               <pre className="p-3 rounded bg-black/40 border border-slate-800 text-[10px] font-mono text-emerald-400/90 overflow-x-auto">
                 {schema.zod_json}
               </pre>
             </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
