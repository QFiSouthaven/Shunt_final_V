// context/TelemetryContext.tsx

import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { TelemetryService } from '../telemetry.service';
import { VersionControlService } from '../versionControl.service';
import type { GlobalTelemetryContext } from '@/types/telemetry';

interface TelemetryContextType {
    telemetryService: TelemetryService;
    versionControlService: VersionControlService;
    globalContext: GlobalTelemetryContext;
    updateTelemetryContext: (newContext: Partial<GlobalTelemetryContext>) => void;
}

const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

interface TelemetryProviderProps {
    children: React.ReactNode;
    initialGlobalContext: GlobalTelemetryContext;
}

export const TelemetryProvider: React.FC<TelemetryProviderProps> = ({ children, initialGlobalContext }) => {
    const [currentGlobalContext, setCurrentGlobalContext] = useState<GlobalTelemetryContext>(initialGlobalContext);

    // Lazy-construct services exactly once.
    const [telemetryService] = useState<TelemetryService>(() => new TelemetryService(initialGlobalContext));
    const [versionControlService] = useState<VersionControlService>(() => new VersionControlService(telemetryService));

    // Push global-context updates into the service whenever they change.
    useEffect(() => {
        telemetryService.updateGlobalContext(currentGlobalContext);
    }, [currentGlobalContext, telemetryService]);

    const updateTelemetryContext = useCallback((newContext: Partial<GlobalTelemetryContext>) => {
        setCurrentGlobalContext(prev => ({ ...prev, ...newContext }));
    }, []);

    const contextValue = useMemo(() => ({
        telemetryService,
        versionControlService,
        globalContext: currentGlobalContext,
        updateTelemetryContext,
    }), [telemetryService, versionControlService, currentGlobalContext, updateTelemetryContext]);

    return (
        <TelemetryContext.Provider value={contextValue}>
            {children}
        </TelemetryContext.Provider>
    );
};

export const useTelemetry = (): TelemetryContextType => {
    const context = useContext(TelemetryContext);
    if (context === undefined) {
        throw new Error('useTelemetry must be used within a TelemetryProvider');
    }
    return context;
};
