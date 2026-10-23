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
- Shared landing-page/API data contains metadata only. Before starting an attempt, no question prompts, explanations or correct-option fields are returned. Attempts expose questions/options but hide answer keys until the configured review release.
- Browser coverage includes save, review invalidation, mobile editor overflow, instructor preview/key toggle, publish, student metadata privacy, close, archive, duplicate and draft deletion.

## Assessment reliability coverage

- Debounced saves acknowledge only committed snapshots; edits made during a save remain pending.
- Final submission waits for the current save revision; repeated clicks produce one request.
- Lost save acknowledgements are reconciled against the exact server snapshot, without overwriting changes from another tab.
- Three bounded automatic retries preserve unsaved choices; reconnect and manual save can retry again. Conflicts and access/closure failures stop automatic writes.
- Unconfirmed submission freezes choices and offers an explicit retry; no score is fabricated and no autosave follows an ambiguous submit.
- Browser coverage interrupts a save, restores connectivity, drops a response after commit, reloads saved answers and completes submission/results/export.
- A real-PostgreSQL-only integration pilot creates a synthetic 100-student cohort and runs 25 concurrent starts/saves plus 50 duplicate submissions. It asserts one result per student, matching grades, rejection of stale saves and no loss of acknowledged answers. It logs sanitized service latency metrics in CI. PGlite runs skip this check because its single connection cannot represent lock contention.

## Current limits

Local integration checks use disposable PGlite; GitHub Actions uses PostgreSQL 16. The database pilot does not include HTTP, authentication, hosting cold starts or production network latency. A separate staging HTTP load measurement remains required before claiming capacity.

Backup/restore rehearsal, a chosen retention policy, service budget review and support procedures remain launch gates. No production load test is authorized or performed by these checks. Browser mail uses a local file transport. Production Brevo delivery was checked separately and the owner confirmed signup verification works; mailbox placement remains outside the browser harness.
