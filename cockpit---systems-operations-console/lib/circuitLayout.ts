import { SystemEntry } from './systemRegistry';

export function getLayoutedElements(systems: SystemEntry[]) {
  const nodes: any[] = [];
  const edges: any[] = [];

  const groupConfigs = {
    compute: { y: 50, color: 'text-purple-400' },
    knowledge: { y: 50, color: 'text-amber-400' },
    orchestration: { y: 250, color: 'text-blue-400' },
    interface: { y: 450, color: 'text-emerald-400' },
    custom: { y: 650, color: 'text-slate-400' }
  };

  const groupCounts: Record<string, number> = {
    compute: 0,
    knowledge: 0, 
    orchestration: 0,
    interface: 0,
    custom: 0
  };

  systems.forEach((system) => {
    // Treat unknown groups as custom
    const groupName = groupConfigs[system.group as keyof typeof groupConfigs] ? system.group : 'custom';
    const groupConf = groupConfigs[groupName as keyof typeof groupConfigs];
    
    // Assign X position based on how many items are already in this group
    const xSpacing = 250;
    const xBase = 100;
    
    // Quick grouping: knowledge goes next to compute
    let actualGroupName = groupName;
    if (groupName === 'knowledge') actualGroupName = 'compute';
    
    const count = groupCounts[actualGroupName] || 0;
    
    nodes.push({
      id: system.id,
      type: 'circuitNode',
      position: { x: xBase + count * xSpacing, y: groupConf.y },
      data: { system, groupColor: groupConf.color },
    });

    groupCounts[actualGroupName] = count + 1;

    // Edges (dependencies)
    system.deps.forEach(depId => {
       // Only add edge if the target exists
       if (systems.find(s => s.id === depId)) {
         edges.push({
            id: `e-${depId}-${system.id}`,
            source: depId,
            target: system.id,
            type: 'default',
            animated: false,
            style: { stroke: '#a2a098', strokeWidth: 2 },
            data: { source: depId, target: system.id }
         });
       }
    });
  });

  // Center the layout roughly
  nodes.forEach(node => {
     let actualGroupName = node.data.system.group;
     if (!groupConfigs[actualGroupName as keyof typeof groupConfigs]) actualGroupName = 'custom';
     if (actualGroupName === 'knowledge') actualGroupName = 'compute';
     const totalInGroup = groupCounts[actualGroupName] || 1;
     const offset = (totalInGroup * 250) / 2;
     node.position.x = node.position.x - offset + 400; // Center around 400
  });

  return { nodes, edges };
}
