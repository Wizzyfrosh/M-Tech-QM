"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, KeyRound, LoaderCircle, Mail } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
export function InstructorActivationForm() {
  const hydrated = useHydrated();
  const [step, setStep] = useState<"email"|"verify"|"complete">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/instructor-activation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to request activation.");
      setMessage("If this email is approved, a six-digit code will arrive. Check your inbox or spam.");
      setStep("verify");
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed."); }
    finally { setBusy(false); }
  }
  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/instructor-activation", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Activation failed.");
      setPassword(""); setCode(""); setStep("complete");
    } catch (err) { setError(err instanceof Error ? err.message : "Activation failed."); }
    finally { setBusy(false); }
  }
  return <div className="auth-form">
    <span className="eyebrow">M TECH QMS · INSTRUCTOR</span>
    <h1>Activate instructor access</h1>
    <p className="muted">A single-use, email-verified setup for the designated instructor. No terminal or database editor required.</p>
    {step === "complete" ? <section className="activation-complete" role="status">
      <CheckCircle2 size={35}/>
      <h2>Instructor account activated</h2>
      <p>Your password is saved securely. Sign in to manage your students and quizzes.</p>
      <Link href="/sign-in" className="button primary full">Go to sign in <ArrowRight size={18}/></Link>
    </section> : <form className="form-stack" onSubmit={step === "email" ? sendCode : redeem}>
      <label>Email address
        <input type="email" autoComplete="email" required maxLength={254}
          disabled={!hydrated || busy || step === "verify"} value={email}
          onChange={e=>setEmail(e.target.value)} placeholder="your@email.com"/>
      </label>
      {step === "verify" && <>
        <label>Six-digit activation code
          <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"
            minLength={6} maxLength={6} required disabled={busy || !hydrated} value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"/>
        </label>
        <label>Create your password
          <input type="password" autoComplete="new-password" required minLength={8} maxLength={128}
            disabled={busy || !hydrated} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"/>
          <small>Use a unique password. You can change it later in Account Settings.</small>
        </label>
      </>}
      {error && <p role="alert" className="notice error">{error}</p>}
      {message && <p role="status" className="notice">{message}</p>}
      <button className="button primary full" disabled={busy || !hydrated}>
        {busy ? <LoaderCircle size={18} className="spin"/> : step === "email" ? <Mail size={18}/> : <KeyRound size={18}/>}
        {step === "email" ? "Send activation code" : "Activate account"} <ArrowRight size={18}/>
      </button>
      {step === "verify" && <button className="text-button" type="button" onClick={()=>{setStep("email");setCode("");setPassword("");setMessage("");setError("");}}>Use a different email or request another code</button>}
    </form>}
    <div className="auth-links"><Link href="/sign-in">Already activated? Sign in</Link></div>
  </div>;
}
