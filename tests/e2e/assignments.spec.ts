import { test, expect } from "@playwright/test";
import { expectAligned } from "./layout-checks";
test.use({ actionTimeout: 15000 });
test("standalone Flutter assignment submits, requests corrections, grades privately and releases feedback", async ({
  page,
  browser,
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
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Assignments" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Assignments", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create assignment", exact: true })
    .click();
  await expect(page).toHaveURL(/\/instructor\/assignments\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").at(-1)!;
  await page
    .getByLabel("Assignment title", { exact: true })
    .fill("Flutter login screen assignment");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill(
      "Build a responsive login screen using Flutter widgets. Validate email and password fields and demonstrate the result.",
    );
  await page
    .getByLabel("Marking guidelines")
    .fill(
      "Functionality 50, widget use 25, responsiveness 15, code structure 10.",
    );
  await page
    .getByRole("button", { name: "Save assignment", exact: true })
    .click();
  await expect(
    page.getByText("Assignment draft saved.", { exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await expectAligned(page);
  }
  expect(
    await page
      .locator("input[type=checkbox]")
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(24);
  await page.setViewportSize({ width: 1280, height: 900 });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  expect(
    (
      await context.request.post(
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
      await context.request.get(`http://127.0.0.1:3100/api/assignments/${id}`)
    ).status(),
  ).toBe(404);
  await page
    .getByRole("button", { name: "Publish assignment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm publish", exact: true })
    .click();
  await expect(
    page.getByText("Assignment published.", { exact: true }),
  ).toBeVisible();
  const student = await context.newPage();
  student.on("pageerror", (e) => errors.push(e.message));
  await student.goto(`/student/assignments/${id}`);
  await expect(
    student.getByRole("heading", {
      name: "Flutter login screen assignment",
      exact: true,
    }),
  ).toBeVisible();
  await student
    .getByLabel("Explain your work", { exact: true })
    .fill("I created the form and added password visibility.");
  await student
    .getByLabel("GitHub commit link", { exact: true })
    .fill(`https://github.com/synthetic/flutter-form/commit/${"b".repeat(40)}`);
  await student
    .getByLabel(/Evidence links/)
    .fill("https://example.test/recording");
  const pdfBytes = Buffer.from(
    "%PDF-1.4\n% Synthetic assignment evidence\n%%EOF",
  );
  await student
    .getByLabel("Assignment file", { exact: true })
    .setInputFiles({
      name: "flutter-evidence.pdf",
      mimeType: "application/pdf",
      buffer: pdfBytes,
    });
  await expect(
    student.getByRole("button", {
      name: "Remove flutter-evidence.pdf from draft",
    }),
  ).toBeVisible();
  await student
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(
    student.getByText(
      "Draft saved. You still need to submit your assignment.",
      { exact: true },
    ),
  ).toBeVisible();
  const draftWithFile = await (
    await context.request.get(`http://127.0.0.1:3100/api/assignments/${id}`)
  ).json();
  expect(
    (
      await page.request.get(
        `/api/assignment-files/${draftWithFile.submission.files[0].id}`,
      )
    ).status(),
  ).toBe(404);
  await student.reload();
  await expect(
    student.getByLabel("Explain your work", { exact: true }),
  ).toHaveValue("I created the form and added password visibility.");
  await student
    .getByRole("button", { name: "Submit assignment", exact: true })
    .click();
  await student
    .getByRole("button", { name: "Confirm submission", exact: true })
    .click();
  await expect(
    student.getByRole("heading", {
      name: "Awaiting instructor review",
      exact: true,
    }),
  ).toBeVisible();
  const submitted = await (
    await context.request.get(`http://127.0.0.1:3100/api/assignments/${id}`)
  ).json();
  const sid = submitted.submission.id;
  const fileId = submitted.submission.files[0].id;
  const downloaded = await context.request.get(
    `http://127.0.0.1:3100/api/assignment-files/${fileId}`,
  );
  expect(downloaded.status()).toBe(200);
  expect(downloaded.headers()["content-type"]).toBe("application/octet-stream");
  expect(downloaded.headers()["content-disposition"]).toContain("attachment;");
  expect(downloaded.headers()["cache-control"]).toContain("no-store");
  expect(await downloaded.body()).toEqual(pdfBytes);
  expect(
    (await page.request.get(`/api/assignment-files/${fileId}`)).status(),
  ).toBe(200);

  await page.goto(`/instructor/assignments/${id}/submissions/${sid}`);
  await page
    .getByLabel("Feedback", { exact: true })
    .fill("Please add empty-field validation.");
  await page
    .getByRole("button", { name: "Request changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm request changes", exact: true })
    .click();
  await expect(
    page.getByText(
      "Changes requested. The student can read your instructions and submit a new version.",
      { exact: true },
    ),
  ).toBeVisible();
  await student.reload();
  await expect(
    student.getByText("Please add empty-field validation.", { exact: true }),
  ).toBeVisible();
  await student
    .getByLabel("Explain your work", { exact: true })
    .fill("I added validation for both empty fields.");
  await student
    .getByRole("button", { name: "Submit assignment", exact: true })
    .click();
  await student
    .getByRole("button", { name: "Confirm submission", exact: true })
    .click();
  await expect(
    student.getByRole("heading", {
      name: "Awaiting instructor review",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("Marks out of 100", { exact: true }).fill("88");
  await page
    .getByLabel("Feedback", { exact: true })
    .fill(
      "PRIVATE_ASSIGNMENT_FEEDBACK: Strong validation. Extract your reusable widgets.",
    );
  await page
    .getByRole("button", { name: "Save private grade", exact: true })
    .click();
  await expect(page.getByText(/Grade saved privately/)).toBeVisible();
  await student.reload();
  expect(await student.content()).not.toContain("PRIVATE_ASSIGNMENT_FEEDBACK");
  const hidden = await (
    await context.request.get(`http://127.0.0.1:3100/api/assignments/${id}`)
  ).json();
  expect(hidden.submission.grade).toBeNull();
  expect(hidden.submission.feedback).toBe("");
  await page
    .getByRole("link", { name: "Back to assignment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Release graded results (1)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm grade release", exact: true })
    .click();
  await expect(page.getByText(/1 grade\(s\) released/)).toBeVisible();
  await student.reload();
  await expect(student.getByText("88 / 100", { exact: true })).toBeVisible();
  await expect(
    student.getByText(
      "PRIVATE_ASSIGNMENT_FEEDBACK: Strong validation. Extract your reusable widgets.",
      { exact: true },
    ),
  ).toBeVisible();
  const notices = await (
    await context.request.get("http://127.0.0.1:3100/api/notifications")
  ).json();
  expect(
    notices.items.some(
      (n: { title: string }) =>
        n.title === "Your assignment grade is available",
    ),
  ).toBe(true);
  for (const width of [320, 390, 768, 1280]) {
    await student.setViewportSize({ width, height: 900 });
    await expectAligned(student);
    await page.setViewportSize({ width, height: 900 });
    await expectAligned(page);
  }
  await student.setViewportSize({ width: 390, height: 844 });
  await student.screenshot({
    path: "test-results/mobile-assignment-grade.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await context.close();
});
