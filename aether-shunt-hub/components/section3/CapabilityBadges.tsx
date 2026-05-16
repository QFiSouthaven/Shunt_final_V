import { jidColor } from "@/lib/jid-color";

const KNOWN_CAPS = ["reason", "code", "tools:mcp", "chat", "local"];

export function CapabilityBadges({ capabilities = [] }: { capabilities?: string[] }) {
  if (!capabilities.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {capabilities.map(cap => {
        const isKnown = KNOWN_CAPS.includes(cap);
        return (
          <span
            key={cap}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${isKnown ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" : "bg-slate-800 border-slate-700 text-slate-400"}`}
          >
            {cap}
          </span>
        );
      })}
    </div>
  );
}
