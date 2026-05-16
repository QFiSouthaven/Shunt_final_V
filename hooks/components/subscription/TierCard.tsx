
// components/subscription/TierCard.tsx
import React from 'react';
import { TierDetails } from '../../../styles/services/context/SubscriptionContext';
import { CheckIcon } from '../icons';

interface TierCardProps {
    tier: TierDetails;
    isCurrent: boolean;
    onSelect: (tierName: TierDetails['name']) => void;
}

const TierCard: React.FC<TierCardProps> = ({ tier, isCurrent, onSelect }) => {
    const cardClasses = `
        bg-gray-800/50 border-2 rounded-lg p-6 flex flex-col h-full
        ${isCurrent ? 'border-fuchsia-500' : 'border-gray-700/50'}
    `;

    return (
        <div className={cardClasses}>
            <div className="flex-grow">
                <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                    {isCurrent && <span className="px-3 py-1 text-xs font-semibold rounded-full bg-fuchsia-500/20 text-fuchsia-300">Current Plan</span>}
                </div>
                <p className="text-3xl font-extrabold text-white mt-4">{tier.price}</p>
                <ul className="space-y-3 mt-6 text-gray-300">
                    {tier.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-3">
                            <CheckIcon className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                            <span>{feature}</span>
                        </li>
                    ))}
                </ul>
            </div>
            {!isCurrent && (
                <button
                    onClick={() => onSelect(tier.name)}
                    className="w-full mt-8 px-6 py-3 bg-fuchsia-600 text-white font-semibold rounded-md hover:bg-fuchsia-500 transition-colors"
                >
                    Upgrade to {tier.name}
                </button>
            )}
        </div>
    );
};

export default React.memo(TierCard);
