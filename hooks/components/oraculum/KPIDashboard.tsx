
// components/oraculum/KPIDashboard.tsx
import React, { useEffect, useRef, useState } from 'react';
import { appEventBus } from '@/lib/eventBus';
// Fix: Removed ActivityIcon from imports as it is not exported from icons.tsx
import { BoltIcon } from '../icons';

// Simple ActivityIcon since it wasn't exported previously
const ActivityGraphIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
);

const MAX_DATA_POINTS = 60; // 60 seconds history roughly

const KPIDashboard: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loadData, setLoadData] = useState<number[]>(new Array(MAX_DATA_POINTS).fill(0));
    const currentLoad = useRef(0);
    const targetLoad = useRef(0);

    // Neural Load Simulation Logic
    useEffect(() => {
        const handleActivity = (payload: { type: string, data: any }) => {
            // Spike the target load based on event type
            let spike = 0;
            if (payload.type === 'mia-alert') spike = 30;
            else if (payload.type === 'interaction_event') {
                const event = payload.data;
                if (event.eventType === 'ai_response') spike = 50;
                else if (event.eventType === 'system_action') spike = 20;
                else spike = 5;
            } else if (payload.type === 'telemetry') {
                spike = 10;
            }
            
            targetLoad.current = Math.min(100, targetLoad.current + spike);
        };

        const unsubscribeMia = appEventBus.on('mia-alert', (alert) => handleActivity({ type: 'mia-alert', data: alert }));
        const unsubscribeTelemetry = appEventBus.on('telemetry', (payload) => handleActivity(payload));

        // Animation Loop
        let animationFrame: number;
        const loop = () => {
            // Decay target load
            targetLoad.current = Math.max(0, targetLoad.current * 0.95);
            
            // Smoothly interpolate current load towards target
            const diff = targetLoad.current - currentLoad.current;
            currentLoad.current += diff * 0.1;
            
            // Add base noise for "aliveness"
            const noise = (Math.random() - 0.5) * 2;
            const displayValue = Math.max(0, Math.min(100, currentLoad.current + noise));

            // Update graph data periodically (every frame is too fast for the array shift, maybe?)
            // Actually for smooth canvas animation we draw every frame, but update the history array less often?
            // Let's just update the visual array state every 100ms or so in a separate interval
            
            drawGraph(displayValue);
            animationFrame = requestAnimationFrame(loop);
        };
        
        loop();

        const dataInterval = setInterval(() => {
             setLoadData(prev => {
                const next = [...prev.slice(1), currentLoad.current];
                return next;
            });
        }, 100);

        return () => {
            unsubscribeMia();
            unsubscribeTelemetry();
            cancelAnimationFrame(animationFrame);
            clearInterval(dataInterval);
        };
    }, []);

    const drawGraph = (currentValue: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        // Draw Grid
        ctx.strokeStyle = 'rgba(55, 65, 81, 0.5)'; // gray-700
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < width; x += 20) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }
        for (let y = 0; y < height; y += 20) {
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();

        // Draw Graph Line
        ctx.strokeStyle = '#22d3ee'; // cyan-400
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#22d3ee';

        ctx.beginPath();
        const step = width / (MAX_DATA_POINTS - 1);
        
        // Use the state data for history, but replace last point with current real-time value for responsiveness
        const dataToDraw = [...loadData];
        dataToDraw[dataToDraw.length - 1] = currentValue;

        dataToDraw.forEach((val, i) => {
            const x = i * step;
            const y = height - (val / 100) * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowBlur = 0;

        // Draw Area under curve
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.1)';
        ctx.fill();
    };

    // Calculate dynamic stats
    const currentLoadValue = Math.round(loadData[loadData.length - 1]);
    const maxLoad = Math.round(Math.max(...loadData));
    const avgLoad = Math.round(loadData.reduce((a, b) => a + b, 0) / loadData.length);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Neural Load Graph Card */}
            <div className="md:col-span-2 bg-gray-900/50 p-4 rounded-lg border border-gray-700/50 relative overflow-hidden flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2 relative z-10">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-cyan-900/30 rounded-lg">
                            <ActivityGraphIcon className="w-5 h-5 text-cyan-400 animate-pulse" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-200">Neural System Load</h3>
                            <p className="text-xs text-cyan-400 font-mono">LIVE TELEMETRY STREAM</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-bold text-white font-mono">{currentLoadValue}%</p>
                        <p className="text-xs text-gray-500">Current Load</p>
                    </div>
                </div>
                
                <div className="relative w-full h-32 bg-gray-900/80 rounded border border-gray-700/50">
                    <canvas 
                        ref={canvasRef} 
                        width={600} 
                        height={128} 
                        className="w-full h-full object-cover"
                    />
                </div>
            </div>

            {/* Quick Stats Column */}
            <div className="flex flex-col gap-4">
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-400">Peak Load</p>
                        <p className="text-xl font-bold text-fuchsia-400">{maxLoad}%</p>
                    </div>
                    <BoltIcon className="w-6 h-6 text-gray-700" />
                </div>
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-400">Avg Activity</p>
                        <p className="text-xl font-bold text-green-400">{avgLoad}%</p>
                    </div>
                    <ActivityGraphIcon className="w-6 h-6 text-gray-700" />
                </div>
                 <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
                    <p className="text-xs text-gray-400 mb-1">System Status</p>
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${currentLoadValue > 80 ? 'bg-red-500 animate-ping' : 'bg-green-500'}`}></span>
                        <span className="text-sm font-semibold text-gray-200">
                            {currentLoadValue > 80 ? 'High Traffic' : 'Operational'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KPIDashboard;
