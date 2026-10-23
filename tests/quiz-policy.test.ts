import { describe, it, expect } from "vitest";
import {
  blankQuiz,
  blankQuestion,
  publishIssues,
  quizDraftSchema,
  fromLagosInput,
  lagosInput,
  effectivelyClosed,
} from "../src/lib/quiz-policy";
describe("quiz publishing policy", () => {
  it("allows incomplete drafts but rejects publishing them", () => {
    const draft = blankQuiz();
    draft.questions = [blankQuestion()];
    expect(quizDraftSchema.safeParse(draft).success).toBe(true);
    expect(publishIssues(draft).length).toBeGreaterThan(3);
  });
  it("requires distinct options and explicit review", () => {
    const draft = blankQuiz();
    draft.lessonLabel = "Variables";
    draft.questions = [
      {
        ...blankQuestion(),
        prompt: "What does const mean?",
        options: [
          "Fixed binding",
          "fixed binding ",
          "Global binding",
          "Any binding",
        ],
        correctIndex: 0,
        explanation: "A const binding cannot be reassigned.",
        reviewed: false,
      },
    ];
    const issues = publishIssues(draft);
    expect(issues.some((s) => s.includes("different"))).toBe(true);
    expect(issues.some((s) => s.includes("reviewed"))).toBe(true);
  });
  it.each([
    "javascript:alert(1)",
    "http://example.test/lesson",
    "https://user:password@example.test/lesson",
  ])("rejects unsafe lesson URL %s", (url) =>
    expect(
      quizDraftSchema.safeParse({ ...blankQuiz(), lessonUrl: url }).success,
    ).toBe(false),
  );
  it("keeps Lagos deadlines independent of the browser timezone", () => {
    expect(fromLagosInput("2030-01-15T12:00")).toBe("2030-01-15T11:00:00.000Z");
    expect(lagosInput("2030-01-15T11:00:00.000Z")).toBe("2030-01-15T12:00");
  });
  it("closes at the deadline boundary", () => {
    const now = new Date("2030-01-15T12:00:00Z");
    expect(effectivelyClosed({ status: "PUBLISHED", deadline: now }, now)).toBe(
      true,
    );
    expect(
      effectivelyClosed({ status: "PUBLISHED", deadline: null }, now),
    ).toBe(false);
  });
});
