// components/tool_for_ai/ScratchpadDisplay.tsx
import React from 'react';

const ScratchpadDisplay: React.FC<{ scratchpad: Record<string, any> }> = ({ scratchpad }) => {
    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg flex flex-col h-1/2">
            <header className="p-3 border-b border-gray-700/50 flex-shrink-0">
                <h3 className="font-semibold text-gray-300">Scratchpad Inspector</h3>
            </header>
            <main className="p-4 flex-grow overflow-y-auto font-mono text-xs text-gray-300">
                {Object.keys(scratchpad).length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <p>AI's scratchpad is empty...</p>
                    </div>
                ) : (
                    <pre>{JSON.stringify(scratchpad, null, 2)}</pre>
                )}
            </main>
        </div>
    );
};

export default ScratchpadDisplay;
