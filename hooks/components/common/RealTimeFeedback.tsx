
// components/common/RealTimeFeedback.tsx
import React from 'react';
import { SparklesIcon, CheckIcon, XMarkIcon } from '../icons';
import Loader from '../Loader';
import MarkdownRenderer from './MarkdownRenderer';

interface RealTimeFeedbackProps {
    isLoading: boolean;
    feedback: string;
    onApply: () => void;
    onDiscard: () => void;
}

export const RealTimeFeedback: React.FC<RealTimeFeedbackProps> = ({ isLoading, feedback, onApply, onDiscard }) => {
    if (!isLoading && !feedback) return null;

    return (
        <div className="mt-2 animate-fade-in bg-fuchsia-900/20 border border-fuchsia-500/30 rounded-md flex flex-col overflow-hidden relative mb-4 shadow-lg">
            <div className="bg-fuchsia-900/40 p-2 border-b border-fuchsia-500/30 flex justify-between items-center">
                <div className="flex items-center gap-2 text-fuchsia-300">
                    {isLoading ? <Loader className="w-4 h-4 text-fuchsia-400" /> : <SparklesIcon className="w-4 h-4" />}
                    <span className="text-xs font-bold uppercase tracking-wider">{isLoading ? "Mia is optimizing..." : "Mia's Optimization Suggestion"}</span>
                </div>
                <div className="flex gap-2">
                    {!isLoading && feedback && (
                        <>
                             <button 
                                onClick={onApply}
                                className="flex items-center gap-1 px-2 py-1 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs rounded transition-colors shadow-sm"
                                title="Apply this suggestion"
                            >
                                <CheckIcon className="w-3 h-3" /> Apply
                            </button>
                            <button 
                                onClick={onDiscard}
                                className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors shadow-sm"
                                title="Dismiss"
                            >
                                <XMarkIcon className="w-3 h-3" />
                            </button>
                        </>
                    )}
                </div>
            </div>
            <div className="p-3 overflow-y-auto max-h-40 text-sm text-gray-300 bg-gray-900/40">
                    {isLoading && !feedback ? (
                        <div className="flex flex-col items-center justify-center text-fuchsia-300/50 text-xs italic p-2">
                            Analyzing prompt structure and specificity...
                        </div>
                    ) : (
                        <div className="whitespace-pre-wrap font-mono text-xs">
                            <MarkdownRenderer content={feedback} />
                        </div>
                    )}
            </div>
        </div>
    );
};
