// components/developers/nodes/UIEventNode.tsx
import React from 'react';
import { Handle, Position } from 'reactflow';

const UIEventNode: React.FC<{ data: any }> = ({ data }) => {
    return (
        <div className="p-2 border rounded bg-blue-700 text-white w-48 text-center">
            <div>{data.label || 'UI Event'}</div>
            <Handle type="source" position={Position.Right} />
            <Handle type="target" position={Position.Left} />
        </div>
    );
};

export default UIEventNode;
