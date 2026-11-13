import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren<Record<string, never>>, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="page-shell page-shell--wide py-20">
          <section className="glass-elevated p-8 rounded-3xl border border-border max-w-3xl mx-auto text-center">
            <h1 className="text-3xl font-semibold text-foreground mb-4">Something went wrong</h1>
            <p className="text-text-secondary mb-6">
              An unexpected error occurred. Refresh the page or try again using the button below.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={this.reset}
            >
              Retry
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
