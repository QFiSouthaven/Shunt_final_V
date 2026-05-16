// types/telemetry.ts
import { TokenUsage } from '../types';

/**
 * Defines the high-level outcome of an interaction from the system's perspective.
 * This provides crucial semantic context for understanding event results.
 */
export type InteractionOutcome = 'success' | 'failure' | 'error' | 'incomplete' | 'timeout' | 'aborted' | 'unknown';

/**
 * Defines explicit or implicit user feedback.
 * Can be a simple sentiment or a more structured object for detailed feedback,
 * offering nuanced insights into user satisfaction and pain points.
 */
export type UserFeedback = 'positive' | 'negative' | 'neutral' | 'thumbs_up' | 'thumbs_down' | {
    type: 'explicit' | 'implicit'; // Differentiates direct input from inferred sentiment
    sentiment?: 'positive' | 'negative' | 'neutral';
    score?: number; // e.g., 1-5 rating for quantitative feedback
    comment?: string; // Open-ended textual feedback
    details?: Record<string, any>; // e.g., 'edited_output', 're_prompted' for specific actions
};

/**
 * Represents granular details about a tool call made by the AI,
 * essential for debugging tool-use agents and understanding AI capabilities.
 */
export interface ToolCallDetails {
    toolName: string; // The specific tool invoked
    toolInput: string | object; // The precise input provided to the tool
    toolOutput: string | object; // The raw output received from the tool
    successful: boolean; // Indicates if the tool call completed without error
    durationMs?: number; // Latency of the tool call
    error?: string; // Error message if the tool call failed
}

/**
 * The core interface for a structured interaction event.
 * This extensible schema is meticulously designed to capture rich, actionable context
 * surrounding every key interaction within the application.
 */
export interface InteractionEvent {
    // Core Identifiers for tracing and correlation
    id: string; // Globally unique identifier (GUID) for this specific event
    timestamp: string; // ISO 8601 formatted timestamp (e.g., '2023-10-27T10:00:00.000Z')

    // User & Session Context: Who did what, when?
    userID: string; // Anonymous or authenticated user ID for user-centric analysis
    sessionID: string; // Links all interactions within a single user journey/session

    // Application & Environmental Context: Where and under what conditions?
    tab: 'Shunt' | 'Weaver' | 'Chat' | 'Orchestrator' | string; // Specific module, feature, or UI context
    activeProjectID?: string; // ID of the currently engaged project for project-specific insights
    activeProjectName?: string; // Name of the active project for human-readable context
    contextDetails?: Record<string, any>; // Generic object for dynamic, additional context (e.g., current workspace state, active file, editor settings)
    appVersion?: string; // Version of the frontend application for release-specific analysis
    browserInfo?: string; // User agent string or parsed browser details for client environment understanding

    // Interaction Specifics: What happened?
    eventType: 'user_input' | 'ai_response' | 'system_action' | 'feedback_given' | string; // High-level categorization of the event
    interactionType?: string; // More granular type (e.g., 'code_generation', 'query_response', 'data_transformation', 'file_save')

    userInput?: string | object; // User's explicit query, command, or input data, can be text or structured
    aiOutput?: string | object; // AI's generated response, plan, code, or transformed content

    outcome?: InteractionOutcome; // High-level result of the interaction, crucial for success/failure metrics
    userFeedback?: UserFeedback; // Explicit or implicit user sentiment, critical for product improvement

    latency?: number; // Time taken for AI response or system action in milliseconds, for performance monitoring
    toolCalls?: ToolCallDetails[]; // Detailed breakdown of tools invoked by the AI
    tokenUsage?: TokenUsage; // Token consumption metrics for LLM-powered features

    // Internal System Context at time of interaction: How was it achieved?
    promptVersion?: string; // Version or ID of the prompt template used, for prompt engineering analysis
    modelUsed?: string; // Specific AI model (e.g., 'gpt-4', 'claude-2', 'gemini-pro')
    availableTools?: string[]; // List of tools available to the AI at interaction time, for tool efficacy analysis
    featureFlags?: Record<string, boolean | string>; // Active feature flags, for A/B testing and conditional behavior tracking

    // Custom data for specific event types, ensuring maximum flexibility
    customData?: Record<string, any>;
}

/**
 * Contextual information that can be passed to the TelemetryService
 * to consistently enrich all recorded events with shared, immutable attributes.
 */
export interface GlobalTelemetryContext {
    userID: string;
    sessionID: string;
    activeProjectID?: string;
    activeProjectName?: string;
    appVersion?: string;
    browserInfo?: string; // Can be derived from user agent for consistent client-side data
    contextDetails?: Record<string, any>;
    tab?: 'Shunt' | 'Weaver' | 'Chat' | 'Orchestrator' | string;
}

/**
 * Defines the type of content being versioned.
 * This helps categorize and display versions appropriately.
 */
export type VersionContentType = 'development_plan' | 'code_snippet' | 'project_context' | 'documentation' | 'chat_export' | 'shunt_interaction' | 'weaver_memory_update' | 'developer_canvas_snapshot';

/**
 * Represents a specific version record in the history.
 * This will be stored persistently.
 */
export interface VersionRecord {
    versionId: string;        // Unique ID for this version
    timestamp: string;        // ISO 8601 when this version was created
    committerId: string;      // userID who created this version (from global context)
    eventType: string;        // E.g., 'plan_generated', 'code_generated', 'user_edited'
    contentType: VersionContentType; // Type of content
    contentRef: string;       // A reference or ID to the actual content being versioned (e.g., 'weaver_plan_output', 'shunt_code_output', 'context_doc_name')
    summary: string;          // Human-readable summary of changes (can be AI-generated)
    diff?: string;            // Optional: The actual diff string against the previous version
    metadata?: Record<string, any>; // Additional context (e.g., associated goal ID, prompt ID)
}