"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PenLine, AlertTriangle, Send } from "lucide-react";
import { kindMap } from "@/lib/kind-map";

export function SendAsPeerComposer() {
  const [agents, setAgents] = useState<any[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [room, setRoom] = useState("");
  const [kind, setKind] = useState("message");
  const [intent, setIntent] = useState("");
  const [body, setBody] = useState("");
  
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch("/api/worker/presence");
        if (res.ok) {
          const data = await res.json();
          setAgents(data.agents || []);
          if (data.agents?.length > 0) {
            setFrom(data.agents[0].jid);
          }
        }
      } catch (e) {}
    }
    fetchAgents();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to || !kind) return;
    
    setStatus("submitting");
    try {
      const payload = {
        from, to, kind,
        ...(room ? { room } : {}),
        ...(intent ? { intent } : {}),
        ...(body ? { body } : {})
      };
      
      const res = await fetch("/api/worker/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (res.ok && data.ok) {
        setStatus("success");
        setStatusMsg(`Sent! ID: ${data.id}`);
        setBody(""); // keep headers for subsequent sends
      } else {
        setStatus("error");
        setStatusMsg(`Failed: ${data.error || 'Server error'}`);
      }
    } catch (err) {
      setStatus("error");
      setStatusMsg("Network error");
    }
  };

  return (
    <Card className="flex flex-col h-full bg-[#0a0a0c]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <PenLine className="h-4 w-4" />
          Send As Peer
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase">From (Spoof)</label>
              <select 
                value={from} 
                onChange={e => setFrom(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none"
              >
                {agents.map(ag => <option key={ag.jid} value={ag.jid}>{ag.jid}</option>)}
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase">To</label>
              <input 
                value={to} 
                onChange={e => setTo(e.target.value)}
                placeholder="target.jid"
                required
                className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase">Kind</label>
              <select 
                value={kind} 
                onChange={e => setKind(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none"
              >
                {kindMap.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase">Room (Opt)</label>
              <input 
                value={room} 
                onChange={e => setRoom(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase">Intent (Opt)</label>
              <input 
                value={intent} 
                onChange={e => setIntent(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
          
          <div className="space-y-1 mt-2">
            <label className="text-[10px] text-slate-500 uppercase flex justify-between">
              Body
              <span className="text-[9px] bg-slate-800 text-slate-400 px-1 rounded">Markdown</span>
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded p-2 outline-none focus:border-emerald-500/50 font-mono"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs font-mono">
              {status === "error" && <span className="text-rose-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {statusMsg}</span>}
              {status === "success" && <span className="text-emerald-400">{statusMsg}</span>}
              {status === "submitting" && <span className="text-slate-500 italic">Sending...</span>}
            </div>
            <button 
              type="submit" 
              disabled={status === "submitting" || !from || !to}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-1.5 rounded transition-all flex items-center gap-2"
            >
              <Send className="h-3 w-3" />
              INJECT
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
