
// components/foundry/AgentCard.tsx
import React from 'react';
import { FoundryAgent } from '@/types';
import { BrainIcon } from '../icons';

interface AgentCardProps {
    agent: FoundryAgent;
}

const ProgressBar: React.FC = () => (
    <div className="w-full bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
        <div className="bg-fuchsia-500 h-1.5 rounded-full progress-bar-animate"></div>
        <style>{`
            @keyframes progress-indeterminate {
                0% { transform: translateX(-100%) scaleX(0.5); }
                50% { transform: translateX(0) scaleX(0.2); }
                100% { transform: translateX(100%) scaleX(0.5); }
            }
            .progress-bar-animate {
                width: 100%;
                transform-origin: left;
                animation: progress-indeterminate 1.5s ease-in-out infinite;
            }
        `}</style>
    </div>
);

const AgentCard: React.FC<AgentCardProps> = ({ agent }) => {
    const isWorking = ['Auditing', 'Designing', 'Reviewing', 'Refining'].includes(agent.status);

    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BrainIcon className={`w-5 h-5 ${isWorking ? 'text-fuchsia-400 animate-pulse' : 'text-gray-500'}`} />
                    <h4 className="font-semibold text-gray-200">{agent.name}</h4>
                </div>
                {agent.designScore ? (
                    <span className="font-mono text-sm text-cyan-300 bg-gray-700/50 px-2 py-0.5 rounded">{agent.designScore.toFixed(0)}/100</span>
                ) : null}
            </div>
            <p className="text-xs text-gray-400 h-8 overflow-hidden">{agent.currentTask || 'Standing by...'}</p>
            <div className="h-1.5">
                {isWorking && <ProgressBar />}
            </div>
        </div>
    );
};

export default AgentCard;
