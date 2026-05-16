import { WorkerHealthTile } from "@/components/section1/WorkerHealthTile";
import { WorkerAuthProbeTile } from "@/components/section1/WorkerAuthProbeTile";
import { FileBusHeartbeatTile } from "@/components/section1/FileBusHeartbeatTile";
import { BridgeStateMatrix } from "@/components/section1/BridgeStateMatrix";
import { DLQDepthBadge } from "@/components/section1/DLQDepthBadge";
import { TranscriptLineCount } from "@/components/section1/TranscriptLineCount";
import { CFBindingsPanel } from "@/components/section1/CFBindingsPanel";
import { CostMeter } from "@/components/section1/CostMeter";
import { WorkerVersionBadge } from "@/components/section1/WorkerVersionBadge";

export const revalidate = 30;

export default function DashboardPage() {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-white mb-6 tracking-wide">SYSTEM OVERVIEW</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <WorkerHealthTile />
        <WorkerAuthProbeTile />
        <FileBusHeartbeatTile />
        <BridgeStateMatrix />
        <DLQDepthBadge />
        <TranscriptLineCount />
        <CFBindingsPanel />
        <CostMeter />
        <WorkerVersionBadge />
      </div>
    </div>
  );
}
