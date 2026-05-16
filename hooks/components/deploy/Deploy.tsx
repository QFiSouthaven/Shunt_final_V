
// components/deploy/Deploy.tsx
import React, { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TabFooter from '../common/TabFooter';
import EnvironmentCard from './EnvironmentCard';
import DeploymentHistory from './DeploymentHistory';
import { useSubscription } from '../../../styles/services/context/SubscriptionContext';
import { audioService } from '../../../styles/services/audioService';
import { ServerStackIcon } from '../icons';

type EnvironmentStatus = 'Deployed' | 'Deploying...' | 'Failed' | 'Ready to Deploy';

interface Environment {
    name: 'Development' | 'Staging' | 'Production';
    status: EnvironmentStatus;
    lastDeployed: string;
    version: string;
}

interface HistoryEntry {
    id: string;
    env: string;
    version: string;
    status: 'Success' | 'Pending' | 'Failed';
    timestamp: string;
    user: string;
}

const Deploy: React.FC = () => {
    const { tier, usage, tierDetails, incrementUsage } = useSubscription();

    const [environments, setEnvironments] = useState<Environment[]>([
        { name: 'Development', status: 'Deployed', lastDeployed: new Date(Date.now() - 3600000).toLocaleString(), version: 'v2.0.0-a1b2c3d' },
        { name: 'Staging', status: 'Ready to Deploy', lastDeployed: 'N/A', version: 'N/A' },
        { name: 'Production', status: 'Ready to Deploy', lastDeployed: 'N/A', version: 'N/A' },
    ]);
    const [history, setHistory] = useState<HistoryEntry[]>([
        { id: uuidv4(), env: 'Development', version: 'v2.0.0-a1b2c3d', status: 'Success', timestamp: new Date(Date.now() - 3600000).toLocaleString(), user: 'You' },
    ]);
    const [isDeploying, setIsDeploying] = useState<string | null>(null);
    
    const handleDeploy = useCallback((envName: Environment['name']) => {
        const isTierLocked = tier === 'Free' && (envName === 'Staging' || envName === 'Production');
        const isUsageLocked = tierDetails.deployments !== 'unlimited' && usage.deployments >= tierDetails.deployments;

        if (isDeploying || isTierLocked || isUsageLocked) return;

        setIsDeploying(envName);
        audioService.playSound('send');
        
        const newVersion = `v2.0.0-${Math.random().toString(36).substring(2, 9)}`;
        const newHistoryEntry: HistoryEntry = {
            id: uuidv4(),
            env: envName,
            version: newVersion,
            status: 'Pending',
            timestamp: new Date().toLocaleString(),
            user: 'You',
        };

        setHistory(prev => [newHistoryEntry, ...prev]);
        setEnvironments(prev => prev.map(env => env.name === envName ? { ...env, status: 'Deploying...' } : env));
        incrementUsage('deployments');

        // Simulate deployment
        setTimeout(() => {
            const isSuccess = Math.random() > 0.1; // 90% success rate
            
            if (isSuccess) {
                audioService.playSound('success');
                setEnvironments(prev => prev.map(env => env.name === envName ? { ...env, status: 'Deployed', lastDeployed: new Date().toLocaleString(), version: newVersion } : env));
                setHistory(prev => prev.map(h => h.id === newHistoryEntry.id ? { ...h, status: 'Success' } : h));
            } else {
                audioService.playSound('error');
                setEnvironments(prev => prev.map(env => env.name === envName ? { ...env, status: 'Failed' } : env));
                setHistory(prev => prev.map(h => h.id === newHistoryEntry.id ? { ...h, status: 'Failed' } : h));
            }
            setIsDeploying(null);
        }, 3000 + Math.random() * 2000);

    }, [isDeploying, tier, tierDetails.deployments, usage.deployments, incrementUsage]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex-grow p-4 md:p-6 space-y-8 overflow-y-auto">
                <header>
                    <h2 className="text-2xl font-semibold text-white flex items-center gap-3">
                        <ServerStackIcon className="w-7 h-7 text-fuchsia-400" />
                        Deployment Control Center
                    </h2>
                    <p className="text-gray-400 mt-2">Manage and monitor your application deployments across all environments.</p>
                </header>

                <section>
                    <h3 className="text-lg font-semibold text-gray-200 mb-4">Environments</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {environments.map(env => (
                            <EnvironmentCard
                                key={env.name}
                                environment={env}
                                onDeploy={handleDeploy}
                                isDeploying={!!isDeploying}
                                isTierLocked={tier === 'Free' && (env.name === 'Staging' || env.name === 'Production')}
                                isUsageLocked={tierDetails.deployments !== 'unlimited' && usage.deployments >= tierDetails.deployments}
                            />
                        ))}
                    </div>
                </section>
                
                <section>
                    <DeploymentHistory history={history} />
                </section>
            </div>
            <TabFooter />
        </div>
    );
};

export default Deploy;
