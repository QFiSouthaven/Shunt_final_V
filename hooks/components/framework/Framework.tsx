// components/framework/Framework.tsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TabFooter from '../common/TabFooter';
import { useTelemetry } from '@/styles/services/context/TelemetryContext';
import { CpuChipIcon } from '../icons';
import ConfigurationPanel from './ConfigurationPanel';
import SimulationPanel from './SimulationPanel';
import { Hyperparameters, Metrics, LiveInspectorData, LogEntry } from './types';

const initialHyperparameters: Hyperparameters = {
  learningRate: 0.001,
  gamma: 0.99,
  epsilonStart: 1.0,
  epsilonEnd: 0.01,
  epsilonDecay: 0.995,
  numEpisodes: 500,
  batchSize: 64,
  bufferCapacity: 10000,
};

const Framework: React.FC = () => {
    const { updateTelemetryContext } = useTelemetry();
    const [hyperparameters, setHyperparameters] = useState<Hyperparameters>(initialHyperparameters);
    const [simulationState, setSimulationState] = useState<'idle' | 'running' | 'paused' | 'finished'>('idle');
    
    const simulationInterval = useRef<number | null>(null);

    const initialMetrics: Metrics = {
        episode: 0,
        totalReward: 0,
        avgReward: 0,
        loss: 1.0,
        rewardHistory: [],
    };

    const initialInspectorData: LiveInspectorData = {
        epsilon: hyperparameters.epsilonStart,
        bufferSize: 0,
        qValues: { left: 0.5, right: 0.5 },
        log: [],
    };
    
    const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
    const [inspectorData, setInspectorData] = useState<LiveInspectorData>(initialInspectorData);

    useEffect(() => {
        updateTelemetryContext({ tab: 'framework' });
    }, [updateTelemetryContext]);
    
    const stopSimulation = useCallback(() => {
        if (simulationInterval.current) {
            clearInterval(simulationInterval.current);
            simulationInterval.current = null;
        }
    }, []);

    const simulationTick = useCallback(() => {
        setMetrics(prevMetrics => {
            if (prevMetrics.episode >= hyperparameters.numEpisodes) {
                stopSimulation();
                setSimulationState('finished');
                return prevMetrics;
            }

            const newEpisode = prevMetrics.episode + 1;
            
            const maxReward = 500;
            const learningSpeed = 3; 
            const progress = Math.min(1, newEpisode / (hyperparameters.numEpisodes / learningSpeed));
            const baseReward = progress * maxReward;
            const noise = (Math.random() - 0.5) * 80 * (1 - progress);
            const newReward = Math.min(maxReward, Math.max(10, baseReward + noise));

            const newHistory = [...prevMetrics.rewardHistory, { episode: newEpisode, reward: newReward }];
            const newAvgReward = newHistory.reduce((acc, cur) => acc + cur.reward, 0) / newHistory.length;
            const newLoss = Math.max(0.01, prevMetrics.loss * (0.985 + Math.random() * 0.01));

            setInspectorData(prevInspector => {
                const newEpsilon = Math.max(hyperparameters.epsilonEnd, prevInspector.epsilon * hyperparameters.epsilonDecay);
                const newBufferSize = Math.min(hyperparameters.bufferCapacity, prevInspector.bufferSize + Math.round(newReward)); 
                const qLeft = 0.5 + progress * Math.random() * 0.2;
                const qRight = 0.8 + progress * Math.random() * 0.15;

                const newLogEntry: LogEntry = {
                    id: uuidv4(),
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    message: `Episode ${newEpisode}: Reward=${newReward.toFixed(1)}, Loss=${newLoss.toFixed(4)}, Epsilon=${newEpsilon.toFixed(3)}`,
                };
                
                return {
                    epsilon: newEpsilon,
                    bufferSize: newBufferSize,
                    qValues: { left: qLeft, right: qRight },
                    log: [newLogEntry, ...prevInspector.log.slice(0, 99)],
                };
            });

            return {
                episode: newEpisode,
                totalReward: prevMetrics.totalReward + newReward,
                avgReward: newAvgReward,
                loss: newLoss,
                rewardHistory: newHistory,
            };
        });
    }, [hyperparameters, stopSimulation]);

    const handleStart = () => {
        if (simulationState === 'idle' || simulationState === 'finished') {
             setMetrics(initialMetrics);
             setInspectorData({ ...initialInspectorData, epsilon: hyperparameters.epsilonStart });
        }
        setSimulationState('running');
        if (simulationInterval.current) clearInterval(simulationInterval.current);
        simulationInterval.current = window.setInterval(simulationTick, 75);
    };

    const handleStop = () => {
        setSimulationState('paused');
        stopSimulation();
    };
    
    const handleReset = () => {
        stopSimulation();
        setSimulationState('idle');
        setMetrics(initialMetrics);
        setInspectorData(initialInspectorData);
    };

    useEffect(() => {
        return () => stopSimulation();
    }, [stopSimulation]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex-grow p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
                <div className="lg:col-span-1 flex flex-col gap-6 overflow-y-auto pr-2">
                    <header>
                        <h2 className="text-2xl font-semibold text-white flex items-center gap-3">
                            <CpuChipIcon className="w-7 h-7 text-fuchsia-400" />
                            Live RL Simulation
                        </h2>
                        <p className="text-gray-400 mt-2">
                            Configure, run, and inspect a simulated Deep Q-Network (DQN) training process in real-time.
                        </p>
                    </header>
                    <ConfigurationPanel 
                        params={hyperparameters} 
                        onParamChange={setHyperparameters}
                        isRunning={simulationState === 'running'}
                    />
                </div>
                <div className="lg:col-span-2 overflow-hidden h-full">
                    <SimulationPanel 
                        metrics={metrics}
                        inspectorData={inspectorData}
                        onStart={handleStart}
                        onStop={handleStop}
                        onReset={handleReset}
                        state={simulationState}
                        hyperparameters={hyperparameters}
                    />
                </div>
            </div>
            <TabFooter />
        </div>
    );
};

export default Framework;
