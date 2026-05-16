'use client';

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { ReactFlow, Background, Controls, NodeProps, EdgeProps, getBezierPath, useReactFlow, ReactFlowProvider, addEdge, applyNodeChanges, applyEdgeChanges, Connection, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useHealth } from './HealthPoller';
import { getLayoutedElements } from '@/lib/circuitLayout';
import { colors } from '@/lib/colorPalette';
import { eventBus } from '@/lib/eventBus';
import { SaveIcon, RefreshIcon, HistoryIcon } from './icons';

function CircuitNode({ data }: NodeProps & { data: any }) {
  const { healthStates, selectedSystemId } = useHealth();
  const state = healthStates[data.system.id] || { status: 'stopped' };
  const isRunning = state.status === 'running';
  const isSelected = selectedSystemId === data.system.id;
  const isDependency = data.isDependency;
  const isDependent = data.isDependent;

  return (
    <div className={`p-4 border-2 shadow-md min-w-[200px] transition-all duration-300 font-mono relative bg-[#eeece3] rounded-sm cursor-pointer
      ${isRunning ? 'border-t-white border-l-white border-b-[#b8b6af] border-r-[#b8b6af]' : 'border-[#c2c0b8]'}
      ${isSelected ? 'ring-2 ring-[#b45309] border-[#b45309] shadow-lg scale-105 z-50' : ''}
      ${isDependency ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)] bg-blue-50/50' : ''}
      ${isDependent ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] bg-emerald-50/50' : ''}
    `}>
       <Handle type="target" position={Position.Top} className={`w-3 h-1.5 !border-none !rounded-none ${isDependency ? '!bg-blue-500' : '!bg-[#a2a098]'}`} />
       
       <div className={`flex items-center justify-between mb-3 text-[9px] font-black`}>
          <div className={`uppercase tracking-widest ${data.groupColor || 'text-slate-400'}`}>[{data.system.group}]</div>
          <div className="flex gap-2 items-center">
            {isDependency && <span className="text-blue-600">UPSTREAM</span>}
            {isDependent && <span className="text-emerald-600">DOWNSTREAM</span>}
            <div className={`w-3 h-3 rounded-full ${colors.health[state.status]} ${isRunning ? 'animate-pulse' : ''}`} />
          </div>
       </div>
       <div className="font-bold text-[#33312e] text-sm tracking-wide uppercase">{data.system.name}</div>
       <div className="text-[10px] text-[#6c6a65] mt-1 font-semibold">::{data.system.transport}</div>
       {state.latency !== undefined && (
          <div className="text-[10px] text-[#6c6a65] mt-4 flex items-center justify-between border-t border-[#c2c0b8] pt-2 font-bold">
            <span>LAT:</span>
            <span className="text-[#33312e]">{state.latency}ms</span>
          </div>
       )}

       <Handle type="source" position={Position.Bottom} className={`w-3 h-1.5 !border-none !rounded-none ${isDependent ? '!bg-emerald-500' : '!bg-[#a2a098]'}`} />
    </div>
  );
}

const nodeTypes = {
  circuitNode: CircuitNode
};

function FlowCanvas() {
  const { systems, setSystems, selectedSystemId, setSelectedSystemId } = useHealth();
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [isAutoLayout, setIsAutoLayout] = useState(true);
  const { fitView } = useReactFlow();

  const onNodesChange = useCallback((changes: any) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    if (changes.some((c: any) => c.type === 'position')) {
      setIsAutoLayout(false);
    }
  }, []);

  const onEdgesChange = useCallback((changes: any) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target) return;
    
    setEdges((eds) => addEdge({ ...params, style: { stroke: '#a2a098', strokeWidth: 2 } }, eds));
    
    // Update systems registry to persist this connection
    setSystems((prev) => prev.map((s) => {
      if (s.id === params.target) {
         return { ...s, deps: Array.from(new Set([...s.deps, params.source!])) };
      }
      return s;
    }));
    
    eventBus.emit('system', 'info', `Established link: ${params.source} -> ${params.target}`);
  }, [setSystems]);

  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedSystemId(node.data.system.id);
  }, [setSelectedSystemId]);

  // Update node and edge styling based on selection
  useEffect(() => {
    const dependencyIds = new Set(edges.filter(e => e.target === selectedSystemId).map(e => e.source));
    const dependentIds = new Set(edges.filter(e => e.source === selectedSystemId).map(e => e.target));

    setNodes(nds => nds.map(n => ({
      ...n,
      data: {
        ...n.data,
        isDependency: selectedSystemId ? dependencyIds.has(n.id) : false,
        isDependent: selectedSystemId ? dependentIds.has(n.id) : false
      }
    })));

    setEdges(eds => eds.map(e => {
      if (!selectedSystemId) {
        return { ...e, style: { stroke: '#a2a098', strokeWidth: 2 }, animated: false, zIndex: 1 };
      }
      
      const isIncoming = e.target === selectedSystemId;
      const isOutgoing = e.source === selectedSystemId;
      
      if (isIncoming) {
        return { ...e, style: { stroke: '#3b82f6', strokeWidth: 4 }, animated: true, zIndex: 10 };
      }
      if (isOutgoing) {
        return { ...e, style: { stroke: '#10b881', strokeWidth: 4 }, animated: true, zIndex: 10 };
      }
      return { ...e, style: { stroke: '#d5d3cb', strokeWidth: 1, opacity: 0.3 }, animated: false, zIndex: 1 };
    }));
  }, [selectedSystemId, edges.length]); // Re-run if selection changes or topology changes

  // Initial layout or load
  useEffect(() => {
    const runLayout = () => {
      const saved = localStorage.getItem('circuitLayout');
      if (saved) {
         try {
            const { nodes: savedNodes, edges: savedEdges } = JSON.parse(saved);
            const systemIds = new Set(systems.map(s => s.id));
            
            // Filter out saved nodes for systems that no longer exist
            const validNodes = savedNodes.filter((n: any) => systemIds.has(n.id));
            
            // Find systems that are not in the saved layout
            const layout = getLayoutedElements(systems);
            const newSystems = systems.filter(s => !savedNodes.find((n: any) => n.id === s.id));
            const newNodes = layout.nodes.filter(n => newSystems.some(s => s.id === n.id));
            
            // Merge edges: keep saved ones (if systems still exist), and add edges for new systems
            const validSavedEdges = savedEdges.filter((e: any) => systemIds.has(e.source) && systemIds.has(e.target));
            const newEdges = layout.edges.filter((e: any) => {
               // Edge is new if it involves a new system
               const isNewInvolved = newSystems.some(s => s.id === e.source || s.id === e.target);
               // And it's not already in saved edges
               const isAlreadySaved = validSavedEdges.some((se: any) => se.id === e.id);
               return isNewInvolved && !isAlreadySaved;
            });

            setNodes([...validNodes, ...newNodes]);
            setEdges([...validSavedEdges, ...newEdges]);
            setIsAutoLayout(false);
         } catch (e) {
            const layout = getLayoutedElements(systems);
            setNodes(layout.nodes);
            setEdges(layout.edges);
         }
      } else {
         const layout = getLayoutedElements(systems);
         setNodes(layout.nodes);
         setEdges(layout.edges);
      }
      
      setTimeout(() => {
         fitView({ padding: 0.2, duration: 800 });
      }, 100);
    };

    // Use a small delay to avoid synchronous state updates in effect
    const timeout = setTimeout(runLayout, 0);
    return () => clearTimeout(timeout);
  }, [systems, fitView]);

  const saveLayout = () => {
    const layout = { nodes, edges };
    localStorage.setItem('circuitLayout', JSON.stringify(layout));
    eventBus.emit('system', 'info', 'Circuit layout configuration saved to local storage.');
  };

  const resetLayout = () => {
    const layout = getLayoutedElements(systems);
    setNodes(layout.nodes);
    setEdges(layout.edges);
    setIsAutoLayout(true);
    localStorage.removeItem('circuitLayout');
    eventBus.emit('system', 'info', 'Circuit layout reset to default orchestration.');
    setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 100);
  };

  // Listen for traffic events to pulse edges
  useEffect(() => {
    const unsub = eventBus.subscribe(ev => {
       if (ev.level === 'info') {
          setEdges(eds => eds.map(e => {
             if (e.target === ev.systemId || e.source === ev.systemId) {
                return { ...e, animated: true, style: { ...e.style, stroke: '#16a34a', strokeWidth: 6 } };
             }
             return e;
          }));
          setTimeout(() => {
             setEdges(eds => eds.map(e => {
                if (e.target === ev.systemId || e.source === ev.systemId) {
                   // Calculate correct "revert" state
                   const isIncoming = e.target === selectedSystemId;
                   const isOutgoing = e.source === selectedSystemId;
                   
                   if (isIncoming) return { ...e, animated: true, style: { stroke: '#3b82f6', strokeWidth: 4 } };
                   if (isOutgoing) return { ...e, animated: true, style: { stroke: '#10b881', strokeWidth: 4 } };
                   if (selectedSystemId) return { ...e, animated: false, style: { stroke: '#d5d3cb', strokeWidth: 1, opacity: 0.3 } };
                   return { ...e, animated: false, style: { stroke: '#a2a098', strokeWidth: 2 } };
                }
                return e;
             }));
          }, 1000);
       }
    });
    return unsub;
  }, [selectedSystemId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between mb-2">
         <div className="flex gap-2">
            <button 
              onClick={saveLayout}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#c2c0b8] border-2 border-t-white border-l-white border-b-[#a2a098] border-r-[#a2a098] text-[10px] font-bold uppercase tracking-widest text-[#33312e] hover:bg-[#a2a098] active:shadow-inner transition-colors"
            >
              <SaveIcon className="w-3.5 h-3.5" /> SAVE_LAYOUT
            </button>
            <button 
              onClick={resetLayout}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#d5d3cb] border-2 border-t-white border-l-white border-b-[#b8b6af] border-r-[#b8b6af] text-[10px] font-bold uppercase tracking-widest text-[#6c6a65] hover:bg-[#c2c0b8] active:shadow-inner transition-colors"
            >
              <HistoryIcon className="w-3.5 h-3.5" /> RESET_GRID
            </button>
         </div>
         <div className="text-[10px] font-mono font-bold text-[#8c8a85] uppercase tracking-widest">
            STATUS: {isAutoLayout ? 'AUTO_SORT' : 'MANUAL_OVERRIDE'}
         </div>
      </div>
      
      <div className="h-[600px] w-full bg-[#d5d3cb] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white relative shadow-inner rounded-sm">
        <div className="absolute inset-x-0 inset-y-0 pointer-events-none z-10 shadow-[inner_0_4px_10px_rgba(0,0,0,0.05)]"></div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background color="#b8b6af" size={2} gap={20} />
          <Controls showInteractive={false} className="bg-[#c2c0b8] border-2 border-t-white border-l-white border-b-[#a2a098] border-r-[#a2a098] rounded-sm shadow-sm" />
        </ReactFlow>
      </div>
    </div>
  );
}

export function Tier2CircuitBoard() {
  return (
    <section className="bg-[#dfddd4] border-2 border-t-white border-l-white border-b-[#b8b6af] border-r-[#b8b6af] p-6 md:p-8 relative shadow-lg rounded-sm">
      {/* Decorative screws */}
      <div className="absolute top-3 left-3 w-3 h-3 rounded-full bg-[#c2c0b8] shadow-inner border border-[#a2a098] flex items-center justify-center"><div className="w-full h-[1px] bg-[#8c8a85] rotate-45"></div></div>
      <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-[#c2c0b8] shadow-inner border border-[#a2a098] flex items-center justify-center"><div className="w-full h-[1px] bg-[#8c8a85] -rotate-45"></div></div>
      <div className="absolute bottom-3 left-3 w-3 h-3 rounded-full bg-[#c2c0b8] shadow-inner border border-[#a2a098] flex items-center justify-center"><div className="w-full h-[1px] bg-[#8c8a85] -rotate-12"></div></div>
      <div className="absolute bottom-3 right-3 w-3 h-3 rounded-full bg-[#c2c0b8] shadow-inner border border-[#a2a098] flex items-center justify-center"><div className="w-full h-[1px] bg-[#8c8a85] rotate-12"></div></div>

      <div className="flex items-center gap-3 mb-8 border-b-2 border-[#c2c0b8] border-t-white pb-4 pt-2 relative z-20">
        <div className="w-8 h-8 rounded-sm bg-[#c2c0b8] border-t-2 border-l-2 border-t-white border-l-white border-b-2 border-r-2 border-[#a2a098] flex items-center justify-center shadow-sm">
          <svg className="w-5 h-5 text-[#4a4843]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        </div>
        <h2 className="text-[16px] font-bold tracking-widest text-[#33312e] uppercase">CIRCUIT INTERCONNECTS</h2>
      </div>
      
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>

    </section>
  );
}
