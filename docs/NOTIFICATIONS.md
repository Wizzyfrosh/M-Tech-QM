# Activity notifications

The bell in the workspace opens a private paginated inbox with unread badges, individual read receipts and mark-all-as-read. A verified student awaiting approval can also open Notifications from the waiting screen. The bell refreshes on focus and every minute while visible. This is an in-app inbox, not operating-system push notifications.

Events:
- New student registration: instructor inbox and email, linking to Students. The student must verify their email before approval.
- Verified registration: separate deduplicated instructor approval-ready alert.
- Approval, restoration or removal of access: student inbox and email. Removed users cannot sign in; the email tells them to contact the instructor.
- Published quiz: inbox and email to currently approved, email-verified students only.
- Released results: inbox to approved participants only. The existing score-email workflow sends the email once; the new inbox does not send a second result email.

No historical alerts are backfilled on deployment. Publishing/approval/result alerts are committed in the same transaction as their activity. Signup hooks enqueue registration alerts after creation. Event keys prevent duplicate recipient/event rows. Inbox reads and read receipts always scope to the session user; IDs from clients cannot change another recipient’s messages.

The Notification table doubles as a durable email outbox. After-response processing claims at most 100 pending messages per invocation, in groups of 20 concurrent sends. Each send has a stable provider idempotency key, individual recipient, and ten-second timeout. Recipient eligibility is rechecked before delivery. Delivery is attempted after relevant mutations and inbox reads; remaining pending messages recover on the next such request. This targets the existing approximately 100-student community and is not a guaranteed background scheduler for larger cohorts.

SENT means provider acceptance, not inbox delivery. FAILED can be retried explicitly by the instructor from Notifications. UNKNOWN or interrupted SENDING require checking provider logs before any manual recovery; they never auto-retry and risk duplicate mail. File mail is restricted to non-production tests. Logs never include recipient identities, credentials or message bodies.

Validation uses synthetic accounts, transactional recipient selection tests, private inbox/read receipts, duplicate delivery protection, revoked-recipient checks, and browser registration/inbox/publication flows. Production deployment does not send test messages to real students.
