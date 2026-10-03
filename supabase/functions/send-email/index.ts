import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers for secure browser invocation
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Safe HTML character escaper to neutralize XSS in email bodies
function escapeHtml(str: unknown): string {
  if (typeof str !== "string") {
    return str === null || str === undefined ? "" : String(str);
  }
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface SendEmailPayload {
  template: "invitation" | "join_request" | "join_decision";
  recipientEmail: string;
  familyName: string;
  // Optional template-specific fields
  inviterName?: string;
  inviteToken?: string;
  familyCode?: string;
  expiresInDays?: number;
  applicantName?: string;
  applicantEmail?: string;
  decision?: "approved" | "rejected";
  role?: string;
  reason?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify EmailJS configuration
    const emailjsServiceId = Deno.env.get("EMAILJS_SERVICE_ID") || "service_55smup6";
    const emailjsPublicKey = Deno.env.get("EMAILJS_PUBLIC_KEY") || Deno.env.get("EMAILJS_USER_ID") || "HEG3QZD4pEenpmuuV";
    const emailjsPrivateKey = Deno.env.get("EMAILJS_PRIVATE_KEY") || "yjuxNjh82ERnBzobJdI9c";

    // 2. Authenticate the caller using Supabase Auth JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Invalid or expired session" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // 3. Parse and validate input payload
    const body: SendEmailPayload = await req.json();
    const { template, recipientEmail, familyName } = body;

    if (!recipientEmail || typeof recipientEmail !== "string" || !recipientEmail.includes("@")) {
      return new Response(
        JSON.stringify({ success: false, error: "A valid recipientEmail is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!familyName || typeof familyName !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "familyName is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Origin for email links (default to referer/origin or production base)
    const origin = req.headers.get("origin") || req.headers.get("referer") || "https://familyfinancesync.app";
    const cleanOrigin = origin.replace(/\/$/, "");

    let subject = "";
    let htmlContent = "";
    let inviteUrl = "";
    let approvalUrl = "";
    let plainTextMessage = "";

    // 4. Render template with strict HTML escaping
    if (template === "invitation") {
      const safeFamilyName = escapeHtml(familyName);
      const safeInviterName = escapeHtml(body.inviterName || "");
      const safeToken = encodeURIComponent(body.inviteToken || "");
      const safeFamilyCode = escapeHtml(body.familyCode || "");
      const expiresInDays = body.expiresInDays && body.expiresInDays > 0 ? body.expiresInDays : 7;
      inviteUrl = `${cleanOrigin}/family/invite/${safeToken}`;
      const inviterStr = safeInviterName ? `${safeInviterName} has` : "You have been";

      subject = `You're invited to join ${safeFamilyName} on FamilyFinanceSync`;
      plainTextMessage = `You have been invited by ${safeInviterName || "a family member"} to join ${safeFamilyName} on FamilyFinanceSync. Use code ${safeFamilyCode || ""} or visit: ${inviteUrl}`;
      htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
              .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
              .header { text-align: center; margin-bottom: 24px; }
              .logo { font-size: 24px; font-weight: 700; color: #059669; letter-spacing: -0.5px; }
              .title { font-size: 20px; font-weight: 600; color: #1e293b; margin-top: 12px; }
              .content { font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
              .code-box { background: #f1f5f9; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0; border: 1px dashed #cbd5e1; }
              .code { font-family: monospace; font-size: 22px; font-weight: 700; letter-spacing: 2px; color: #334155; }
              .btn-container { text-align: center; margin: 28px 0; }
              .btn { display: inline-block; background-color: #059669; color: #ffffff !important; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none; }
              .footer { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 32px; line-height: 1.5; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div class="logo">FamilyFinanceSync</div>
                <div class="title">Join ${safeFamilyName} on FamilyFinanceSync</div>
              </div>
              <div class="content">
                <p>Hello,</p>
                <p>${inviterStr} invited you to join the <strong>${safeFamilyName}</strong> workspace to manage family finances together securely.</p>
                
                <div class="btn-container">
                  <a href="${inviteUrl}" class="btn">Accept Family Invitation</a>
                </div>

                <p>Or join directly using your unique family invitation code:</p>
                <div class="code-box">
                  <div class="code">${safeFamilyCode}</div>
                </div>

                <p style="font-size: 13px; color: #64748b;">This invitation link will expire in ${expiresInDays} days.</p>
              </div>
              <div class="footer">
                FamilyFinanceSync — Secure Family Finance Management<br/>
                If you did not expect this invitation, you can safely ignore this email.
              </div>
            </div>
          </body>
        </html>
      `;
    } else if (template === "join_request") {
      const safeFamilyName = escapeHtml(familyName);
      const safeApplicantName = escapeHtml(body.applicantName || "A user");
      const safeApplicantEmail = escapeHtml(body.applicantEmail || "");
      const safeFamilyCode = escapeHtml(body.familyCode || "");
      const approvalUrl = `${cleanOrigin}/family/members`;
      plainTextMessage = `${safeApplicantName} (${safeApplicantEmail}) has requested to join your family workspace "${safeFamilyName}". Review: ${approvalUrl}`;

      subject = `[Action Required] New Join Request from ${safeApplicantName} for ${safeFamilyName}`;
      htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
              .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
              .header { text-align: center; margin-bottom: 24px; }
              .logo { font-size: 24px; font-weight: 700; color: #059669; letter-spacing: -0.5px; }
              .title { font-size: 20px; font-weight: 600; color: #1e293b; margin-top: 12px; }
              .content { font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
              .applicant-box { background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0; border: 1px solid #cbd5e1; }
              .btn-container { text-align: center; margin: 28px 0; }
              .btn { display: inline-block; background-color: #059669; color: #ffffff !important; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none; }
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
                <p>A new user has requested to join your workspace <strong>${safeFamilyName}</strong> using your family code (<code>${safeFamilyCode}</code>).</p>
                
                <div class="applicant-box">
                  <div style="font-weight: 700; font-size: 16px; color: #0f172a;">${safeApplicantName}</div>
                  <div style="font-size: 14px; color: #64748b;">${safeApplicantEmail}</div>
                </div>

                <p>Please review and approve or decline this request in your Executive Approval Center.</p>

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
    } else if (template === "join_decision") {
      const safeFamilyName = escapeHtml(familyName);
      const isApproved = body.decision === "approved";
      const safeRole = escapeHtml(body.role || "member");
      const safeReason = escapeHtml(body.reason || "");
      const dashboardUrl = `${cleanOrigin}/dashboard`;
      plainTextMessage = isApproved
        ? `Your request to join ${safeFamilyName} has been approved as ${safeRole}. Open workspace: ${dashboardUrl}`
        : `Your request to join ${safeFamilyName} was not approved.${safeReason ? ` Reason: ${safeReason}` : ""}`;

      if (isApproved) {
        subject = `🎉 Your request to join ${safeFamilyName} has been approved`;
        htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
              .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
              .header { text-align: center; margin-bottom: 24px; }
              .logo { font-size: 24px; font-weight: 700; color: #059669; letter-spacing: -0.5px; }
              .title { font-size: 20px; font-weight: 600; color: #1e293b; margin-top: 12px; }
              .content { font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
              .badge-box { background: #ecfdf5; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0; border: 1px solid #a7f3d0; }
              .role-pill { font-size: 16px; font-weight: 700; color: #059669; text-transform: uppercase; }
              .btn-container { text-align: center; margin: 28px 0; }
              .btn { display: inline-block; background-color: #059669; color: #ffffff !important; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none; }
              .footer { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 32px; line-height: 1.5; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div class="logo">FamilyFinanceSync</div>
                <div class="title">🎉 Welcome to ${safeFamilyName}</div>
              </div>
              <div class="content">
                <p>Hello,</p>
                <p>Your request to join <strong>${safeFamilyName}</strong> has been approved by the Family Head.</p>
                
                <div class="badge-box">
                  <div>Assigned Workspace Role:</div>
                  <div class="role-pill">${safeRole}</div>
                </div>

                <p>You can now access the shared family dashboard and collaborate according to your assigned permissions.</p>

                <div class="btn-container">
                  <a href="${dashboardUrl}" class="btn">Open Family Workspace</a>
                </div>
              </div>
              <div class="footer">
                FamilyFinanceSync — Secure Family Finance Management
              </div>
            </div>
          </body>
        </html>
        `;
      } else {
        subject = `Update on your request to join ${safeFamilyName}`;
        htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
              .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
              .header { text-align: center; margin-bottom: 24px; }
              .logo { font-size: 24px; font-weight: 700; color: #64748b; letter-spacing: -0.5px; }
              .title { font-size: 20px; font-weight: 600; color: #1e293b; margin-top: 12px; }
              .content { font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
              .reason-box { background: #fef2f2; border-radius: 8px; padding: 14px; margin: 16px 0; border: 1px solid #fecaca; color: #991b1b; font-size: 14px; }
              .footer { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 32px; line-height: 1.5; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div class="logo">FamilyFinanceSync</div>
                <div class="title">Join Request Decision</div>
              </div>
              <div class="content">
                <p>Hello,</p>
                <p>Your request to join <strong>${safeFamilyName}</strong> was not approved at this time.</p>
                ${safeReason ? `<div class="reason-box"><strong>Reason:</strong> ${safeReason}</div>` : ""}
                <p>If you believe this was an error, please reach out directly to the Family Head.</p>
              </div>
              <div class="footer">
                FamilyFinanceSync — Secure Family Finance Management
              </div>
            </div>
          </body>
        </html>
        `;
      }
    } else {
      return new Response(
        JSON.stringify({ success: false, error: `Unsupported template: ${template}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // 5. Send email via EmailJS API from the server boundary
    const emailjsTemplateId = Deno.env.get("EMAILJS_TEMPLATE_ID") ||
      (template === "invitation" ? Deno.env.get("EMAILJS_INVITE_TEMPLATE_ID") : Deno.env.get("EMAILJS_REQUEST_TEMPLATE_ID")) ||
      "template_default";

    const emailjsPayload = {
      service_id: emailjsServiceId,
      template_id: emailjsTemplateId,
      user_id: emailjsPublicKey,
      accessToken: emailjsPrivateKey || undefined,
      template_params: {
        to_email: recipientEmail.trim().toLowerCase(),
        recipient_email: recipientEmail.trim().toLowerCase(),
        family_name: familyName,
        inviter_name: inviterName || "Family Head",
        invite_code: familyCode || "",
        family_code: familyCode || "",
        invite_link: inviteUrl,
        expires_in_days: expiresInDays || 7,
        applicant_name: applicantName || "",
        applicant_email: applicantEmail || "",
        approval_link: approvalUrl,
        subject: subject,
        message: plainTextMessage,
        html_content: htmlContent,
      },
    };

    const emailjsResponse = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailjsPayload),
    });

    if (!emailjsResponse.ok) {
      const errText = await emailjsResponse.text();
      console.error("[send-email] EmailJS API error:", emailjsResponse.status, errText);
      return new Response(
        JSON.stringify({
          success: false,
          error: errText || "Failed to dispatch email via EmailJS",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: emailjsResponse.status,
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: `emailjs-${Date.now()}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    console.error("[send-email] Unexpected error:", err);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
