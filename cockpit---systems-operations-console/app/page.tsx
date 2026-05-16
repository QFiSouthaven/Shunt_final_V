'use client';

import { HealthProvider } from '@/components/HealthPoller';
import { Tier1ControlPanel } from '@/components/Tier1ControlPanel';
import { Tier2CircuitBoard } from '@/components/Tier2CircuitBoard';
import { Tier3DebugTool } from '@/components/Tier3DebugTool';
import { NodeDetailPanel } from '@/components/NodeDetailPanel';

export default function CockpitOverview() {
  return (
    <HealthProvider>
      <div className="min-h-screen bg-[#e6e4dc] text-[#33312e] font-sans relative">
         <header className="bg-[#eeece3] border-b-2 border-b-[#c2c0b8] border-t-2 border-t-white px-6 py-4 sticky top-0 z-50 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
               <div className="flex items-center justify-center font-mono text-xl font-bold bg-[#d5d3cb] border-t-2 border-l-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-2 border-r-2 border-b-white border-r-white text-[#4a4843] px-3 py-1 tracking-widest uppercase shadow-sm">
                 COCKPIT
               </div>
               <div>
                 <p className="text-[10px] uppercase font-bold tracking-widest text-[#6c6a65]">Systems Operations</p>
                 <p className="text-[10px] uppercase font-mono tracking-widest text-[#8c8a85]">Master Console</p>
               </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="font-mono text-[10px] font-bold tracking-widest text-[#6c6a65] border-2 border-[#b8b6af] border-b-white border-r-white px-2 py-1 bg-[#d5d3cb] shadow-inner">
                MK II
              </div>
              <div className="w-4 h-4 rounded-full bg-[#d5d3cb] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white flex items-center justify-center shadow-inner">
                 <div className="w-full h-[1px] bg-[#8c8a85] rotate-45"></div>
              </div>
            </div>
         </header>
         <main className="max-w-[1800px] mx-auto p-4 md:p-6 grid grid-cols-1 gap-6">
            <Tier1ControlPanel />
            <Tier2CircuitBoard />
            <Tier3DebugTool />
         </main>
         <NodeDetailPanel />
      </div>
    </HealthProvider>
  );
}
