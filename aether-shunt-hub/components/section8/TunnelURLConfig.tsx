"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Network } from "lucide-react";

export function TunnelURLConfig({ initialUrl = "" }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/tunnel-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setStatus("success");
    } catch (e: any) {
      setStatus(`error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-[#0a0a0c]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Network className="h-4 w-4" />
          Cloudflared Tunnel URL
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <p className="text-xs text-slate-500 max-w-sm">
          URL that fronts panel-server. Must be a <code className="text-indigo-400 bg-indigo-950/30 px-1 py-0.5 rounded">.trycloudflare.com</code> or <code className="text-indigo-400 bg-indigo-950/30 px-1 py-0.5 rounded">localhost:7777</code> domain.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
          <Input 
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="bg-black/40 border-slate-800 text-xs font-mono max-w-sm"
            placeholder="https://xyz.trycloudflare.com"
          />
          <Button 
            onClick={handleSave} 
            disabled={loading}
            className="text-xs font-bold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            {loading ? "Saving..." : "Save Route"}
          </Button>
        </div>
        {status && (
          <div className={`text-xs font-mono ${status === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>
            {status === 'success' ? 'Tunnel URL updated.' : status}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
