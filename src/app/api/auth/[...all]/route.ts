import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { consumeEmailQuota } from "@/lib/throttle";
import { emailSchema } from "@/lib/policy";
import { z } from "zod";
export const runtime = "nodejs";
const postPaths = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/sign-out",
  "/change-password",
  "/email-otp/send-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
]);
export async function GET(request: Request) {
  const path = new URL(request.url).pathname.replace("/api/auth", "");
  if (path !== "/get-session" && path !== "/ok")
    return json({ error: "Not found." }, 404);
  try {
    return await getAuth().handler(request);
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  const path = new URL(request.url).pathname.replace("/api/auth", "");
  if (!postPaths.has(path)) return json({ error: "Not found." }, 404);
  try {
    assertOrigin(request);
    const body = await readJson(request, z.record(z.string(), z.unknown()));
    if (
      path === "/email-otp/send-verification-otp" &&
      body.type !== "email-verification"
    )
      return json({ error: "Not found." }, 404);
    if ("email" in body) {
      const parsed = emailSchema.safeParse(body.email);
      if (!parsed.success)
        return json({ error: "Enter a valid email address." }, 400);
      body.email = parsed.data;
      const category =
        path.includes("verify-email") || path.endsWith("/reset-password")
          ? "code-check"
          : path.includes("sign-in")
            ? "sign-in"
            : "email-send";
      if (
        !(await consumeEmailQuota(
          getDb(),
          parsed.data,
          category,
          process.env.BETTER_AUTH_SECRET!,
          category === "email-send" ? 5 : 10,
        ))
      )
        return json(
          { error: "Too many requests. Try again in 10 minutes." },
          429,
        );
    }
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.delete("content-length");
    const response = await getAuth().handler(
      new Request(request.url, {
        method: "POST",
        headers: forwardedHeaders,
        body: JSON.stringify(body),
      }),
    );
    // Preserve the actual authentication response, including validation failures.
    return response;
  } catch (error) {
    return failure(error);
  }
}
