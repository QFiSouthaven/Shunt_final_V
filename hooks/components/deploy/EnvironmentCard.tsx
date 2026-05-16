// components/deploy/EnvironmentCard.tsx
import React from 'react';
import StatusIndicator from '../common/StatusIndicator';
import { ServerIcon } from '../icons';
import Loader from '../Loader';

type EnvironmentStatus = 'Deployed' | 'Deploying...' | 'Failed' | 'Ready to Deploy';

interface Environment {
    name: 'Development' | 'Staging' | 'Production';
    status: EnvironmentStatus;
    lastDeployed: string;
    version: string;
}

interface EnvironmentCardProps {
    environment: Environment;
    onDeploy: (envName: Environment['name']) => void;
    isDeploying: boolean;
    isTierLocked: boolean;
    isUsageLocked: boolean;
}

const getStatusColorClass = (status: EnvironmentStatus) => {
    switch (status) {
        case 'Deployed': return 'border-green-500/50';
        case 'Deploying...': return 'border-cyan-500/50 animate-pulse';
        case 'Failed': return 'border-red-500/50';
        default: return 'border-gray-700/50';
    }
};

const EnvironmentCard: React.FC<EnvironmentCardProps> = ({ environment, onDeploy, isDeploying, isTierLocked, isUsageLocked }) => {
    const { name, status, lastDeployed, version } = environment;
    const isDisabled = isDeploying || (isTierLocked && name !== 'Development') || (isUsageLocked && name !== 'Development');
    
    let tooltipText = '';
    if (isTierLocked && name !== 'Development') {
        tooltipText = 'Upgrade to Pro to deploy to Staging and Production.';
    } else if (isUsageLocked && name !== 'Development') {
        tooltipText = 'You have reached your monthly deployment limit.';
    }

    return (
        <div className={`bg-gray-800/50 rounded-lg border-2 p-5 flex flex-col justify-between shadow-lg ${getStatusColorClass(status)}`}>
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <ServerIcon className="w-6 h-6 text-gray-400" />
                        <h4 className="text-xl font-bold text-white">{name}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                        <StatusIndicator status={status === 'Deployed' ? 'Running' : status === 'Failed' ? 'Error' : 'Pending'} />
                        <span className="text-sm font-medium text-gray-300">{status}</span>
                    </div>
                </div>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-gray-400">Last Deployed:</span>
                        <span className="text-gray-200 font-mono">{lastDeployed}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Version:</span>
                        <span className="text-gray-200 font-mono">{version}</span>
                    </div>
                </div>
            </div>
            <div className="mt-6" title={tooltipText}>
                <button
                    onClick={() => onDeploy(name)}
                    disabled={isDisabled}
                    className="w-full px-4 py-2.5 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-500 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                    {status === 'Deploying...' ? <Loader /> : null}
                    {status === 'Deploying...' ? 'Deploying...' : `Deploy to ${name}`}
                </button>
            </div>
        </div>
    );
};

export default EnvironmentCard;