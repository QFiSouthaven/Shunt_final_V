
// components/ErrorBoundary.tsx
import React, { ErrorInfo, ReactNode } from 'react';
import { logFrontendError, ErrorSeverity } from '@/utils/errorLogger';
import { ArrowPathIcon, ErrorIcon } from './icons';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string; // To identify which part of the app crashed
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: undefined,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // logFrontendError covers console output + Mia alert dispatch via appEventBus.
    logFrontendError(error, ErrorSeverity.Critical, {
        componentStack: errorInfo.componentStack,
        componentName: this.props.componentName || 'Unknown Component'
    });
  }

  handleRetry = () => {
      this.setState({ hasError: false, error: undefined });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
          return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-6 bg-gray-900/80 border border-red-900/50 rounded-lg text-center animate-fade-in">
          <div className="p-3 bg-red-900/20 rounded-full mb-4">
            <ErrorIcon className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-red-400 mb-2">Render Error in {this.props.componentName || 'View'}</h2>
          <p className="text-sm text-gray-400 mb-6 max-w-md">
            The application encountered a critical error while rendering this component. 
            Telemetry has been dispatched to the governance engine.
          </p>
          
          {this.state.error && (
            <details className="w-full max-w-lg mb-6 text-left bg-black/50 p-3 rounded border border-red-900/30">
                <summary className="text-xs text-red-300 cursor-pointer hover:text-red-200">View Error Details</summary>
                <pre className="mt-2 text-[10px] font-mono text-red-300/70 whitespace-pre-wrap overflow-auto max-h-32">
                    {this.state.error.toString()}
                    {this.state.error.stack}
                </pre>
            </details>
          )}

          <button 
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md transition-colors font-medium text-sm shadow-lg shadow-red-900/20"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Attempt Recovery
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
