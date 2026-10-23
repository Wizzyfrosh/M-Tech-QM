"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
export function SignOut() {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className="signout"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(false);
          try {
            const result = await authClient.signOut();
            if (result.error) throw new Error();
            router.replace("/sign-in");
            router.refresh();
          } catch {
            setError(true);
            setBusy(false);
          }
        }}
      >
        <LogOut size={17} />
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <small role="alert">Could not sign out. Try again.</small>}
    </>
  );
}
