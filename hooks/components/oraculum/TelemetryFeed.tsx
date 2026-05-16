
import React from 'react';
import { InteractionEvent } from '@/types/telemetry';
import { BoltIcon, SparklesIcon, ServerIcon } from '../icons';

interface TelemetryFeedProps {
    events: InteractionEvent[];
}

const getIconForEvent = (eventType: string, interactionType?: string) => {
    if (eventType.includes('ai_response')) {
        return <SparklesIcon className="w-4 h-4 text-fuchsia-400" />;
    }
    if (interactionType?.includes('shunt')) {
        return <BoltIcon className="w-4 h-4 text-cyan-400" />;
    }
    return <ServerIcon className="w-4 h-4 text-gray-500" />;
};

const TelemetryFeed: React.FC<TelemetryFeedProps> = ({ events }) => {
    return (
        <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 flex flex-col h-full">
            <header className="p-3 border-b border-gray-700/50 flex-shrink-0">
                <h3 className="font-semibold text-gray-300">Live Telemetry Feed</h3>
            </header>
            <main className="p-4 flex-grow overflow-y-auto">
                {events.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <p>Waiting for telemetry events...</p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {events.map(event => (
                            <li key={event.id} className="flex items-start gap-3 text-xs animate-fade-in">
                                <div className="mt-0.5">{getIconForEvent(event.eventType, event.interactionType)}</div>
                                <div className="flex-grow">
                                    <p className="font-mono text-gray-400">
                                        <span className="text-fuchsia-400">{event.eventType}</span> in <span className="text-cyan-400">{event.tab}</span>
                                    </p>
                                    <p className="text-gray-500">
                                        {event.interactionType || 'System Event'} - {new Date(event.timestamp).toLocaleTimeString()}
                                    </p>
                                </div>
                                {event.tokenUsage && (
                                    <div className="text-right text-gray-500 font-mono flex-shrink-0">
                                        <p>{event.tokenUsage.total_tokens} tokens</p>
                                        <p>{event.modelUsed}</p>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </main>
        </div>
    );
};

export default TelemetryFeed;
