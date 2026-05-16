// components/tool_for_ai/FileDiffViewer.tsx
import React, { useState } from 'react';
import { FileChange } from '@/hooks/useAiAgentSimulation';

const FileDiffViewer: React.FC<{ fileChanges: FileChange[] }> = ({ fileChanges }) => {
    const [activeTab, setActiveTab] = useState<string | null>(null);

    React.useEffect(() => {
        if (!activeTab && fileChanges.length > 0) {
            setActiveTab(fileChanges[0].path);
        }
    }, [fileChanges, activeTab]);

    const activeChange = fileChanges.find(fc => fc.path === activeTab);

    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg flex flex-col h-1/2">
            <header className="p-3 border-b border-gray-700/50 flex-shrink-0">
                <h3 className="font-semibold text-gray-300">File Change Viewer</h3>
            </header>
            {fileChanges.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                    <p>Proposed file changes will appear here...</p>
                </div>
            ) : (
                <div className="flex flex-col flex-grow overflow-hidden">
                    <div className="flex border-b border-gray-700/50 text-sm overflow-x-auto">
                        {fileChanges.map(change => (
                            <button key={change.path} onClick={() => setActiveTab(change.path)} className={`px-4 py-2 font-mono text-xs transition-colors ${activeTab === change.path ? 'bg-gray-700/50 text-fuchsia-300' : 'text-gray-400 hover:bg-gray-700/30'}`}>
                                {change.path}
                            </button>
                        ))}
                    </div>
                    <main className="p-4 flex-grow overflow-y-auto font-mono text-xs">
                        {activeChange && (
                            <pre className="whitespace-pre-wrap">
                                {activeChange.diff.split('\n').map((line, i) => {
                                    const color = line.startsWith('+') ? 'text-green-400' : line.startsWith('-') ? 'text-red-400' : 'text-gray-400';
                                    return <span key={i} className={`block ${color}`}>{line}</span>;
                                })}
                            </pre>
                        )}
                    </main>
                </div>
            )}
        </div>
    );
};

export default FileDiffViewer;
