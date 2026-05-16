
import React from 'react';
import { useAutonomous } from '@/context/AutonomousContext.tsx';
import { SparklesIcon, XMarkIcon } from './icons';

interface AdaptivePanelProps {
    children: React.ReactNode;
    className?: string;
}

const AdaptivePanel: React.FC<AdaptivePanelProps> = ({ children, className = '' }) => {
    const { activeDirectives, consumeDirective } = useAutonomous();

    // Find suggestions that are general (no specific target element) or specifically target this panel context
    const suggestions = activeDirectives.filter(d => d.type === 'SUGGESTION' && !d.targetElementId);

    return (
        <div className={`relative flex flex-col h-full ${className}`}>
            {suggestions.length > 0 && (
                <div className="mb-4 space-y-2 animate-slide-up flex-shrink-0">
                    {suggestions.map(suggestion => (
                        <div key={suggestion.id} className="bg-fuchsia-900/20 border border-fuchsia-500/30 rounded-lg p-3 flex items-start gap-3 relative overflow-hidden shadow-lg backdrop-blur-sm">
                             {/* Glow effect */}
                            <div className="absolute top-0 left-0 w-1 h-full bg-fuchsia-500"></div>
                            
                            <div className="flex-shrink-0 mt-0.5">
                                <SparklesIcon className="w-5 h-5 text-fuchsia-400 animate-pulse" />
                            </div>
                            <div className="flex-grow">
                                <p className="text-sm text-gray-200 font-medium">{suggestion.payload.message}</p>
                                {suggestion.payload.actionLabel && (
                                    <button className="mt-2 text-xs bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-3 py-1 rounded-md transition-colors shadow-sm">
                                        {suggestion.payload.actionLabel}
                                    </button>
                                )}
                            </div>
                            <button 
                                onClick={() => consumeDirective(suggestion.id)}
                                className="text-gray-500 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                            >
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <div className="glass-panel rounded-xl p-4 md:p-6 h-full overflow-hidden flex flex-col relative z-10">
                {children}
            </div>
        </div>
    );
};

export default AdaptivePanel;