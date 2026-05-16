'use client';

import React, { useState, useEffect } from 'react';
import { NetworkIcon, SendIcon, CheckIcon, AlertTriangleIcon } from './icons';
import { eventBus } from '@/lib/eventBus';
import { useHealth } from './HealthPoller';

interface RouteEntry {
  id: string;
  source: string;
  target: string;
  lastActive: number;
  status: 'active' | 'idle' | 'failed';
  bandwidth: string;
}

export function HubRelayRouting() {
  const { systems } = useHealth();
  const [routes, setRoutes] = useState<RouteEntry[]>(() => [
    { id: 'R1', source: 'splicer-desktop', target: 'lm-studio', lastActive: Date.now(), status: 'active', bandwidth: '1.2 GB/s' },
    { id: 'R2', source: 'host-python', target: 'anythingllm', lastActive: Date.now() - 5000, status: 'idle', bandwidth: '450 KB/s' },
    { id: 'R3', source: 'nexus', target: 'hub-relay', lastActive: Date.now(), status: 'active', bandwidth: '8.4 GB/s' },
  ]);

  const [routingSource, setRoutingSource] = useState('');
  const [routingTarget, setRoutingTarget] = useState('');
  const [isRouting, setIsRouting] = useState(false);

  const handleManualRoute = () => {
    if (!routingSource || !routingTarget) return;
    
    setIsRouting(true);
    eventBus.emit('hub-relay', 'info', `INITIATING_PACKET_RELAY: [${routingSource}] -> [${routingTarget}]`);
    
    setTimeout(() => {
      setIsRouting(false);
      setRoutes(prev => {
        const existing = prev.find(r => r.source === routingSource && r.target === routingTarget);
        if (existing) {
          return prev.map(r => r.id === existing.id ? { ...r, lastActive: Date.now(), status: 'active' as const } : r);
        }
        return [
          ...prev,
          { id: `R${prev.length + 1}`, source: routingSource, target: routingTarget, lastActive: Date.now(), status: 'active', bandwidth: '4.2 MB/s' }
        ];
      });
      eventBus.emit('hub-relay', 'info', `RELAY_SUCCESS: DATA_BURST_CONFIRMED [${routingSource}] -> [${routingTarget}]`);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Active Routing Table */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[#6c6a65] border-b border-[#c2c0b8] pb-1">
          <NetworkIcon className="w-3.5 h-3.5" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">Active Routing Table</span>
        </div>
        <div className="bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white overflow-hidden shadow-inner font-mono text-[10px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#c2c0b8] text-[#33312e] font-black border-b border-[#a2a098]">
                <th className="px-3 py-1.5 uppercase">ID</th>
                <th className="px-3 py-1.5 uppercase">PATH</th>
                <th className="px-3 py-1.5 uppercase text-right">LOAD</th>
              </tr>
            </thead>
            <tbody>
              {routes.map(route => (
                <tr key={route.id} className="border-b border-[#d5d3cb] last:border-0 hover:bg-[#dfddd4] transition-colors">
                  <td className="px-3 py-1.5 font-bold text-[#6c6a65]">{route.id}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#33312e]">{route.source}</span>
                      <span className="text-[#8c8a85]">→</span>
                      <span className="text-[#33312e]">{route.target}</span>
                      {route.status === 'active' && <div className="w-1.5 h-1.5 rounded-full bg-[#16a34a] animate-pulse" />}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-[#b45309]">{route.bandwidth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Override Routing */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[#6c6a65] border-b border-[#c2c0b8] pb-1">
          <SendIcon className="w-3.5 h-3.5" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">Manual Payload Injection</span>
        </div>
        <div className="bg-[#d5d3cb] p-4 border-2 border-dashed border-[#b8b6af] space-y-4 shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)]">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-[#6c6a65] uppercase tracking-widest">Origin</label>
              <select 
                value={routingSource}
                onChange={e => setRoutingSource(e.target.value)}
                className="w-full bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white px-2 py-1.5 text-[10px] font-mono font-bold text-[#33312e] uppercase focus:outline-none shadow-inner cursor-pointer"
              >
                <option value="">SELECT_SOURCE</option>
                {systems.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-[#6c6a65] uppercase tracking-widest">Destination</label>
              <select 
                value={routingTarget}
                onChange={e => setRoutingTarget(e.target.value)}
                className="w-full bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white px-2 py-1.5 text-[10px] font-mono font-bold text-[#33312e] uppercase focus:outline-none shadow-inner cursor-pointer"
              >
                <option value="">SELECT_TARGET</option>
                {systems.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
              </select>
            </div>
          </div>
          
          <button 
            disabled={isRouting || !routingSource || !routingTarget}
            onClick={handleManualRoute}
            className={`w-full py-2 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] transition-all border-2
              ${isRouting 
                ? 'bg-[#c2c0b8] border-[#a2a098] text-[#8c8a85] cursor-not-allowed' 
                : 'bg-[#33312e] border-[#1a1918] text-[#dfddd4] hover:bg-[#1a1918] active:translate-y-[1px] active:scale-[0.99] shadow-md'}
            `}
          >
            {isRouting ? (
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 border-2 border-[#8c8a85] border-t-transparent rounded-full animate-spin" />
                RELAYING_PACKET...
              </div>
            ) : (
              <>COMMIT_ROUTE_TRIGGER</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
