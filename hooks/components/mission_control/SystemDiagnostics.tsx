
// components/mission_control/SystemDiagnostics.tsx
import React, { useEffect, useState } from 'react';
import { runDiagnostics } from '@/styles/services/testRunner';
import { ShieldCheckIcon, BoltIcon, CheckCircleIcon, ErrorIcon } from '../icons';
import Loader from '../Loader';
import TabFooter from '../common/TabFooter';
import { useSettings } from '@/styles/services/context/SettingsContext';

const SystemDiagnostics: React.FC = () => {
    const [logs, setLogs] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'failure'>('idle');
    const { settings } = useSettings();

    const handleRunDiagnostics = async () => {
        setIsRunning(true);
        setStatus('idle');
        setLogs(['Initializing diagnostic sequence...', 'Loading schema definitions...', 'Reading configuration...']);
        
        try {
            // Pass the AI base URL from settings to the runner
            const report = await runDiagnostics(settings.aiBaseUrl);
            setLogs(report.split('\n'));
            setStatus(report.includes('FAILED') ? 'failure' : 'success');
        } catch (e) {
            setLogs(prev => [...prev, `CRITICAL SYSTEM FAILURE: ${e}`]);
            setStatus('failure');
        } finally {
            setIsRunning(false);
        }
    };

    // Auto-run on mount
    useEffect(() => {
        handleRunDiagnostics();
    }, []);

    return (
        <div className="flex flex-col h-full bg-gray-900/30">
            <div className="p-4 md:p-6 border-b border-gray-700/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-semibold text-white flex items-center gap-3">
                        <ShieldCheckIcon className={`w-7 h-7 ${status === 'success' ? 'text-green-400' : status === 'failure' ? 'text-red-400' : 'text-gray-400'}`} />
                        System Resilience & Type Monitor
                    </h2>
                    <p className="text-gray-400 mt-1 text-sm">
                        Runtime verification of Zod schemas, API contracts, Local AI health, and internal consistency.
                    </p>
                </div>
                <button
                    onClick={handleRunDiagnostics}
                    disabled={isRunning}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                    {isRunning ? <Loader className="w-4 h-4" /> : <BoltIcon className="w-4 h-4 text-cyan-400" />}
                    {isRunning ? 'Running Tests...' : 'Re-Run Diagnostics'}
                </button>
            </div>

            <div className="flex-grow p-4 md:p-6 overflow-hidden">
                <div className="h-full bg-black/50 border border-gray-700/50 rounded-lg p-4 font-mono text-sm overflow-y-auto custom-scrollbar shadow-inner">
                    {logs.map((log, index) => {
                        const isPass = log.includes('PASSED');
                        const isFail = log.includes('FAILED');
                        const isWarn = log.includes('WARNING');
                        const isHeader = log.startsWith('---') || log.startsWith('[');
                        
                        return (
                            <div key={index} className={`mb-1 flex items-start gap-2 ${isHeader ? 'text-gray-500 mt-4 mb-2 font-bold' : ''}`}>
                                {!isHeader && (
                                    <span className="mt-1 flex-shrink-0">
                                        {isPass ? <CheckCircleIcon className="w-3 h-3 text-green-500" /> : 
                                         isFail ? <ErrorIcon className="w-3 h-3 text-red-500" /> : 
                                         isWarn ? <span className="w-3 h-3 text-yellow-500 font-bold">!</span> :
                                         <span className="w-3 h-3 block" />}
                                    </span>
                                )}
                                <span className={`break-all ${isPass ? 'text-green-300' : isFail ? 'text-red-300 font-bold' : isWarn ? 'text-yellow-300' : 'text-gray-300'}`}>
                                    {log}
                                </span>
                            </div>
                        );
                    })}
                    {isRunning && (
                        <div className="flex items-center gap-2 mt-2 text-cyan-400 animate-pulse">
                            <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                            Executing next test suite...
                        </div>
                    )}
                </div>
            </div>
            <TabFooter />
        </div>
    );
};

export default SystemDiagnostics;
