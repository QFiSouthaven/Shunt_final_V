
// components/subscription/UpgradeModal.tsx
import React, { useState, useEffect } from 'react';
import { SubscriptionTier, TIER_DETAILS } from '../../../styles/services/context/SubscriptionContext';
import { XMarkIcon, SparklesIcon } from '../icons';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpgrade: (newTier: SubscriptionTier) => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, onUpgrade }) => {
    const [isRendered, setIsRendered] = useState(false);
    
    useEffect(() => {
        if (isOpen) {
            setIsRendered(true);
        } else {
            const timer = setTimeout(() => setIsRendered(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const handleUpgrade = (tier: SubscriptionTier) => {
        // In a real app, this would trigger a payment flow.
        onUpgrade(tier);
    };

    if (!isRendered) return null;

    const proTier = TIER_DETAILS['Pro'];

    return (
        <div 
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop ${isOpen ? 'bg-black/70' : 'bg-black/0'}`} 
            aria-modal="true" 
            role="dialog"
        >
            <div className={`modal-content ${isOpen ? 'open' : ''} bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-md flex flex-col`}>
                 <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-200">Upgrade to Pro</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <main className="p-6 text-center">
                    <SparklesIcon className="w-12 h-12 text-fuchsia-400 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white">Unlock Your Full Potential</h3>
                    <p className="text-gray-400 mt-2">
                        Upgrade to the Pro plan for just <span className="font-semibold text-white">{proTier.price}</span> and get access to all premium features.
                    </p>
                    <div className="text-left my-6 p-4 bg-gray-900/50 rounded-md">
                        <ul className="space-y-2 text-gray-300 text-sm">
                            {proTier.features.map((feature, i) => <li key={i}>✓ {feature}</li>)}
                        </ul>
                    </div>
                </main>
                <footer className="p-4 bg-gray-900/30 border-t border-gray-700/50 rounded-b-lg">
                    <button
                        onClick={() => handleUpgrade('Pro')}
                        className="w-full px-6 py-3 bg-fuchsia-600 text-white font-semibold rounded-md hover:bg-fuchsia-500 transition-colors"
                    >
                        Confirm Upgrade
                    </button>
                    <button onClick={onClose} className="w-full mt-2 text-sm text-gray-400 hover:text-white">
                        Maybe Later
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default UpgradeModal;
