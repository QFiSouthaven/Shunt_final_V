// types/autonomous.ts
import { v4 as uuidv4 } from 'uuid';

/**
 * Represents a user interaction event to be sent to the telemetry system.
 * This is the raw input for the temporally-aware cognitive architecture.
 */
export type UserTelemetryEvent = {
  id: string; // Unique event ID
  timestamp: string; // ISO 8601 format
  eventType: string; // e.g., 'click', 'hover', 'scroll', 'inputChange', 'pageView'
  elementId?: string; // ID of the interacted element
  elementName?: string; // Name/label of the element
  elementType?: string; // e.g., 'button', 'input', 'link', 'div'
  pagePath: string; // Current URL path
  userId?: string; // User identifier
  sessionId: string; // Current session identifier
  duration?: number; // Duration of an interaction (e.g., hover time, focus time)
  value?: string | number | boolean; // Value associated with input fields or selections
  coords?: { x: number; y: number }; // Coordinates of click/hover
  // Additional context for temporal awareness
  sequenceNumber: number; // Order of event within session
  previousEventId?: string; // Link to the preceding event
  context?: Record<string, any>; // Arbitrary context data (e.g., current form state, visible items)
};

/**
 * Represents a directive from the autonomous backend.
 * These drive the dynamic adaptation of the UI.
 */
export type AutonomousDirective = {
  id: string; // Unique directive ID
  type:
    | 'SUGGESTION' // Proactive help, next step suggestion
    | 'UI_RECONFIGURATION' // Change layout, add/remove components, modify props
    | 'PRE_FETCH' // Pre-load data or modules
    | 'CONTEXT_UPDATE' // Update client-side state/context for future interactions
    | 'ALERT' // Display an urgent alert
    | 'OPTIMIZATION'; // Generic optimization (e.g., offer a shortcut)
  targetElementId?: string; // The ID of the UI element this directive applies to
  payload: Record<string, any>; // Arbitrary data for the directive (e.g., new content, component props, URL for pre-fetch)
  priority?: number; // Lower number means higher priority
  ttl?: number; // Time-to-live for the directive in milliseconds
  creationTimestamp: string; // ISO 8601 timestamp for when the directive was created
  originEventId?: string; // The telemetry event that triggered this directive
};

/**
 * Client-side inferred intent or state based on basic heuristics.
 * This is for the lightweight client-side proactive engine.
 */
export type ClientInferredState = {
  intent: 'UNKNOWN' | 'NAVIGATE' | 'SEARCH' | 'COMPLETE_FORM' | 'TROUBLESHOOT';
  confidence: number; // 0-1
  context?: Record<string, any>;
};

/**
 * Type for the autonomous governance model's response.
 */
export type GovernanceResponse = {
  directives: AutonomousDirective[];
  clientInferenceUpdate?: ClientInferredState; // Optionally update client-side inference model
};

/**
 * Defines the structure for a client-side behavioral rule.
 * Part of the 'algorithmic governance model' on the frontend for immediate responses.
 */
export type ClientBehavioralRule = {
  id: string;
  trigger: (event: UserTelemetryEvent, history: UserTelemetryEvent[]) => boolean;
  // FIX: Changed event parameter type from 'any' to 'UserTelemetryEvent' for type safety.
  action: (event: UserTelemetryEvent) => AutonomousDirective | null;
  priority: number;
};

// --- Utils ---

/**
 * Generates a unique ID (UUID v4 style) using the 'uuid' library.
 */
export const generateUniqueId = (): string => {
  return uuidv4();
};
