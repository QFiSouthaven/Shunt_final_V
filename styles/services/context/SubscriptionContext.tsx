// context/SubscriptionContext.tsx
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

export type SubscriptionTier = 'Free' | 'Pro' | 'Enterprise';

export interface TierDetails {
    name: SubscriptionTier;
    price: string;
    shuntRuns: number | 'unlimited';
    weaverPlans: number | 'unlimited';
    trimAgentRuns: number | 'unlimited';
    deployments: number | 'unlimited';
    features: string[];
}

export const TIER_DETAILS: Record<SubscriptionTier, TierDetails> = {
    Free: {
        name: 'Free',
        price: '$0/mo',
        shuntRuns: 50,
        weaverPlans: 5,
        trimAgentRuns: 2,
        deployments: 1,
        features: ['Basic Shunt Actions', 'Limited Weaver Plans', 'Manual TRIM Runs', '1 Deployment/mo', 'Community Support'],
    },
    Pro: {
        name: 'Pro',
        price: '$20/mo',
        shuntRuns: 500,
        weaverPlans: 50,
        trimAgentRuns: 20,
        deployments: 25,
        features: ['All Shunt Actions', 'Full Weaver Capabilities', 'Automated TRIM Agent', '25 Deployments/mo', 'Priority Email Support'],
    },
    Enterprise: {
        name: 'Enterprise',
        price: 'Custom',
        shuntRuns: 'unlimited',
        weaverPlans: 'unlimited',
        trimAgentRuns: 'unlimited',
        deployments: 'unlimited',
        features: ['Unlimited Usage', 'On-premise Deployment', 'Dedicated Support', 'Custom Integrations'],
    },
};

export interface SubscriptionUsage {
    shuntRuns: number;
    weaverPlans: number;
    trimAgentRuns: number;
    deployments: number;
}

interface SubscriptionContextType {
    tier: SubscriptionTier;
    usage: SubscriptionUsage;
    tierDetails: TierDetails;
    incrementUsage: (metric: keyof SubscriptionUsage) => void;
    upgradeTier: (newTier: SubscriptionTier) => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [tier, setTier] = useState<SubscriptionTier>('Free');
    const [usage, setUsage] = useState<SubscriptionUsage>({
        shuntRuns: 12,
        weaverPlans: 2,
        trimAgentRuns: 1,
        deployments: 0,
    });

    const tierDetails = TIER_DETAILS[tier];

    const incrementUsage = useCallback((metric: keyof SubscriptionUsage) => {
        setUsage(prev => ({ ...prev, [metric]: prev[metric] + 1 }));
    }, []);

    const upgradeTier = useCallback((newTier: SubscriptionTier) => {
        // In a real app, this would involve a payment flow
        setTier(newTier);
        // Optionally reset usage on upgrade
        setUsage({
            shuntRuns: 0,
            weaverPlans: 0,
            trimAgentRuns: 0,
            deployments: 0,
        });
    }, []);

    const value = {
        tier,
        usage,
        tierDetails,
        incrementUsage,
        upgradeTier,
    };

    return (
        <SubscriptionContext.Provider value={value}>
            {children}
        </SubscriptionContext.Provider>
    );
};

export const useSubscription = (): SubscriptionContextType => {
    const context = useContext(SubscriptionContext);
    if (!context) {
        throw new Error('useSubscription must be used within a SubscriptionProvider');
    }
    return context;
};