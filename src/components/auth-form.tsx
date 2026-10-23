"use client";
import Link from "next/link";
import { useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { safeReturnTo } from "@/lib/policy";
type Mode =
  "sign-in" | "sign-up" | "verify-email" | "forgot-password" | "reset-password";
export function AuthForm({
  mode,
  returnTo = "/dashboard",
}: {
  mode: Mode;
  returnTo?: string;
}) {
  const hydrated = useHydrated();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
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
    "sign-up": "Use the email your instructor added to the student roster.",
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
            "Registration could not be completed. Check your details and try again.",
          );
        else
          setMessage(
            "If your email is eligible, a verification code will arrive shortly. Continue to verify your email.",
          );
      } else if (mode === "verify-email") {
        const result = await authClient.emailOtp.verifyEmail({
          email: email.trim(),
          otp,
        });
        if (result.error)
          setError(
            "The code is invalid or expired. Request a new code and try again.",
          );
        else setMessage("Email verified. You can now sign in.");
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
          "Unable to request a code. Check your email and try again later.",
        );
      else
        setMessage(
          "If your account needs verification, a new code will arrive shortly.",
        );
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
                minLength={mode === "sign-in" ? 1 : 12}
                maxLength={128}
                placeholder={
                  mode === "sign-in"
                    ? "Enter your password"
                    : "At least 12 characters"
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
            <Link href={`/verify-email?next=${next}`}>Verify your email</Link>
            <Link href="/activate-instructor">First instructor? Activate your account</Link>
          </>
        )}
        {mode === "sign-up" && (
          <>
            <Link href={`/verify-email?next=${next}`}>
              Continue to email verification
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
              disabled={busy || !hydrated || !email}
              onClick={resend}
            >
              Send a new code
            </button>
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
