
// services/governanceApi.ts
import { GovernanceResponse, UserTelemetryEvent, ClientInferredState } from '@/types/autonomous';

const GOVERNANCE_API_ENDPOINT = '/api/governance/decisions'; // Assumed backend endpoint

let currentClientInferredState: ClientInferredState = { intent: 'UNKNOWN', confidence: 0 };

/**
 * Sends a batch of telemetry events and optionally a client-side inferred state
 * to the backend governance model, and retrieves directives.
 * @param events The events to send.
 * @param clientState The current client-side inferred state to provide context to the backend.
 * @returns A promise resolving to a GovernanceResponse or null on error.
 */
export const fetchAutonomousDirectives = async (
  events: UserTelemetryEvent[],
  clientState: ClientInferredState = currentClientInferredState
): Promise<GovernanceResponse | null> => {
  if (events.length === 0) {
    return null;
  }

  try {
    const response = await fetch(GOVERNANCE_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events,
        clientState,
      }),
    });

    if (!response.ok) {
      console.error(`Governance API responded with status: ${response.status}`);
      return null;
    }

    const data: GovernanceResponse = await response.json();
    console.log('Received autonomous directives:', data);

    // Update client-side inferred state if provided by the backend
    if (data.clientInferenceUpdate) {
      currentClientInferredState = data.clientInferenceUpdate;
    }

    return data;
  } catch (error) {
    console.error('Error fetching autonomous directives:', error);
    return null;
  }
};

/**
 * Allows the client-side proactive engine to update its own inferred state.
 * This can be sent to the backend in the next `fetchAutonomousDirectives` call.
 */
export const updateClientInferredState = (newState: Partial<ClientInferredState>) => {
  currentClientInferredState = { ...currentClientInferredState, ...newState };
  console.log('Client inferred state updated:', currentClientInferredState);
};

/**
 * Retrieves the current client-side inferred state.
 */
export const getClientInferredState = (): ClientInferredState => {
  return currentClientInferredState;
};
