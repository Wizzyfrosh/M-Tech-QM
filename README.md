# M Tech QMS

Quiz Management System for one programming instructor and a private student community.

**Status:** planning baseline v0.1, 23 October 2026. Application implementation has not started.

Create a quiz, share its link, mark submissions automatically, and track student progress. AI assists the instructor with editable quiz drafts from lesson transcripts.

## Planning documents

- [Product requirements](docs/PRD.md)
- [Architecture, data model and API contract](docs/ARCHITECTURE.md)
- [Implementation milestones and acceptance checks](docs/IMPLEMENTATION.md)
- [Engineering instructions](AGENTS.md)

## MVP

Instructor and student accounts, private roster, manual multiple-choice quiz creation, AI draft generation, quiz links, automatic marking, personal result history, instructor results, CSV export, per-quiz leaderboards, and question breakdowns.

One application and one PostgreSQL database. No video hosting, billing, native mobile app, theory marking, or student code execution in this release.

## Proposed implementation

Next.js and TypeScript, Tailwind CSS, PostgreSQL with Prisma, and Better Auth. Hosting, email, database provisioning and the AI provider are selected during implementation; this repository does not provision services or promise free hosting. Use a single server-side AI integration initially.

## Repository setup

Repository: [Wizzyfrosh/M-Tech-QM](https://github.com/Wizzyfrosh/M-Tech-QM); product display name: **M Tech QMS**. The repository is public. Never commit student data, transcripts, production exports, answer keys from real assessments, or credentials.

There are no application commands yet. Add verified installation, migration, development and test instructions when the application is scaffolded.
