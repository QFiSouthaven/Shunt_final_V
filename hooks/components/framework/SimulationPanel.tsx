// components/framework/SimulationPanel.tsx
import React, { useState } from 'react';
import { Metrics, LiveInspectorData, Hyperparameters } from './types';
import { BoltIcon, Cog6ToothIcon, ServerIcon, BrainIcon, PlayIcon, StopIcon, ArrowPathIcon } from '../icons';
import Loader from '../Loader';

interface SimulationPanelProps {
    metrics: Metrics;
    inspectorData: LiveInspectorData;
    onStart: () => void;
    onStop: () => void;
    onReset: () => void;
    state: 'idle' | 'running' | 'paused' | 'finished';
    hyperparameters: Hyperparameters;
}

const StatCard: React.FC<{ label: string; value: string; unit?: string }> = ({ label, value, unit }) => (
    <div className="bg-gray-900/50 p-3 rounded-lg text-center">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-lg font-bold text-white">{value} <span className="text-sm font-normal text-gray-400">{unit}</span></p>
    </div>
);

const LineChart: React.FC<{ data: { episode: number, reward: number }[], maxEpisodes: number }> = ({ data, maxEpisodes }) => {
    const width = 500;
    const height = 200;
    const padding = 20;

    const maxX = maxEpisodes;
    const maxY = 500; // Max reward for CartPole-v1

    if (data.length === 0) {
        return <div className="w-full h-[200px] flex items-center justify-center text-gray-500">Waiting for data...</div>
    }

    const getX = (episode: number) => padding + (episode / maxX) * (width - padding * 2);
    const getY = (reward: number) => height - padding - (reward / maxY) * (height - padding * 2);

    const pathD = data.map((point, i) => {
        const x = getX(point.episode);
        const y = getY(point.reward);
        return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
    }).join(' ');

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            {/* Axes */}
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#4b5563" />
            <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#4b5563" />
            
            {/* Y-Axis Labels */}
            {[0, 100, 200, 300, 400, 500].map(val => (
                <text key={val} x={padding - 5} y={getY(val)} textAnchor="end" alignmentBaseline="middle" fill="#9ca3af" fontSize="10">{val}</text>
            ))}
            <text transform={`rotate(-90) translate(-${height/2}, 8)`} textAnchor="middle" fill="#9ca3af" fontSize="10">Reward</text>

            {/* X-Axis Labels */}
            {[0, 0.25, 0.5, 0.75, 1].map(frac => (
                <text key={frac} x={getX(maxX * frac)} y={height - padding + 15} textAnchor="middle" fill="#9ca3af" fontSize="10">{Math.round(maxX * frac)}</text>
            ))}
            <text x={width/2} y={height - 2} textAnchor="middle" fill="#9ca3af" fontSize="10">Episode</text>

            <path d={pathD} stroke="#a855f7" strokeWidth="2" fill="none" />
        </svg>
    );
};


const SimulationPanel: React.FC<SimulationPanelProps> = ({ metrics, inspectorData, onStart, onStop, onReset, state, hyperparameters }) => {
    const [activeTab, setActiveTab] = useState<'log' | 'agent' | 'buffer'>('log');

    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg flex flex-col h-full">
            {/* Controls */}
            <header className="p-3 border-b border-gray-700/50 flex justify-between items-center">
                <h3 className="font-semibold text-gray-300">Simulation Dashboard</h3>
                <div className="flex items-center gap-2">
                    <button onClick={onStart} disabled={state === 'running'} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center gap-2">
                        <PlayIcon className="w-4 h-4" /> Run
                    </button>
                     <button onClick={onStop} disabled={state !== 'running'} className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center gap-2">
                        <StopIcon className="w-4 h-4" /> Pause
                    </button>
                    <button onClick={onReset} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-500 flex items-center gap-2">
                        <ArrowPathIcon className="w-4 h-4" /> Reset
                    </button>
                </div>
            </header>

            {/* Metrics */}
            <main className="p-4 flex-grow flex flex-col overflow-hidden">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <StatCard label="Episode" value={`${metrics.episode} / ${hyperparameters.numEpisodes}`} />
                    <StatCard label="Avg Reward" value={metrics.avgReward.toFixed(2)} />
                    <StatCard label="Last Reward" value={(metrics.rewardHistory[metrics.rewardHistory.length - 1]?.reward ?? 0).toFixed(2)} />
                    <StatCard label="Current Loss" value={metrics.loss.toFixed(4)} />
                </div>

                {/* Chart */}
                <div className="bg-gray-900/50 rounded-lg p-2 mb-4">
                    <h4 className="text-sm font-semibold text-gray-300 ml-2 mb-1">Reward per Episode</h4>
                    <LineChart data={metrics.rewardHistory} maxEpisodes={hyperparameters.numEpisodes} />
                </div>
                
                {/* Inspector */}
                <div className="flex-grow flex flex-col overflow-hidden bg-gray-900/50 rounded-lg">
                    <div className="flex border-b border-gray-700/50 text-sm">
                        <button onClick={() => setActiveTab('log')} className={`px-4 py-2 ${activeTab === 'log' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400'}`}><BoltIcon className="w-4 h-4 inline mr-2"/>Training Log</button>
                        <button onClick={() => setActiveTab('agent')} className={`px-4 py-2 ${activeTab === 'agent' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400'}`}><BrainIcon className="w-4 h-4 inline mr-2"/>Agent</button>
                        <button onClick={() => setActiveTab('buffer')} className={`px-4 py-2 ${activeTab === 'buffer' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400'}`}><ServerIcon className="w-4 h-4 inline mr-2"/>Buffer</button>
                    </div>
                    <div className="p-4 flex-grow overflow-y-auto font-mono text-xs">
                        {activeTab === 'log' && (
                            <div className="space-y-1 text-gray-300">
                                {inspectorData.log.map(entry => (
                                    <div key={entry.id} className="flex gap-3">
                                        <span className="text-gray-500">{entry.timestamp}</span>
                                        <span>{entry.message}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                         {activeTab === 'agent' && (
                             <div className="space-y-3 text-gray-300">
                                <div><span className="text-gray-500">Epsilon (Exploration Rate): </span><span className="text-fuchsia-400">{inspectorData.epsilon.toFixed(4)}</span></div>
                                <div>
                                    <p className="text-gray-500">Q-Values (Last State):</p>
                                    <div className="pl-4 mt-1">
                                        <p>Action 'Left': <span className="text-cyan-400">{inspectorData.qValues.left.toFixed(4)}</span></p>
                                        <p>Action 'Right': <span className="text-cyan-400">{inspectorData.qValues.right.toFixed(4)}</span></p>
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeTab === 'buffer' && (
                            <div className="space-y-3 text-gray-300">
                                <div><span className="text-gray-500">Buffer Size: </span><span className="text-fuchsia-400">{inspectorData.bufferSize.toLocaleString()} / {hyperparameters.bufferCapacity.toLocaleString()}</span></div>
                                <div><span className="text-gray-500">Batch Size: </span><span className="text-cyan-400">{hyperparameters.batchSize}</span></div>
                                <div className="text-gray-500 mt-2">Simulating experience tuples being added...</div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default SimulationPanel;