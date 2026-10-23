# Deployment status

Status recorded on 23 October 2026.

- Foundation PR #1 and quiz authoring PR #2 are merged into `main`, commit `1ad1b4e7869eb6eac03d4448a297a568c481187c`.
- PR #2 GitHub Actions run `39960868139` passed all checks, including PostgreSQL 16 migrations, 42 unit/integration tests, the production build and three browser tests.
- Neon project **M Tech QMS Production**, project ID `super-mode-47855255`, contains database `qms` on its production branch in `aws-eu-central-1` (PostgreSQL 16).
- Both committed migrations were applied atomically through the Neon connector because this execution environment could not reach the direct PostgreSQL endpoint. Their original SHA-256 checksums and completed records are stored in `_prisma_migrations`. Querying that ledger confirmed both migrations finished. Future migrations should use the normal Prisma migration command from an environment with direct database connectivity.
- No student data or instructor account has been created in production.

## Vercel production deployment

- Public URL: https://m-tech-qms.vercel.app
- Project: `m-tech-qms` (`prj_YBbD7C3bzeGRgMOTmYVgTsuQ5FOK`), team `umanor-wisdom-chizoba-s-projects`.
- GitHub integration is connected to `Wizzyfrosh/M-Tech-QM`, production branch `main`; future main pushes trigger deployments.
- Initial configured production deployment: `dpl_87b6KyDgMTC1MNjup1EcXjaVWmW5`, application commit `1b4a4ebbf66c95175089ee2a6041aeb3c0d039b6`, status READY. Node.js 24, Next.js and the Frankfurt function region are configured in Vercel.
- Production-only database URLs, authentication secret, exact HTTPS origin, database pool size, Brevo transport and mail display name are configured. No production credentials were assigned to preview environments.

## Deployed checks

- Public sign-in returns HTTP 200 over HTTPS; the dashboard redirects to sign-in with its return URL.
- Anonymous account, instructor quiz and student quiz API requests return 401. A cross-origin quiz mutation returns 403.
- A synthetic unlisted signup returned the generic privacy-preserving response and created no User, RosterEntry or Verification record. Its rate-limit write confirms the deployed authentication handler can reach Neon.
- Five account screens rendered at a 390px mobile viewport without horizontal overflow or browser JavaScript errors. Mobile and desktop sign-in layouts were visually inspected. Chromium used the execution environment's HTTP proxy with certificate checks disabled in that browser context; the separate HTTPS HTTP checks used normal certificate validation.
- Runtime log review found no QMS application failure; the Postgres driver emitted a warning about future SSL mode semantics. No real email delivery or authenticated production instructor workflow has been verified.

## Remaining activation

Add `BREVO_API_KEY` and `MAIL_FROM_EMAIL` (a verified Brevo sender) to **Production** in Vercel environment settings, then redeploy for those values to take effect. `MAIL_TRANSPORT=brevo` and `MAIL_FROM_NAME=M Tech QMS` are already set. Never paste the API key into chat or source control.

The intended instructor email is still needed. Provision that account using the setup script and verify email ownership through password recovery. Confirm actual Brevo delivery and the authenticated account/quiz workflow before calling the release ready for students. Student attempts and grading remain the next implementation milestone.
