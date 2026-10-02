import './instrument'; // ← Sentry MUST be first — before React and any app imports

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { reactErrorHandler } from '@sentry/react';
import './index.css';
import App from './App';
import { ErrorBoundary, ErrorFallbackUI } from './components/common/ErrorBoundary';

createRoot(document.getElementById('root')!, {
  // React 19: route all error types through Sentry's error handler
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={({ error, resetError }) => (
      <ErrorFallbackUI error={error as Error} onReset={resetError} />
    )}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
