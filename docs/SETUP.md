# Configuration and first instructor

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

Run `npm run db:migrate` against the intended development database after reviewing its connection. The committed migration creates auth, roster, audit and rate-limiting tables, database uniqueness and a partial index allowing only one instructor. `npm run db:dev` is reserved for developing new migrations against disposable development data. Do not run it against production.

The auth user table stores the display name, role and ranking preference directly. This replaces the separate Profile entity proposed in the logical planning model; it avoids duplicated identity fields while preserving the same access rules. Quiz tables will be added with their implementation milestone.

## Instructor activation

Run the documented setup command with the designated email and name after migration. It uses an advisory transaction lock and database uniqueness to prevent two instructors, creates an unverified credential account with an undisclosed random password, and writes an audit event. It sends no email.

The owner then uses **Forgot password** and the email code to establish their password. Email OTP recovery verifies ownership, marks the account verified and revokes existing sessions. Instructor registration is never exposed as a public signup option. Re-running setup when an instructor exists fails without modifying that account.

## Brevo delivery

Configure a verified sender and transactional API key for this project in the intended environment. Set `MAIL_TRANSPORT=brevo`, `BREVO_API_KEY`, `MAIL_FROM_EMAIL` and optionally `MAIL_FROM_NAME`. Do not paste credentials into source files or client-visible variables. Email is sent after the request using Next.js `after()` to preserve the serverless lifecycle without exposing account existence through provider latency. Delivery failures emit a fixed error code without addresses or codes; operational provider delivery checks remain necessary before launch.

Codes expire after 10 minutes, have a limited number of guesses and are stored hashed. Auth endpoints have shared database rate limits; an additional atomic email quota limits sending and guessing across application instances. Protected operations recheck the current database role and roster, and suspension revokes stored sessions.

## Current release boundary

This milestone provides account and roster management only. No production service has been created, migrated or deployed by this change. Before live access, configure isolated staging/production databases and email, exercise real delivery, review backups/retention, and verify the deployed account flows. Later milestones implement quiz authoring and assessment behavior.
