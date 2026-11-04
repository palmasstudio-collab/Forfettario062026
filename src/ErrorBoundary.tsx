import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    const errorMsg = String(error?.message || error || '');
    // Ignore known browser DOM manipulation errors caused by browser extensions or Google Translate
    if (errorMsg.includes('removeChild') || errorMsg.includes('insertBefore') || errorMsg.includes('Node')) {
      console.warn("Recovered from transient DOM mutation error (e.g. browser extension / translation):", error);
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorMsg = String(error?.message || error || '');
    if (errorMsg.includes('removeChild') || errorMsg.includes('insertBefore') || errorMsg.includes('Node')) {
      console.warn("Caught and suppressed transient removeChild/DOM error:", error, errorInfo);
      this.setState({ hasError: false, error: null });
      return;
    }
    console.error("Uncaught error in UI:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-white border border-red-200 rounded-xl m-4 shadow-lg text-center" style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
          <h1 className="text-xl font-bold mb-4 text-red-900">Si è verificato un errore critico nell'interfaccia.</h1>
          <p className="text-sm font-mono mb-4 text-gray-700 bg-gray-50 p-4 rounded">{String(this.state.error)}</p>
          <button 
            className="px-6 py-3 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition"
            onClick={() => window.location.reload()}
          >
            Ricarica applicazione
          </button>
        </div>
      );
    }
    return (this as any).props.children;
  }
}
