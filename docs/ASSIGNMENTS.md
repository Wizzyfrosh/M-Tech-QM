# Standalone assignments

Assignments are independent of quizzes: separate records, navigation, submissions, marking, release and history. They use the same approved student roster and durable email/in-app notification outbox. No quiz or quiz attempt is created or required.

## Instructor flow

Open Assignments → Create assignment. Set a title, instructions, submission format (written response or coding project), optional marking guidelines and up to five HTTPS resources, maximum marks (1–1000), optional WAT deadline, and late-work policy. Save and publish. Publishing locks the brief and notifies currently approved, verified students. Check the deadline and requirements first.

The submission tracker shows submitted/draft/changes-requested/graded/released states. Its “without a current submission” count covers currently approved, verified students, including students with drafts or requested corrections. Historical submissions by suspended students remain in instructor records. Open each student's work to review their latest submitted snapshot and older versions. Draft text remains private.

Save marks and feedback privately. Request changes instead to send correction instructions immediately and reopen that student's submission, including after the original deadline or manual closure. This is an explicit revision window with no automatic expiry. The assignment must not be archived. Resubmission preserves older versions and clears the change request.

Release graded results publishes all currently graded, unreleased submissions belonging to approved, verified students. It does not publish ungraded submissions or create grades for nonparticipants. Students get an inbox alert and score email through the existing durable outbox. Release can run again for newly graded work or restored students. Each submission's release/notification is idempotent. Released grades and feedback are immutable. The assignment need not close before releasing reviewed work.

Close submissions blocks new work and normal edits, but permits explicit correction requests. Archive stops all submissions and hides the assignment from students who never submitted; participants retain their work and released grades. Unpublished drafts can be deleted.

## Student flow

Open Assignments, read the brief, and build the project locally. Written tasks need a text response. Coding tasks require a short explanation plus a fixed GitHub commit or tree URL containing its full 40-character commit SHA. On GitHub, open the repository's commit history, select the commit, and copy its URL. Repository and branch homepages are mutable and cannot be final project submissions. Keep the repository accessible to the instructor; a pinned link cannot prevent the repository owner from deleting it.

Add up to five optional HTTPS evidence links for screenshots, recordings or live builds. The app does not fetch links, clone repositories, execute code, or upload files. Instructors open links in a separate tab. External permissions and continued availability are the student's responsibility. Direct ZIP, PDF, image and APK uploads are not implemented in this milestone.

Save draft explicitly before leaving. Drafts are not submissions. Final submission atomically records an append-only snapshot and notifies the instructor. An exact retry after a lost submission acknowledgement returns the existing committed version. Optimistic revisions reject stale tabs. Before the deadline, ungraded submitted work can be explicitly returned to draft, edited, then submitted again; the earlier snapshot remains. While it is a draft, it does not count as submitted and cannot be graded. Once grading starts, only an instructor correction request permits changes.

Marks, grading feedback, and the private grading state are omitted or masked from student HTML and JSON until release. A correction request's feedback is intentionally visible immediately. No aggregate quiz/assignment score is calculated.

## Data and checks

Assignment, AssignmentSubmission and AssignmentVersion have no foreign key to Quiz. Unique assignment/student and submission/version constraints prevent duplicate current records and snapshots. Assignment row locks serialize lifecycle changes, submissions, marking and release; roster locks serialize student writes with access revocation. Database time enforces deadlines. Submitted versions and released grades have database immutability guards; grade values cannot exceed the assignment maximum. Services enforce authenticated roles, approval, ownership, lifecycle and revisions. Routes additionally enforce same-origin JSON mutations and bounded strict schemas. Private routes use no-store; the existing service worker never caches these pages or records.

The existing notification delivery limits/retry semantics still apply; see NOTIFICATIONS.md. Provider acceptance does not prove inbox arrival. No new scheduler, paid service, storage provider, AI grader or executable-code sandbox is introduced.

Synthetic integration checks cover independence from quizzes, access boundaries, hidden drafts/grades, duplicate submissions, stale revisions, pinned project links, late/closed work, corrections, history, release targeting and notification deduplication. The browser journey covers instructor publication, student draft recovery/submission, requested corrections, private marking, released feedback, notifications and mobile alignment. No real student accounts or messages are used in automated tests.
