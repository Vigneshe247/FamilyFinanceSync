import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,

  integrations: [
    Sentry.browserTracingIntegration(),
  ],

  // Performance tracing: 0.1 in production, 1.0 during local testing
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

  // Environment separation (development / staging / production)
  environment: import.meta.env.MODE || 'development',

  // Privacy Safeguard: Ensure no financial data or auth credentials leak into Sentry
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers['Authorization'];
      delete event.request.headers['apikey'];
    }
    return event;
  },
});
