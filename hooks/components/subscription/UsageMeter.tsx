// components/subscription/UsageMeter.tsx
import React from 'react';

interface UsageMeterProps {
    label: string;
    used: number;
    limit: number | 'unlimited';
}

const UsageMeter: React.FC<UsageMeterProps> = ({ label, used, limit }) => {
    if (limit === 'unlimited') {
        return (
            <div>
                <div className="flex justify-between items-baseline mb-1">
                    <span className="font-medium text-gray-300">{label}</span>
                    <span className="text-sm font-mono text-gray-400">Unlimited</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                    <div className="bg-fuchsia-500 h-2.5 rounded-full" style={{ width: '100%' }}></div>
                </div>
            </div>
        );
    }
    
    const percentage = Math.min((used / limit) * 100, 100);
    
    let barColor = 'bg-cyan-500';
    if (percentage > 90) barColor = 'bg-red-500';
    else if (percentage > 70) barColor = 'bg-yellow-500';

    return (
        <div>
            <div className="flex justify-between items-baseline mb-1">
                <span className="font-medium text-gray-300">{label}</span>
                <span className="text-sm font-mono text-gray-400">{used} / {limit} used</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div className={`${barColor} h-2.5 rounded-full transition-all duration-500`} style={{ width: `${percentage}%` }}></div>
            </div>
        </div>
    );
};

export default React.memo(UsageMeter);