/* =========================================================
   RESEND EMAIL SERVICE HELPER & SUPABASE SMTP CONFIGURATION
   Provides Resend integration for reliable email delivery
   (Verification emails, password resets, family invitations).
   ========================================================= */

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

/**
 * Resend SMTP & Supabase Custom SMTP Configuration Guidelines:
 * 
 * Host: smtp.resend.com
 * Port: 465 or 587
 * Username: resend
 * Password: <YOUR_RESEND_API_KEY> (e.g., re_xxxxxxxxx)
 * Sender Email: onboarding@resend.dev (or your verified domain)
 * Sender Name: FamilyFinanceSync
 */
export async function sendEmailViaResendApi(payload: EmailPayload, apiKey?: string): Promise<{ success: boolean; id?: string; error?: string }> {
  const key = apiKey || import.meta.env.VITE_RESEND_API_KEY;
  if (!key) {
    return { success: false, error: 'Resend API key is not configured.' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from: 'FamilyFinanceSync <onboarding@resend.dev>',
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to send email via Resend API.');
    }

    return { success: true, id: data.id };
  } catch (err: any) {
    console.error('Resend email error:', err);
    return { success: false, error: err.message || 'Email delivery failed.' };
  }
}

export interface FamilyInvitationEmailParams {
  recipientEmail: string;
  familyName: string;
  inviterName?: string;
  inviteToken: string;
  familyCode: string;
  expiresInDays?: number;
}

/**
 * Send a structured Family Invitation Email using Resend
 */
export async function sendInvitationEmail(params: FamilyInvitationEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const inviteUrl = `${window.location.origin}/family/invite/${params.inviteToken}`;
  const inviterStr = params.inviterName ? `${params.inviterName} has` : 'You have been';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
          .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { text-align: center; margin-bottom: 24px; }
          .logo { font-size: 24px; font-weight: 700; color: #4f46e5; letter-spacing: -0.5px; }
          .title { font-size: 20px; font-weight: 600; color: #1e293b; margin-top: 12px; }
          .content { font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
          .code-box { background: #f1f5f9; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0; border: 1px dashed #cbd5e1; }
          .code { font-family: monospace; font-size: 22px; font-weight: 700; letter-spacing: 2px; color: #334155; }
          .btn-container { text-align: center; margin: 28px 0; }
          .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none; transition: background-color 0.2s; }
          .footer { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 32px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div class="logo">FamilyFinanceSync</div>
            <div class="title">Join ${params.familyName} on FamilyFinanceSync</div>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>${inviterStr} invited you to join the <strong>${params.familyName}</strong> family workspace on FamilyFinanceSync to manage shared family finances together securely.</p>
            
            <div class="btn-container">
              <a href="${inviteUrl}" class="btn">Accept Family Invitation</a>
            </div>

            <p>Or join directly using your unique family invitation code:</p>
            <div class="code-box">
              <div class="code">${params.familyCode}</div>
            </div>

            <p style="font-size: 13px; color: #64748b;">This invitation link will expire in ${params.expiresInDays || 7} days.</p>
          </div>
          <div class="footer">
            FamilyFinanceSync — Secure Family Finance Management<br/>
            If you did not expect this invitation, you can safely ignore this email.
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmailViaResendApi({
    to: params.recipientEmail,
    subject: `You're invited to join ${params.familyName} on FamilyFinanceSync`,
    html,
  });
}

export interface JoinRequestEmailParams {
  headEmail: string;
  familyName: string;
  applicantName: string;
  applicantEmail: string;
  familyCode: string;
}

/**
 * Send a Join Request Approval notification email to the Family Head using Resend
 */
export async function sendJoinRequestEmailToFamilyHead(params: JoinRequestEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const approvalUrl = `${window.location.origin}/approval-center`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
          .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { text-align: center; margin-bottom: 24px; }
          .logo { font-size: 24px; font-weight: 700; color: #4f46e5; letter-spacing: -0.5px; }
          .title { font-size: 20px; font-weight: 600; color: #1e293b; margin-top: 12px; }
          .content { font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
          .applicant-box { background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0; border: 1px solid #cbd5e1; }
          .btn-container { text-align: center; margin: 28px 0; }
          .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none; }
          .footer { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 32px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div class="logo">FamilyFinanceSync</div>
            <div class="title">🔔 New Family Member Join Request</div>
          </div>
          <div class="content">
            <p>Hello Family Head,</p>
            <p>A new user has requested to join your family workspace <strong>${params.familyName}</strong> using your family code (<code>${params.familyCode}</code>).</p>
            
            <div class="applicant-box">
              <div style="font-weight: 700; font-size: 16px; color: #0f172a;">${params.applicantName}</div>
              <div style="font-size: 14px; color: #64748b;">${params.applicantEmail}</div>
            </div>

            <p>Please review and approve or decline this join request in your Executive Approval Center.</p>

            <div class="btn-container">
              <a href="${approvalUrl}" class="btn">Open Approval Center</a>
            </div>
          </div>
          <div class="footer">
            FamilyFinanceSync — Secure Family Finance Governance
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmailViaResendApi({
    to: params.headEmail,
    subject: `[Action Required] New Join Request from ${params.applicantName} for ${params.familyName}`,
    html,
  });
}


