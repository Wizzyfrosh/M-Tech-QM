# Deployment status

Status recorded on 23 October 2026.

- Foundation PR #1 and quiz authoring PR #2 are merged into `main`, commit `1ad1b4e7869eb6eac03d4448a297a568c481187c`.
- PR #2 GitHub Actions run `39960868139` passed all checks, including PostgreSQL 16 migrations, 42 unit/integration tests, the production build and three browser tests.
- Neon project **M Tech QMS Production**, project ID `super-mode-47855255`, contains database `qms` on its production branch in `aws-eu-central-1` (PostgreSQL 16).
- Both committed migrations were applied atomically through the Neon connector because this execution environment could not reach the direct PostgreSQL endpoint. Their original SHA-256 checksums and completed records are stored in `_prisma_migrations`. Querying that ledger confirmed both migrations finished. Future migrations should use the normal Prisma migration command from an environment with direct database connectivity.
- No student data or instructor account has been created in production.

## Remaining deployment prerequisites

Vercel rejected the repository import because its GitHub integration is not installed for this repository. Install the Vercel GitHub integration and grant access to `Wizzyfrosh/M-Tech-QM`; then create/reuse the Git-connected `m-tech-qms` project in the designated Vercel team. The CLI fallback also has no authenticated credentials. No Vercel deployment has been created.

Configure production-only `DATABASE_URL` (pooled Neon connection), `DIRECT_URL` (direct connection), `BETTER_AUTH_SECRET` (private random secret), `BETTER_AUTH_URL` (exact HTTPS production origin), `MAIL_TRANSPORT=brevo`, `BREVO_API_KEY`, `MAIL_FROM_EMAIL` (verified sender) and `MAIL_FROM_NAME=M Tech QMS`. Never commit these credentials or share production database access with previews. Use separate preview data and credentials.

After configuration, deploy the exact main commit, verify public pages and protected-route redirects, provision the intended instructor using the setup script and verify email ownership via password recovery. Confirm real Brevo delivery and the authenticated account/quiz workflow before calling the release ready. No live email delivery or deployed sign-in verification has passed yet.
