import { ExternalLink } from "lucide-react";
import { assignmentDate } from "@/lib/assignment-policy";
export type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;
export async function assignmentRequest<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    ...(body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json().catch(() => {
    throw new Error("The server response was interrupted. Please try again.");
  });
  if (!response.ok)
    throw new Error(result.error || "Unable to complete this request.");
  return result as T;
}
export const errorMessage = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "Unable to complete this request. Please try again.";
export function AssignmentLinks({ links }: { links: string[] }) {
  return (
    <ul className="assignment-links">
      {links.map((link, i) => (
        <li key={`${i}:${link}`}>
          <a href={link} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} /> {link}
          </a>
        </li>
      ))}
    </ul>
  );
}
export function AssignmentInstructions({
  assignment: a,
}: {
  assignment: {
    instructions: string;
    rubric: string;
    resources: string[];
    deadline: string | null;
    maxMarks: number;
    submissionType: string;
    allowLate: boolean;
  };
}) {
  return (
    <>
      <div className="assignment-facts">
        <span>
          <strong>{a.maxMarks}</strong> maximum marks
        </span>
        <span>
          {a.submissionType === "PROJECT"
            ? "Flutter / coding project"
            : "Written response"}
        </span>
        <span>Due: {assignmentDate(a.deadline)}</span>
      </div>
      <section className="panel assignment-panel">
        <h2>Instructions</h2>
        <p className="pre-wrap assignment-prose">{a.instructions}</p>
        <p className="muted">
          {a.allowLate
            ? "Late submissions are accepted and labelled late."
            : "Submissions close at the deadline. Your instructor can explicitly request a revision afterwards."}
        </p>
        {a.rubric && (
          <>
            <h3>Marking guidelines</h3>
            <p className="pre-wrap assignment-prose">{a.rubric}</p>
          </>
        )}
        {!!a.resources.length && (
          <>
            <h3>Resources</h3>
            <AssignmentLinks links={a.resources} />
          </>
        )}
      </section>
    </>
  );
}
export function SubmissionEvidence({
  responseText,
  projectUrl,
  evidenceUrls,
}: {
  responseText: string;
  projectUrl: string;
  evidenceUrls: string[];
}) {
  return (
    <>
      <p className="pre-wrap assignment-prose">
        {responseText || "No written response."}
      </p>
      {projectUrl && (
        <>
          <h3>Submitted code version</h3>
          <AssignmentLinks links={[projectUrl]} />
        </>
      )}
      {!!evidenceUrls.length && (
        <>
          <h3>Supporting evidence</h3>
          <AssignmentLinks links={evidenceUrls} />
        </>
      )}
    </>
  );
}
