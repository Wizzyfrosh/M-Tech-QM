import { test, expect } from "@playwright/test";
import { expectAligned } from "./layout-checks";
test.use({ actionTimeout: 15000 });
test("instructor saves, previews, publishes and archives a quiz without leaking its answer key", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
  await page.getByRole("link", { name: "Quizzes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Quizzes", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText("Loading quizzes…", { exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Create quiz", exact: true }).click();
  await expect(page).toHaveURL(/\/instructor\/quizzes\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: "Untitled quiz", exact: true }),
  ).toBeVisible();
  const editorUrl = page.url();
  const id = editorUrl.split("/").at(-1)!;
  await page
    .getByLabel("Quiz title", { exact: true })
    .fill("JavaScript foundations");
  await page
    .getByLabel("Lesson name", { exact: true })
    .fill("Variables and bindings");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Review the lesson before attempting this assessment.");
  await page.getByRole("button", { name: "Add video part", exact: true }).click();
  await page.getByLabel("Video part 1").fill("https://example.com/lesson-video-one");
  await page.getByRole("button", { name: "Add video part", exact: true }).click();
  await page.getByLabel("Video part 2").fill("https://example.com/lesson-video-two");
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  const question = page.getByRole("group", { name: "Question 1", exact: true });
  await question
    .getByLabel("Question text", { exact: true })
    .fill("PRIVATE_PROMPT: Which declaration prevents reassignment?");
  for (const [i, option] of ["const", "let", "var", "None"].entries())
    await question
      .getByLabel(`Option ${String.fromCharCode(65 + i)}`, { exact: true })
      .fill(option);
  await question
    .getByRole("radio", { name: "Mark option A correct", exact: true })
    .check();
  await question
    .getByLabel("Answer explanation", { exact: true })
    .fill(
      "PRIVATE_EXPLANATION: const binds the name without allowing reassignment.",
    );
  await question.getByLabel("Marks", { exact: true }).fill("3");
  await expect(
    page.getByRole("button", { name: "Publish quiz", exact: true }),
  ).toBeDisabled();
  await question
    .getByRole("checkbox", { name: /I reviewed this question/ })
    .check();
  await expect(question).toBeVisible();
  await question
    .getByRole("textbox", { name: "Question text", exact: true })
    .fill(
      "PRIVATE_PROMPT: Which keyword creates a binding that cannot be reassigned?",
    );
  await expect(
    question.getByRole("checkbox", { name: /I reviewed this question/ }),
  ).not.toBeChecked();
  await question
    .getByRole("checkbox", { name: /I reviewed this question/ })
    .check();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expectAligned(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const sidePanels = await page
    .locator(".editor-side > .panel")
    .evaluateAll((panels) =>
      panels.map((panel) => panel.getBoundingClientRect().width),
    );
  expect(Math.max(...sidePanels) - Math.min(...sidePanels)).toBeLessThan(2);
  await page.screenshot({
    path: "test-results/mobile-quiz-editor.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const editorResponse = await page.request.get(`/api/instructor/quizzes/${id}`);
  expect(editorResponse.ok(), await editorResponse.text()).toBe(true);
  const editor = await editorResponse.json();
  expect(editor.shareSlug).toEqual(expect.any(String));
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const student = await context.newPage();
  student.on("pageerror", (error) => errors.push(error.message));
  await student.goto("/sign-in");
  await student
    .getByLabel("Email address", { exact: true })
    .fill("quiz-student@example.test");
  await student
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-quiz-student-password-123!");
  await student.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    student.getByRole("heading", { name: "Welcome back, Quiz." }),
  ).toBeVisible();
  expect(
    (await context.request.get(`/api/quizzes/${editor.shareSlug}`)).status(),
  ).toBe(404);
  expect(
    (await context.request.get(`/api/instructor/quizzes/${id}`)).status(),
  ).toBe(403);
  await page
    .getByRole("link", { name: "Preview saved quiz", exact: true })
    .click();
  await expect(
    page.getByText("INSTRUCTOR PREVIEW", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", {name:"Watch video part 1"})).toHaveAttribute("href","https://example.com/lesson-video-one");
  await expect(page.getByRole("link", {name:"Watch video part 2"})).toHaveAttribute("href","https://example.com/lesson-video-two");
  await expect(
    page.getByText(
      "PRIVATE_EXPLANATION: const binds the name without allowing reassignment.",
      { exact: true },
    ),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Show answer key", exact: true })
    .click();
  await expect(
    page.getByText(
      "PRIVATE_EXPLANATION: const binds the name without allowing reassignment.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to editor", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "JavaScript foundations", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish quiz", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm publish", exact: true })
    .click();
  await expect(
    page.getByText(
      "Quiz published. The questions and answer key are now locked.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Quiz title", { exact: true })).toBeDisabled();
  await student.goto(`/q/${editor.shareSlug}`);
  await expect(student.getByRole("link", {name:"Watch part 1"})).toHaveAttribute("href","https://example.com/lesson-video-one");
  await expect(student.getByRole("link", {name:"Watch part 2"})).toHaveAttribute("href","https://example.com/lesson-video-two");
  await expect(
    student.getByRole("heading", {
      name: "JavaScript foundations",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    student.getByRole("button", { name: "Start or resume quiz" }),
  ).toBeVisible();
  expect(await student.content()).not.toContain("PRIVATE_");
  const metadata = await (
    await context.request.get(`/api/quizzes/${editor.shareSlug}`)
  ).text();
  expect(metadata).not.toContain("correctIndex");
  expect(metadata).not.toContain("PRIVATE_");
  expect(
    await student.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await student.getByRole("button", { name: "Start or resume quiz" }).click();
  await expect(student.getByText("OFFICIAL ASSESSMENT", { exact: true })).toBeVisible();
  await expect(student.getByText(/Which keyword creates a binding/)).toBeVisible();
  await student.locator(".attempt-option input[type=radio]").first().check();
  await expect(student.getByText(/Answers saved/)).toBeVisible();
  // Interrupt a save without taking down authentication or the page itself.
  let connected = false;
  await student.route("**/api/attempts/*/answers", route => connected ? route.continue() : route.abort("internetdisconnected"));
  await student.locator(".attempt-option input[type=radio]").nth(1).check();
  await expect(student.getByRole("alert").filter({ hasText: "Answers not saved" })).toBeVisible();
  await expect(student.locator(".attempt-option input[type=radio]").nth(1)).toBeChecked();
  connected = true;
  await student.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(student.getByText(/Answers saved/)).toBeVisible();
  await student.unroute("**/api/attempts/*/answers");
  // The server commits, but the acknowledgement never reaches the browser.
  await student.route("**/api/attempts/*/answers", async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("connectionreset");
  }, { times: 1 });
  await student.locator(".attempt-option input[type=radio]").first().check();
  await expect(student.getByText(/Answers saved/)).toBeVisible();
  await student.reload();
  await expect(student.getByText(/1 of 1 questions answered/)).toBeVisible();
  student.once("dialog", dialog => dialog.accept());
  await student.getByRole("button", { name: "Submit final answers" }).click();
  await expect(student.getByText("Submission recorded", { exact: true })).toBeVisible();
  await expect(student.getByText("3 / 3", { exact: true })).not.toBeVisible();
  await expect(student.getByText(/Your submission is awaiting instructor review/)).toBeVisible();
  expect(await student.content()).not.toContain("PRIVATE_EXPLANATION");
  await page.getByRole("button", { name: "Close quiz", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm close", exact: true })
    .click();
  await expect(page.getByText("Quiz closed.", { exact: true })).toBeVisible();
  await page.goto(`/instructor/results/${id}`);
  await expect(page.getByRole("heading", { name: "JavaScript foundations" })).toBeVisible();
  await expect(page.getByText("quiz-student@example.test")).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  const releaseResponse = page.waitForResponse(response => response.url().endsWith(`/api/instructor/results/${id}/release`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "Release results", exact: true }).click();
  expect((await releaseResponse).status()).toBe(200);
  await expect(page.getByText("Students can now view their scores and full reviews.")).toBeVisible();
  await student.reload();
  await expect(student.getByText("3 / 3", { exact: true })).toBeVisible();
  const exportResponse = await page.request.get(`/api/instructor/results/${id}/export`);
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()["content-type"]).toContain("text/csv");
  expect(await exportResponse.text()).toContain("quiz-student@example.test");
  const forbiddenExport = await context.request.get(`/api/instructor/results/${id}/export`);
  expect(forbiddenExport.status()).toBe(403);
  // Use a new tab to avoid the previous student's asynchronous post-submit
  // router.replace() racing with the leaderboard navigation.
  const rankingPage = await context.newPage();
  await rankingPage.goto(`/leaderboard/${editor.shareSlug}`, {waitUntil:"domcontentloaded"});
  await expect(rankingPage.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
  expect(await rankingPage.content()).not.toContain("quiz-student@example.test");
  await rankingPage.close();
  await page.goto(`/instructor/quizzes/${id}`);
  await page.getByRole("button", { name: "Archive quiz", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm archive", exact: true })
    .click();
  await expect(page.getByText("Quiz archived.", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Duplicate quiz", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "JavaScript foundations (copy)",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /I reviewed this question/ }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Quizzes", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});
