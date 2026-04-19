'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics/events';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught component error:', error, errorInfo);
    // Report to analytics
    track('api_error_encountered', {
      endpoint: 'client_error_boundary',
      statusCode: 500,
      message: error.message || 'React component crashed',
    });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Module Temporarily Unavailable</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-xs mx-auto">
              This part of your Command Center experienced an unexpected issue. Our team has been notified.
            </p>
          </div>
          <Button 
            variant="outline" 
            className="border-slate-200"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            <RefreshCcw className="w-4 h-4 mr-2" /> Reload Module
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
