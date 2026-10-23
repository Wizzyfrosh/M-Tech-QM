# Configuration and first instructor

Production canonical origin: `https://mtech-qms.froshcodeorbit.site`. Point `BETTER_AUTH_URL` to that exact URL; do not use the previous `qms` hostname for production authentication or email links.

## Environment variables

| Variable           | Purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| DATABASE_URL       | Application PostgreSQL connection; server only                        |
| DATABASE_POOL_SIZE | Optional per-process pool size, 1–20; defaults to 5                   |
| DIRECT_URL         | Optional migration connection, taking precedence in Prisma CLI        |
| BETTER_AUTH_URL    | Exact application URL for this environment; production requires HTTPS |
| BETTER_AUTH_SECRET | Private random secret, at least 32 characters                         |
| MAIL_TRANSPORT     | `brevo` for real delivery, `file` only for local development          |
| BREVO_API_KEY      | Server-only transactional email key                                   |
| MAIL_FROM_EMAIL    | Sender address verified in the email provider                         |
| MAIL_FROM_NAME     | Defaults to M Tech QMS                                                |

No credentials are needed to compile the application. Accessing protected pages requires a configured database and auth environment. To use a preview, set its exact URL and use isolated test data. Do not use wildcard trusted origins or share production sessions/data with disposable previews.

## Database and migrations

Run `npm run db:migrate` against the intended development database after reviewing its connection. The committed migrations create auth, roster, audit, rate-limiting and quiz tables, database uniqueness and a partial index allowing only one instructor. The quiz migration adds questions, options and separately stored answer keys, option-membership constraints and triggers protecting published content. `npm run db:dev` is reserved for developing new migrations against disposable development data. Do not run it against production.

The auth user table stores the display name, role and ranking preference directly. This replaces the separate Profile entity proposed in the logical planning model; it avoids duplicated identity fields while preserving the same access rules. Quiz draft updates and lifecycle changes use row locks and optimistic revisions to prevent stale tabs from overwriting newer work.

## First instructor: browser activation

No terminal, developer tools or direct database login is required for the instructor. A trusted Neon administrator first provisions exactly one `InstructorInvitation` row (ID `primary`) containing the **explicitly designated** instructor email and name. Never infer the privileged email from another project or turn public instructor signup on.

The instructor then visits `/activate-instructor`, enters the approved email, and requests a six-digit code. The endpoint returns the same message whether or not the email is approved and schedules Brevo delivery after the HTTP response. The code is HMAC-hashed using the auth secret, expires after 10 minutes, has five guesses, and request/redeem actions use the shared database throttle.

After receiving the email, the instructor enters the code and chooses a password with at least 8 characters on the same page. A transaction locks the invite, verifies its code and expiry, creates a verified Better Auth credential account with role INSTRUCTOR, writes an audit event and marks the invite redeemed irrevocably. Database uniqueness prevents a second instructor. The instructor signs in normally and can change the password in Account Settings.

For provisioning through the Neon connector, use an approved email and name, and run the one-time insert only after the migration is applied:

```sql
INSERT INTO "InstructorInvitation" ("id", "email", "name", "updatedAt")
VALUES ('primary', lower(trim('approved-instructor@example.com')), 'Approved Instructor', NOW())
ON CONFLICT ("id") DO NOTHING;
```

Never expose a public API to create or update the invite. Do not replace or reassign the invitation once redeemed. The old `npm run instructor:setup` command is only an emergency administrator fallback and is **not** part of normal activation.

## Brevo delivery

Configure a verified sender and transactional API key for this project in the intended environment. Set `MAIL_TRANSPORT=brevo`, `BREVO_API_KEY`, `MAIL_FROM_EMAIL` and optionally `MAIL_FROM_NAME`. Do not paste credentials into source files or client-visible variables. Email is sent after the request using Next.js `after()` to preserve the serverless lifecycle without exposing account existence through provider latency. Delivery failures emit a fixed error code without addresses or codes; operational provider delivery checks remain necessary before launch.

Codes expire after 10 minutes, have a limited number of guesses and are stored hashed. Auth endpoints have shared database rate limits; an additional atomic email quota limits sending and guessing across application instances. Protected operations recheck the current database role and roster, and suspension revokes stored sessions.

## Current release boundary

The current implementation provides accounts, roster management and manual quiz authoring/publication. Shared student links expose published metadata only; attempts, grading, results, rankings and AI drafting are not available yet. The dedicated Neon production database has been created and migrated. Vercel hosting is live; Brevo delivery and instructor activation are still pending; see [deployment status](DEPLOYMENT.md). Before live access, configure isolated staging/production databases and email, exercise real delivery, review backups/retention, and verify the deployed account flows. Later milestones implement assessment behavior and AI drafts.

## Milestone 5 — AI transcript drafts (Gemini)

**Scope:** Instructor-only, editable multiple-choice draft suggestions. AI never publishes a quiz or marks a generated question reviewed. Start with a DRAFT quiz, paste 160–40,000 characters of non-sensitive lesson notes, choose 1–20 questions (maximum 50 in the quiz) and a difficulty. After validating the provider's structured JSON response, review suggested answers and supporting verbatim source excerpts, add selected questions and review each in the ordinary quiz editor. Save the draft manually.

**Provider setup:** Create a Gemini API key in Google AI Studio and configure it **only** as `GEMINI_API_KEY` in Vercel's Production environment. Do not add an API key to repository files, NEXT_PUBLIC variables, client code, chat messages or browser storage. Use `gemini-2.5-flash-lite`. Pricing and free-tier eligibility depend on your Google account and should be confirmed with the provider. Missing credentials return a clear 503 and do not disable manual quizzes.

**Privacy:** Transcript input is passed from the instructor's browser to the server and then Google Gemini. It is not stored in Neon, analytics or application logs. The server persists only the instructor/quiz linkage, generation status and optional token counts. Do not paste student names, contact details, passwords, proprietary code or confidential content.

**Limits and resilience:** A single instructor can reserve up to 10 requests per UTC day with an atomic PostgreSQL request bucket; failed requests consume that quota. Generation is limited to 20 questions/request with a 25-second provider timeout and at most one retry for transient provider responses. Invalid output is rejected: four distinct options, one key, source excerpt literally supported by the supplied notes. On errors, no quiz content changes.

**Release:** Apply migration `202610230005_ai_generations` to Neon production before deploying this commit. Do not merge or enable the production endpoint until CI, migrations and Vercel quota permit a verified release. Configure the production Gemini key before real teacher acceptance tests.

 
## Preview and student signup verification

The Git branch `preview/student-onboarding-multivideo-ai` is mapped to
`https://mtech-qms-preview.froshcodeorbit.site`, using a separate Neon database
and Better Auth secret. It must never use production DATABASE_URL or sessions.
The initial preview instructor is an unredeemed invitation for the approved
instructor email. Use the preview activation page to create preview-only
credentials; the live production account remains unchanged.

Student self-registration: Share `/sign-up` with your class. Students
enter their own names, emails and passwords. Better Auth sends a six-digit
verification code, and the interface opens the pre-filled OTP verification
screen. After verifying and signing in, students see a pending-approval dashboard
rather than lessons or quizzes. No instructor-entered student records or
individual invite links are required.

Instructor approval: Open `/instructor/students` and select
**Awaiting approval**. Only students with verified emails appear in the approval
queue. Approve one student or select up to 20 on the current page and approve
the batch. Suspended students remain blocked; prior approved students retain
their access. Approval takes effect at the next dashboard refresh without
requiring a new verification code. `GET /api/quizzes`, individual quiz routes,
attempts and results remain protected by the existing approved-access guard.
Bulk writes are audited and restricted to the authenticated instructor.

Preview migration requirements: first `202610230007_pending_roster_status`
adds the PENDING enum value and then `202610230008_default_pending_students`
changes the default. Apply them in that order. They do **not** rewrite existing
approved or suspended student records.

For testable preview mail delivery, BREVO_API_KEY and MAIL_FROM_EMAIL must be
enabled on Vercel Preview in addition to Production. The sender domain must
be verified in Brevo. Preview uses a separate Neon database; don't transfer
production user sessions or credentials.

## Multiple lesson video links

Each quiz supports up to 20 ordered HTTPS video links. The first link also
populates the legacy lessonUrl column for compatibility. Existing quizzes
with one video are migrated safely. The application presents the videos in
order on preview and student quiz detail pages. External videos remain hosted
at their original service, subject to that provider's playback restrictions.

## AI providers and fallback

`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, and `XAI_API_KEY` are server-only
environment variables. A selected provider uses only its corresponding key.
Automatic mode tries configured providers in the order Gemini, OpenRouter,
and xAI Grok if a provider returns a temporary 503/quota error.
The optional server-only `OPENROUTER_MODEL` defaults to `openrouter/free`.
The optional `GROK_MODEL` defaults to `grok-4.3`.
Grok is billable and OpenRouter's free model routing may have separate
privacy/retention rules. Avoid confidential lesson content when using them.
Provider credentials must not be exposed through NEXT_PUBLIC variables.
Never assume the provider key is enabled until a live draft request succeeds.


## Brevo student-verification troubleshooting

A successful sign-up triggers a six-digit OTP send to the provided email. The
server **awaits Brevo's HTTP response**; it never reports a successful send
after a known rejection. Brevo acceptance does **not** guarantee inbox
placement; check the inbox, spam folder, and Brevo transactional logs.

Verify the following in Vercel for the exact preview Git branch:
`BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME`, `BETTER_AUTH_URL`.
The sender address or domain in `MAIL_FROM_EMAIL` must be authorized in Brevo.
A key configured in Production alone does not necessarily cover Preview.
The application never exposes keys or OTPs in runtime logs.

Safe server error categories:
- `QMS_BREVO_SEND_REJECTED` with provider HTTP status (often 400/401/403/429)
- `QMS_BREVO_SEND_UNREACHABLE` for transport failures and timeouts
- `Email delivery is not configured.` if required environment variables are empty

If student signup created an account before an email transport failure, **do not
register again**: open `/verify-email` and tap **Send a new code**. Codes
expire in 10 minutes and are hashed in the database. The daily/session rate
limits remain active. Verify real inbox receipt before production release.

Responsive support now includes 320/360/390/760px layouts, touch-friendly
authentication inputs and tabs, and instructor approval cards on phones.
