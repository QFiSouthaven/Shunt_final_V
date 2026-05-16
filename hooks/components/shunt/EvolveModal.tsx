
// components/shunt/EvolveModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ShuntAction, EvolveStep, EvolveResult } from '@/types';
import { performShunt } from '../../../styles/services/aiService';
import { shuntActionDescriptions, shuntActionsConfig, actionGroups } from '../../../styles/services/prompts';
import { XMarkIcon, BranchingIcon, BoltIcon, CheckIcon, ErrorIcon, DocumentDuplicateIcon } from '../icons';
import Loader from '../Loader';

interface EvolveModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialText: string;
    onComplete: (finalText: string) => void;
}

const EvolveModal: React.FC<EvolveModalProps> = ({ isOpen, onClose, initialText, onComplete }) => {
    const [isRendered, setIsRendered] = useState(false);
    const [chain, setChain] = useState<EvolveStep[]>([]);
    const [view, setView] = useState<'builder' | 'running' | 'results'>('builder');
    const [results, setResults] = useState<EvolveResult[]>([]);
    const [currentStep, setCurrentStep] = useState(0);

    // Drag and drop state
    const [draggedAction, setDraggedAction] = useState<ShuntAction | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    useEffect(() => {
        if (isOpen) {
            setIsRendered(true);
        } else {
            const timer = setTimeout(() => {
                setIsRendered(false);
                setChain([]);
                setResults([]);
                setView('builder');
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);
    
    const handleRunWorkflow = useCallback(async () => {
        setView('running');
        setResults([]);
        let currentText = initialText;
        const newResults: EvolveResult[] = [];

        for (let i = 0; i < chain.length; i++) {
            setCurrentStep(i);
            const step = chain[i];
            try {
                const { resultText } = await performShunt(currentText, step.action, '');
                currentText = resultText;
                newResults.push({ stepId: step.id, action: step.action, output: resultText, status: 'success' });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
                newResults.push({ stepId: step.id, action: step.action, output: '', status: 'error', error: errorMessage });
                setResults(newResults);
                setView('results');
                return;
            }
        }
        setResults(newResults);
        setView('results');
    }, [chain, initialText]);

    const handleApply = () => {
        if (results.length > 0) {
            const finalResult = results[results.length - 1];
            if (finalResult.status === 'success') {
                onComplete(finalResult.output);
            }
        }
    };

    // --- Drag and Drop Handlers ---
    const handleActionDragStart = (e: React.DragEvent<HTMLButtonElement>, action: ShuntAction) => {
        e.dataTransfer.setData('application/shunt-action', action);
        e.dataTransfer.effectAllowed = 'copy';
    };
    
    const handleChainDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    
    const handleDropOnChain = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const action = e.dataTransfer.getData('application/shunt-action') as ShuntAction;
        const draggedId = e.dataTransfer.getData('application/step-id');

        if (action) { // From action list
            const newStep: EvolveStep = { id: uuidv4(), action };
            if (dragOverIndex === null) {
                setChain(prev => [...prev, newStep]);
            } else {
                setChain(prev => {
                    const newChain = [...prev];
                    newChain.splice(dragOverIndex, 0, newStep);
                    return newChain;
                });
            }
        } else if (draggedId) { // Reordering within chain
            const draggedIndex = chain.findIndex(step => step.id === draggedId);
            if (draggedIndex === -1 || dragOverIndex === null) return;
            
            setChain(prev => {
                const newChain = [...prev];
                const [movedItem] = newChain.splice(draggedIndex, 1);
                newChain.splice(dragOverIndex, 0, movedItem);
                return newChain;
            });
        }
        setDragOverIndex(null);
    };
    
    const handleStepDragStart = (e: React.DragEvent<HTMLDivElement>, stepId: string) => {
        e.dataTransfer.setData('application/step-id', stepId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const removeStep = (id: string) => {
        setChain(prev => prev.filter(step => step.id !== id));
    };


    if (!isRendered) return null;

    const finalResult = results.length > 0 ? results[results.length - 1] : null;

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop ${isOpen ? 'bg-black/70' : 'bg-black/0'}`}>
            <div className={`modal-content ${isOpen ? 'open' : ''} bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col`}>
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <BranchingIcon className="w-6 h-6 text-purple-400" />
                        <h2 className="text-lg font-semibold text-gray-200">Evolve Workflow</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-700/50">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <main className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-6 p-6 overflow-hidden relative">
                    {/* Running Overlay */}
                    {view === 'running' && (
                        <div className="absolute inset-0 bg-gray-900/80 z-20 flex flex-col items-center justify-center gap-4">
                            <Loader className="w-12 h-12" />
                            <p className="text-lg text-gray-300">Executing Step {currentStep + 1} of {chain.length}: {chain[currentStep]?.action}</p>
                            <div className="w-1/2 bg-gray-700 rounded-full h-2.5">
                                <div className="bg-purple-600 h-2.5 rounded-full" style={{ width: `${((currentStep + 1) / chain.length) * 100}%` }}></div>
                            </div>
                        </div>
                    )}

                    {/* Builder View */}
                    {view === 'builder' && (
                        <>
                            {/* Left Panel: Available Actions */}
                            <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg flex flex-col">
                                <h3 className="p-3 font-semibold text-gray-300 border-b border-gray-700/50">Available Actions</h3>
                                <div className="p-4 overflow-y-auto space-y-4">
                                    {actionGroups.map(group => (
                                        <div key={group}>
                                            <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">{group}</h4>
                                            <div className="space-y-2">
                                                {shuntActionsConfig.filter(c => c.group === group).map(({ action, icon }) => (
                                                    <button
                                                        key={action}
                                                        draggable
                                                        onDragStart={(e) => handleActionDragStart(e, action)}
                                                        className="w-full flex items-center gap-3 p-2 rounded-md bg-gray-700/50 text-gray-300 hover:bg-gray-700 text-sm transition-colors cursor-grab"
                                                        title={shuntActionDescriptions[action]}
                                                    >
                                                        {/* FIX: Cast icon to a ReactElement with a className prop to satisfy TypeScript's strict type checking for cloneElement. */}
                                                        {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-4 h-4 flex-shrink-0" })}
                                                        <span>{action}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right Panel: Evolve Chain */}
                            <div
                                onDragOver={handleChainDragOver}
                                onDrop={handleDropOnChain}
                                onDragEnter={() => setDragOverIndex(chain.length)}
                                className="bg-gray-900/50 border-2 border-dashed border-gray-700/50 rounded-lg flex flex-col"
                            >
                                <h3 className="p-3 font-semibold text-gray-300 border-b border-gray-700/50">Evolve Chain ({chain.length} steps)</h3>
                                <div className="p-4 overflow-y-auto space-y-2">
                                    {chain.length === 0 ? (
                                        <div className="flex items-center justify-center h-full text-gray-500">
                                            <p>Drag actions here to build your workflow.</p>
                                        </div>
                                    ) : (
                                        chain.map((step, index) => (
                                            <div
                                                key={step.id}
                                                draggable
                                                onDragStart={(e) => handleStepDragStart(e, step.id)}
                                                onDragEnter={() => setDragOverIndex(index)}
                                                className={`flex items-center justify-between p-3 rounded-md bg-gray-700/80 text-gray-200 cursor-grab group ${dragOverIndex === index ? 'ring-2 ring-purple-500' : ''}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono text-xs text-gray-400">{index + 1}.</span>
                                                    <span className="font-semibold">{step.action}</span>
                                                </div>
                                                <button onClick={() => removeStep(step.id)} className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <XMarkIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Results View */}
                    {view === 'results' && (
                        <div className="md:col-span-2 bg-gray-900/50 border border-gray-700/50 rounded-lg p-4 flex flex-col overflow-hidden">
                             <h3 className="text-lg font-semibold text-gray-200 mb-4">Workflow Results</h3>
                             <div className="overflow-y-auto space-y-4 pr-2">
                                {results.map((result, index) => (
                                    <details key={result.stepId} className="bg-gray-800/60 rounded-lg border border-gray-700" open={index === results.length - 1}>
                                        <summary className="p-3 cursor-pointer flex items-center justify-between font-semibold">
                                            <div className="flex items-center gap-3">
                                                {result.status === 'success' ? <CheckIcon className="w-5 h-5 text-green-400"/> : <ErrorIcon className="w-5 h-5 text-red-400"/>}
                                                <span>Step {index + 1}: {result.action}</span>
                                            </div>
                                            <span className="text-xs text-gray-500">Click to {index === results.length - 1 ? 'collapse' : 'expand'}</span>
                                        </summary>
                                        <div className="p-4 border-t border-gray-700 bg-black/20">
                                            {result.status === 'success' ? (
                                                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{result.output}</pre>
                                            ) : (
                                                <p className="text-red-400">Error: {result.error}</p>
                                            )}
                                        </div>
                                    </details>
                                ))}
                             </div>
                        </div>
                    )}
                </main>
                <footer className="p-4 bg-gray-900/50 border-t border-gray-700/50 rounded-b-lg flex justify-end items-center gap-4">
                     {view === 'results' && finalResult?.status === 'success' && (
                        <div className="flex items-center gap-2 text-sm text-green-400 mr-auto">
                            <CheckIcon className="w-5 h-5" />
                            <span>Workflow completed successfully.</span>
                        </div>
                     )}
                     {view === 'results' && finalResult?.status === 'error' && (
                        <div className="flex items-center gap-2 text-sm text-red-400 mr-auto">
                            <ErrorIcon className="w-5 h-5" />
                            <span>Workflow failed.</span>
                        </div>
                     )}
                     
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-500 transition-colors">
                        Close
                    </button>
                    {view === 'builder' && (
                        <button
                            onClick={handleRunWorkflow}
                            disabled={chain.length === 0}
                            className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            <BoltIcon className="w-5 h-5" />
                            Run Workflow
                        </button>
                    )}
                     {view === 'results' && finalResult?.status === 'success' && (
                        <button
                            onClick={handleApply}
                            className="px-6 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-500 transition-colors flex items-center gap-2"
                        >
                            <DocumentDuplicateIcon className="w-5 h-5" />
                            Apply Final Result
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
};

export default EvolveModal;
