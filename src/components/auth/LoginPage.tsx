import React, { useState } from "react";
import { AuthLayout } from "./AuthLayout";
import { useRouter } from "../../router/Router";
import { useAuth } from "../../context/AuthContext";
import { useFamilyFinance } from "../../context/FamilyFinanceContext";
import { loginUser, loginWithGoogle, loginWithGitHub, getFirebaseErrorMessage } from "../../services/authService";
import { Eye, EyeOff, AlertCircle, Shield, IndianRupee, ArrowRight, Check, Sparkles, Users, Crown, FileText } from "lucide-react";
import { TermsModal } from "./TermsModal";

export const LoginPage: React.FC = () => {
  const { navigate } = useRouter();
  const { user, isEmailVerified } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isGithubSubmitting, setIsGithubSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [termsTab, setTermsTab] = useState<'terms' | 'privacy'>('terms');

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    if (!email.trim() || !password) {
      setErrorMessage("Please enter your email address and password.");
      setIsSubmitting(false);
      return;
    }

    try {
      const loggedInUser = await loginUser(email, password);
      await loggedInUser.reload();

      if (!loggedInUser.emailVerified) {
        navigate("/verify-email");
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      setErrorMessage(getFirebaseErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage("");
    setIsGoogleSubmitting(true);

    try {
      const res = await loginWithGoogle();
      if (res) {
        navigate("/dashboard");
      }
    } catch (err: any) {
      console.error("Google login failed:", err);
      setErrorMessage(getFirebaseErrorMessage(err));
      setIsGoogleSubmitting(false);
    }
  };

  const handleGitHubLogin = async () => {
    setErrorMessage("");
    setIsGithubSubmitting(true);

    try {
      const res = await loginWithGitHub();
      if (res) {
        navigate("/dashboard");
      }
    } catch (err: any) {
      console.error("GitHub login failed:", err);
      setErrorMessage(getFirebaseErrorMessage(err));
      setIsGithubSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    border: "1px solid #D1D5DB",
    fontSize: "0.95rem",
    color: "#111827",
    background: "#FFFFFF",
    backgroundColor: "#FFFFFF",
    colorScheme: "light",
    outline: "none",
    boxSizing: "border-box",
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
  };

  const labelStyle = {
    display: "block",
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#111827",
    marginBottom: "0.4rem",
  };

  return (
    <AuthLayout>
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        {/* Logo */}
        <div
          style={{
            width: 64,
            height: 64,
            background: "#059669",
            borderRadius: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
            position: "relative",
            boxShadow: "0 4px 14px rgba(5, 150, 105, 0.25)",
          }}
        >
          <Shield size={36} color="white" strokeWidth={2} />
          <IndianRupee size={16} color="white" strokeWidth={3} style={{ position: "absolute", marginTop: "-2px" }} />
        </div>
        
        <h2 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#111827", margin: "0 0 0.5rem" }}>
          Welcome Back
        </h2>
        <p style={{ fontSize: "0.95rem", color: "#6B7280", margin: 0 }}>
          Sign in to access your family financial workspace.
        </p>
      </div>



      {errorMessage && (
        <div
          style={{
            background: "#FEF2F2",
            color: "#DC2626",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            fontSize: "0.85rem",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1.5rem",
            border: "1px solid #FEE2E2",
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleEmailLogin} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        
        {/* Email Address */}
        <div>
          <label style={labelStyle}>Email Address</label>
          <div style={{ position: "relative" }}>
            <input
              type="email"
              style={inputStyle}
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
            <button
              type="button"
              onClick={() => navigate("/forgot-password")}
              style={{
                background: "none",
                border: "none",
                color: "#059669",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Forgot password?
            </button>
          </div>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              style={{ ...inputStyle, paddingRight: "2.5rem" }}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#6B7280",
                padding: 0,
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Remember Me */}
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "#111827", cursor: "pointer", marginTop: "0.25rem", fontWeight: 500 }}>
          <div 
            style={{ 
              width: "18px", 
              height: "18px", 
              borderRadius: "4px", 
              border: rememberMe ? "none" : "1px solid #D1D5DB", 
              background: rememberMe ? "#059669" : "#FFFFFF",
              backgroundColor: rememberMe ? "#059669" : "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer"
            }}
            onClick={() => setRememberMe(!rememberMe)}
          >
            {rememberMe && <Check size={14} color="white" strokeWidth={3} />}
          </div>
          <span>Remember me</span>
        </label>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || isGoogleSubmitting}
          style={{ 
            width: "100%", 
            padding: "0.875rem", 
            background: "#059669", 
            color: "white", 
            border: "none", 
            borderRadius: "8px", 
            fontWeight: 600, 
            fontSize: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            cursor: "pointer",
            marginTop: "0.5rem",
            transition: "background 0.2s"
          }}
        >
          {isSubmitting ? "Signing In..." : "Sign In"} <ArrowRight size={18} />
        </button>
      </form>

      {/* OR Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", margin: "1.75rem 0" }}>
        <div style={{ flex: 1, height: "1px", background: "#E5E7EB" }} />
        <span style={{ fontSize: "0.75rem", color: "#6B7280", fontWeight: 600 }}>OR</span>
        <div style={{ flex: 1, height: "1px", background: "#E5E7EB" }} />
      </div>

      {/* Social Login Buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isSubmitting || isGoogleSubmitting}
          style={{ 
            width: "100%", 
            padding: "0.75rem", 
            background: "white", 
            border: "1px solid #D1D5DB", 
            borderRadius: "8px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            gap: "0.6rem", 
            fontWeight: 600, 
            fontSize: "0.9rem", 
            color: "#374151", 
            cursor: "pointer" 
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Continue with Google
        </button>
        <button
          type="button"
          onClick={handleGitHubLogin}
          disabled={isSubmitting || isGoogleSubmitting || isGithubSubmitting}
          style={{ 
            width: "100%", 
            padding: "0.75rem", 
            background: "white", 
            border: "1px solid #D1D5DB", 
            borderRadius: "8px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            gap: "0.6rem", 
            fontWeight: 600, 
            fontSize: "0.9rem", 
            color: "#374151", 
            cursor: "pointer" 
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          {isGithubSubmitting ? "Redirecting..." : "Continue with GitHub"}
        </button>
      </div>

      {/* Terms & Conditions Agreement Notice */}
      <div style={{ marginTop: "1.5rem", padding: "0.85rem", background: "#F8FAFC", borderRadius: "8px", border: "1px solid #E2E8F0", fontSize: "0.78rem", color: "#64748B", textAlign: "center", lineHeight: 1.5 }}>
        By continuing, you agree to our{" "}
        <button
          type="button"
          onClick={() => { setTermsTab('terms'); setIsTermsOpen(true); }}
          style={{ background: "none", border: "none", color: "#059669", fontWeight: 700, cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: "0.78rem" }}
        >
          Terms & Conditions
        </button>{" "}
        and{" "}
        <button
          type="button"
          onClick={() => { setTermsTab('privacy'); setIsTermsOpen(true); }}
          style={{ background: "none", border: "none", color: "#059669", fontWeight: 700, cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: "0.78rem" }}
        >
          Privacy Policy
        </button>.
      </div>

      {/* Register Link */}
      <div style={{ marginTop: "1.25rem", textAlign: "center", fontSize: "0.95rem", color: "#6B7280" }}>
        Don't have an account?{" "}
        <button
          type="button"
          onClick={() => navigate("/register")}
          style={{ background: "none", border: "none", color: "#059669", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
        >
          Create account
        </button>
      </div>

      {/* Legal & Governance Terms Modal */}
      <TermsModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        defaultTab={termsTab}
      />
    </AuthLayout>
  );
};
