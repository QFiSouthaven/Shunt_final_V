export type SystemGroup = 'compute' | 'orchestration' | 'interface' | 'knowledge';

export interface SystemEntry {
  id: string;
  name: string;
  group: SystemGroup;
  transport: string; // e.g. 'http :1234', 'local', 'https + wss'
  deps: string[]; // array of system ids
  url?: string;
  healthPath?: string;
  startCmd?: string;
}

export const defaultRegistry: SystemEntry[] = [
  { id: 'lm-studio', name: 'LM Studio', group: 'compute', transport: 'http :1234', deps: [], url: 'http://localhost:1234', healthPath: '/v1/models' },
  { id: 'host-python', name: 'Host Python', group: 'compute', transport: 'local', deps: [] },
  { id: 'anythingllm', name: 'AnythingLLM', group: 'knowledge', transport: 'http :3001', deps: ['lm-studio'], url: 'http://localhost:3001', healthPath: '/api/ping' },
  { id: 'nexus', name: 'NEXUS-PRIME', group: 'orchestration', transport: 'http :8000', deps: ['lm-studio'], url: 'http://localhost:8000', healthPath: '/health' },
  { id: 'hub-relay', name: 'Hub-Relay', group: 'orchestration', transport: 'https + wss', deps: [] },
  { id: 'sfv', name: 'Shunt Factory V', group: 'orchestration', transport: '(placeholder)', deps: [] },
  { id: 'aether-spa', name: 'Aether Shunt SPA', group: 'interface', transport: 'http :3000', deps: [], url: 'http://localhost:3000', healthPath: '/' },
  { id: 'splicer-desktop', name: 'Splicer', group: 'interface', transport: 'local', deps: ['hub-relay'] },
];

export function getDependencySortedSystems(systems: SystemEntry[]): SystemEntry[] {
  const sorted: SystemEntry[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(systemId: string) {
    if (visited.has(systemId)) return;
    if (visiting.has(systemId)) {
      console.warn(`Circular dependency detected involving ${systemId}`);
      return;
    }

    visiting.add(systemId);
    const system = systems.find(s => s.id === systemId);
    if (system) {
       for (const dep of system.deps) {
         visit(dep);
       }
       sorted.push(system);
    }
    visiting.delete(systemId);
    visited.add(systemId);
  }

  for (const system of systems) {
    visit(system.id);
  }

  return sorted;
}
