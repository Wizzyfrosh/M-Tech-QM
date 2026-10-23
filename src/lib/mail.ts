import "server-only";
export type OtpMail = {
  email: string;
  otp: string;
  type: "sign-in" | "email-verification" | "forget-password" | "change-email";
};
export async function sendOtpMail(message: OtpMail) {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.MAIL_TRANSPORT === "file"
  ) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const dir = resolve(process.cwd(), ".local-mail");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(
      resolve(dir, `${crypto.randomUUID()}.json`),
      JSON.stringify(message),
      { mode: 0o600 },
    );
    return;
  }
  if (!process.env.BREVO_API_KEY || !process.env.MAIL_FROM_EMAIL)
    throw new Error("Email delivery is not configured.");
  const logoUrl = new URL("/m-tech-hub-logo.jpg", process.env.BETTER_AUTH_URL)
    .href;
  const purpose =
    message.type === "forget-password"
      ? "Reset your password"
      : "Verify your email";
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: process.env.MAIL_FROM_NAME || "M Tech QMS",
        email: process.env.MAIL_FROM_EMAIL,
      },
      to: [{ email: message.email }],
      subject: `${purpose} · M Tech QMS`,
      textContent: `${purpose}\n\nYour M Tech QMS code is ${message.otp}.\n\nIt expires in 10 minutes. Do not share this code. If you did not request it, you can ignore this email.`,
      htmlContent: `<div style="font-family:Arial,sans-serif;background:#f5f6fa;padding:32px"><div style="max-width:480px;margin:auto;background:white;padding:32px;border-radius:16px"><img src="${logoUrl}" width="240" alt="M Tech Hub" style="display:block;max-width:100%;height:auto;margin-bottom:20px"/><p style="color:#4f46e5;font-weight:700">M TECH QMS</p><h1 style="font-size:24px">${purpose}</h1><p>Enter this code to continue:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700">${message.otp}</p><p>Expires in 10 minutes. Never share this code.</p><p style="color:#6b7280">If you did not request it, you can ignore this email.</p></div></div>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Email delivery failed.");
}
