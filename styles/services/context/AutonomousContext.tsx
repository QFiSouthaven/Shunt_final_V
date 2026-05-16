
// context/AutonomousContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AutonomousDirective, UserTelemetryEvent, GovernanceResponse } from '@/types';
import { fetchAutonomousDirectives } from '../governanceApi';
import { useClientProactiveEngine } from '@/hooks/useClientProactiveEngine';
import { trackCustomEvent } from '../telemetry';

interface AutonomousContextType {
  activeDirectives: AutonomousDirective[];
  consumeDirective: (directiveId: string) => void;
  dispatchTelemetryEvent: (event: Omit<UserTelemetryEvent, 'id' | 'timestamp' | 'sessionId' | 'sequenceNumber' | 'pagePath'>) => void;
}

const AutonomousContext = createContext<AutonomousContextType | undefined>(undefined);

interface AutonomousProviderProps {
  children: React.ReactNode;
}

const GOVERNANCE_POLLING_INTERVAL = 5000;

export const AutonomousProvider: React.FC<AutonomousProviderProps> = ({ children }) => {
  const [backendDirectives, setBackendDirectives] = useState<AutonomousDirective[]>([]);
  const {
    localDirectives,
    clientInferredState,
    processLocalEvent,
    consumeDirective: consumeLocalDirective,
  } = useClientProactiveEngine();

  const isFetchingDirectives = useRef(false);

  const dispatchTelemetryEvent = useCallback((eventDetails: Omit<UserTelemetryEvent, 'id' | 'timestamp' | 'sessionId' | 'sequenceNumber' | 'pagePath'>) => {
    // This is a simplified passthrough; the actual enrichment happens in the service
    const fullEvent = trackCustomEvent(eventDetails.eventType, eventDetails);
    
    // The telemetry service automatically adds full context. We pass the full event to the client engine.
    processLocalEvent(fullEvent);
  }, [processLocalEvent]);

  // Backend Communication (Polling) is not implemented in this demo as it requires a backend.
  // A real implementation would use a WebSocket or periodic fetch here.

  const allActiveDirectives = [...backendDirectives, ...localDirectives].sort((a, b) => (a.priority || 99) - (b.priority || 99));

  const consumeGlobalDirective = useCallback(
    (directiveId: string) => {
      setBackendDirectives((prev) => prev.filter((d) => d.id !== directiveId));
      consumeLocalDirective(directiveId);
      console.log(`Directive ${directiveId} consumed.`);
    },
    [consumeLocalDirective]
  );

  useEffect(() => {
    const cleanupExpired = () => {
      setBackendDirectives((prev) =>
        prev.filter((d) => !d.ttl || new Date().getTime() - new Date(d.creationTimestamp).getTime() < d.ttl)
      );
    };
    const interval = setInterval(cleanupExpired, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AutonomousContext.Provider
      value={{
        activeDirectives: allActiveDirectives,
        consumeDirective: consumeGlobalDirective,
        dispatchTelemetryEvent,
      }}
    >
      {children}
    </AutonomousContext.Provider>
  );
};

export const useAutonomous = () => {
  const context = useContext(AutonomousContext);
  if (context === undefined) {
    throw new Error('useAutonomous must be used within an AutonomousProvider');
  }
  return context;
};
