
import React, { useState, useEffect, useCallback } from 'react';
import { appEventBus } from '@/lib/eventBus';
import { InteractionEvent } from '@/types/telemetry';
import { generateOraculumInsights } from '../../../styles/services/aiService';
import KPIDashboard from './KPIDashboard';
import TelemetryFeed from './TelemetryFeed';
import { GlobeAltIcon } from '../icons';
import Loader from '../Loader';
import MarkdownRenderer from '../common/MarkdownRenderer';
import { audioService } from '../../../styles/services/audioService';
import { parseApiError } from '@/utils/errorLogger';

const MAX_FEED_EVENTS = 20;

const Oraculum: React.FC = () => {
    const [liveEvents, setLiveEvents] = useState<InteractionEvent[]>([]);
    const [insights, setInsights] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleTelemetry = (payload: { type: string, data: Record<string, any> }) => {
            // Only process full InteractionEvents intended for the live feed, and ensure it has an eventType.
            if (payload.type === 'interaction_event' && payload.data.eventType) {
                setLiveEvents(prev => [payload.data as InteractionEvent, ...prev.slice(0, MAX_FEED_EVENTS - 1)]);
            }
        };

        const unsubscribe = appEventBus.on('telemetry', handleTelemetry);
        return () => unsubscribe();
    }, []);

    const handleGenerateInsights = useCallback(async () => {
        if (liveEvents.length === 0 || isLoading) return;
        setIsLoading(true);
        setError(null);
        setInsights(null);
        audioService.playSound('send');
        
        try {
            const eventsJson = JSON.stringify(liveEvents, null, 2);
            const generatedInsights = await generateOraculumInsights(eventsJson);
            setInsights(generatedInsights);
            audioService.playSound('success');
        } catch(e) {
            const userFriendlyMessage = parseApiError(e);
            setError(userFriendlyMessage);
            audioService.playSound('error');
        } finally {
            setIsLoading(false);
        }
    }, [liveEvents, isLoading]);

    return (
        <div className="flex flex-col h-full p-4 md:p-6 gap-6 overflow-hidden">
            <header className="flex-shrink-0">
                <KPIDashboard />
            </header>

            <div className="flex-grow grid grid-cols-1 xl:grid-cols-2 gap-6 overflow-hidden">
                <div className="xl:col-span-1 h-full overflow-hidden">
                    <TelemetryFeed events={liveEvents} />
                </div>
                
                <div className="xl:col-span-1 h-full overflow-hidden flex flex-col gap-6">
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
                        <button
                            onClick={handleGenerateInsights}
                            disabled={isLoading || liveEvents.length === 0}
                            className="w-full flex items-center justify-center gap-2 text-md font-semibold text-center p-3 rounded-md border transition-all duration-200 bg-fuchsia-600/80 border-fuchsia-500 text-white shadow-lg hover:bg-fuchsia-600 hover:border-fuchsia-400 hover:shadow-fuchsia-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? <Loader /> : <GlobeAltIcon className="w-5 h-5" />}
                            Generate Insights from Live Feed
                        </button>
                    </div>

                    <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 flex-grow overflow-y-auto p-4">
                        {isLoading && <div className="flex justify-center items-center h-full"><Loader /></div>}
                        {error && <p className="text-red-400">{error}</p>}
                        {insights && <MarkdownRenderer content={insights} />}
                        {!isLoading && !error && !insights && (
                            <div className="text-center text-gray-500 flex flex-col justify-center items-center h-full">
                                <p>AI-generated insights will appear here.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Oraculum;
