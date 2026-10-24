import { test, expect } from "@playwright/test";
test.use({ actionTimeout: 15000 });
test("instructor permanently deletes a published test quiz and invalidates student links", async ({
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
  const headers = { origin: "http://127.0.0.1:3100" };
  const created = await page.request.post("/api/instructor/quizzes", {
    headers,
    data: {},
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const title = "Disposable browser test quiz";
  expect(
    (
      await page.request.patch(`/api/instructor/quizzes/${id}`, {
        headers,
        data: {
          title,
          lessonLabel: "Sandbox",
          description: "Disposable quiz",
          lessonUrl: null,
          lessonUrls: [],
          deadline: null,
          reviewMode: "INSTRUCTOR_RELEASE",
          leaderboardEnabled: true,
          revision: 0,
          questions: [
            {
              prompt: "Which option comes first?",
              options: ["First", "Second", "Third", "Fourth"],
              correctIndex: 0,
              explanation: "The first option is correct.",
              marks: 1,
              reviewed: true,
            },
          ],
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(`/api/instructor/quizzes/${id}/publish`, {
        headers,
        data: { revision: 1, acknowledged: true },
      })
    ).status(),
  ).toBe(200);
  const quiz = await (
    await page.request.get(`/api/instructor/quizzes/${id}`)
  ).json();
  const student = await browser.newContext();
  expect(
    (
      await student.request.post(
        "http://127.0.0.1:3100/api/auth/sign-in/email",
        {
          headers: { origin: "http://127.0.0.1:3100" },
          data: {
            email: "quiz-student@example.test",
            password: "Synthetic-quiz-student-password-123!",
          },
        },
      )
    ).status(),
  ).toBe(200);
  expect(
    (
      await student.request.get(
        `http://127.0.0.1:3100/api/quizzes/${quiz.shareSlug}`,
      )
    ).status(),
  ).toBe(200);
  await page.goto(`/instructor/quizzes/${id}`);
  await page
    .getByRole("button", { name: "Delete quiz permanently", exact: true })
    .click();
  const confirm = page.getByRole("region", { name: "Confirm quiz action" });
  await expect(
    confirm.getByRole("button", { name: "Confirm delete", exact: true }),
  ).toBeDisabled();
  await confirm.getByLabel("Type the quiz title to confirm").fill(title);
  const removed = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/instructor/quizzes/${id}`) &&
      r.request().method() === "DELETE",
  );
  await confirm
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  expect((await removed).status()).toBe(200);
  await expect(page).toHaveURL(/\/instructor\/quizzes$/);
  expect(
    (
      await student.request.get(
        `http://127.0.0.1:3100/api/quizzes/${quiz.shareSlug}`,
      )
    ).status(),
  ).toBe(404);
  await student.close();
});
