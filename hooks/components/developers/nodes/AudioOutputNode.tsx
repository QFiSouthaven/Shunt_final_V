// components/developers/nodes/AudioOutputNode.tsx
import React from 'react';
import { Handle, Position } from 'reactflow';

const AudioOutputNode: React.FC<{ data: any }> = ({ data }) => {
    return (
        <div className="p-2 border rounded bg-green-700 text-white w-48 text-center">
            <div>{data.label || 'Audio Output'}</div>
            <Handle type="target" position={Position.Left} />
        </div>
    );
};

export default AudioOutputNode;
