"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export function SelfBrickingWarningBanner({ policy, zodJson }: { policy: string, zodJson: string }) {
  const [adminJids, setAdminJids] = useState<string[]>([]);
  const [wouldBrick, setWouldBrick] = useState(false);

  useEffect(() => {
    fetch("/api/admin/admin-jids")
      .then(r => r.json())
      .then(d => setAdminJids(d.jids || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (policy !== 'strict') {
      setWouldBrick(false);
      return;
    }
    
    try {
      const schema = JSON.parse(zodJson);
      if (schema.properties?.from?.enum && adminJids.length > 0) {
        const allowed = schema.properties.from.enum;
        if (!adminJids.some(jid => allowed.includes(jid))) {
          setWouldBrick(true);
          return;
        }
      }
    } catch(e) {}
    
    setWouldBrick(false);
  }, [policy, zodJson, adminJids]);

  if (!wouldBrick) return null;

  return (
    <div className="bg-rose-950/50 border border-rose-900 text-rose-400 p-3 rounded flex items-center gap-3 mb-4">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <div className="text-xs font-bold uppercase tracking-wide">
        This schema would reject your own schema-update envelope.
      </div>
    </div>
  );
}
