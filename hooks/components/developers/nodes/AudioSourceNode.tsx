// components/developers/nodes/AudioSourceNode.tsx
import React from 'react';
import { Handle, Position } from 'reactflow';

const AudioSourceNode: React.FC<{ data: any }> = ({ data }) => {
    return (
        <div className="p-2 border rounded bg-gray-700 text-white w-48 text-center">
            <div>{data.label || 'Audio Source'}</div>
            <Handle type="source" position={Position.Right} />
        </div>
    );
};

export default AudioSourceNode;
