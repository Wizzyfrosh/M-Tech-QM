import { afterEach, describe, expect, it, vi } from "vitest";
import { sendOtpMail } from "../src/lib/mail";

const message = {
  email: "student@example.test",
  otp: "123456",
  type: "email-verification" as const,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function configure() {
  vi.stubEnv("MAIL_TRANSPORT", "brevo");
  vi.stubEnv("BREVO_API_KEY", "synthetic-brevo-key");
  vi.stubEnv("MAIL_FROM_EMAIL", "no-reply@example.test");
  vi.stubEnv("BETTER_AUTH_URL", "https://mtech-qms-preview.example.test");
}
describe("Brevo verification mail", () => {
  it("accepts Brevo success and formats the six-digit email without leaking the API key", async () => {
    configure();
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.brevo.com/v3/smtp/email");
      expect((init.headers as Record<string,string>)["api-key"]).toBe("synthetic-brevo-key");
      const body = JSON.parse(init.body as string);
      expect(body.to).toEqual([{email:"student@example.test"}]);
      expect(body.sender.email).toBe("no-reply@example.test");
      expect(body.textContent).toContain("123456");
      expect(body.htmlContent).toContain("123456");
      return Response.json({messageId:"test-id"},{status:201});
    });
    vi.stubGlobal("fetch", mock);
    await expect(sendOtpMail(message)).resolves.toBeUndefined();
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("does not claim success if Brevo rejects the sender", async () => {
    configure();
    const logged = vi.spyOn(console,"error").mockImplementation(()=>{});
    vi.stubGlobal("fetch", async()=>Response.json({message:"Sender not authorized"},
      {status:403}));
    await expect(sendOtpMail(message)).rejects.toThrow("Verification email could not be sent.");
    expect(logged).toHaveBeenCalledWith("QMS_BREVO_SEND_REJECTED",403);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("123456");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("student@example.test");
  });
  it("rejects missing configuration without making a provider request",async()=>{
    vi.stubEnv("MAIL_TRANSPORT","brevo");
    vi.stubEnv("BREVO_API_KEY","");
    vi.stubEnv("MAIL_FROM_EMAIL","");
    const mock = vi.fn();
    vi.stubGlobal("fetch",mock);
    await expect(sendOtpMail(message)).rejects.toThrow("Email delivery is not configured.");
    expect(mock).not.toHaveBeenCalled();
  });
});
