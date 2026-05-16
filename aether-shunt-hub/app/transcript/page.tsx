"use client";
import { useState } from "react";
import { AgentRosterFilter } from "@/components/section2/AgentRosterFilter";
import { LiveTranscript } from "@/components/section2/live-transcript";
import { PendingInboxesPane } from "@/components/section2/PendingInboxesPane";
import { AdminAuditLogViewer } from "@/components/section2/AdminAuditLogViewer";
import { TraceDrillDown } from "@/components/section2/TraceDrillDown";
import { PeerComparisonView } from "@/components/section2/PeerComparisonView";
import { TranscriptReplay } from "@/components/section2/TranscriptReplay";

export default function TranscriptPage() {
  const [selectedJid, setSelectedJid] = useState<string | undefined>(undefined);

  return (
    <div className="p-6 flex flex-col h-screen overflow-hidden">
      <h2 className="text-lg shrink-0 font-semibold text-white mb-6 tracking-wide">TRANSCRIPT VIEW</h2>
      
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0 min-w-0">
        {/* Left Column: Roster & Controls */}
        <div className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
          <div className="h-[400px] shrink-0">
            <AgentRosterFilter 
              selectedJid={selectedJid}
              onSelectJid={setSelectedJid}
            />
          </div>
          <div className="flex-1 min-h-[300px]">
            <AdminAuditLogViewer />
          </div>
        </div>

        {/* Center Column: Live Transcript */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="flex-1 min-h-0">
            <LiveTranscript filterJid={selectedJid} />
          </div>
          <div className="shrink-0">
            <TranscriptReplay />
          </div>
        </div>

        {/* Right Column: Inboxes & Analysis */}
        <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
          <div className="h-[300px] shrink-0">
            <PendingInboxesPane />
          </div>
          <div className="shrink-0">
            <TraceDrillDown />
          </div>
          <div className="shrink-0">
            <PeerComparisonView />
          </div>
        </div>
      </div>
    </div>
  );
}
