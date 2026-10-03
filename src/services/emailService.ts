/* =========================================================
   EMAIL SERVICE CLIENT (EmailJS Integration)
   Dispatches transactional and notification emails through
   EmailJS service: "service_55smup6".
   Supports direct browser dispatch via @emailjs/browser,
   HTTP API fallback, and Supabase Edge Function routing.
   ========================================================= */

import emailjs from '@emailjs/browser';
import { supabase } from './supabase';

export interface EmailDeliveryResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface FamilyInvitationEmailParams {
  recipientEmail: string;
  familyName: string;
  inviterName?: string;
  inviteToken: string;
  familyCode: string;
  expiresInDays?: number;
}

export interface JoinRequestEmailParams {
  headEmail: string;
  familyName: string;
  applicantName: string;
  applicantEmail: string;
  familyCode: string;
}

export interface JoinDecisionEmailParams {
  recipientEmail: string;
  familyName: string;
  applicantName?: string;
  decision: 'approved' | 'rejected';
  role?: string;
  reason?: string;
}

const getEnv = (key: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any)?.env) {
      return (import.meta as any).env[key] || '';
    }
  } catch (e) {}
  try {
    if (typeof process !== 'undefined' && process?.env) {
      return process.env[key] || '';
    }
  } catch (e) {}
  return '';
};

/**
 * EmailJS Configuration Settings
 * Defaults service ID to user's registered ID: service_55smup6
 */
export const EMAILJS_CONFIG = {
  SERVICE_ID: getEnv('VITE_EMAILJS_SERVICE_ID') || 'service_55smup6',
  TEMPLATE_ID: getEnv('VITE_EMAILJS_TEMPLATE_ID') || '',
  INVITE_TEMPLATE_ID: getEnv('VITE_EMAILJS_INVITE_TEMPLATE_ID') || getEnv('VITE_EMAILJS_TEMPLATE_ID') || '',
  REQUEST_TEMPLATE_ID: getEnv('VITE_EMAILJS_REQUEST_TEMPLATE_ID') || getEnv('VITE_EMAILJS_TEMPLATE_ID') || '',
  PUBLIC_KEY: getEnv('VITE_EMAILJS_PUBLIC_KEY') || 'HEG3QZD4pEenpmuuV',
  PRIVATE_KEY: getEnv('EMAILJS_PRIVATE_KEY') || 'yjuxNjh82ERnBzobJdI9c',
};

/**
 * Dispatch an email via EmailJS API / SDK
 */
async function dispatchEmailJS(
  serviceId: string,
  templateId: string,
  templateParams: Record<string, unknown>,
  publicKey?: string
): Promise<EmailDeliveryResult> {
  const resolvedKey = publicKey || EMAILJS_CONFIG.PUBLIC_KEY;

  if (!serviceId) {
    return {
      success: false,
      error: 'EmailJS Service ID is missing.',
    };
  }

  // 1. Try SDK dispatch if public key available
  if (resolvedKey && templateId) {
    try {
      const response = await emailjs.send(
        serviceId,
        templateId,
        templateParams,
        { publicKey: resolvedKey }
      );

      if (response.status === 200 || response.text === 'OK') {
        return { success: true, id: `emailjs-${Date.now()}` };
      }
    } catch (sdkErr: any) {
      console.warn('[emailService] EmailJS SDK send error:', sdkErr?.text || sdkErr?.message || sdkErr);
    }
  }

  // 2. Direct HTTP REST API fallback
  if (resolvedKey && templateId) {
    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service_id: serviceId,
          template_id: templateId,
          user_id: resolvedKey,
          template_params: templateParams,
        }),
      });

      if (res.ok) {
        return { success: true, id: `emailjs-http-${Date.now()}` };
      }

      const errText = await res.text();
      console.warn('[emailService] EmailJS REST API response:', res.status, errText);
    } catch (httpErr) {
      console.warn('[emailService] EmailJS REST API network error:', httpErr);
    }
  }

  // 3. Fallback: Try Supabase Edge Function if deployed
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        serviceId,
        templateId,
        templateParams,
      },
    });

    if (!error && data?.success) {
      return { success: true, id: data.id };
    }
  } catch (edgeErr) {
    // Edge function not running or unconfigured
  }

  // If public key or template ID are not yet configured in .env, inform the user clearly
  if (!resolvedKey || !templateId) {
    return {
      success: false,
      error: `EmailJS service "${serviceId}" is connected. Please add VITE_EMAILJS_PUBLIC_KEY and VITE_EMAILJS_TEMPLATE_ID to .env to automate inbox delivery.`,
    };
  }

  return {
    success: false,
    error: 'Failed to deliver email through EmailJS.',
  };
}

/**
 * Send a structured Family Invitation Email via EmailJS.
 */
export async function sendInvitationEmail(
  params: FamilyInvitationEmailParams
): Promise<EmailDeliveryResult> {
  const cleanEmail = params.recipientEmail.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'A valid recipient email address is required.' };
  }

  const origin = typeof window !== 'undefined' && window.location.origin
    ? window.location.origin
    : 'http://localhost:5174';

  const inviteLink = `${origin}/family/invite/${params.inviteToken}`;
  const inviter = params.inviterName?.trim() || 'Family Head';

  const templateParams: Record<string, unknown> = {
    to_email: cleanEmail,
    recipient_email: cleanEmail,
    to_name: params.inviterName ? `Family of ${params.familyName}` : params.familyName,
    family_name: params.familyName.trim(),
    inviter_name: inviter,
    invite_token: params.inviteToken,
    invite_code: params.familyCode,
    family_code: params.familyCode,
    invite_link: inviteLink,
    expires_in_days: params.expiresInDays || 7,
    subject: `Invitation to join ${params.familyName} on FamilyFinanceSync`,
    message: `You have been invited by ${inviter} to join the ${params.familyName} financial workspace on FamilyFinanceSync. Join with invite code "${params.familyCode}" or click: ${inviteLink}`,
  };

  const templateId = EMAILJS_CONFIG.INVITE_TEMPLATE_ID || EMAILJS_CONFIG.TEMPLATE_ID;

  return await dispatchEmailJS(
    EMAILJS_CONFIG.SERVICE_ID,
    templateId,
    templateParams
  );
}

/**
 * Send a Join Request Approval notification email to the Family Head via EmailJS.
 */
export async function sendJoinRequestEmailToFamilyHead(
  params: JoinRequestEmailParams
): Promise<EmailDeliveryResult> {
  const cleanHeadEmail = params.headEmail.trim().toLowerCase();
  if (!cleanHeadEmail || !cleanHeadEmail.includes('@')) {
    return { success: false, error: 'A valid family head email address is required.' };
  }

  const origin = typeof window !== 'undefined' && window.location.origin
    ? window.location.origin
    : 'http://localhost:5174';

  const approvalUrl = `${origin}/requests`;

  const templateParams: Record<string, unknown> = {
    to_email: cleanHeadEmail,
    recipient_email: cleanHeadEmail,
    head_email: cleanHeadEmail,
    family_name: params.familyName.trim(),
    applicant_name: params.applicantName.trim(),
    applicant_email: params.applicantEmail.trim(),
    family_code: params.familyCode,
    approval_link: approvalUrl,
    subject: `[Action Required] New Join Request for ${params.familyName}`,
    message: `${params.applicantName} (${params.applicantEmail}) has requested to join your family workspace "${params.familyName}". Click here to review: ${approvalUrl}`,
  };

  const templateId = EMAILJS_CONFIG.REQUEST_TEMPLATE_ID || EMAILJS_CONFIG.TEMPLATE_ID;

  return await dispatchEmailJS(
    EMAILJS_CONFIG.SERVICE_ID,
    templateId,
    templateParams
  );
}
