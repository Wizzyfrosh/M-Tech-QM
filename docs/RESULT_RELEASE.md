# Instructor-controlled results

Students submit one official attempt. The server calculates the immutable grade, but the submission response, result page, history API and student leaderboard hide scores and correctness until `Quiz.reviewReleasedAt` is set. Legacy review modes no longer bypass this release gate. An existing result which has already been seen cannot be made unseen; all currently unreleased quizzes follow the new gate.

The instructor closes the quiz (or waits for its deadline), reviews submissions in Results, and confirms Release results. Release takes the same quiz row lock as submission and closure. It is idempotent, records an audit event, sets the release timestamp, and queues personalized notifications transactionally. Only verified, currently ACTIVE students with a SUBMITTED attempt are recipients. Pending, suspended, unverified and non-participating students are excluded. Access is checked again before sending. Ranking opt-out does not suppress a student's private result email.

Each batch contains at most 1,000 separate Brevo message versions, each with one recipient, their own score/percentage and an authenticated result link. Recipients cannot see other students' addresses or scores. Development uses synthetic file mail. Delivery runs after the response, keeping release responsive. Up to five batches are processed per invocation; pressing the release/retry control again continues queued batches without releasing twice.

The batch ledger prevents concurrent workers claiming the same pending batch. Brevo receives a stable UUID idempotency key. A known rejection is FAILED and may be retried explicitly; a network/5xx uncertainty is UNKNOWN and requires provider-log review before any resend. Interrupted SENDING jobs likewise require investigation. These ambiguous sends are not blindly retried because provider idempotency expires. SENT means provider acceptance, not guaranteed inbox placement. Release remains visible in the app even if email delivery fails. The instructor report displays delivery status and a refresh control.

Removing app access suspends the roster entry and revokes sessions while preserving historical results. Restore is an explicit instructor action. This is not destructive account/data deletion.

Navigation now has a loading boundary and pending-link feedback; independent dashboard count queries execute in parallel. Hosting/database cold starts and network latency still require production measurement before promising a response-time target.
