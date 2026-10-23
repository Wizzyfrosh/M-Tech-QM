# Deployment status

## Released baseline

Milestones 1–5 and the dark-mode/mobile profile update are merged into main. The last verified production release before assessment autosave is PR #11, commit `9b12c708ca1559097be5c82866cbdc18ece97700`, Vercel deployment `dpl_Hway5CY9tSsdTcUk3PVj6LpAhsVy` (READY).

- Canonical URL: https://mtech-qms.froshcodeorbit.site
- Legacy `qms.froshcodeorbit.site` and `m-tech-qms.vercel.app` redirect to the canonical host.
- Vercel project: `m-tech-qms` (`prj_YBbD7C3bzeGRgMOTmYVgTsuQ5FOK`), team `umanor-wisdom-chizoba-s-projects`.
- GitHub repository: `Wizzyfrosh/M-Tech-QM`; main merges trigger production deployment.
- Neon project: **M Tech QMS Production**, ID `super-mode-47855255`, database `qms`, production branch `br-muddy-morning-b9bykj2q`, PostgreSQL 16 in Frankfurt. Eight committed migrations were applied before this release. The autosave change requires no schema migration.
- Production database, authentication origin/secret, Brevo and AI provider credentials are configured server-side. Test databases and local file mail stay separate from production. Preview environment configuration is branch-scoped; do not assume an arbitrary preview branch has backend credentials.
- Instructor activation is complete and closed. Public student signup uses email verification, followed by instructor approval before assessment access.

## Evidence and release procedure

PR #11 CI passed lint, types, PostgreSQL integration tests, production build and three browser flows on rerun. Production returned HTTP 200 for sign-in with the theme control and preference initialization script. The owner confirmed student signup verification works. Email delivery was verified separately; CI/browser tests use synthetic fixtures and file mail and cannot prove inbox placement.

For application releases, wait for PR checks and the preview build, merge the exact reviewed head, then verify the production deployment's commit, READY status, canonical alias and smoke checks. Never claim a pending deployment is live.

## Pilot and launch readiness

Assessment reliability work adds autosave and connection recovery. Its automated concurrency check is confined to disposable local PostgreSQL in CI; it must not run against production or real students. It measures database/service behavior, not deployed HTTP capacity.

Remaining operational gates:

- Measure a staging HTTP pilot with authentication and deployment latency.
- Rehearse backup and restore on an isolated Neon branch and record recovery evidence.
- Choose and document student-record retention and support procedures.
- Review current provider quotas and configured spending limits before the live assessment pilot.

These gates remain open until their evidence is recorded. No production load testing or destructive restore is part of the autosave release.
