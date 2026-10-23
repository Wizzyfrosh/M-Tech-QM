# Implementation plan and acceptance checks

Execute milestones in order. Ship the manual end-to-end workflow before adding AI. This is a sequence of deliverables, not a promised delivery date.

## Milestone 1 — Foundation, accounts and roster

Scaffold the TypeScript application and light responsive shell; pin compatible dependencies and runtime; configure database migrations, auth, verification/recovery email and controlled instructor provisioning. Implement active roster enforcement and safe session handling.

Acceptance: an allowed email can verify and sign in; an unlisted email cannot enroll; students cannot assign roles; a suspended student loses domain access even with an existing session; recovery tokens expire and repeated requests are throttled. CI performs type checking, linting and a production build with documented test-safe configuration. No production secrets are needed for pull-request checks.

## Milestone 2 — Manual quiz creation and publishing

Implemented in the quiz-authoring branch. This change is stacked on the accounts/roster foundation pull request. Student links intentionally stop at published metadata until Milestone 3 adds official attempts.

Build quiz list/editor, four-option multiple-choice questions, marks, preview, optional lesson link, deadline and review settings. Add draft delete, duplicate, close and archive. Enforce lifecycle and reviewed-answer validation on the server.

Acceptance: publishing an incomplete question fails; unauthorized students cannot fetch drafts or keys; editing published content fails; duplication creates a separate editable draft; closing/archiving retains history; deadline is clearly shown in Lagos time.

## Milestone 3 — Student attempt and marking

Implement shared-link return after sign-in, landing page, start/resume, revision-protected saves, submission confirmation, transactional grading and policy-filtered result screen.

Acceptance: a phone-sized browser can complete the quiz; refresh restores acknowledged answers; network failure displays unsaved state; stale tabs cannot overwrite newer saved answers; two simultaneous submissions yield one result; replay after response loss returns that same result; tampered option/question IDs fail; unanswered questions earn zero; client-supplied scores are ignored; deadline/manual-close races follow the documented policy.

## Milestone 4 — Records, reports and leaderboard

Build student history, instructor results, participation status, per-question breakdown and CSV download. Add closed-quiz leaderboard, shared ranks, privacy opt-out and disable toggle.

Acceptance: students cannot fetch another student's result or an export; no email is exposed on the leaderboard; opted-out/suspended students are absent from student rankings; equal ratios share rank; incomplete attempts do not count as submissions; CSV totals match database results; formula-like student names cannot execute in a spreadsheet; hidden reviews contain no key/correctness fields in HTML or JSON.

## Milestone 5 — AI drafts

Choose and configure one provider, then implement transcript input, count/difficulty controls, validated output, instructor editing and acceptance. Add quota, timeout, safe error handling and token-usage recording where available.

Acceptance: invalid/malformed output is rejected; a transcript containing malicious instructions cannot trigger tool use or publication; insufficient material produces an actionable message; all generated questions begin unreviewed; outages leave manual editing usable; concurrent requests cannot bypass the quota; no transcript or provider key reaches logs/client bundles.

## Milestone 6 — Pilot and launch readiness

Test a real browser flow from instructor publishing through student result and instructor CSV. Exercise account recovery and a staged backup/restore. Perform targeted accessibility and mobile checks. Run a measured concurrency pilot with 25 synthetic active students against a 100-member roster; record response times, errors and grading consistency. Use separate test data and never load-test production without explicit authorization.

Launch checklist: public routes and deep links load; no broken redirect/404 in primary flows; authorization/answer-key checks pass; CI is green; current service quotas and spending caps are known; instructor activation is closed; retention and support procedures are recorded; deployment smoke tests pass. Deployment is a separate implementation step, not completed by this planning pack.

## Test priorities

Use deterministic tests for marks, tie ranking, quiz closure and review release. Integration-test access control, ownership, database uniqueness, transaction replay/concurrency, option membership and CSV sanitization. Use browser tests for the full instructor/student journey and an interrupted-save recovery. Do not substitute screenshots or a successful build for authorization and grading checks.

## Scope guard

Do not add video storage, payments, organizations, theory grading, code execution, practice retries, countdown timers or overall rankings to solve an MVP issue. Record later ideas separately. The first pilot should establish whether students can complete quizzes reliably and whether question breakdowns help the instructor adjust lessons.
