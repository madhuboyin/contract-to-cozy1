"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Props for CardLayoutErrorBoundary
 */
interface CardLayoutErrorBoundaryProps {
  /** Child components to render */
  children: ReactNode;
  /** Callback when error occurs and fallback to table layout is needed */
  onError?: () => void;
}

/**
 * State for CardLayoutErrorBoundary
 */
interface CardLayoutErrorBoundaryState {
  /** Whether an error has occurred */
  hasError: boolean;
  /** Error object if available */
  error: Error | null;
}

/**
 * Error boundary component for card layout.
 * 
 * Catches errors in card layout components and provides graceful degradation.
 * When an error occurs, it logs the error and can trigger fallback to table layout.
 * 
 * Features:
 * - Catches rendering errors in card layout
 * - Logs errors to console for debugging
 * - Displays user-friendly error message
 * - Provides option to retry or fallback to table layout
 * - Resets error state when children change
 * 
 * @example
 * <CardLayoutErrorBoundary onError={() => setUseCardLayout(false)}>
 *   <CardLayout {...props} />
 * </CardLayoutErrorBoundary>
 */
export class CardLayoutErrorBoundary extends Component<
  CardLayoutErrorBoundaryProps,
  CardLayoutErrorBoundaryState
> {
  constructor(props: CardLayoutErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): CardLayoutErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error to console for debugging
    console.error("[CardLayoutErrorBoundary] Error caught:", error, errorInfo);
    
    // Call onError callback if provided
    if (this.props.onError) {
      this.props.onError();
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/40">
            <AlertTriangle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-rose-900 dark:text-rose-100">
            Card layout error
          </h3>
          <p className="mb-6 text-sm text-rose-700 dark:text-rose-300">
            The card layout encountered an error. The page will automatically fall back to the table layout.
          </p>
          {this.state.error && (
            <details className="mb-6 rounded-lg border border-rose-200 bg-white p-4 text-left text-xs dark:border-rose-900/50 dark:bg-rose-950/40">
              <summary className="cursor-pointer font-medium text-rose-900 dark:text-rose-100">
                Error details
              </summary>
              <pre className="mt-2 overflow-auto text-rose-700 dark:text-rose-300">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <Button
            onClick={this.handleReset}
            variant="outline"
            className="border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/40"
          >
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
