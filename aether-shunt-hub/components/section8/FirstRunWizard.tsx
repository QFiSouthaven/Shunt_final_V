"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, ArrowRight } from "lucide-react";
import { SecretEntryPane } from "./SecretEntryPane";
import { saveWizardSettings } from "@/app/settings/actions";

export function FirstRunWizard() {
  const [step, setStep] = useState(1);
  const [workerUrl, setWorkerUrl] = useState("http://localhost:8787");
  const [secret, setSecret] = useState("");
  const [cfAccount, setCfAccount] = useState("");
  const [adminJids, setAdminJids] = useState("");
  const [loading, setLoading] = useState(false);

  const isNextDisabled = () => {
    switch (step) {
      case 1: return !workerUrl;
      case 2: return !secret;
      case 3: return !cfAccount;
      case 4: return !adminJids;
      default: return false;
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto mt-10 bg-[#0a0a0c] border-indigo-900/50">
      <CardHeader className="border-b border-slate-800 bg-indigo-950/20">
        <CardTitle className="flex items-center gap-2 text-indigo-400 uppercase tracking-widest font-mono text-sm">
          <Sparkles className="w-4 h-4" />
          First-Run Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <form action={saveWizardSettings} onSubmit={() => setLoading(true)}>
          <input type="hidden" name="workerUrl" value={workerUrl} />
          <input type="hidden" name="secret" value={secret} />
          <input type="hidden" name="cfAccount" value={cfAccount} />
          <input type="hidden" name="adminJids" value={adminJids} />

          <div className="min-h-[200px]">
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in zoom-in-95">
                <div className="text-slate-300 font-bold mb-2">Step 1: Worker URL</div>
                <p className="text-xs text-slate-500 max-w-md leading-relaxed mb-4">
                  Provide the base URL where your panel-server Worker is running.
                  This is typically a local address during development or a Cloudflare Workers dev domain.
                </p>
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 uppercase tracking-widest">Worker URL</label>
                  <Input 
                    value={workerUrl}
                    onChange={e => setWorkerUrl(e.target.value)}
                    className="bg-black/40 border-slate-800 text-xs font-mono"
                    placeholder="http://localhost:8787"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 animate-in fade-in zoom-in-95">
                <div className="text-slate-300 font-bold mb-2">Step 2: Shared Secret</div>
                <p className="text-xs text-slate-500 max-w-md leading-relaxed mb-4">
                  Enter the API bearer token used to authenticate with the Worker.
                  This wizard uses localhost trust to bootstrap the initial connection.
                  This secret is saved securely server-side and never sent back to the client.
                </p>
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 uppercase tracking-widest">Bearer Secret</label>
                  <SecretEntryPane onChange={setSecret} />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 animate-in fade-in zoom-in-95">
                <div className="text-slate-300 font-bold mb-2">Step 3: Cloudflare Account ID</div>
                <p className="text-xs text-slate-500 max-w-md leading-relaxed mb-4">
                  Used for deployments and syncing routing rules via Cloudflare APIs.
                  Find this in the right sidebar of the Cloudflare dash.
                </p>
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 uppercase tracking-widest">Account ID</label>
                  <Input 
                    value={cfAccount}
                    onChange={e => setCfAccount(e.target.value)}
                    className="bg-black/40 border-slate-800 text-xs font-mono"
                    placeholder="e.g. abc123def456"
                  />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4 animate-in fade-in zoom-in-95">
                <div className="text-slate-300 font-bold mb-2">Step 4: Admin JIDs</div>
                <p className="text-xs text-slate-500 max-w-md leading-relaxed mb-4">
                  Provide a comma-separated list of Jabber IDs or email addresses that will be granted
                  hub admin authority. These users bypass standard routing constraints and can alter schemas.
                </p>
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 uppercase tracking-widest">Admin JIDs</label>
                  <Input 
                    value={adminJids}
                    onChange={e => setAdminJids(e.target.value)}
                    className="bg-black/40 border-slate-800 text-xs font-mono"
                    placeholder="admin@domain.com, root@domain.com"
                  />
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4 animate-in fade-in zoom-in-95">
                <div className="text-slate-300 font-bold mb-2">Confirm Configuration</div>
                <p className="text-xs text-slate-500 max-w-md leading-relaxed mb-4">
                  Your config is ready to be saved. The UI will reload to apply these changes.
                </p>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-black/40 p-4 border border-slate-800 rounded">
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">WORKER URL</div>
                    <div className="text-slate-300 truncate">{workerUrl}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">SECRET</div>
                    <div className="text-slate-300">&lt;redacted&gt;</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">ACCOUNT ID</div>
                    <div className="text-slate-300 truncate">{cfAccount}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">ADMIN JIDS</div>
                    <div className="text-slate-300 truncate">{adminJids}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-800">
            <div className="flex gap-1.5">
              {[1,2,3,4,5].map(s => (
                <div key={s} className={`h-1.5 w-6 rounded-full ${s === step ? 'bg-indigo-500' : s < step ? 'bg-indigo-900' : 'bg-slate-800'}`} />
              ))}
            </div>
            
            <div className="flex gap-2">
              {step > 1 && (
                <Button type="button" variant="ghost" onClick={() => setStep(s => s - 1)} disabled={loading} className="text-xs uppercase text-slate-500 hover:text-slate-300">
                  Back
                </Button>
              )}
              {step < 5 ? (
                <Button type="button" onClick={() => setStep(s => s + 1)} disabled={isNextDisabled()} className="bg-indigo-600 hover:bg-indigo-500 text-xs font-bold uppercase disabled:opacity-50 transition-colors">
                  Next <ArrowRight className="w-3 h-3 ml-2" />
                </Button>
              ) : (
                <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-xs font-bold uppercase transition-colors shadow-[0_0_15px_-3px_rgba(16,185,129,0.5)]">
                  {loading ? "Persisting..." : "Save & Finish"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
