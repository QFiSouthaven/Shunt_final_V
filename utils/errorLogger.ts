
// utils/errorLogger.ts
import { v4 as uuidv4 } from 'uuid';
import { MiaAlert } from '../types';
import { appEventBus } from '../lib/eventBus';

export enum ErrorSeverity {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

/**
 * Creates a user-friendly, actionable error message from a raw API error object.
 * @param error The error object caught from an API call.
 * @returns A string containing a user-friendly message.
 */
export const parseApiError = (error: any): string => {
    let userFriendlyMessage = 'An unexpected error occurred. Please try again or check the developer console for details.';

    if (error && typeof error.toString === 'function') {
        const errorMessage = error.toString().toLowerCase();

        // Specific tensor mismatch error handling
        if (errorMessage.includes('size of tensor a') && errorMessage.includes('match the size of tensor b')) {
            return "Model Tensor Mismatch: The local AI model encountered a shape mismatch (e.g., 1024 vs 1280). This usually indicates incompatible model weights or an issue with the local inference engine configuration.";
        }

        if (errorMessage.includes('quota')) {
            return "You've exceeded your API usage quota for the current period. Please check your usage or upgrade your plan in the 'Subscription' tab.";
        }
        if (errorMessage.includes('429') || errorMessage.includes('resource_exhausted')) {
            return 'API rate limit exceeded. The service is temporarily busy. Please wait a moment before trying again.';
        }
        if (errorMessage.includes('api key')) {
            return 'There appears to be an issue with the API key configuration. Please ensure it is set up correctly.';
        }
        if (errorMessage.includes('400') || errorMessage.includes('invalid')) {
            return 'Invalid request sent to the API. This may be due to malformed input.';
        }
        if (error.message) {
            // Extract the core message from Gemini's formatted error string like "[400 Bad Request] The model ... does not exist."
            const match = error.message.match(/\[\d{3}.*?\]\s*(.*)/);
            if (match) {
                return match[1];
            }
            return error.message;
        }
    }
    return userFriendlyMessage;
}

export const logFrontendError = (
  error: any,
  severity: ErrorSeverity = ErrorSeverity.Medium,
  context?: Record<string, any>
) => {
  let message: string;
  let stack: string | undefined;
  let title: string = "An error occurred";

  if (error instanceof Error) {
    message = error.message;
    stack = error.stack;
    title = error.name;
  } else if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Event && error.type === 'error') {
    message = (error as ErrorEvent).message || 'An unknown error occurred from an Event.';
    title = 'Unhandled Error Event';
  } else {
    title = 'Unknown Error';
    if (typeof error === 'object' && error !== null) {
        if (error.message) {
            message = String(error.message);
        } else {
            try {
                message = JSON.stringify(error);
            } catch {
                message = 'An un-serializable object was thrown.';
            }
        }
        if (error.stack) {
            stack = String(error.stack);
        }
    } else {
        message = 'An unknown value was thrown.';
    }
  }

  const errorContext = {
    ...context,
    stack: stack,
    timestamp: new Date().toISOString(),
  };

  // Log to console for immediate developer feedback.
  // Using multiple arguments is more robust against loggers that stringify objects.
  console.error('[AetherShunt ErrorLogger] - An error was caught:');
  console.error('  Severity:', severity);
  console.error('  Title:', title);
  console.error('  Message:', message);
  console.error('  Context:', errorContext);

  // Map severity to Mia's alert levels
  let miaSeverity: 'info' | 'warning' | 'critical';
  switch (severity) {
    case ErrorSeverity.Critical:
    case ErrorSeverity.High:
      miaSeverity = 'critical';
      break;
    case ErrorSeverity.Medium:
      miaSeverity = 'warning';
      break;
    case ErrorSeverity.Low:
    default:
      miaSeverity = 'info';
      break;
  }

  // Create an alert for Mia to handle, but only for medium severity and above
  if (severity === ErrorSeverity.Medium || severity === ErrorSeverity.High || severity === ErrorSeverity.Critical) {
    const alert: MiaAlert = {
      id: uuidv4(),
      type: 'error_diagnosis',
      severity: miaSeverity,
      title: title,
      message: message,
      timestamp: new Date().toISOString(),
      context: errorContext,
      actions: [{ label: 'Diagnose Error', actionType: 'diagnose' }]
    };
    appEventBus.emit('mia-alert', alert);
  }
};

export const setupGlobalErrorHandlers = () => {
  window.onerror = (message, source, lineno, colno, error) => {
    // Some browsers pass an Error object, others just the message. logFrontendError handles both.
    logFrontendError(error || message, ErrorSeverity.Critical, {
      source,
      lineno,
      colno,
      context: 'window.onerror',
    });
    // Prevent the default browser console error log
    return true;
  };

  window.onunhandledrejection = (event) => {
    logFrontendError(event.reason, ErrorSeverity.High, {
      context: 'window.onunhandledrejection',
    });
  };
};
