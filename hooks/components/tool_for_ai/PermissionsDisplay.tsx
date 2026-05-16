
// components/tool_for_ai/PermissionsDisplay.tsx
import React from 'react';
import { ExecutionContext } from '../../../styles/services/toolApi';
import { ShieldCheckIcon } from '../icons';

const PermissionsDisplay: React.FC<{ context: ExecutionContext }> = ({ context }) => {
    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg flex flex-col">
            <header className="p-3 border-b border-gray-700/50 flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold text-gray-300">Agent Permissions</h3>
            </header>
            <main className="p-4 font-mono text-xs text-gray-300 space-y-2">
                <p>Agent ID: <span className="text-gray-400">{context.agentId}</span></p>
                <div>
                    <p>Granted Permissions:</p>
                    {context.permissions.length > 0 ? (
                        <ul className="list-disc list-inside pl-2 mt-1">
                            {context.permissions.map(p => (
                                <li key={p} className="text-green-400">{p}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500 italic mt-1">No permissions granted.</p>
                    )}
                </div>
            </main>
        </div>
    );
};

export default PermissionsDisplay;
