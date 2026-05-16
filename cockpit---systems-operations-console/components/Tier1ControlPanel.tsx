'use client';

import React, { useState } from 'react';
import { useHealth, HealthStatus } from './HealthPoller';
import { colors } from '@/lib/colorPalette';
import { SystemEntry } from '@/lib/systemRegistry';
import { PlayIcon, StopIcon, ActivityIcon, PlusIcon, XIcon, ServerStackIcon, RefreshIcon } from '@/components/icons';

function PowerKnob({ systemId, status }: { systemId: string, status: HealthStatus }) {
  const { startSystem, stopSystem } = useHealth();
  const isRunning = status === 'running' || status === 'starting';

  return (
    <button
      onClick={() => isRunning ? stopSystem(systemId) : startSystem(systemId)}
      className={`relative w-12 h-12 flex items-center justify-center transition-transform active:scale-95 rounded-full border-2 shadow-md ${isRunning ? 'bg-[#d5d3cb] border-[#b8b6af] shadow-[inset_1px_2px_4px_rgba(0,0,0,0.1)]' : 'bg-[#eeece3] border-t-white border-l-white border-b-[#b8b6af] border-r-[#b8b6af] shadow-[2px_3px_5px_rgba(0,0,0,0.1)]'}`}
    >
      <div className={`absolute -right-1 -top-1 w-3 h-3 rounded-full ${colors.health[status]} pointer-events-none`} />
      {isRunning ? <StopIcon className={`w-5 h-5 ${colors.text[status]}`} /> : <PlayIcon className="w-5 h-5 text-[#8c8a85]" />}
    </button>
  );
}

function SystemTile({ system }: { system: SystemEntry }) {
  const { healthStates, removeSystem, forceRefreshSystem, setSelectedSystemId } = useHealth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const state = healthStates[system.id] || { status: 'stopped' };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    await forceRefreshSystem(system.id);
    setIsRefreshing(false);
  };

  return (
    <div 
      onClick={() => setSelectedSystemId(system.id)}
      className="flex items-center gap-5 bg-[#eeece3] border-y-2 border-x-2 border-t-white border-l-white border-b-[#c2c0b8] border-r-[#c2c0b8] p-4 relative group shadow-sm rounded-sm cursor-pointer hover:bg-[#eeece3] hover:border-[#8c8a85] transition-all"
    >
      {/* Module connecting line decor */}
      <div className="hidden absolute left-0 top-1/2 w-2 h-[2px] bg-[#a2a098]" />
      
      <PowerKnob systemId={system.id} status={state.status} />
      <div className="flex-1 min-w-0 flex flex-col justify-center border-l-2 border-l-[#d5d3cb] border-r-2 border-r-white pl-4 -ml-1 py-1 group-hover:border-l-[#a2a098] transition-colors">
        <h3 className="text-sm font-bold font-sans text-[#33312e] uppercase truncate group-hover:text-[#b45309]">{system.name}</h3>
        <p className="text-[10px] font-mono font-semibold text-[#8c8a85] truncate mt-0.5">{system.transport}</p>
        <div className="flex items-center gap-3 mt-2 font-mono text-[10px] uppercase font-bold">
          <div className="flex items-center gap-1.5">
            <span className={state.status === 'running' ? 'text-[#16a34a]' : 'text-[#8c8a85]'}>{state.status}</span>
          </div>
          {state.latency !== undefined && (
             <span className="text-[#8c8a85]">LAT: <span className="text-[#33312e]">{state.latency}ms</span></span>
          )}
        </div>
      </div>
      <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
           onClick={handleRefresh}
           disabled={isRefreshing}
           className="p-1.5 bg-[#d5d3cb] border border-[#b8b6af] rounded-sm text-[#4a4843] hover:bg-[#e4e2d9] disabled:opacity-50 transition-colors shadow-sm active:shadow-inner"
           title="Force Refresh"
        >
          <RefreshIcon className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
        <button 
           onClick={(e) => { e.stopPropagation(); removeSystem(system.id); }}
           className="p-1.5 bg-[#d5d3cb] border border-[#b8b6af] rounded-sm text-[#4a4843] hover:bg-[#e4e2d9] hover:text-[#dc2626] transition-colors shadow-sm active:shadow-inner"
           title="Remove Integration"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function MasterPowerKnob() {
  const { startAllSystems } = useHealth();
  return (
    <button 
      onClick={startAllSystems}
      className="flex items-center gap-2 px-6 py-3 bg-[#eeece3] text-[#b45309] border-2 border-t-white border-l-white border-b-[#b8b6af] border-r-[#b8b6af] shadow-[1px_3px_5px_rgba(0,0,0,0.1)] transition-all active:scale-95 active:shadow-inner font-bold uppercase tracking-widest text-[11px]"
    >
      <ActivityIcon className="w-4 h-4" />
      ENGAGE ALL
    </button>
  );
}

function AddIntegrationForm({ onCancel, onSave }: { onCancel: ()=>void, onSave: (sys: SystemEntry)=>void }) {
  const { systems } = useHealth();
  const [formData, setFormData] = useState<Partial<SystemEntry>>({
     group: 'custom' as any,
     deps: [],
     transport: 'http'
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const id = formData.id?.trim();
    const name = formData.name?.trim();

    if (!id || !name) {
      setError("ID AND NAME ARE REQUIRED");
      return;
    }

    // Format validation: alphanumeric and hyphens
    const idRegex = /^[a-zA-Z0-9-]+$/;
    if (!idRegex.test(id)) {
      setError("INVALID ID FORMAT: USE ALPHANUMERIC AND HYPHENS ONLY");
      return;
    }

    // Uniqueness validation
    const exists = systems.some(s => s.id.toLowerCase() === id.toLowerCase());
    if (exists) {
      setError(`CONFLICT: SYSTEM_ID '${id}' ALREADY REGISTERED`);
      return;
    }

    onSave({ ...formData, id, name } as SystemEntry);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-[#d5d3cb] border-2 border-[#b8b6af] p-5 flex flex-col gap-4 font-mono shadow-inner rounded-sm">
       <div className="flex justify-between items-center pb-2 border-b-2 border-[#b8b6af]">
         <h3 className="text-[11px] font-bold tracking-widest text-[#4a4843] uppercase">Add Module</h3>
         <button type="button" onClick={onCancel} className="text-[#8c8a85] hover:text-[#33312e]"><XIcon className="w-4 h-4"/></button>
       </div>
       
       <div className="space-y-1">
         <input 
           required placeholder="SYSTEM_ID (e.g. my-app)" 
           className={`w-full bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white px-3 py-2 text-[11px] tracking-widest text-[#33312e] focus:outline-none placeholder-[#8c8a85] uppercase shadow-inner ${error && error.includes('ID') ? 'border-red-500 ring-1 ring-red-500' : ''}`}
           onChange={e => {
             setError(null);
             setFormData({...formData, id: e.target.value});
           }}
         />
         <p className="text-[9px] text-[#6c6a65] font-bold">CHARS: A-Z, 0-9, -</p>
       </div>

       <input 
         required placeholder="DISPLAY_NAME (e.g. My App)" 
         className="w-full bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white px-3 py-2 text-[11px] tracking-widest text-[#33312e] focus:outline-none placeholder-[#8c8a85] uppercase shadow-inner"
         onChange={e => setFormData({...formData, name: e.target.value})}
       />
       <input 
         placeholder="URL (e.g. http://localhost:8080)" 
         className="w-full bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white px-3 py-2 text-[11px] tracking-widest text-[#33312e] focus:outline-none placeholder-[#8c8a85] shadow-inner"
         onChange={e => setFormData({...formData, url: e.target.value, transport: e.target.value ? 'http' : 'local'})}
       />
       <input 
         placeholder="HEALTH_PATH (e.g. /health)" 
         className="w-full bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white px-3 py-2 text-[11px] tracking-widest text-[#33312e] focus:outline-none placeholder-[#8c8a85] shadow-inner"
         onChange={e => setFormData({...formData, healthPath: e.target.value})}
       />

       {error && (
         <div className="bg-red-500/10 border border-red-500/30 p-2 text-[10px] text-red-600 font-bold text-center animate-pulse">
           {error}
         </div>
       )}

       <div className="flex gap-3 pt-2">
         <button type="button" onClick={onCancel} className="flex-1 py-2 text-[11px] font-bold tracking-widest text-[#6c6a65] bg-[#e8e6df] shadow-sm border border-[#c2c0b8] hover:bg-[#eeece3] transition-colors uppercase active:shadow-inner">CANCEL</button>
         <button type="submit" className="flex-1 py-2 text-[11px] font-bold tracking-widest text-white bg-[#d97706] shadow-sm border border-[#b45309] hover:bg-[#b45309] transition-colors uppercase active:shadow-inner">REGISTER</button>
       </div>
    </form>
  );
}

function EmptySlot() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { addSystem } = useHealth();

  if (isFormOpen) {
     return <AddIntegrationForm onCancel={() => setIsFormOpen(false)} onSave={(sys) => { addSystem(sys); setIsFormOpen(false); }} />;
  }

  return (
    <button 
      onClick={() => setIsFormOpen(true)}
      className="flex flex-col items-center justify-center gap-2 h-full min-h-[100px] border-2 border-dashed border-[#a2a098] hover:border-[#8c8a85] bg-[#e4e2d9]/50 hover:bg-[#e4e2d9] transition-all text-[#6c6a65] rounded-sm"
    >
      <PlusIcon className="w-6 h-6" />
      <span className="font-mono text-[11px] font-bold tracking-widest uppercase">ADD MODULE</span>
    </button>
  );
}

function TierHeader() {
  const { systems, healthStates } = useHealth();
  const runningCount = systems.filter(s => healthStates[s.id]?.status === 'running').length;

  return (
    <div className="flex items-center justify-between mb-8 pb-4 border-b-2 border-b-[#c2c0b8] border-t-white pt-2">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-sm bg-[#c2c0b8] border-t-2 border-l-2 border-t-white border-l-white border-b-2 border-r-2 border-[#a2a098] flex items-center justify-center shadow-sm">
           <ServerStackIcon className="w-5 h-5 text-[#4a4843]" />
        </div>
        <h2 className="text-[16px] font-bold tracking-widest text-[#33312e] uppercase">MAIN CONTROL</h2>
      </div>
      <div className="flex items-center gap-8">
         <div className="flex items-center gap-2 bg-[#d5d3cb] px-4 py-2 border-2 border-[#b8b6af] border-b-white border-r-white shadow-inner font-mono text-[11px] font-bold">
           <span className="text-[#6c6a65]">ACTIVE:</span>
           <span className="text-[#16a34a] text-sm">{runningCount}</span>
           <span className="text-[#6c6a65]">/ {systems.length}</span>
         </div>
         <MasterPowerKnob />
      </div>
    </div>
  );
}

export function Tier1ControlPanel() {
  const { systems } = useHealth();
  
  return (
    <section className="bg-[#dfddd4] border-2 border-t-white border-l-white border-b-[#b8b6af] border-r-[#b8b6af] p-6 md:p-8 shadow-lg relative rounded-sm">
      {/* Decorative screws */}
      <div className="absolute top-3 left-3 w-3 h-3 rounded-full bg-[#c2c0b8] shadow-inner border border-[#a2a098] flex items-center justify-center"><div className="w-full h-[1px] bg-[#8c8a85] rotate-45"></div></div>
      <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-[#c2c0b8] shadow-inner border border-[#a2a098] flex items-center justify-center"><div className="w-full h-[1px] bg-[#8c8a85] -rotate-45"></div></div>
      <div className="absolute bottom-3 left-3 w-3 h-3 rounded-full bg-[#c2c0b8] shadow-inner border border-[#a2a098] flex items-center justify-center"><div className="w-full h-[1px] bg-[#8c8a85] rotate-12"></div></div>
      <div className="absolute bottom-3 right-3 w-3 h-3 rounded-full bg-[#c2c0b8] shadow-inner border border-[#a2a098] flex items-center justify-center"><div className="w-full h-[1px] bg-[#8c8a85] -rotate-12"></div></div>

      <TierHeader />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {systems.map(sys => (
          <SystemTile key={sys.id} system={sys} />
        ))}
        <EmptySlot />
      </div>
    </section>
  );
}
