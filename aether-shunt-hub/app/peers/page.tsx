import { PeerRoster } from "@/components/section3/PeerRoster";
import { SendAsPeerComposer } from "@/components/section3/SendAsPeerComposer";

export default function PeersIndexPage() {
  return (
    <div className="p-6 flex flex-col h-screen overflow-hidden">
      <h2 className="text-lg shrink-0 font-semibold text-white mb-6 tracking-wide">PEERS SYSTEM</h2>
      
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0 min-w-0">
        <div className="w-full lg:w-1/2 flex-shrink-0 min-h-0">
          <PeerRoster />
        </div>
        <div className="w-full lg:w-1/2 flex-shrink-0 min-h-0">
          <SendAsPeerComposer />
        </div>
      </div>
    </div>
  );
}
