import { test, expect } from "@playwright/test";
test.use({ actionTimeout: 15000 });
test("instructor sees new registrations and can read their notification inbox", async ({
  page,
  browser,
}) => {
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
  const registration = await browser.newContext();
  const response = await registration.request.post(
    "http://127.0.0.1:3100/api/auth/sign-up/email",
    {
      headers: { origin: "http://127.0.0.1:3100" },
      data: {
        name: "Notification Learner",
        email: "notification-learner@example.test",
        password: "Synthetic-notification-password-123!",
      },
    },
  );
  expect(response.status()).toBe(200);
  await registration.close();
  await page.getByRole("link", { name: /^Notifications/ }).click();
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Notification Learner.*created an account/),
  ).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/notifications")).json()).unread,
    )
    .toBe(0);
  await page.reload();
  await expect(
    page.getByText(/Notification Learner.*created an account/),
  ).toBeVisible();
});
