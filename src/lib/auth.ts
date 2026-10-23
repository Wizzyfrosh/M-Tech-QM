import "server-only";
import { createAuth } from "./auth-core";
import { getDb } from "./db";
import { sendOtpMail } from "./mail";
import { recordEmailDelivery } from "./otp-delivery-receipt";
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
        // Better Auth can swallow provider exceptions and still return HTTP 200.
        // Record success/failure for this request without storing PII or OTPs.
        try {
          await sendOtpMail(message);
          recordEmailDelivery(true);
        } catch (error) {
          recordEmailDelivery(false);
          throw error;
        }
      },
    });
  }
  return auth;
}
