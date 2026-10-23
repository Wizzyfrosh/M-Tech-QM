import { describe, it, expect } from "vitest";
import {
  emailSchema,
  profileSchema,
  mayAccess,
  safeReturnTo,
} from "../src/lib/policy";
describe("access policy", () => {
  it("requires verified ownership and current access", () => {
    expect(mayAccess(null)).toBe(false);
    expect(
      mayAccess({ role: "INSTRUCTOR", emailVerified: false, roster: null }),
    ).toBe(false);
    expect(
      mayAccess({ role: "INSTRUCTOR", emailVerified: true, roster: null }),
    ).toBe(true);
    expect(
      mayAccess({ role: "STUDENT", emailVerified: true, roster: null }),
    ).toBe(false);
    expect(
      mayAccess({
        role: "STUDENT",
        emailVerified: true,
        roster: { status: "SUSPENDED" },
      }),
    ).toBe(false);
    expect(
      mayAccess({
        role: "STUDENT",
        emailVerified: true,
        roster: { status: "ACTIVE" },
      }),
    ).toBe(true);
  });
  it("normalizes case and whitespace without merging distinct email addresses", () => {
    expect(emailSchema.parse(" Student+quiz@Example.COM ")).toBe(
      "student+quiz@example.com",
    );
    expect(emailSchema.parse("first.last@example.com")).not.toBe(
      emailSchema.parse("firstlast@example.com"),
    );
  });
  it("rejects role and email mutation through profile updates", () => {
    expect(
      profileSchema.safeParse({
        name: "Student",
        leaderboardOptOut: false,
        role: "INSTRUCTOR",
      }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({
        name: "Student",
        leaderboardOptOut: false,
        email: "other@example.com",
      }).success,
    ).toBe(false);
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/sign-in",
    "/dashboard\n",
    "javascript:alert(1)",
  ])("rejects unsafe return path %s", (path) =>
    expect(safeReturnTo(path)).toBe("/dashboard"),
  );
  it("preserves a local quiz destination", () =>
    expect(safeReturnTo("/q/lesson-1?from=class")).toBe(
      "/q/lesson-1?from=class",
    ));
});
