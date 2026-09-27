import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
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
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    // Clear potentially corrupted cached state in localStorage if requested
    try {
      localStorage.removeItem('ffs_members');
      localStorage.removeItem('ffs_active_member_id');
    } catch {}
    window.location.href = '/login';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            background: '#F3F4F6',
            fontFamily: "'Inter', sans-serif",
            color: '#111827',
          }}
        >
          <div
            style={{
              maxWidth: '500px',
              width: '100%',
              background: '#FFFFFF',
              borderRadius: '20px',
              padding: '2.5rem',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.08)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '16px',
                background: '#FEF2F2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
              }}
            >
              <AlertCircle size={32} />
            </div>

            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#111827' }}>
              Something went wrong
            </h2>

            <p style={{ fontSize: '0.9rem', color: '#6B7280', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
              The application encountered an unexpected error while initializing. You can reload or reset the workspace to recover.
            </p>

            {this.state.error && (
              <div
                style={{
                  background: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  color: '#DC2626',
                  textAlign: 'left',
                  maxHeight: '120px',
                  overflowY: 'auto',
                  marginBottom: '1.5rem',
                }}
              >
                {this.state.error.message}
              </div>
            )}

            <button
              onClick={this.handleReset}
              style={{
                width: '100%',
                padding: '0.875rem',
                background: '#059669',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              <RotateCcw size={18} />
              Reset & Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
