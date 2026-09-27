/* =========================================================
   EMAIL VERIFICATION SCREEN (Section 3)
   Displays:
   "Verify your email"
   "We sent a verification link to: user@example.com
    Please verify your email before accessing your family financial workspace."
   Buttons:
   [ I've Verified My Email ] -> reloads user; checks user.emailVerified
   [ Resend Verification Email ]
   [ Back to Sign In ]
   ========================================================= */

import React, { useState } from "react";
import { AuthLayout } from "./AuthLayout";
import { useRouter } from "../../router/Router";
import { useAuth } from "../../context/AuthContext";
import { resendVerificationEmail, sendWelcomeEmail, getFirebaseErrorMessage } from "../../services/authService";
import { MailCheck, RefreshCw, Send, ArrowLeft, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";

export const VerifyEmailPage: React.FC = () => {
  const { navigate } = useRouter();
  const { user, userProfile, reloadUser, logout, devSimulateVerify } = useAuth();

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const emailDisplay = user?.email || "your registered email";

  // Check if user has verified their email (Section 3)
  const handleCheckVerified = async () => {
    setChecking(true);
    setStatusMessage(null);

    try {
      const isVerified = await reloadUser();

      if (isVerified) {
        // Step 11: Invoke Supabase Edge Function to send welcome email
        sendWelcomeEmail(userProfile?.firstName).catch(err => {
          console.error("Welcome email invocation notice:", err);
        });

        setStatusMessage({
          type: "success",
          text: "Email verified successfully! Sending welcome email...",
        });
        setTimeout(() => {
          navigate("/dashboard");
        }, 1200);
      } else {
        setStatusMessage({
          type: "error",
          text: "Your email has not been verified yet. Please check your inbox or spam folder.",
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: getFirebaseErrorMessage(err),
      });
    } finally {
      setChecking(false);
    }
  };

  // Resend verification email
  const handleResend = async () => {
    setResending(true);
    setStatusMessage(null);

    try {
      await resendVerificationEmail(user);
      setStatusMessage({
        type: "success",
        text: `Verification link resent to ${emailDisplay}. Please check your inbox.`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: getFirebaseErrorMessage(err),
      });
    } finally {
      setResending(false);
    }
  };

  // Back to sign in
  const handleBackToSignIn = async () => {
    await logout();
    navigate("/login");
  };

  // Local testing simulation
  const handleSimulateVerify = async () => {
    await devSimulateVerify();
    setStatusMessage({
      type: "success",
      text: "Email verified successfully (Testing Mode). Opening workspace...",
    });
    setTimeout(() => {
      navigate("/dashboard");
    }, 1000);
  };

  return (
    <AuthLayout>
      <div style={{ textAlign: "center" }}>
        {/* Verification Icon */}
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: "50%",
            background: "rgba(22, 163, 74, 0.12)",
            color: "#16A34A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.5rem",
            border: "1px solid rgba(22, 163, 74, 0.3)",
          }}
        >
          <MailCheck size={34} />
        </div>

        {/* Title */}
        <h2 style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--text-main)", margin: "0 0 0.5rem" }}>
          Verify your email
        </h2>

        {/* Message */}
        <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.5, margin: "0 0 1.5rem" }}>
          We sent a verification link to:
          <br />
          <strong style={{ color: "var(--text-main)", fontSize: "0.95rem" }}>{emailDisplay}</strong>
          <br />
          <span style={{ fontSize: "0.82rem", color: "#64748B" }}>
            Please check your <strong>Inbox</strong> or <strong>Spam / Junk / Promotions</strong> folder.
          </span>
        </p>

        {/* Status Feedback Notification */}
        {statusMessage && (
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "14px",
              fontSize: "0.82rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1.5rem",
              textAlign: "left",
              background:
                statusMessage.type === "success"
                  ? "rgba(22, 163, 74, 0.1)"
                  : "rgba(235, 87, 87, 0.1)",
              color: statusMessage.type === "success" ? "#16A34A" : "#EB5757",
              border:
                statusMessage.type === "success"
                  ? "1px solid rgba(22, 163, 74, 0.3)"
                  : "1px solid rgba(235, 87, 87, 0.3)",
            }}
          >
            {statusMessage.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Action Buttons (Section 3) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <button
            type="button"
            onClick={handleCheckVerified}
            disabled={checking}
            className="btn btn-primary"
            style={{
              width: "100%",
              justifyContent: "center",
              fontWeight: 700,
              padding: "0.8rem",
              fontSize: "0.92rem",
            }}
          >
            <RefreshCw size={17} className={checking ? "animate-spin" : ""} />
            <span>{checking ? "Checking..." : "I've Verified My Email"}</span>
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="btn btn-secondary"
            style={{ width: "100%", justifyContent: "center", fontWeight: 600, padding: "0.75rem" }}
          >
            <Send size={16} />
            <span>{resending ? "Resending..." : "Resend Verification Email"}</span>
          </button>

          <button
            type="button"
            onClick={handleBackToSignIn}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
              marginTop: "0.5rem",
            }}
          >
            <ArrowLeft size={15} /> Back to Sign In
          </button>
        </div>

        {/* Developer Testing Mode Helper */}
        <div
          style={{
            marginTop: "2rem",
            padding: "0.75rem",
            borderRadius: "12px",
            background: "var(--bg-canvas-subtle)",
            border: "1px dashed var(--border-subtle)",
          }}
        >
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
            Testing / Development Environment Simulation:
          </div>
          <button
            type="button"
            onClick={handleSimulateVerify}
            className="btn btn-sm"
            style={{
              background: "rgba(22, 163, 74, 0.1)",
              color: "#16A34A",
              border: "1px solid #16A34A",
              fontSize: "0.75rem",
              fontWeight: 700,
              width: "100%",
              justifyContent: "center",
            }}
          >
            <ShieldCheck size={14} /> Simulate Email Verified (Testing Mode)
          </button>
        </div>
      </div>
    </AuthLayout>
  );
};
