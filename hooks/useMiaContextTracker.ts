// hooks/useMiaContextTracker.ts
import { useEffect } from 'react';
import { useTelemetry } from '../styles/services/context/TelemetryContext';
import { appEventBus } from '@/lib/eventBus';

export const useMiaContextTracker = () => {
    const { globalContext } = useTelemetry();

    // Track tab changes from TelemetryContext
    useEffect(() => {
        if(globalContext.tab) {
            appEventBus.emit('telemetry', {
                type: 'tab_change',
                data: {
                    tab: globalContext.tab,
                    timestamp: new Date().toISOString(),
                }
             });
        }
    }, [globalContext.tab]);


    // Track global clicks
    useEffect(() => {
        const handleGlobalClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.tagName === 'BUTTON' || target.tagName === 'A' || target.closest('[data-mia-track-click="true"]')) {
                appEventBus.emit('telemetry', {
                    type: 'user_interaction',
                    data: {
                        type: 'click',
                        element: target.tagName,
                        text: target.textContent?.trim().substring(0, 100),
                        id: target.id,
                        classNames: target.className,
                        url: window.location.href,
                    }
                });
            }
        };

        document.addEventListener('click', handleGlobalClick, true);
        return () => {
            document.removeEventListener('click', handleGlobalClick, true);
        };
    }, []);
};