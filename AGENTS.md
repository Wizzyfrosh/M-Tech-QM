# M Tech QMS engineering instructions

Read README.md and docs/PRD.md, docs/ARCHITECTURE.md and docs/IMPLEMENTATION.md before implementing. This repository begins as a planning pack; do not claim unbuilt features are working.

- Build one application and one PostgreSQL database; keep the approved MVP scope.
- Use explicit server authorization for every role, roster, quiz and attempt operation.
- Never expose answer keys before review release, accept browser-calculated scores, or store real student records in source control.
- Keep grading transactional and submission idempotent. Enforce one official attempt with database uniqueness and prevent stale autosave writes.
- Lock published assessment content; preserve historical results.
- AI is instructor-only drafting with review, validation, quota and timeout. Manual authoring must work without AI.
- Keep secrets server-only and out of logs, commits and example values. Use synthetic test fixtures.
- Choose compatible supported package versions during scaffolding; commit a lockfile and documented commands.
- Test meaningful security, concurrency, grading and full user flows. Run the checks relevant to each change and report actual results and limitations.
- Keep UI responsive, accessible and plain-language. No emojis in product UI.
- Do not provision paid services, change production configuration, apply production migrations or deploy as an implicit side effect of a documentation change.
