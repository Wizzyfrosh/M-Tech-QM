"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { safeReturnTo } from "@/lib/policy";
type Mode =
  "sign-in" | "sign-up" | "verify-email" | "forgot-password" | "reset-password";
export function AuthForm({
  mode,
  returnTo = "/dashboard",
  initialEmail = "",
}: {
  mode: Mode;
  returnTo?: string;
  initialEmail?: string;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);
  const isPassword = ["sign-in", "sign-up", "reset-password"].includes(mode);
  const labels = {
    "sign-in": "Sign in to your account",
    "sign-up": "Create your student account",
    "verify-email": "Verify your email",
    "forgot-password": "Forgot your password?",
    "reset-password": "Set a new password",
  };
  const subtitles = {
    "sign-in": "Your next step starts here. Pick up where you left off.",
    "sign-up": "Create your account, verify your email, then wait for your instructor to approve access.",
    "verify-email":
      "Enter the six-digit code sent to your email. Codes expire after 10 minutes.",
    "forgot-password": "We’ll send a code if this email has an account.",
    "reset-password": "Enter your email, recovery code and a new password.",
  };
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "sign-in") {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (result.error) {
          if (result.error.code === "EMAIL_NOT_VERIFIED")
            setError(
              "Verify your email before signing in. Use the verification link below.",
            );
          else
            setError(
              "Sign-in was unsuccessful. Check your details or contact your instructor.",
            );
        } else window.location.assign(safeReturnTo(returnTo));
      } else if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim(),
        });
        if (result.error)
          setError(
            result.error.status >= 500
              ? "Your registration may have been saved, but we could not send the verification email. Open Verify email below to request a new code."
              : result.error.status === 429
                ? "Too many code requests. Wait 10 minutes, then request a new code."
                : (result.error.message || "Registration failed. Check your details and try again."),
          );
        else {
          router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}&next=${next}`);
          return;
        }
      } else if (mode === "verify-email") {
        const result = await authClient.emailOtp.verifyEmail({
          email: email.trim(),
          otp,
        });
        if (result.error)
          setError(
            "The code is invalid or expired. Request a new code and try again.",
          );
        else {
          // Better Auth can establish the session as part of OTP verification.
          // Use a prefilled sign-in fallback only when no session was issued.
          const session = await authClient.getSession();
          window.location.assign(session.data?.session
            ? safeReturnTo(returnTo)
            : `/sign-in?email=${encodeURIComponent(email.trim().toLowerCase())}&next=${next}`);
          return;
        }
      } else if (mode === "forgot-password") {
        const result = await authClient.emailOtp.requestPasswordReset({
          email: email.trim(),
        });
        if (result.error)
          setError(
            "Unable to request a code right now. Please try again later.",
          );
        else
          setMessage(
            "If an account exists, a recovery code will arrive shortly. Continue to set a new password.",
          );
      } else {
        const result = await authClient.emailOtp.resetPassword({
          email: email.trim(),
          otp,
          password,
        });
        if (result.error)
          setError(
            "Unable to reset your password. Check the code and password requirements.",
          );
        else {
          setPassword("");
          setMessage("Password updated. Sign in with your new password.");
        }
      }
    } catch {
      setError(
        "We couldn’t reach the server. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (busy || resendCooldown > 0) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: "email-verification",
      });
      if (result.error)
        setError(
          result.error.status === 429
            ? "Too many code requests. Wait 10 minutes before requesting another code."
            : "We couldn't send a verification code. Check your email and try again shortly. If the problem persists, contact your instructor.",
        );
      else {
        setResendCooldown(60);
        setOtp("");
        setMessage(
          "Code requested. Check your inbox and Spam or Junk folder. Use the newest code; earlier codes no longer work. If you have not created an account yet, register first.",
        );
      }
    } catch {
      setError("Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  const next = encodeURIComponent(safeReturnTo(returnTo));
  return (
    <div className="auth-form">
      <span className="eyebrow">YOUR LEARNING SPACE</span>
      <h1>{labels[mode]}</h1>
      <p className="muted">{subtitles[mode]}</p>
      {mode === "verify-email" && <p className="notice">
        Check Spam or Junk for an email from M Tech QMS. Codes expire after 10 minutes;
        requesting another code replaces the previous one.
      </p>}
      <form onSubmit={submit} className="form-stack">
        {mode === "sign-up" && (
          <label>
            Full name
            <input
              disabled={!hydrated}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={80}
              placeholder="Your name"
            />
          </label>
        )}
        <label>
          Email address
          <input
            disabled={!hydrated}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
            placeholder="you@example.com"
          />
        </label>
        {["verify-email", "reset-password"].includes(mode) && (
          <label>
            Verification code
            <input
              disabled={!hydrated}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              required
              placeholder="000000"
              className="otp-input"
            />
          </label>
        )}
        {isPassword && (
          <div className="password-field">
            <div className="label-row">
              <label htmlFor="account-password">
                {mode === "reset-password" ? "New password" : "Password"}
              </label>
              {mode === "sign-in" && (
                <Link href="/forgot-password">Forgot password?</Link>
              )}
            </div>
            <span className="password-wrap">
              <input
                disabled={!hydrated}
                id="account-password"
                type={show ? "text" : "password"}
                autoComplete={
                  mode === "sign-in" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "sign-in" ? 1 : 8}
                maxLength={128}
                placeholder={
                  mode === "sign-in"
                    ? "Enter your password"
                    : "At least 8 characters"
                }
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShow(!show)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </div>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="notice success" role="status">
            {message}
          </p>
        )}
        <button className="button primary full" disabled={busy || !hydrated}>
          {busy ? <LoaderCircle size={18} className="spin" /> : null}
          {mode === "sign-in"
            ? "Sign in"
            : mode === "sign-up"
              ? "Create account"
              : mode === "verify-email"
                ? "Verify email"
                : mode === "forgot-password"
                  ? "Send recovery code"
                  : "Update password"}
          {!busy && <ArrowRight size={18} />}
        </button>
      </form>
      <div className="auth-links">
        {mode === "sign-in" && (
          <>
            <p>
              New to the community?{" "}
              <Link href={`/sign-up?next=${next}`}>Create an account</Link>
            </p>
            <Link href={`/verify-email?email=${encodeURIComponent(email)}&next=${next}`}>Verify your email</Link>
            <Link href="/activate-instructor">First instructor? Activate your account</Link>
          </>
        )}
        {mode === "sign-up" && (
          <>
            <Link href={`/verify-email?email=${encodeURIComponent(email)}&next=${next}`}>
              Already registered or didn&apos;t receive a code? Verify email or resend
            </Link>
            <p>
              Already registered?{" "}
              <Link href={`/sign-in?next=${next}`}>Sign in</Link>
            </p>
          </>
        )}
        {mode === "verify-email" && (
          <>
            <button
              type="button"
              className="text-button"
              disabled={busy || !hydrated || !email || resendCooldown > 0}
              onClick={resend}
            >
              {resendCooldown > 0 ? `Request another code in ${resendCooldown}s` : "Send a new code"}
            </button>
            <Link href={`/sign-up?next=${next}`}>No account yet? Register first</Link>
            <Link href={`/sign-in?next=${next}`}>Back to sign in</Link>
          </>
        )}
        {mode === "forgot-password" && (
          <>
            <Link href="/reset-password">I have a code — reset password</Link>
            <Link href="/sign-in">Back to sign in</Link>
          </>
        )}
        {mode === "reset-password" && (
          <>
            <Link href="/sign-in">Back to sign in</Link>
            <Link href="/forgot-password">Request a new recovery code</Link>
          </>
        )}
      </div>
    </div>
  );
}
