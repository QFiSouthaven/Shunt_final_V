
// components/shunt/Shunt.tsx
import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ShuntAction, HistoryEntry } from '@/types';
import { useShuntProcessor } from '../../useShuntProcessor';
import { useSubscription } from '../../../styles/services/context/SubscriptionContext';
import { useSettings } from '../../../styles/services/context/SettingsContext';
import Loader from '../Loader';
import MarkdownRenderer from '../common/MarkdownRenderer';
import { 
    SparklesIcon, ArrowPathIcon, PaperAirplaneIcon, 
    BoltIcon, DocumentDuplicateIcon, CheckIcon,
    CodeIcon, BrainIcon, EditIcon, JsonIcon,
    TerminalIcon
} from '../icons';
import { useRealTimePrompt } from '../../useRealTimePrompt';
import { RealTimeFeedback } from '../common/RealTimeFeedback';

// Intent Chip Component for 0-Point Literacy
const QuickActionChip: React.FC<{ label: string; icon?: React.ReactNode; onClick: () => void; disabled?: boolean; className?: string }> = ({ label, icon, onClick, disabled, className }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-medium transition-all disabled:opacity-50 whitespace-nowrap backdrop-blur-md hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] active:scale-95 ${className ? className : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300 hover:text-white'}`}
    >
        {icon}
        {label}
    </button>
);

const HistoryCard: React.FC<{ entry: HistoryEntry }> = ({ entry }) => (
    <div className="opacity-80 hover:opacity-100 transition-opacity duration-500 mb-8 group animate-slide-up">
        <div className="flex justify-end mb-3">
            <div className="bg-white/5 backdrop-blur-lg px-6 py-3 rounded-2xl rounded-br-sm border border-white/10 text-sm text-gray-200 max-w-[85%] shadow-lg">
                {entry.prompt}
            </div>
        </div>
        <div className="bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
             <div className="prose prose-invert prose-sm md:prose-base max-w-none text-gray-300">
                <MarkdownRenderer content={entry.output} />
             </div>
        </div>
    </div>
);

const Shunt: React.FC = () => {
    // Simplified State for "Stream" Architecture
    const [inputText, setInputText] = useState('');
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [bulletinDocuments, setBulletinDocuments] = useState<any[]>([]);
    const [initialPrompt, setInitialPrompt] = useState('');
    const [showCopied, setShowCopied] = useState(false);

    const { feedback, isLoading: isRTLoading, applyFeedback, discardFeedback } = useRealTimePrompt(inputText, setInputText);

    const { settings } = useSettings();
    const { usage, tierDetails, incrementUsage } = useSubscription();

    // Processor Hook
    const {
        isLoading,
        error,
        outputText,
        handleShunt,
        handleGradeAndIterate
    } = useShuntProcessor({
        inputText,
        setInputText,
        bulletinDocuments,
        setBulletinDocuments,
        history,
        setHistory,
        initialPrompt,
        setInitialPrompt,
        priority: 'Medium', // Auto-set for simplicity
        selectedModel: '', // Empty = use configured model
        settings,
        usage,
        tierDetails,
        incrementUsage
    });

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [outputText, history, isLoading]);

    const handleSubmit = () => {
        if (!inputText.trim()) return;
        // Default "Magic" action if no specific chip is clicked
        handleShunt(ShuntAction.AMPLIFY);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(outputText);
        setShowCopied(true);
        setTimeout(() => setShowCopied(false), 2000);
    };

    return (
        <div className="flex flex-col h-full relative bg-transparent">
            
            {/* --- Stream Area (Output) --- */}
            <div ref={scrollRef} className="flex-grow overflow-y-auto p-6 md:p-12 pb-48 custom-scrollbar scroll-smooth">
                <div className="max-w-4xl mx-auto">
                    
                    {/* Zero State / Welcome */}
                    {history.length === 0 && !outputText && !isLoading && (
                        <div className="flex flex-col items-center justify-center h-[60vh] opacity-80 animate-fade-in">
                            <div className="relative w-24 h-24 mb-8">
                                <div className="absolute inset-0 bg-fuchsia-500 blur-3xl opacity-20 rounded-full animate-pulse"></div>
                                <div className="relative w-full h-full rounded-full bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center shadow-2xl">
                                    <SparklesIcon className="w-10 h-10 text-white/90" />
                                </div>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-4 tracking-tight text-center">
                                Aether Shunt <span className="text-lg text-fuchsia-400 font-mono tracking-widest uppercase">// System Interface</span>
                            </h1>
                            <p className="text-gray-400 text-lg max-w-md text-center leading-relaxed">
                                Ready for input. <br/>
                                <span className="text-sm text-gray-500">Initiate a command, generate a script, or transform data.</span>
                            </p>
                        </div>
                    )}

                    {/* Historical Stream */}
                    {history.map(entry => (
                        <HistoryCard key={entry.id} entry={entry} />
                    ))}
                    
                    {/* Current User Input Echo (during processing) */}
                    {isLoading && inputText && (
                         <div className="flex justify-end mb-8 animate-slide-up">
                            <div className="bg-white/5 backdrop-blur-md px-6 py-3 rounded-2xl rounded-br-sm border border-white/10 text-gray-200 shadow-lg">
                                {inputText}
                            </div>
                        </div>
                    )}

                    {/* Active Result Card */}
                    {(outputText || isLoading) && (
                        <div className="relative animate-slide-up mb-12">
                            {/* Glow Effect */}
                            <div className="absolute -inset-1 bg-gradient-to-r from-fuchsia-500/20 to-cyan-500/20 rounded-3xl blur-xl transition-opacity duration-1000"></div>
                            
                            <div className="relative bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
                                
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center py-16 gap-6">
                                        <div className="relative">
                                            <div className="absolute inset-0 bg-fuchsia-500 blur-xl opacity-30 animate-pulse rounded-full"></div>
                                            <Loader className="w-12 h-12 text-fuchsia-400 relative z-10" />
                                        </div>
                                        <span className="text-fuchsia-200/80 text-sm font-medium tracking-[0.2em] uppercase animate-pulse">
                                            Forging Reality...
                                        </span>
                                    </div>
                                ) : (
                                    <>
                                        {error ? (
                                            <div className="text-red-300 p-6 bg-red-900/10 rounded-2xl border border-red-500/20 flex items-center gap-4">
                                                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                                                <div>
                                                    <p className="font-bold mb-1">Process Interrupted</p>
                                                    <p className="text-sm opacity-80">{error}</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="prose prose-invert prose-p:leading-relaxed prose-headings:font-bold prose-a:text-cyan-400 max-w-none">
                                                <MarkdownRenderer content={outputText} />
                                            </div>
                                        )}

                                        {/* Result Toolbar */}
                                        {!error && (
                                            <div className="flex flex-wrap items-center gap-3 mt-10 pt-8 border-t border-white/5">
                                                <button
                                                    onClick={handleCopy}
                                                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-xs font-medium text-gray-300 transition-all hover:text-white"
                                                >
                                                    {showCopied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <DocumentDuplicateIcon className="w-4 h-4" />}
                                                    {showCopied ? 'Copied' : 'Copy Output'}
                                                </button>
                                                <div className="flex-grow"></div>
                                                <button 
                                                    onClick={handleGradeAndIterate}
                                                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/30 transition-all hover:shadow-[0_0_15px_rgba(34,211,238,0.2)] text-xs font-bold tracking-wide uppercase"
                                                >
                                                    <ArrowPathIcon className="w-4 h-4" />
                                                    Refine Loop
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- The Dock / Omnibar --- */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 z-30">
                 {/* Gradient Fade for Scroll */}
                <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent pointer-events-none"></div>
                
                <div className="max-w-3xl mx-auto flex flex-col gap-4 relative">
                    
                    <RealTimeFeedback 
                        isLoading={isRTLoading} 
                        feedback={feedback} 
                        onApply={applyFeedback} 
                        onDiscard={discardFeedback} 
                    />

                    {/* The Omnibar */}
                    <div className="relative group">
                        {/* Glowing Border Effect */}
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-fuchsia-500 to-cyan-500 rounded-2xl opacity-20 group-focus-within:opacity-70 transition duration-500 blur-md group-focus-within:blur-lg"></div>
                        
                        <div className="relative flex items-end gap-3 bg-[#080808] backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl">
                            <textarea
                                ref={inputRef}
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                placeholder="Type, paste, or describe your intent..."
                                className="w-full bg-transparent text-gray-100 placeholder-gray-600 text-lg p-3 max-h-48 min-h-[3.5rem] resize-none focus:outline-none custom-scrollbar leading-relaxed"
                                disabled={isLoading}
                                onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }}}
                            />
                            <button
                                onClick={handleSubmit}
                                disabled={isLoading || !inputText.trim()}
                                className={`
                                    mb-1 p-3.5 rounded-xl transition-all duration-300 shadow-lg flex-shrink-0
                                    ${isLoading || !inputText.trim() 
                                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed' 
                                        : 'bg-white text-black hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                                    }
                                `}
                            >
                                {isLoading ? <Loader className="w-6 h-6" /> : <PaperAirplaneIcon className="w-6 h-6 transform -rotate-45 translate-x-0.5 translate-y-0.5" />}
                            </button>
                        </div>
                    </div>

                    {/* Quick Actions / Intent Chips - Moved Below Input */}
                    <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar mask-linear px-4 justify-center">
                        <QuickActionChip 
                            label="Gen Shell Script" 
                            icon={<TerminalIcon className="w-4 h-4 text-green-400"/>} 
                            onClick={() => {
                                setInputText("Write a shell script to ");
                                inputRef.current?.focus();
                            }} 
                            disabled={isLoading} 
                            className="bg-green-900/20 border-green-500/30 text-green-300 hover:bg-green-900/40"
                        />
                        <QuickActionChip 
                            label="Auto-Fix" 
                            icon={<BoltIcon className="w-4 h-4 text-white animate-pulse"/>} 
                            onClick={() => {
                                if ((window as any).enterRecoveryMode) {
                                    (window as any).enterRecoveryMode({
                                        message: inputText || "User requested manual Auto-Fix",
                                        stack: "Triggered from Shunt Auto-Fix Button"
                                    });
                                }
                            }} 
                            disabled={isLoading || !inputText}
                            className="bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white border-transparent hover:from-fuchsia-500 hover:to-purple-500 shadow-lg hover:shadow-fuchsia-500/30"
                        />
                        <QuickActionChip label="Amplify" icon={<SparklesIcon className="w-4 h-4 text-fuchsia-400"/>} onClick={() => handleShunt(ShuntAction.AMPLIFY)} disabled={isLoading || !inputText} />
                        <QuickActionChip label="Summarize" icon={<BrainIcon className="w-4 h-4 text-cyan-400"/>} onClick={() => handleShunt(ShuntAction.SUMMARIZE)} disabled={isLoading || !inputText} />
                        <QuickActionChip label="Fix Grammar" icon={<EditIcon className="w-4 h-4 text-green-400"/>} onClick={() => handleShunt(ShuntAction.PROOFREAD)} disabled={isLoading || !inputText} />
                        <QuickActionChip label="Format JSON" icon={<JsonIcon className="w-4 h-4 text-orange-400"/>} onClick={() => handleShunt(ShuntAction.FORMAT_JSON)} disabled={isLoading || !inputText} />
                        <QuickActionChip label="Explain (ELI5)" icon={<BrainIcon className="w-4 h-4 text-yellow-400"/>} onClick={() => handleShunt(ShuntAction.EXPLAIN_LIKE_IM_FIVE)} disabled={isLoading || !inputText} />
                        <QuickActionChip label="Code Plan" icon={<BoltIcon className="w-4 h-4 text-blue-400"/>} onClick={() => handleShunt(ShuntAction.MAKE_ACTIONABLE)} disabled={isLoading || !inputText} />
                    </div>
                    
                    <div className="text-center">
                        <p className="text-[10px] text-gray-600 uppercase tracking-[0.2em] font-medium opacity-50">Powered by Local AI</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Shunt;
