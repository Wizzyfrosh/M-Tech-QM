# M Tech QMS

A mobile-friendly quiz workspace for one programming instructor and a private student community.

## Implementation status

Milestone 1 is implemented: responsive account pages and dashboards, email-code verification, password recovery, a private student roster, suspend/restore controls, profile settings, server-enforced roles and access, and PostgreSQL migrations. Milestone 2 adds manual multiple-choice quiz authoring, reviewed-answer validation, instructor preview, publication, shared details links, duplication, closure and archiving. Published questions and answer keys are locked. Student attempts, grading, reports, leaderboard rankings and AI drafting remain upcoming milestones. Both implementation milestones are merged into main. The dedicated Neon production database has both migrations applied. The app is hosted at [qms.froshcodeorbit.site](https://qms.froshcodeorbit.site). Live Brevo delivery and instructor activation remain pending; see [deployment status](docs/DEPLOYMENT.md).

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
9. Open **Students**, add a student's name/email, and share the application link. The student registers, verifies their email code and signs in. Adding a student does not send an invitation.

After signing in as the instructor, open **Quizzes**, create a draft, add four-option questions and review each correct answer and explanation. Save and preview before publishing. Published links currently show quiz details; students cannot submit attempts yet. Deadlines use West Africa Time (UTC+1).

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
