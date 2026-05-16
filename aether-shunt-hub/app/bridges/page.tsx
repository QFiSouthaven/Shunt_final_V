import { BridgeRunMatrix } from "@/components/section4/BridgeRunMatrix";
import { TailStdoutViewer } from "@/components/section4/TailStdoutViewer";
import { RetryCounterTable } from "@/components/section4/RetryCounterTable";
import { OrphanRecoveryTrigger } from "@/components/section4/OrphanRecoveryTrigger";
import { CompactionTrigger } from "@/components/section4/CompactionTrigger";
import { PermFailFlip } from "@/components/section4/PermFailFlip";
import { Providers } from "@/components/section4/Providers";

export default function BridgesPage() {
  return (
    <div className="p-6 flex flex-col h-screen overflow-hidden">
      <h2 className="text-lg shrink-0 font-semibold text-white mb-6 tracking-wide">BRIDGE ORCHESTRATOR</h2>
      
      <Providers>
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
          
          {/* Left Column */}
          <div className="lg:col-span-4 flex flex-col gap-6 min-h-0">
            <div className="flex-1 min-h-0">
              <BridgeRunMatrix />
            </div>
            <div className="shrink-0 h-[250px]">
              <RetryCounterTable />
            </div>
          </div>

          {/* Center Column */}
          <div className="lg:col-span-5 flex flex-col min-h-0">
            <TailStdoutViewer />
          </div>

          {/* Right Column */}
          <div className="lg:col-span-3 flex flex-col gap-6 min-h-0">
             <div className="shrink-0 h-[200px]">
               <OrphanRecoveryTrigger />
             </div>
             <div className="shrink-0 h-[250px]">
               <CompactionTrigger />
             </div>
             <div className="shrink-0 h-[150px]">
               <PermFailFlip />
             </div>
          </div>

        </div>
      </Providers>
    </div>
  );
}
