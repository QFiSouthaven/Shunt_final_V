import React, { useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { TelemetryProvider } from './styles/services/context/TelemetryContext';
import { SettingsProvider, useSettings } from './styles/services/context/SettingsContext';
import { MCPProvider } from './styles/services/context/MCPContext';
import { MailboxProvider } from './styles/services/context/MailboxContext';
import { MiaProvider } from './styles/services/context/MiaContext'; 
import { SubscriptionProvider } from './styles/services/context/SubscriptionContext';
import { UndoRedoProvider } from './styles/services/context/UndoRedoContext';
import MissionControl from './hooks/components/mission_control/MissionControl';
import { GlobalTelemetryContext } from './types/telemetry';
import MiaAssistant from './hooks/components/mia/MiaAssistant';
import { useMiaContextTracker } from './hooks/useMiaContextTracker';
import ErrorBoundary from './hooks/components/ErrorBoundary';
import StopGenerationButton from './hooks/components/StopGenerationButton';
import { audioService } from './styles/services/audioService';

const App: React.FC = () => {
  // Initialize user and session IDs, persisting them for the session/user
  const initialUserID = localStorage.getItem('userID') || `user_${uuidv4()}`;
  const initialSessionID = sessionStorage.getItem('sessionID') || `session_${uuidv4()}`;

  if (!localStorage.getItem('userID')) {
    localStorage.setItem('userID', initialUserID);
  }
  if (!sessionStorage.getItem('sessionID')) {
    sessionStorage.setItem('sessionID', initialSessionID);
  }

  const initialGlobalContext: GlobalTelemetryContext = {
    userID: initialUserID,
    sessionID: initialSessionID,
    appVersion: '2.0.0-professional', // Updated version
    browserInfo: navigator.userAgent,
  };

  // ─── LOAD-BEARING PROVIDER ORDER ──────────────────────────────────────
  // Settings → Telemetry → MCP → Mailbox → Mia → Subscription → UndoRedo
  // Downstream contexts depend on upstream ones. Reordering will break the
  // app silently. See COWORK_HANDOFF_2026-05-11.md §7.5 #4 and root
  // CLAUDE.md "Provider stack" section. Do NOT change the nesting.
  // ──────────────────────────────────────────────────────────────────────
  return (
    <SettingsProvider>
      <TelemetryProvider initialGlobalContext={initialGlobalContext}>
        <MCPProvider>
          <MailboxProvider>
            <MiaProvider>
              <SubscriptionProvider>
                <UndoRedoProvider>
                  <AppContent />
                </UndoRedoProvider>
              </SubscriptionProvider>
            </MiaProvider>
          </MailboxProvider>
        </MCPProvider>
      </TelemetryProvider>
    </SettingsProvider>
  );
};

// This sub-component ensures context hooks are used within the provider scope
const AppContent: React.FC = () => {
    const { settings } = useSettings();
    useMiaContextTracker(); // Activate Mia's context tracking globally

    useEffect(() => {
        // --- Global Style & Theme Management ---

        // Mia's font color
        document.documentElement.style.setProperty('--mia-font-color', settings.miaFontColor);
        
        // Dynamic background color
        document.body.style.backgroundColor = settings.backgroundColor;

        // Dynamic wallpaper
        document.body.style.backgroundImage = settings.backgroundImage ? `url(${settings.backgroundImage})` : 'none';

        // Toggle animations globally via CSS class
        if (settings.animationsEnabled) {
            document.body.classList.add('animations-enabled');
        } else {
            document.body.classList.remove('animations-enabled');
        }

        // Mute/unmute audio service
        audioService.setMuted(!settings.audioFeedbackEnabled);

    }, [settings]);

    return (
        <div className="app-container w-full">
            {/* FIX: Wrapped <MissionControl> with <ErrorBoundary> to catch errors from this component and provide the required `children` prop. */}
            <ErrorBoundary>
              <MissionControl />
            </ErrorBoundary>
            {/* FIX: Wrapped <MiaAssistant> with <ErrorBoundary> to catch errors from this component and provide the required `children` prop. */}
            <ErrorBoundary>
              <MiaAssistant />
            </ErrorBoundary>
            <ErrorBoundary>
              <StopGenerationButton />
            </ErrorBoundary>
        </div>
    );
}

export default App;