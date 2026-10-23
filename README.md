# M Tech QMS

A mobile-friendly quiz workspace for one programming instructor and a private student community.

## Implementation status

Milestones 1–5 are implemented: self-service student signup with email-code verification and instructor approval, account recovery, roster access controls, manual quiz authoring, official attempts and transactional grading, result histories, instructor reports/CSV, closed-quiz rankings and reviewed AI drafts. Dark mode is optional, light mode is the default, and the theme preference is saved on the device. Password settings expand only when selected.

Milestone 6 (pilot and launch readiness) is in progress. This release adds debounced answer autosave, bounded connection retries, lost-response reconciliation and serialization with final submission. Production capacity and disaster-recovery readiness are separate checks; see [validation](docs/VALIDATION.md) and [deployment status](docs/DEPLOYMENT.md).

## Stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, PostgreSQL, Prisma 7 and Better Auth. Versions are pinned in `package-lock.json`. Use Node.js 24.

## Local setup

1. Clone the repository and run `npm ci`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to a dedicated development PostgreSQL database. `DIRECT_URL` is optional for migrations when the application connection is pooled.
3. Generate a secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and save it as `BETTER_AUTH_SECRET`. Keep it private.
4. Set `BETTER_AUTH_URL=http://localhost:3000`. Use the same host when opening the app; origins must match.
5. Set `MAIL_TRANSPORT=file` for local development. Codes will be written into the ignored `.local-mail` directory. This transport cannot deliver mail in a production build. For Brevo, see [configuration](docs/SETUP.md).
6. Run `npm run db:migrate` to apply the committed migrations to the development database.
7. Prepare the single instructor account: `npm run instructor:setup -- --email owner@example.com --name "Instructor name"`.
8. Run `npm run dev`, open `/forgot-password`, request a code for that instructor email and use it on `/reset-password` to choose a password. The code proves email ownership and verifies the account. Then sign in.
9. Share the application link. Students register and verify their email themselves, then see a waiting-for-approval screen. Open **Students** as the instructor to approve them. Approval grants quiz access; suspension removes access while preserving records. Manual roster entry remains available when needed.

After signing in as the instructor, open **Quizzes**, create a draft, add four-option questions and review each correct answer and explanation. Save and preview before publishing. Approved students can start/resume an official attempt and submit once. Answers save automatically after a short pause, with an explicit Save progress fallback. Wait for the saved acknowledgement before leaving; unsaved choices are held in page memory only. Final submission requires server confirmation. Deadlines use West Africa Time (UTC+1).

The instructor setup command generates an undisclosed random initial password and refuses to create a second instructor. There is no public role-selection or instructor-creation endpoint.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` uses a disposable PGlite PostgreSQL-compatible database locally. Set `TEST_DATABASE_URL` to a dedicated local PostgreSQL database whose name ends in `_test` to use PostgreSQL instead. These tests erase that database's `public` schema. Never point test commands at real data. GitHub Actions uses PostgreSQL 16 for integration and browser checks. Browser tests use synthetic accounts and local file mail; they do not contact Brevo.

Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` only if a compatible Chromium browser is already installed outside Playwright's cache. See [validation notes](docs/VALIDATION.md) for verified checks and limits.

## Planning and implementation documents

- [Product requirements](docs/PRD.md)
- [Architecture, data model and API contracts](docs/ARCHITECTURE.md)
- [Implementation milestones](docs/IMPLEMENTATION.md)
- [Environment and instructor setup](docs/SETUP.md)
- [Validation notes](docs/VALIDATION.md)
- [Engineering instructions](AGENTS.md)

Repository: [Wizzyfrosh/M-Tech-QM](https://github.com/Wizzyfrosh/M-Tech-QM). Product name: **M Tech QMS**. Never commit student records, transcripts, exports, real assessment keys or credentials to this public repository.

## Branding

The supplied M Tech Hub logo is used in account pages, workspace navigation and transactional emails. Interface symbols use [Lucide SVG icons](https://lucide.dev/); do not use emoji characters.
