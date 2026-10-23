import { test, expect } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
async function mailCode(email: string, type: string) {
  let otp = "";
  await expect
    .poll(
      async () => {
        try {
          const files = await readdir(".local-mail");
          const messages = await Promise.all(
            files.map(async (f) =>
              JSON.parse(await readFile(`.local-mail/${f}`, "utf8")),
            ),
          );
          otp =
            messages.filter((m) => m.email === email && m.type === type).at(-1)
              ?.otp || "";
          return otp.length;
        } catch {
          return 0;
        }
      },
      { timeout: 15000 },
    )
    .toBe(6);
  return otp;
}
test("instructor adds a student; student verifies, signs in, recovers and loses access when suspended", async ({
  browser,
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/sign-in");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("instructor@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-instructor-password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Test." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Students", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Full name", { exact: true }).fill("Browser Student");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("browser@example.test");
  await page.getByRole("button", { name: "Add student", exact: true }).click();
  await expect(
    page.getByText("browser@example.test", { exact: true }),
  ).toBeVisible();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const student = await context.newPage();
  student.on("pageerror", (e) => errors.push(e.message));
  await student.goto("/sign-up");
  await student
    .getByLabel("Full name", { exact: true })
    .fill("Browser Student");
  await student
    .getByLabel("Email address", { exact: true })
    .fill("browser@example.test");
  await student
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-student-password-123!");
  await student
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(student.getByRole("status")).toContainText("verification code");
  const otp = await mailCode("browser@example.test", "email-verification");
  await student
    .getByRole("link", { name: "Continue to email verification" })
    .click();
  await expect(
    student.getByRole("heading", { name: "Verify your email", exact: true }),
  ).toBeVisible();
  await student
    .getByLabel("Email address", { exact: true })
    .fill("browser@example.test");
  await student.getByLabel("Verification code").fill(otp);
  await student
    .getByRole("button", { name: "Verify email", exact: true })
    .click();
  await expect(student.getByRole("status")).toContainText("Email verified");
  await student.getByRole("link", { name: "Back to sign in" }).click();
  await expect(
    student.getByRole("heading", {
      name: "Sign in to your account",
      exact: true,
    }),
  ).toBeVisible();
  await student
    .getByLabel("Email address", { exact: true })
    .fill("browser@example.test");
  await student
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-student-password-123!");
  await student.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    student.getByRole("heading", { name: "Welcome back, Browser." }),
  ).toBeVisible();
  expect(
    await student.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await context.request.get("/api/instructor/students")).status()).toBe(
    403,
  );
  await student.getByRole("link", { name: "My account", exact: true }).click();
  await student.getByLabel("Display name").fill("Updated Browser Student");
  await student.getByRole("button", { name: "Save profile" }).click();
  await expect(student.getByText("Profile saved.")).toBeVisible();
  await student.screenshot({
    path: "test-results/mobile-account.png",
    fullPage: true,
  });
  await student.getByRole("button", { name: "Sign out", exact: true }).click();
  await student.getByRole("link", { name: "Forgot password?" }).click();
  await expect(
    student.getByRole("heading", {
      name: "Forgot your password?",
      exact: true,
    }),
  ).toBeVisible();
  await student
    .getByLabel("Email address", { exact: true })
    .fill("browser@example.test");
  await student.getByRole("button", { name: "Send recovery code" }).click();
  await expect(student.getByRole("status")).toContainText("recovery code");
  const recovery = await mailCode("browser@example.test", "forget-password");
  await student
    .getByRole("link", { name: "I have a code — reset password" })
    .click();
  await expect(
    student.getByRole("heading", { name: "Set a new password", exact: true }),
  ).toBeVisible();
  await student
    .getByLabel("Email address", { exact: true })
    .fill("browser@example.test");
  await student.getByLabel("Verification code").fill(recovery);
  await student
    .getByLabel("New password", { exact: true })
    .fill("Recovered-student-password-456!");
  await student.getByRole("button", { name: "Update password" }).click();
  await expect(student.getByRole("status")).toContainText("Password updated");
  await student.getByRole("link", { name: "Back to sign in" }).click();
  await expect(
    student.getByRole("heading", {
      name: "Sign in to your account",
      exact: true,
    }),
  ).toBeVisible();
  await student
    .getByLabel("Email address", { exact: true })
    .fill("browser@example.test");
  await student
    .getByLabel("Password", { exact: true })
    .fill("Recovered-student-password-456!");
  await student.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    student.getByRole("heading", { name: "Welcome back, Updated." }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("row")
    .filter({ hasText: "browser@example.test" })
    .getByRole("button", { name: "Suspend", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Suspend access", exact: true })
    .click();
  await expect(page.getByText("Suspended", { exact: true })).toBeVisible();
  await student.reload();
  await expect(student).toHaveURL(/sign-in/);
  await page.screenshot({
    path: "test-results/instructor-roster.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await context.close();
});
test("all account pages render at 360px without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const route of [
    "/sign-in",
    "/sign-up",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/sign-in");
  await page.screenshot({
    path: "test-results/mobile-sign-in.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/desktop-sign-in.png",
    fullPage: true,
  });
});
