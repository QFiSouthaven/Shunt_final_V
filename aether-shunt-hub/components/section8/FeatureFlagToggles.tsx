"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SlidersHorizontal } from "lucide-react";

export function FeatureFlagToggles({ defaults }: { defaults: { dualWrite: boolean, sound: boolean, theme: string } }) {
  const [dualWrite, setDualWrite] = useState(defaults.dualWrite);
  const [sound, setSound] = useState(defaults.sound);
  const [theme, setTheme] = useState(defaults.theme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const storedDw = localStorage.getItem("ff_dual_write");
    const storedSd = localStorage.getItem("ff_sound");
    const storedTh = localStorage.getItem("ff_theme");
    
    if (storedDw !== null) setDualWrite(storedDw === 'true');
    if (storedSd !== null) setSound(storedSd === 'true');
    if (storedTh !== null) setTheme(storedTh);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("ff_dual_write", String(dualWrite));
    localStorage.setItem("ff_sound", String(sound));
    localStorage.setItem("ff_theme", theme);
  }, [dualWrite, sound, theme, mounted]);

  const toggleUI = (label: string, active: boolean, onClick: () => void) => (
    <div className="flex items-center justify-between p-3 bg-black/20 border border-slate-800/50 rounded hover:border-slate-800 transition-colors">
      <span className="text-xs text-slate-400 capitalize">{label}</span>
      <button 
        onClick={onClick}
        className={`w-10 h-5 rounded-full relative transition-colors ${active ? 'bg-indigo-600' : 'bg-slate-700'}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${active ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );

  return (
    <Card className="bg-[#0a0a0c]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Client Overrides
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {toggleUI("Dual-Write Output", dualWrite, () => setDualWrite(x => !x))}
        {toggleUI("Sound Effects", sound, () => setSound(x => !x))}
        
        <div className="flex items-center justify-between p-3 bg-black/20 border border-slate-800/50 rounded">
          <span className="text-xs text-slate-400">Theme</span>
          <div className="flex bg-slate-900 rounded p-1">
             {['dark', 'light', 'system'].map(t => (
                <button 
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`px-3 py-1 text-xs rounded uppercase tracking-wider font-bold transition-colors ${theme === t ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {t}
                </button>
             ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
