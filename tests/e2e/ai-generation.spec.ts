import { test, expect } from "@playwright/test";

test("AI failure preserves notes and retry produces unreviewed editable drafts", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address", {exact:true}).fill("instructor@example.test");
  await page.getByLabel("Password", {exact:true}).fill("Synthetic-instructor-password-123!");
  await page.getByRole("button", {name:"Sign in",exact:true}).click();
  await expect(page.getByRole("heading", {name:"Welcome back, Test."})).toBeVisible();
  await page.getByRole("link", {name:"Quizzes",exact:true}).click();
  await page.getByRole("button", {name:"Create quiz",exact:true}).click();
  await expect(page.getByRole("heading", {name:"Untitled quiz",exact:true})).toBeVisible();
  await page.getByLabel("Quiz title",{exact:true}).fill("AI browser sandbox");
  await page.getByLabel("Lesson name",{exact:true}).fill("JavaScript");
  const transcript = "JavaScript const declares a binding that cannot be reassigned. JavaScript let declares a binding that can be reassigned. JavaScript var declares a function-scoped variable. The function keyword declares a function.";
  const panel = page.getByRole("region",{name:"AI-assisted question drafts"});
  await panel.getByLabel("Lesson notes or transcript").fill(transcript);
  await panel.getByRole("spinbutton",{name:/Questions/}).fill("1");
  let calls = 0;
  // Browser transport fixture; actual fallback/validation is covered against the service and test DB.
  await page.route("**/api/instructor/quizzes/*/ai-drafts", async route => {
    expect(route.request().postDataJSON()).toMatchObject({transcript,count:1,provider:"auto"});
    calls++;
    if(calls===1) {
      await route.fulfill({status:503,contentType:"text/plain",body:"upstream unavailable"});
      return;
    }
    await route.fulfill({json:{provider:"openrouter",questions:[{
      prompt:"Which JavaScript declaration prevents reassignment?",options:["const","let","var","function"],correctIndex:0,
      explanation:"JavaScript const declares a binding that cannot be reassigned.",
      sourceExcerpt:"JavaScript const declares a binding that cannot be reassigned.",
    }]}});
  });
  const generate = panel.getByRole("button",{name:"Generate draft questions",exact:true});
  await generate.click();
  await expect(panel.getByRole("alert")).toContainText("Your notes are still here");
  await expect(panel.getByLabel("Lesson notes or transcript")).toHaveValue(transcript);
  await generate.click();
  await expect(panel.getByRole("status")).toContainText("1 suggestions generated with openrouter");
  await panel.getByRole("button",{name:"Add 1 to editable quiz"}).click();
  const question = page.getByRole("group",{name:"Question 1",exact:true});
  await expect(question.getByLabel("Question text",{exact:true})).toHaveValue("Which JavaScript declaration prevents reassignment?");
  await expect(question.getByRole("checkbox",{name:/I reviewed this question/})).not.toBeChecked();
  await expect(page.getByRole("button",{name:"Publish quiz",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Save draft",exact:true}).click();
  await expect(page.getByText("Draft saved.",{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("group",{name:"Question 1",exact:true}).getByLabel("Question text",{exact:true}))
    .toHaveValue("Which JavaScript declaration prevents reassignment?");
  expect(calls).toBe(2);
});
