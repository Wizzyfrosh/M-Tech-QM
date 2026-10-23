import { Brand } from "@/components/brand";
import { SignOut } from "@/components/sign-out";
export default function AccessDenied() {
  return (
    <main id="main" className="standalone">
      <Brand />
      <h1>Your account needs attention.</h1>
      <p>
        Contact your instructor to confirm your email and restore access to the
        community.
      </p>
      <SignOut />
    </main>
  );
}
