// components/developers/DiffViewer.tsx
import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider, Node as ReactFlowNode, Edge as ReactFlowEdge } from 'reactflow';
import { XMarkIcon } from '../icons';
import AudioSourceNode from './nodes/AudioSourceNode';
import UIEventNode from './nodes/UIEventNode';
import AudioOutputNode from './nodes/AudioOutputNode';
import RhythmClickNode from './nodes/RhythmClickNode';

// Props for the modal
interface DiffViewerProps {
    isOpen: boolean;
    onClose: () => void;
    oldContent: string;
    newContent: string;
}

// Data structure for the graph state
interface GraphState {
    nodes: ReactFlowNode[];
    edges: ReactFlowEdge[];
    viewport: any;
}

type DiffNode = ReactFlowNode & { diffStatus: 'added' | 'removed' | 'modified' | 'unchanged' };

// Function to calculate diffs
const calculateDiffs = (oldState: GraphState, newState: GraphState) => {
    const oldNodesMap = new Map(oldState.nodes.map(n => [n.id, n]));
    const newNodesMap = new Map(newState.nodes.map(n => [n.id, n]));
    
    const combinedNodes: DiffNode[] = [];

    // Check for added and modified nodes from the new state
    for (const newNode of newState.nodes) {
        const oldNode = oldNodesMap.get(newNode.id);
        if (!oldNode) {
            combinedNodes.push({ ...newNode, diffStatus: 'added', className: 'diff-added' });
        } else {
            // Simple stringify for deep comparison of position and data
            const oldNodeStr = JSON.stringify({ p: oldNode.position, d: oldNode.data });
            const newNodeStr = JSON.stringify({ p: newNode.position, d: newNode.data });
            if (oldNodeStr !== newNodeStr) {
                combinedNodes.push({ ...newNode, diffStatus: 'modified', className: 'diff-modified' });
            } else {
                 combinedNodes.push({ ...newNode, diffStatus: 'unchanged' });
            }
        }
    }

    // Check for removed nodes from the old state
    for (const oldNode of oldState.nodes) {
        if (!newNodesMap.has(oldNode.id)) {
            combinedNodes.push({ ...oldNode, diffStatus: 'removed', className: 'diff-removed' });
        }
    }

    // For simplicity, we just show the edges from the new state. A full edge diff is more complex.
    const edges = newState.edges; 

    return { nodes: combinedNodes, edges };
};

const LegendItem: React.FC<{ colorClass: string; label: string }> = ({ colorClass, label }) => (
    <div className="flex items-center gap-2">
        <div className={`w-4 h-4 rounded-sm border-2 ${colorClass}`}></div>
        <span className="text-xs">{label}</span>
    </div>
);


const DiffViewerContent: React.FC<Omit<DiffViewerProps, 'isOpen'>> = ({ onClose, oldContent, newContent }) => {
    
    const nodeTypes = useMemo(() => ({ 
        audioSource: AudioSourceNode,
        uiEvent: UIEventNode,
        audioOutput: AudioOutputNode,
        rhythmClick: RhythmClickNode,
    }), []);

    const { nodes, edges } = useMemo(() => {
        try {
            const oldState: GraphState = JSON.parse(oldContent);
            const newState: GraphState = JSON.parse(newContent);
            return calculateDiffs(oldState, newState);
        } catch (e) {
            console.error("Failed to parse or diff graph state:", e);
            return { nodes: [], edges: [] };
        }
    }, [oldContent, newContent]);
    
    return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
            <header className="flex items-center justify-between p-3 border-b border-gray-700/50 flex-shrink-0">
                <h2 className="font-semibold text-lg text-gray-300">Visual Diff Viewer</h2>
                <div className="flex items-center gap-4 text-gray-300">
                    <LegendItem colorClass="border-green-400" label="Added" />
                    <LegendItem colorClass="border-yellow-400" label="Modified" />
                    <LegendItem colorClass="border-red-400 border-dashed" label="Removed" />
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                    <XMarkIcon className="w-6 h-6" />
                </button>
            </header>
            <main className="flex-grow relative bg-gray-900/30">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    fitView
                    nodesDraggable={false}
                    nodesConnectable={false}
                    className="bg-transparent"
                >
                    <Background gap={24} color="#4a5568" />
                    <Controls />
                    <MiniMap nodeColor={n => {
                        switch ((n as DiffNode).diffStatus) {
                            case 'added': return '#4ade80';
                            case 'removed': return '#f87171';
                            case 'modified': return '#facc15';
                            default: return '#9ca3af';
                        }
                    }} pannable zoomable />
                </ReactFlow>
            </main>
        </div>
    );
};


const DiffViewer: React.FC<DiffViewerProps> = (props) => {
    if (!props.isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <ReactFlowProvider>
                <DiffViewerContent {...props} />
            </ReactFlowProvider>
        </div>
    );
}

export default DiffViewer;