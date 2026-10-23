# M Tech QMS — Product requirements

Version 0.1 · 23 October 2026 · Planning baseline

## 1. Purpose

A small, mobile-friendly web application for one instructor to assess a registered programming community after weekly lessons. Students open a quiz link, sign in, answer multiple-choice questions, receive a score immediately, and retain their results. The instructor keeps the same records centrally and can export them.

Success means an instructor can publish a manually authored quiz without developer assistance, an eligible student can complete it on a phone, and the instructor and student see the same reproducible score.

## 2. Scope and assumptions

One instructor, one community, and an initial planning target of roughly 100 registered students. This is a sizing assumption, not a tested capacity claim. Every active roster member can access every published quiz; separate classes, cohorts and per-quiz assignments are deferred. Lessons remain on the instructor's existing platform. An optional external lesson link supplies context; watching a lesson is not verified.

The application has two roles: INSTRUCTOR and STUDENT. Student signup never grants instructor privileges. Instructor provisioning is an explicit administrative operation. No organization model, instructor marketplace, payments, or subscription logic.

### Included

| Capability | MVP behavior |
| --- | --- |
| Accounts | Email/password authentication, email ownership verification, account recovery, profile display name |
| Student roster | Instructor adds an allowed email and name, sees activation status, suspends or restores access |
| Quiz editor | Create, edit drafts, preview, duplicate, publish, manually close and archive |
| Questions | Single-answer multiple-choice; four options, one correct option, explanation and integer marks |
| AI drafting | Paste transcript, choose question count and difficulty, generate editable multiple-choice drafts |
| Distribution | One shared link per quiz; authentication and active roster membership required |
| Attempts | One official attempt per student per quiz, resume before submission, server autosave |
| Results | Server marking, immediate score, review controlled by instructor |
| Records | Student history, instructor submission list, CSV export |
| Leaderboard | Optional per quiz, shared ranks for equal scores, display names only |
| Teaching insight | Per-question correct/incorrect/unanswered counts |

### Deferred

Multiple instructors and organizations; payments; video uploads; theory answers and AI grading; student code execution; timers and remote proctoring; native apps; complex analytics; certificates; overall leaderboards; practice retries; bulk roster imports; automatic result emails.

## 3. Primary journeys

### Instructor

Sign in → add student emails → create quiz → add or generate questions → review answer key → set deadline, review visibility and leaderboard → preview → publish → copy link → review submissions and question breakdown → export results.

### Student onboarding

Instructor adds email → instructor shares the app/quiz link through their existing channel → student registers using that email → verifies email ownership → signs in → completes profile → opens quiz. Registration is rejected for emails outside the active roster. Adding a roster email does not create a password or send an invitation automatically.

### Student assessment

Open quiz link → sign in if needed → read quiz details → start/resume attempt → answer questions → review unanswered items → confirm submission → receive score → revisit result from profile. Signing in must preserve the intended quiz destination, restricted to safe same-origin paths.

## 4. Functional requirements

### FR-01 Accounts and roster

- Normalize emails consistently for roster and account matching; enforce uniqueness without rewriting meaningful address components.
- Require email ownership verification before quiz access. Verification and password recovery must expire, rate-limit requests and resist account enumeration.
- Students edit display name and password; email changes are deferred to avoid silently breaking roster membership.
- An instructor can suspend a student; suspension blocks new starts, saves, submission, results and leaderboard access immediately. Restore preserves history.
- Students see their own records only. Instructors see all community records. No public student directory or public leaderboard.

### FR-02 Quiz authoring and lifecycle

- Fields: title, lesson label, description, optional HTTPS lesson link, optional deadline, review mode and leaderboard toggle.
- Draft questions contain a prompt, four non-empty distinct options, exactly one correct option, explanation, order and marks (1–10).
- Allow 1–50 questions; title up to 120 characters; prompt up to 4,000 characters. These are editable product limits for the initial build.
- Preview exactly what the student sees plus a clearly separated instructor answer-key view.
- Publishing validates the entire quiz. Every question requires explicit instructor review, including AI questions.
- States: DRAFT → PUBLISHED → CLOSED → ARCHIVED. A deadline can make a PUBLISHED quiz effectively closed without a background job.
- Lock questions, options, marks and answer keys after publication. Duplicate a published quiz to make a corrected assessment; do not rewrite historical scores.
- Deadline extension is allowed before effective closure; do not shorten a deadline below the current time or reopen closed quizzes in the MVP. Closing early requires an explicit warning about active attempts.
- Drafts can be deleted. Published quizzes are retained and archived, preserving result history.

### FR-03 Student attempts and connectivity

- Shared links identify the quiz; they do not authenticate a student or bypass the roster.
- Show title, lesson, question count, maximum marks, deadline, review policy and whether leaderboard participation is enabled before starting.
- One official attempt per user and quiz, enforced in the database. Starting again resumes the existing attempt.
- Save selected option IDs to the server with debounce and show Saving/Saved/Not saved status. Prevent stale concurrent updates using an attempt revision number; a stale tab must reload before saving.
- After refresh, restore the most recent server-saved answers. Reconnect and retry failed saves. Unsaved answers can be lost if the page closes; explain this plainly.
- No offline submission promise. Submission succeeds only after server acknowledgement. A pending or failed request must not display a fabricated result.
- Show unanswered questions before final confirmation. Unanswered questions are allowed and score zero.
- Reject new starts, saves and submissions at or after the deadline or manual closure. In-progress attempts remain recorded as incomplete and are excluded from ranked results. A draft saved before the deadline is not an official submission.

### FR-04 Marking and result review

- Score on the server: earned marks / maximum marks × 100. Correct option earns full question marks; wrong or unanswered earns zero; no negative or partial marks.
- Store integer earned and maximum marks. Display percentage to one decimal; compare unrounded ratios for ranking.
- Finalize grading and attempt status atomically. Repeated submissions return the existing result, including when the first response was lost.
- A submitted attempt is immutable. Do not accept marks, correct answers, user IDs or final scores supplied by the browser.
- Always show score, submitted time and quiz title immediately. Review modes: AFTER_SUBMISSION, AFTER_CLOSE (default), INSTRUCTOR_RELEASE.
- Before review is released, hide correct options, explanations and per-question correctness. Even correctness flags can reveal an answer when options are few.
- AFTER_CLOSE releases when the deadline has passed or the instructor manually closes the quiz. A quiz without a deadline requires manual closure. INSTRUCTOR_RELEASE requires an explicit release action.
- Archived quizzes retain student scores and apply their existing review policy. A never-released instructor review stays hidden.

### FR-05 Instructor records and CSV

- Dashboard shows active roster, published quizzes and submitted attempt counts.
- Per-quiz results show student name/email, score, percentage, submission time, and incomplete/not-started status for roster members without submissions. Counts must use clear denominators.
- CSV contains quiz title, lesson, student name/email, status, earned/max marks, percentage and submitted timestamp. No password/session data or answer keys.
- Defend against spreadsheet formula injection, including cells starting with formula prefixes after leading whitespace/control characters. Apply proper CSV quoting and UTF-8 encoding.
- Profiles retain quiz title, lesson, score and date. Do not sum different quiz scores into an overall ranking.

### FR-06 Leaderboard and question breakdown

- Only active authenticated roster members and the instructor can see enabled leaderboards. Students see display names and scores, never email addresses.
- Only submitted official attempts count. Equal earned/max ratios share a competition rank (1, 1, 3). Alphabetical ordering among ties does not change rank; speed is not a tiebreaker.
- Students may opt out of public ranking within the community; their result remains available to themselves and the instructor. Suspended users are excluded from the student-facing leaderboard without deleting records.
- Leaderboard stays hidden until effective quiz closure; score access remains immediate. Instructor can disable it entirely.
- Question breakdown is instructor-only: correct, incorrect, unanswered and total submitted attempts for each question. Correct rate = correct / submitted attempts; show no-data state if denominator is zero.

### FR-07 AI quiz drafts

- Instructor-only; paste plain transcript text, select 1–20 questions and beginner/intermediate/advanced difficulty. Initial transcript limit: 40,000 characters, additionally bounded by the chosen model's token budget.
- Treat transcript content as untrusted source material, never as instructions to access tools, change permissions or publish quizzes.
- Generate structured output: prompt, four options, correct option, explanation and a supporting excerpt from the transcript. Excerpts help review but do not prove factual correctness.
- Validate shape, count, lengths, duplicates and answer references. Present every output as an unreviewed draft. Save only after instructor acceptance; publish only after review.
- Refuse unsupported generation when source material is insufficient; return a clear message instead of silently inventing missing material.
- Instructor can edit/remove any generated question. Manual authoring works when AI is disabled, unavailable or out of quota.
- API key stays on server. Enforce a configurable daily generation cap, input/output limits, request timeout and a small bounded retry policy. Record status/token usage if available, without storing raw transcripts in logs.
- Default to not retaining transcript text after generation. Tell the instructor that transcript text is sent to the configured AI provider and should exclude student personal information or confidential material.

## 5. Screens and usability

Public/account: sign in, permitted registration, verification, forgot/reset password, access denied.

Instructor: dashboard, roster, quiz list, quiz editor/AI panel, preview/publish, results/question breakdown, export, profile/settings.

Student: quiz list, quiz landing, attempt, result/review, result history, leaderboard, profile/settings.

Use a clean light interface, accessible contrast, restrained accent colors and icons rather than emojis. Responsive at 360px and above without horizontal page scrolling. Code examples use readable monospace formatting without executing code. Keyboard access, visible focus, labelled inputs and screen-reader announcements for save/error states are required. Avoid a marketing homepage; focus on sign-in and the product workflow.

## 6. Non-functional requirements

- One web application, one relational database, no microservices or mandatory queue/cache.
- All authorization and grading are server-enforced; hidden UI is not an access-control mechanism.
- Private pages and JSON must not be publicly cached. No answer keys in page source, client bundles, analytics or unauthorized API responses.
- Validate same-origin mutations and safe redirects, apply rate limits, secure session cookies and prevent untrusted HTML rendering.
- Preserve UTC timestamps and display deadlines explicitly in Africa/Lagos by default, including timezone.
- No student names, emails, answers, transcript contents or secrets in routine logs. Track safe request IDs and sanitized failures.
- Separate development/test and production data, secrets and deployments. Use synthetic students for automated checks.
- Document database backup and a tested restore procedure before live assessments; set a retention policy before launch.
- Pilot target: 25 concurrent synthetic students saving and submitting against a 100-member roster, with zero duplicate results or lost acknowledged answers. Measure performance before claiming capacity.

## 7. Definition of MVP complete

An instructor can register a student, publish a reviewed quiz, share its link and export matching scores. A verified active student can complete it from a phone, refresh safely, submit exactly once and revisit their result. Other students cannot access that result, drafts or answer keys. AI failures do not block manual quizzes. Leaderboard and question breakdown calculations match stored submissions. All implementation acceptance checks pass on a staging environment before production use.

## 8. Decisions recorded

Product name: M Tech QMS. Repository: Wizzyfrosh/M-Tech-QM (public, created by the owner). One community, no cohort model. Multiple-choice only. One official attempt. No countdown timer. Immediate score with delayed answer review by default. Leaderboards default enabled after closure, with student opt-out. Manual dashboard records and CSV satisfy instructor copies; email notifications are deferred. Provider accounts, budget caps, instructor activation email, retention period and final visual branding are implementation decisions, not blockers to planning.
