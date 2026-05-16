"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, Eye, EyeOff } from "lucide-react";

export function SecretEntryPane({ defaultValue = "", onChange }: { defaultValue?: string, onChange: (v: string) => void }) {
  const [isSet, setIsSet] = useState(!!defaultValue);
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);

  if (isSet) {
    return (
      <div className="flex items-center gap-4 bg-emerald-950/20 border border-emerald-900 text-emerald-400 p-3 rounded text-sm font-mono">
        <Lock className="w-4 h-4" />
        Secret is configured.
        <Button 
          type="button"
          size="sm" 
          variant="outline" 
          onClick={() => { setIsSet(false); setValue(""); onChange(""); }}
          className="ml-auto text-xs h-7"
        >
          Replace
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => { setValue(e.target.value); onChange(e.target.value); }}
        className="pr-10 bg-black/40 border-slate-800 font-mono text-xs text-slate-300"
        placeholder="Enter bearer secret..."
      />
      <button 
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
