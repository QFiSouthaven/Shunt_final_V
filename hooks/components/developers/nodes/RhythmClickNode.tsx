// components/developers/nodes/RhythmClickNode.tsx
import React from 'react';
import { Handle, Position } from 'reactflow';

const RhythmClickNode: React.FC<{ data: any }> = ({ data }) => {
    return (
        <div className="p-2 border rounded bg-purple-700 text-white w-48 text-center">
            <div>{data.label || 'Rhythm Click'}</div>
            <Handle type="source" position={Position.Right} />
            <Handle type="target" position={Position.Left} />
        </div>
    );
};

export default RhythmClickNode;
