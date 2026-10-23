# Implementation validation

## Automated coverage

- Verified ownership and active roster access policy; safe local return URLs.
- Email normalization and strict profile input that rejects role/email changes.
- Actual Better Auth signup, verification, sign-in, recovery, OTP expiry and reuse prevention against the migration schema.
- Anonymous/student rejection from instructor endpoints; cross-origin mutation rejection.
- Roster creation/duplicate handling, optimistic access updates, suspension and immediate session revocation, restoration.
- Atomic shared email quota and database-enforced single instructor.
- Browser flow: instructor adds a student, student registers/verifies/signs in on a mobile viewport, updates a profile, recovers a password and loses access after suspension.
- Account screens at 360px and mobile authenticated layout overflow checks.

Local integration tests use PGlite with the PostgreSQL wire adapter when TEST_DATABASE_URL is absent. GitHub Actions uses a dedicated PostgreSQL 16 service. Local compatibility testing is not a production concurrency/capacity test. The browser harness creates disposable synthetic accounts and stores test codes in the ignored local mail directory; it does not send real emails.

## Quiz authoring coverage

- Incomplete drafts save; publishing requires a lesson, complete questions, four distinct options, a correct answer, marks, an explanation and explicit review.
- Any question edit clears its review confirmation. Duplication creates a new unreviewed draft, share link and no deadline.
- Instructor authorization, ownership, current roster access and same-origin mutation checks cover quiz endpoints. Students cannot fetch drafts, instructor previews or answer keys.
- Row locking and revision checks protect concurrent saves and publishing. Published question/option/key mutations and deletion are blocked by database triggers.
- Correct options must belong to the same question. Invalid draft input rolls back atomically.
- Published deadlines can only be extended before closure. Closed quizzes cannot reopen; leaderboard visibility can still change. Archiving preserves content.
- Shared landing-page/API data contains metadata only. No question prompts, explanations or correct-option fields are returned to students in this milestone.
- Browser coverage includes save, review invalidation, mobile editor overflow, instructor preview/key toggle, publish, student metadata privacy, close, archive, duplicate and draft deletion.

## Limits

A build/type/lint pass does not establish deployed database or email readiness. Real Brevo delivery, production origin/cookie configuration, migration rehearsal, backup/restore and deployment smoke checks must pass before live assessments. Student attempts, grading, result histories, leaderboard rankings, reports and AI have not yet been implemented. Publishing makes the details link available; it does not enable submissions. Local checks cover 42 unit/integration tests plus three browser tests, type checking, linting and a production build. CI results are tracked on the pull request rather than asserted in this document before a run completes.
