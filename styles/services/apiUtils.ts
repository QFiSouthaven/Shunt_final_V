
// services/apiUtils.ts

export class ApiServiceError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiServiceError';
    // This is necessary for correctly extending built-in classes like Error in some environments
    Object.setPrototypeOf(this, ApiServiceError.prototype);
  }
}

/**
 * A utility function that wraps an API call with a retry mechanism.
 * It retries on rate limits (429), server errors (5xx), and network failures.
 * @param apiCall The async function to call.
 * @param maxRetries Maximum number of retries.
 * @param baseDelay Initial delay in milliseconds.
 * @returns The result of the API call.
 */
export const withRetries = async <T>(apiCall: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> => {
    let delay = baseDelay;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await apiCall();
        } catch (error: any) {
            const status = error.status || error.response?.status;
            const errorMessage = error.toString().toLowerCase();
            
            // Retry on:
            // 1. Rate Limits (429)
            // 2. Server Errors (500-599)
            // 3. Fetch failures (network blips)
            const isRetryable =
                errorMessage.includes('429') ||
                errorMessage.includes('rate limit') ||
                errorMessage.includes('fetch failed') ||
                errorMessage.includes('network error') ||
                (status && status >= 500 && status < 600);

            if (isRetryable && i < maxRetries - 1) {
                console.warn(`API Error (${status || 'Network'}). Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                // Last attempt or not a retryable error, re-throw it
                throw error;
            }
        }
    }
    // This line should be unreachable due to the throw in the catch block on the final iteration
    throw new Error("An unexpected error occurred within the retry logic.");
};

/**
 * A utility to handle API errors in a standardized way.
 * It can process Response objects, ApiServiceError instances, or generic Errors.
 * @param error The error object to handle.
 * @returns A user-friendly error message string.
 */
export const handleApiError = (error: any): string => {
  if (error instanceof Response) {
    switch (error.status) {
      case 401:
        return 'Authentication failed. Please check your credentials.';
      case 429:
        return 'Too Many Requests. Please wait a moment and try again.';
      case 500:
        return 'Internal Server Error. The server encountered a problem.';
      case 503:
        return 'Service Unavailable. The AI provider is currently overloaded.';
      default:
        return `An unexpected network error occurred (Status: ${error.status}).`;
    }
  }

  if (error instanceof ApiServiceError) {
    return error.message;
  }

  if (error instanceof Error) {
    if (error.message.includes('429')) return 'Rate limit exceeded. Please try again in a few seconds.';
    if (error.message.includes('500')) return 'AI provider internal error. Please try again.';
    if (error.message.includes('503')) return 'AI provider overloaded or unavailable. Please try again later.';
    return error.message;
  }
  
  // Fallback for non-Error objects or unknown types
  return 'An unexpected error occurred. Please try again.';
};
