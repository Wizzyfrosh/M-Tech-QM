import { z } from "zod";
export const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Use a complete HTTPS link.");
export const assignmentDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    instructions: z.string().trim().max(20000),
    rubric: z.string().trim().max(5000),
    resources: z.array(httpsUrl).max(5),
    submissionType: z.enum(["TEXT", "PROJECT"]),
    maxMarks: z.number().int().min(1).max(1000),
    deadline: z.iso.datetime().nullable(),
    allowLate: z.boolean(),
  })
  .strict();
export const assignmentSaveSchema = assignmentDraftSchema.extend({
  revision: z.number().int().min(0),
});
export const assignmentActionSchema = z
  .object({
    action: z.enum(["publish", "close", "archive", "release"]),
    revision: z.number().int().min(0),
    acknowledged: z.literal(true),
  })
  .strict();
export const submissionSchema = z
  .object({
    action: z.enum(["save", "submit", "edit"]),
    revision: z.number().int().min(0),
    responseText: z.string().trim().max(20000),
    projectUrl: z.union([z.literal(""), httpsUrl]),
    evidenceUrls: z.array(httpsUrl).max(5),
  })
  .strict();
export const assignmentReviewSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("grade"),
      revision: z.number().int().min(0),
      grade: z.number().int().min(0).max(1000),
      feedback: z.string().trim().min(1).max(10000),
    })
    .strict(),
  z
    .object({
      action: z.literal("request_changes"),
      revision: z.number().int().min(0),
      feedback: z.string().trim().min(1).max(10000),
    })
    .strict(),
]);
export type AssignmentDraft = z.infer<typeof assignmentDraftSchema>;
export type SubmissionInput = z.infer<typeof submissionSchema>;
export type ReviewInput = z.infer<typeof assignmentReviewSchema>;
export function pinnedGitHubLink(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      !url.username &&
      !url.password &&
      /^\/[^/]+\/[^/]+\/(commit|tree)\/[a-f0-9]{40}\/?$/i.test(url.pathname) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
export const assignmentStatusLabel = (value: string) =>
  ({
    DRAFT: "Draft",
    PUBLISHED: "Published",
    CLOSED: "Closed",
    ARCHIVED: "Archived",
    SUBMITTED: "Submitted",
    CHANGES_REQUESTED: "Changes requested",
    GRADED: "Graded — awaiting release",
  })[value] ?? value;
export function assignmentDate(value: string | Date | null) {
  return value
    ? `${new Date(value).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })} WAT`
    : "No deadline";
}
