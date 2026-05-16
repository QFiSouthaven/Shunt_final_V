'use client';

import React, { useState, useEffect } from 'react';
import { useHealth } from './HealthPoller';
import { XIcon, InfoIcon, LinkIcon, HistoryIcon } from '@/components/icons';
import { colors } from '@/lib/colorPalette';
import { eventBus, SystemEvent } from '@/lib/eventBus';
import { motion, AnimatePresence } from 'motion/react';
import { HubRelayRouting } from './HubRelayRouting';

export function NodeDetailPanel() {
  const { selectedSystemId, setSelectedSystemId, systems, healthStates } = useHealth();
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [events, setEvents] = useState<SystemEvent[]>(() => {
    if (typeof window === 'undefined') return [];
    return eventBus.getHistory().reverse().slice(0, 100);
  });

  const system = systems.find(s => s.id === selectedSystemId);
  const state = selectedSystemId ? healthStates[selectedSystemId] : null;

  useEffect(() => {
    const unsub = eventBus.subscribe((ev) => {
      setEvents(prev => [ev, ...prev].slice(0, 100));
    });
    return unsub;
  }, []);

  if (!selectedSystemId) return null;
  if (!system) return null;

  const filteredEvents = events.filter(ev => {
    const isTarget = ev.systemId === selectedSystemId || ev.systemId === 'system';
    const matchesLevel = filterLevel === 'all' || ev.level === filterLevel;
    return isTarget && matchesLevel;
  });
  const dependencySystems = system.deps.map(depId => systems.find(s => s.id === depId)).filter(Boolean);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 100 }}
        className="fixed top-[72px] right-6 bottom-6 w-96 z-40"
      >
        <div className="h-full bg-[#dfddd4] border-2 border-t-white border-l-white border-b-[#b8b6af] border-r-[#b8b6af] shadow-2xl flex flex-col rounded-sm overflow-hidden font-sans">
          {/* Header */}
          <div className="bg-[#c2c0b8] border-b-2 border-b-[#a2a098] p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${colors.health[state?.status || 'unknown']} shadow-sm`} />
              <h2 className="font-bold tracking-widest text-[#33312e] uppercase text-sm leading-none">{system.name}</h2>
            </div>
            <button
              onClick={() => setSelectedSystemId(null)}
              className="p-1 hover:bg-[#d5d3cb] text-[#6c6a65] border border-transparent hover:border-[#a2a098] transition-all rounded-sm"
              title="Close Panel"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* System Info */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[#6c6a65] border-b border-[#c2c0b8] pb-1">
                <InfoIcon className="w-3.5 h-3.5" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">Specifications</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white p-3 shadow-inner">
                  <p className="text-[9px] text-[#8c8a85] font-bold uppercase tracking-widest mb-1">Status</p>
                  <p className={`font-mono text-xs font-bold uppercase ${state?.status === 'running' ? 'text-[#16a34a]' : 'text-[#33312e]'}`}>
                    {state?.status || 'UNKNOWN'}
                  </p>
                </div>
                <div className="bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white p-3 shadow-inner">
                  <p className="text-[9px] text-[#8c8a85] font-bold uppercase tracking-widest mb-1">Latency</p>
                  <p className="font-mono text-xs font-bold text-[#33312e]">
                    {state?.latency ? `${state.latency}ms` : '--'}
                  </p>
                </div>
                <div className="col-span-2 bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white p-3 shadow-inner">
                  <p className="text-[9px] text-[#8c8a85] font-bold uppercase tracking-widest mb-1">Transport Protocol</p>
                  <p className="font-mono text-[11px] font-bold text-[#33312e] break-all">
                    {system.transport}
                  </p>
                </div>
                 <div className="col-span-2 bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white p-3 shadow-inner">
                  <p className="text-[9px] text-[#8c8a85] font-bold uppercase tracking-widest mb-1">Endpoint Configuration</p>
                  <p className="font-mono text-[11px] font-bold text-[#33312e] break-all uppercase">
                    {system.url || 'NONE'}
                  </p>
                  <p className="font-mono text-[9px] text-[#6c6a65] mt-1 italic font-bold">
                    PATH: {system.healthPath || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Dependencies */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[#6c6a65] border-b border-[#c2c0b8] pb-1">
                <LinkIcon className="w-3.5 h-3.5" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">Dependency Map</span>
              </div>
              <div className="space-y-2">
                {dependencySystems.length > 0 ? (
                  dependencySystems.map(dep => (
                    <button
                      key={dep!.id}
                      onClick={() => setSelectedSystemId(dep!.id)}
                      className="w-full flex items-center justify-between p-2.5 bg-[#eeece3] border-2 border-t-white border-l-white border-b-[#b8b6af] border-r-[#b8b6af] hover:bg-[#eeece3] transition-all active:shadow-inner shadow-sm group"
                    >
                      <span className="font-mono text-[10px] font-bold text-[#33312e] uppercase tracking-wide group-hover:text-[#b45309]">{dep!.name}</span>
                      <div className={`w-2.5 h-2.5 rounded-full ${colors.health[healthStates[dep!.id]?.status || 'unknown']} shadow-sm border border-black/10`} />
                    </button>
                  ))
                ) : (
                  <div className="p-4 bg-[#e4e2d9]/50 border-2 border-dashed border-[#b8b6af] text-center">
                    <span className="font-mono text-[9px] text-[#8c8a85] font-bold uppercase tracking-widest">No dependencies tracked</span>
                  </div>
                )}
              </div>
            </div>

            {/* Hub-Relay Specialized UI */}
            {system.id === 'hub-relay' && (
              <HubRelayRouting />
            )}

            {/* Recent Events */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 text-[#6c6a65] border-b border-[#c2c0b8] pb-1">
                <div className="flex items-center gap-2">
                  <HistoryIcon className="w-3.5 h-3.5" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">Signal Log</span>
                </div>
                <div className="flex gap-1">
                  {['all', 'info', 'warn', 'error'].map(lvl => (
                    <button
                      key={lvl}
                      onClick={() => setFilterLevel(lvl)}
                      className={`text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-sm border transition-all ${filterLevel === lvl ? 'bg-[#33312e] text-[#dfddd4] border-[#33312e]' : 'bg-[#eeece3] text-[#8c8a85] border-[#c2c0b8] hover:border-[#a2a098]'}`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-[#d5d3cb] border-2 border-[#b8b6af] shadow-inner p-3 h-72 overflow-y-auto space-y-2 relative">
                <div className="absolute inset-0 pointer-events-none shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)]" />
                {filteredEvents.length > 0 ? (
                  filteredEvents.map(ev => (
                    <div key={ev.id} className="text-[10px] font-mono leading-tight border-b border-[#c2c0b8] pb-2 last:border-0 relative">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[#8c8a85] font-bold">[{new Date(ev.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                        <span className={`uppercase font-black text-[8px] px-1 py-0.5 rounded-sm ${ev.level === 'error' ? 'bg-[#ef4444]/10 text-[#dc2626]' : ev.level === 'warn' ? 'bg-[#f59e0b]/10 text-[#b45309]' : 'bg-[#22c55e]/10 text-[#16a34a]'}`}>
                          {ev.level}
                        </span>
                      </div>
                      <span className="text-[#33312e] font-semibold break-words">
                        {ev.message}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex items-center justify-center text-[#8c8a85] italic font-mono text-[10px] font-bold uppercase tracking-widest">
                    No active signals
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Decor */}
          <div className="bg-[#c2c0b8] border-t-2 border-t-[#a2a098] p-3 text-center flex flex-col gap-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
            <div className="font-mono text-[9px] font-bold tracking-[0.3em] text-[#6c6a65] uppercase">
              Inspection Module :: {system.id}
            </div>
            <div className="flex justify-center gap-1">
              {[...Array(20)].map((_, i) => (
                <div key={i} className="w-[2px] h-[4px] bg-[#a2a098]" />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
