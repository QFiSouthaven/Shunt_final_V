
// components/subscription/Subscription.tsx
import React, { useState } from 'react';
import { useSubscription, TIER_DETAILS, TierDetails } from '../../../styles/services/context/SubscriptionContext';
import TabFooter from '../common/TabFooter';
import TierCard from './TierCard';
import UsageMeter from './UsageMeter';
import UpgradeModal from './UpgradeModal';
import { StarIcon } from '../icons';

const SubscriptionContent: React.FC = () => {
    const { tier, usage, tierDetails, upgradeTier } = useSubscription();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleUpgrade = () => {
        // In a real app, you might show different options.
        // For this demo, we'll just open the modal to the 'Pro' tier.
        setIsModalOpen(true);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-grow p-4 md:p-6 overflow-y-auto">
                <div className="max-w-5xl mx-auto space-y-8">
                    <header>
                        <h2 className="text-2xl font-semibold text-white flex items-center gap-3">
                            <StarIcon className="w-7 h-7 text-fuchsia-400" />
                            Subscription & Usage
                        </h2>
                        <p className="text-gray-400 mt-2">Manage your plan and track your usage of AI features.</p>
                    </header>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Current Plan */}
                        <div className="lg:col-span-1">
                            <h3 className="text-lg font-semibold text-gray-200 mb-4">Current Plan</h3>
                            <TierCard tier={tierDetails} isCurrent={true} onSelect={() => {}} />
                        </div>

                        {/* Usage Details */}
                        <div className="lg:col-span-2">
                             <h3 className="text-lg font-semibold text-gray-200 mb-4">Monthly Usage</h3>
                             <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 space-y-6">
                                <UsageMeter 
                                    label="Shunt Runs"
                                    used={usage.shuntRuns}
                                    limit={tierDetails.shuntRuns}
                                />
                                <UsageMeter 
                                    label="Weaver Plans"
                                    used={usage.weaverPlans}
                                    limit={tierDetails.weaverPlans}
                                />
                                <UsageMeter 
                                    label="TRIM Agent Runs"
                                    used={usage.trimAgentRuns}
                                    limit={tierDetails.trimAgentRuns}
                                />
                             </div>
                        </div>
                    </div>
                    
                    {/* Upgrade Options */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-200 mb-4">Upgrade Your Plan</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {(Object.values(TIER_DETAILS) as TierDetails[]).filter(t => t.name !== tier).map(t => (
                                <TierCard key={t.name} tier={t} isCurrent={false} onSelect={handleUpgrade} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <TabFooter />
            <UpgradeModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onUpgrade={(newTier) => {
                    upgradeTier(newTier);
                    setIsModalOpen(false);
                }}
            />
        </div>
    );
};


const Subscription: React.FC = () => (
    <SubscriptionContent />
);

export default Subscription;
