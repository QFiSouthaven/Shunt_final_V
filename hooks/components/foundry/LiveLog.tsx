
// components/foundry/LiveLog.tsx
import React, { useRef, useEffect } from 'react';
import { LogEntry, LogEntryType } from '@/types';
import { FlagIcon, InformationCircleIcon, CheckCircleIcon, SparklesIcon } from '../icons';

interface LiveLogProps {
    log: LogEntry[];
    isLoading: boolean;
}

const getIconForType = (type: LogEntryType): React.ReactNode => {
    switch (type) {
        case 'PHASE':
            return <FlagIcon className="w-4 h-4 text-cyan-400" />;
        case 'SUCCESS':
            return <CheckCircleIcon className="w-4 h-4 text-green-400" />;
        case 'DECISION':
            return <SparklesIcon className="w-4 h-4 text-yellow-400" />;
        case 'INFO':
        default:
            return <InformationCircleIcon className="w-4 h-4 text-gray-400" />;
    }
};

const LiveLog: React.FC<LiveLogProps> = ({ log, isLoading }) => {
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [log]);

    return (
        <div className="h-full p-4 overflow-y-auto bg-black/30 font-mono text-xs text-gray-400 space-y-2">
            {log.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 animate-fade-in">
                    <span className="flex-shrink-0 mt-0.5">{getIconForType(entry.type)}</span>
                    <span className="text-gray-500">{entry.timestamp}</span>
                    <p className="flex-grow text-gray-300">{entry.message}</p>
                </div>
            ))}
            {isLoading && (
                <div className="flex items-center gap-3 text-fuchsia-400 animate-pulse">
                    <span className="flex-shrink-0 mt-0.5"><InformationCircleIcon className="w-4 h-4" /></span>
                    <span>{new Date().toLocaleTimeString()}</span>
                    <p className="flex-grow">Working...</p>
                </div>
            )}
            <div ref={logEndRef} />
        </div>
    );
};

export default LiveLog;
