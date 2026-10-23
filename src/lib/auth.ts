import "server-only";
import { after } from "next/server";
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
        // Retain serverless lifetime without exposing account existence through provider latency.
        after(async () => {
          try {
            await sendOtpMail(message);
          } catch {
            console.error("QMS_EMAIL_DELIVERY_FAILED");
          }
        });
      },
    });
  }
  return auth;
}
