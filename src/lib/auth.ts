import "server-only";
import { createAuth } from "./auth-core";
import { getDb } from "./db";
import { sendOtpMail } from "./mail";
let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  if (!auth) {
    const secret = process.env.BETTER_AUTH_SECRET;
    const url = process.env.BETTER_AUTH_URL;
    if (!secret || secret.length < 32 || !url)
      throw new Error("Authentication is not configured.");
    if (
      process.env.NODE_ENV === "production" &&
      new URL(url).protocol !== "https:"
    )
      throw new Error("Production requires HTTPS.");
    auth = createAuth(getDb(), {
      url,
      secret,
      sendMail: async (message) => {
        // A failed Brevo request must never be reported as a delivered code.
        // No email address or OTP is written to application logs.
        await sendOtpMail(message);
      },
    });
  }
  return auth;
}
