# Architecture, data model and API contract

Implementation architecture. Core services are implemented; deployment evidence and remaining operational gates are recorded separately in DEPLOYMENT.md and VALIDATION.md.

## Architecture decision

Use a modular monolith: Next.js/TypeScript UI and server endpoints in one repository; PostgreSQL persistence through Prisma; Better Auth for account/session lifecycle; Tailwind for responsive styling. The frontend never connects directly to the database or AI service. Use server-side services for authorization, quiz lifecycle, attempts/grading, reports and AI drafts.

One database includes auth and domain tables. Use a pooled connection for application traffic where supported, and the provider's documented migration connection for schema changes. Select compatible stable package versions at scaffolding time and commit the lockfile. Do not assume a particular release from this planning document.

No separate Express server, Redis, queue, object storage or vector database. Authentication email and AI are external integrations; provider selection, account creation, deployment and billing are outside this planning task. Keep AI behind a small interface, but implement one provider initially. Database-backed throttling may use an expiring rate-limit bucket table; an in-memory counter alone is insufficient across server instances.

## Logical data model

| Entity | Essential fields and rules |
| --- | --- |
| Auth user/account/session/verification | Owned by Better Auth's chosen adapter; never invent a parallel password store |
| Profile | userId unique FK, role, displayName, leaderboardOptOut; role never client-editable |
| RosterEntry | id, normalizedEmail unique, name, status ACTIVE/SUSPENDED, userId unique nullable FK, createdAt |
| Quiz | id UUID, shareSlug unique random, title, lessonLabel, description, lessonUrl nullable, status, deadline nullable, reviewMode, reviewReleasedAt nullable, leaderboardEnabled, publishedAt, closedAt, archivedAt, createdBy FK |
| Question | id, quizId FK, prompt, explanation, marks positive integer, position, origin MANUAL/AI, reviewedAt nullable; unique quizId/position |
| Option | id, questionId FK, text, position; unique questionId/position |
| AnswerKey | questionId unique FK, correctOptionId FK; correct option must belong to same question |
| Attempt | id, quizId/userId unique, status IN_PROGRESS/SUBMITTED, revision, startedAt, submittedAt nullable, earnedMarks nullable, maxMarks nullable |
| AttemptAnswer | attemptId/questionId unique, selectedOptionId nullable, awardedMarks nullable; selection must belong to the question and question to attempt's quiz |
| AIGeneration | id, instructorId, requestKey unique, state, requestedCount, difficulty, provider/model, token counts nullable, sanitized errorCode, createdAt; no raw transcript |
| RateLimitBucket | key, windowStart, count, expiresAt; unique key/windowStart for atomic quota checks |
| AuditEvent | actorId, action, entityType/entityId, timestamp, safe metadata; no answer payloads or secrets |

Use database foreign keys, uniqueness, enum/check constraints and application validation. Where a cross-table ownership rule cannot use a simple FK, use a composite constraint or a validated transactional service; never rely on UI filtering. Auth adapter tables are additional to domain entities.

Indexes: quiz status/deadline; attempt quizId/status and userId/submittedAt; roster normalizedEmail; question quizId/position; option questionId/position. Do not add indexes speculatively without query evidence. Keep answer keys in server-only queries; splitting the key table helps avoid accidental broad selects but is not itself authorization.

## Critical transactional boundaries

### Start

Check session, verified email, active linked roster entry, and effective publication/closure. Insert one Attempt with database uniqueness on quizId/userId. A conflict returns the existing attempt. Reopening a submitted attempt returns its result, not a new attempt.

### Browser save coordination

Answer changes debounce for 800ms. Only one save runs at a time; edits made during that request remain dirty and are sent with its acknowledged revision. Submission waits for the active save and then sends the latest answer snapshot. A failed submission response never produces a local score or triggers background submission.

Transient save failures have three automatic retries, plus reconnect/manual retry. After an ambiguous save failure, GET compares the committed revision and the exact attempted snapshot. Only an identical snapshot at the immediately following revision acknowledges that save; a different revision blocks writes and requires an explicit reload. The browser never adopts an arbitrary newer revision to overwrite another tab. Unsaved choices stay in memory, with a page-close warning; there is no offline durability promise.

### Save

Lock the attempt; recheck membership, quiz availability and IN_PROGRESS status. Validate selected option ownership. Require expectedRevision and atomically upsert answer changes and increment revision. Return 409 for stale writes. A response acknowledges only committed answers.

### Submit

Receive expectedRevision and the final answer snapshot. In a transaction, serialize on the quiz then attempt row using a consistent lock order shared with manual closure. After acquiring locks, use the database clock to check the deadline, so an earlier request timestamp cannot bypass closure. Already submitted attempts return their stored result first, even after closure. Validate answer ownership, apply the final snapshot, read the immutable server key, compute integer marks, persist awarded marks/totals and SUBMITTED state together. Reject a stale revision before grading. Concurrent submit requests must converge on one stored result.

Manual close uses the same quiz lock. If close wins, submission is rejected; if submission wins and is before deadline, it commits before closure. No auto-submit of partial answers. Submitted status and results must never depend on an external email or AI call.

## Proposed route contract

Authentication lives under the auth library's own documented handler. Every domain route derives identity from the server session; IDs in URLs are untrusted.

| Method / route | Access | Behavior |
| --- | --- | --- |
| GET/PATCH /api/me | Signed-in | Own display name and ranking preference; no role/email changes |
| GET/POST /api/instructor/students | Instructor | Paginated roster / add allowed email |
| PATCH /api/instructor/students/:id | Instructor | Suspend/restore/name update; audit change |
| GET/POST /api/instructor/quizzes | Instructor | Paginated list / create draft |
| GET/PATCH/DELETE /api/instructor/quizzes/:id | Instructor | Editor model / draft edits / delete draft only |
| POST /api/instructor/quizzes/:id/publish | Instructor | Validate reviewed questions; immutable content afterward |
| POST /api/instructor/quizzes/:id/duplicate | Instructor | Copy into a new draft; clear review state |
| POST /api/instructor/quizzes/:id/close | Instructor | Close with explicit acknowledgement |
| POST /api/instructor/quizzes/:id/archive | Instructor | Close if necessary and retain history |
| POST /api/instructor/quizzes/:id/release-review | Instructor | Explicit answer-review release |
| PATCH /api/instructor/quizzes/:id/settings | Instructor | Deadline extension before closure, leaderboard toggle; no key edits |
| GET /api/quizzes | Active student | Published/effectively closed quiz list; no drafts or keys |
| GET /api/quizzes/:slug | Active student | Quiz metadata; no answer key |
| POST /api/quizzes/:slug/attempt | Active student | Start/resume official attempt |
| GET /api/attempts/:id | Owner, active student | Questions/options and own saved answers; safe projection |
| PUT /api/attempts/:id/answers | Owner, active student | Revision-checked save |
| POST /api/attempts/:id/submit | Owner, active student | Atomic server marking; idempotent result |
| GET /api/attempts/:id/result | Owner active student or instructor | Score plus policy-filtered review |
| GET /api/me/results | Active student | Paginated personal history |
| GET /api/quizzes/:slug/leaderboard | Active student/instructor | Closed-quiz ranking if enabled; display names only |
| GET /api/instructor/quizzes/:id/results | Instructor | Paginated submissions and participation status |
| GET /api/instructor/quizzes/:id/breakdown | Instructor | Submitted-attempt question aggregates |
| GET /api/instructor/quizzes/:id/export | Instructor | Protected CSV attachment; no public export URL |
| POST /api/instructor/ai/drafts | Instructor | Bounded transcript-to-draft request; no publishing side effect |

Quiz editor PATCH uses optimistic revision checks and a transaction for question/option changes. Responses use explicit DTOs; avoid returning ORM objects directly. Paginated lists default to 20 and cap at 100. Consistent errors: 400 invalid input, 401 session required, 403 unauthorized roster/role, 404 unavailable object, 409 lifecycle/revision conflict, 410 quiz no longer accepting work, 429 quota, 503 integration unavailable. Avoid existence leaks for another student's attempt.

## AI and operational controls

Validate schema and answer references even if structured output is requested. Never provide tools or student data to transcript generation. Keep transcript in memory for the request only; redact it from monitoring. Reserve the daily generation quota atomically before the provider call and associate retries with one request key. Limit simultaneous generation per instructor; bound timeout and retries. Verify current provider limits, data policy and cost before enabling AI. Manual quiz authoring must have no dependency on provider availability.

Use HTTPS, HttpOnly secure session cookies, origin/CSRF protections, safe same-origin redirects and parameterized database access. Render prompts/transcripts as plain text or sanitized restricted Markdown. Escape CSV formula prefixes. Do not put credentials in NEXT_PUBLIC variables. Provision the instructor once using a controlled operation and disable any bootstrap path afterward.

Plan a staging environment with synthetic data and a separate production database or isolated provider branch. Keep migrations in version control, review generated SQL and perform a backup/restore exercise before launch. No production provisioning is authorized by this document alone.

## Documentation verified during planning

- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js App Router: https://nextjs.org/docs/app
- Better Auth email/password: https://better-auth.com/docs/authentication/email-password
- Better Auth email integration: https://better-auth.com/docs/concepts/email

These sources establish framework/auth capabilities. The application schema, policies, limits and milestones above are project design decisions; validate package compatibility and provider-specific details during implementation.
