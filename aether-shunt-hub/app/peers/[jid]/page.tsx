import { PeerInboxBrowser } from "@/components/section3/PeerInboxBrowser";
import { PeerOutboxBrowser } from "@/components/section3/PeerOutboxBrowser";
import { PeerReadHistory } from "@/components/section3/PeerReadHistory";
import { CapabilityBadges } from "@/components/section3/CapabilityBadges";
import { PeerRetireAction } from "@/components/section3/PeerRetireAction";
import { jidColor } from "@/lib/jid-color";

export default async function PeerDetailPage(props: { params: Promise<{ jid: string }> }) {
  const params = await props.params;
  const decodedJid = decodeURIComponent(params.jid);

  let agent = { jid: decodedJid, capabilities: [], lastSeenAt: null };
  try {
    const res = await fetch("http://localhost:3000/api/worker/presence", { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const match = (data.agents || []).find((a: any) => a.jid === decodedJid);
      if (match) agent = match;
    }
  } catch (e) {}

  return (
    <div className="p-6 flex flex-col h-screen overflow-hidden">
      <div className="shrink-0 mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <div className={`h-12 w-12 rounded-full ${jidColor(agent.jid)}`} />
          </div>
          <div>
            <h2 className="text-xl font-bold font-mono text-white tracking-wide">{agent.jid}</h2>
            <div className="mt-1">
              <CapabilityBadges capabilities={agent.capabilities} />
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        <div className="col-span-1 min-h-0 flex flex-col gap-6">
          <div className="flex-1 min-h-0">
            <PeerInboxBrowser jid={agent.jid} />
          </div>
          <div className="shrink-0">
            <PeerRetireAction jid={agent.jid} />
          </div>
        </div>
        <div className="col-span-1 min-h-0">
          <PeerOutboxBrowser />
        </div>
        <div className="col-span-1 min-h-0">
          <PeerReadHistory />
        </div>
      </div>
    </div>
  );
}
