# Foundation validation

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

## Limits

A build/type/lint pass does not establish deployed database or email readiness. Real Brevo delivery, production origin/cookie configuration, migration rehearsal, backup/restore and deployment smoke checks must pass before live assessments. Quiz behavior and AI have not yet been implemented. CI results are tracked on the pull request rather than asserted in this document before a run completes.
