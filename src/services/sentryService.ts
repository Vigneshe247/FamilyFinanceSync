/* =========================================================
   SENTRY ERROR MONITORING & DIAGNOSTICS SERVICE
   Safely captures exceptions, sets privacy-safe user context,
   and provides manual reporting for key application operations.
   ========================================================= */

import * as Sentry from '@sentry/react';

/**
 * Associate Sentry events with the authenticated internal user ID.
 * Privacy rule: NEVER send bank accounts, balances, or financial data to Sentry.
 */
export function setSentryUser(userId: string | null) {
  if (userId) {
    Sentry.setUser({ id: userId });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Manually report an exception to Sentry with optional operation tags.
 * Use for critical workflows: transactions, family creation, invitations.
 */
export function captureException(error: unknown, context?: { operation?: string; extra?: Record<string, any> }) {
  console.error('[Sentry Error Captured]:', error);

  Sentry.withScope((scope) => {
    if (context?.operation) {
      scope.setTag('operation', context.operation);
    }
    if (context?.extra) {
      // Ensure no sensitive balance/financial info is accidentally passed
      const sanitizedExtra = { ...context.extra };
      delete sanitizedExtra.balance;
      delete sanitizedExtra.password;
      delete sanitizedExtra.token;
      scope.setExtras(sanitizedExtra);
    }
    Sentry.captureException(error);
  });
}

/**
 * Send an informational diagnostic message to Sentry
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  Sentry.captureMessage(message, level);
}

/**
 * Trigger an intentional test error to verify Sentry dashboard integration
 */
export function triggerSentryTestError(): never {
  throw new Error('Sentry test error — FamilyFinanceSync diagnostic verification');
}

/**
 * Trigger a manual captured exception (non-fatal) to verify Sentry event pipeline
 */
export function triggerSentryManualCapture(): string {
  const eventId = Sentry.captureException(
    new Error('Manual diagnostic exception test — FamilyFinanceSync Sentry setup verification'),
    {
      level: 'info',
      tags: {
        diagnostic: 'true',
        environment_test: 'manual_verification',
      },
      extra: {
        purpose: 'Verify Sentry SDK ingestion and client telemetry pipeline without crashing the UI',
        timestamp: new Date().toISOString(),
      },
    }
  );
  return eventId;
}
