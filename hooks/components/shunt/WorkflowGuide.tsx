// components/shunt/WorkflowGuide.tsx
import React from 'react';
import { MousePointerIcon, SparklesIcon, DocumentArrowDownIcon } from '../icons';

interface WorkflowGuideProps {
    isFading: boolean;
}

const WorkflowGuide: React.FC<WorkflowGuideProps> = ({ isFading }) => {
    return (
        <div className={`absolute inset-0 z-10 flex flex-col lg:flex-row items-center justify-around p-10 pointer-events-none gap-8 lg:gap-0 transition-opacity duration-1000 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
            {/* Step 1: Input */}
            <div className="text-center text-white flex flex-col items-center gap-4 animate-fade-in" style={{ animationDelay: '0s' }}>
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-cyan-400 flex items-center justify-center">
                    <DocumentArrowDownIcon className="w-12 h-12 text-cyan-400" />
                </div>
                <h3 className="text-2xl font-bold">1. Input</h3>
                <p className="max-w-xs text-gray-300">Start here. Add content by typing, pasting, or dropping files into the input panel.</p>
            </div>
            
            <div className="text-gray-500 animate-fade-in lg:block hidden" style={{ animationDelay: '0.2s' }}>
                <svg width="100" height="100" viewBox="0 0 100 100" className="opacity-70">
                    <path d="M10 50 L85 50" stroke="currentColor" strokeWidth="2" strokeDasharray="5,5" />
                    <path d="M80 45 L90 50 L80 55" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
            </div>
            <div className="text-gray-500 animate-fade-in lg:hidden" style={{ animationDelay: '0.2s' }}>
                <svg width="100" height="50" viewBox="0 0 100 50" className="opacity-70">
                    <path d="M50 5 L50 40" stroke="currentColor" strokeWidth="2" strokeDasharray="5,5" />
                    <path d="M45 35 L50 45 L55 35" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
            </div>

            {/* Step 2: Control */}
            <div className="text-center text-white flex flex-col items-center gap-4 animate-fade-in" style={{ animationDelay: '0.4s' }}>
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-fuchsia-400 flex items-center justify-center">
                    <MousePointerIcon className="w-12 h-12 text-fuchsia-400" />
                </div>
                <h3 className="text-2xl font-bold">2. Control</h3>
                <p className="max-w-xs text-gray-300">Choose a one-click Shunt Action or combine modules for a custom transformation.</p>
            </div>

            <div className="text-gray-500 animate-fade-in lg:block hidden" style={{ animationDelay: '0.6s' }}>
                <svg width="100" height="100" viewBox="0 0 100 100" className="opacity-70">
                    <path d="M10 50 L85 50" stroke="currentColor" strokeWidth="2" strokeDasharray="5,5" />
                    <path d="M80 45 L90 50 L80 55" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
            </div>
             <div className="text-gray-500 animate-fade-in lg:hidden" style={{ animationDelay: '0.6s' }}>
                <svg width="100" height="50" viewBox="0 0 100 50" className="opacity-70">
                    <path d="M50 5 L50 40" stroke="currentColor" strokeWidth="2" strokeDasharray="5,5" />
                    <path d="M45 35 L50 45 L55 35" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
            </div>

            {/* Step 3: Output */}
            <div className="text-center text-white flex flex-col items-center gap-4 animate-fade-in" style={{ animationDelay: '0.8s' }}>
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-green-400 flex items-center justify-center">
                    <SparklesIcon className="w-12 h-12 text-green-400" />
                </div>
                <h3 className="text-2xl font-bold">3. Output</h3>
                <p className="max-w-xs text-gray-300">Your transformed text will appear. 'Evolve' it back to the input for more refinement.</p>
            </div>
        </div>
    );
};

export default WorkflowGuide;