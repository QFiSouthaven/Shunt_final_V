// components/tool_for_ai/ActionLog.tsx
import React from 'react';
import { Log } from '@/hooks/useAiAgentSimulation';
import { CheckCircleIcon, InformationCircleIcon, ErrorIcon } from '../icons';
import Loader from '../Loader';

const getStatusIcon = (status: Log['status']) => {
    switch (status) {
        case 'pending': return <Loader />;
        case 'success': return <CheckCircleIcon className="w-5 h-5 text-green-400" />;
        case 'error': return <ErrorIcon className="w-5 h-5 text-red-400" />;
        default: return <InformationCircleIcon className="w-5 h-5 text-gray-500" />;
    }
};

const ErrorDisplay: React.FC<{ error: Log['response']['error'] }> = ({ error }) => {
    if (!error) return null;

    let colorClass = 'text-red-400';
    if (error.type === 'AUTHORIZATION') colorClass = 'text-yellow-400';
    if (error.type === 'VALIDATION') colorClass = 'text-orange-400';

    return (
         <div className="mt-2 ml-8 pl-4 border-l border-gray-700 text-gray-400 space-y-2">
            <div>
                <strong className={colorClass}>Error: {error.type}</strong>
                <pre className="p-2 bg-black/30 rounded mt-1 whitespace-pre-wrap break-all">{error.message}</pre>
            </div>
            {error.details && (
                 <div>
                    <strong>Details:</strong>
                    <pre className="p-2 bg-black/30 rounded mt-1 whitespace-pre-wrap break-all">{JSON.stringify(error.details, null, 2)}</pre>
                </div>
            )}
        </div>
    );
};

const ActionLog: React.FC<{ log: Log[] }> = ({ log }) => {
    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg flex flex-col h-full">
            <header className="p-3 border-b border-gray-700/50 flex-shrink-0">
                <h3 className="font-semibold text-gray-300">Live Action Stream</h3>
            </header>
            <main className="p-4 flex-grow overflow-y-auto font-mono text-xs">
                {log.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <p>AI actions will appear here...</p>
                    </div>
                ) : (
                    log.map(item => (
                        <div key={item.id} className="mb-2">
                            <details open={item.status === 'error'}>
                                <summary className="cursor-pointer flex items-center gap-3">
                                    <span className="w-5 h-5 flex items-center justify-center">{getStatusIcon(item.status)}</span>
                                    <span className="text-gray-500">{item.timestamp}</span>
                                    <span className={`font-semibold ${item.status === 'error' ? 'text-red-400' : 'text-cyan-400'}`}>{item.action}</span>
                                </summary>
                                {item.response?.error ? (
                                    <ErrorDisplay error={item.response.error} />
                                ) : (
                                    <div className="mt-2 ml-8 pl-4 border-l border-gray-700 text-gray-400 space-y-2">
                                        <div>
                                            <strong>Request:</strong>
                                            <pre className="p-2 bg-black/30 rounded mt-1 whitespace-pre-wrap break-all">{JSON.stringify(item.request, null, 2)}</pre>
                                        </div>
                                        {item.response && (
                                        <div>
                                            <strong>Response:</strong>
                                            <pre className="p-2 bg-black/30 rounded mt-1 whitespace-pre-wrap break-all">{JSON.stringify(item.response.data, null, 2)}</pre>
                                        </div>
                                        )}
                                    </div>
                                )}
                            </details>
                        </div>
                    ))
                )}
            </main>
        </div>
    );
};

export default ActionLog;
