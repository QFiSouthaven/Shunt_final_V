
// components/common/TabFooter.tsx

import React from 'react';
import { useTelemetry } from '../../../styles/services/context/TelemetryContext';
import { useSettings } from '../../../styles/services/context/SettingsContext';
import { ShieldCheckIcon } from '../icons';

const TabFooter: React.FC = () => {
    const { globalContext } = useTelemetry();
    const { settings } = useSettings();
    const { appVersion, userID, sessionID } = globalContext;

    if (!appVersion || !userID || !sessionID) {
        return null;
    }
    
    const { inputSanitizationEnabled, promptInjectionGuardEnabled, clientSideRateLimitingEnabled } = settings;
    const allEnabled = inputSanitizationEnabled && promptInjectionGuardEnabled && clientSideRateLimitingEnabled;
    const someEnabled = inputSanitizationEnabled || promptInjectionGuardEnabled || clientSideRateLimitingEnabled;
    
    let shieldColor = 'text-red-500';
    let shieldTitle = 'Exploit protections are disabled. Enable them in Settings.';
    if (allEnabled) {
        shieldColor = 'text-green-500';
        shieldTitle = 'All exploit protections are active.';
    } else if (someEnabled) {
        shieldColor = 'text-yellow-500';
        shieldTitle = 'Some exploit protections are disabled.';
    }

    return (
        <footer className="flex-shrink-0 px-4 py-2 border-t border-gray-700/50 bg-gray-900/20 text-xs text-gray-500">
            <div className="flex justify-between items-center">
                <span className="truncate" title={userID}>
                    UserID: <span className="font-mono">{userID}</span>
                </span>
                <div className="flex items-center gap-4">
                    <span title={shieldTitle}>
                        <ShieldCheckIcon className={`w-4 h-4 ${shieldColor}`} />
                    </span>
                    <span className="truncate hidden md:inline" title={sessionID}>
                        SessionID: <span className="font-mono">{sessionID}</span>
                    </span>
                </div>
                <span title={`Version ${appVersion}`}>
                    v{appVersion}
                </span>
            </div>
        </footer>
    );
};

export default TabFooter;
