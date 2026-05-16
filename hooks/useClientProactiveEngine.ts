
// hooks/useClientProactiveEngine.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  UserTelemetryEvent,
  AutonomousDirective,
  generateUniqueId,
  ClientBehavioralRule,
} from '@/types/autonomous';
import { updateClientInferredState, getClientInferredState } from '../styles/services/governanceApi';

// Define some example client-side rules for immediate responses
const CLIENT_BEHAVIORAL_RULES: ClientBehavioralRule[] = [
  {
    id: 'repeated-invalid-input',
    priority: 10,
    trigger: (event, history) => {
      if (event.eventType === 'inputChange' && event.context?.validationStatus === 'invalid') {
        const recentInvalidInputs = history
          .filter(
            (e) =>
              e.eventType === 'inputChange' &&
              e.elementId === event.elementId &&
              e.context?.validationStatus === 'invalid' &&
              Date.now() - new Date(e.timestamp).getTime() < 5000
          )
          .length;
        return recentInvalidInputs >= 2;
      }
      return false;
    },
    action: (event) => {
      return {
        id: generateUniqueId(),
        type: 'SUGGESTION',
        targetElementId: event.elementId,
        payload: {
          message: 'It seems you are having trouble with this field. Would you like contextual help?',
          actionType: 'SHOW_HELP_MODAL',
          helpTopic: event.elementName,
        },
        priority: 5,
        ttl: 10000,
        creationTimestamp: new Date().toISOString(),
        originEventId: event.id,
      };
    },
  },
];

export const useClientProactiveEngine = () => {
  const [localDirectives, setLocalDirectives] = useState<AutonomousDirective[]>([]);
  const eventHistoryRef = useRef<UserTelemetryEvent[]>([]);

  const processLocalEvent = useCallback((event: UserTelemetryEvent) => {
    eventHistoryRef.current.push(event);
    if (eventHistoryRef.current.length > 50) {
      eventHistoryRef.current.shift();
    }

    let triggeredDirective: AutonomousDirective | null = null;
    let highestPriority = Infinity;

    for (const rule of CLIENT_BEHAVIORAL_RULES) {
      if (rule.trigger(event, eventHistoryRef.current)) {
        if (rule.priority < highestPriority) {
          triggeredDirective = rule.action(event);
          highestPriority = rule.priority;
        }
      }
    }

    if (triggeredDirective) {
      setLocalDirectives((prev) => [...prev, triggeredDirective!]);
      if (triggeredDirective!.type === 'SUGGESTION' || triggeredDirective!.type === 'OPTIMIZATION') {
        updateClientInferredState({ intent: 'TROUBLESHOOT', confidence: 0.7 });
      }
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setLocalDirectives((prev) => prev.filter((d) => !d.ttl || (new Date().getTime() - new Date(d.creationTimestamp).getTime()) < d.ttl));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const consumeDirective = useCallback((directiveId: string) => {
    setLocalDirectives((prev) => prev.filter((d) => d.id !== directiveId));
  }, []);

  return {
    localDirectives,
    clientInferredState: getClientInferredState(),
    processLocalEvent,
    consumeDirective,
  };
};
