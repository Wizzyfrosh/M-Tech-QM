# Installable web app

The manifest at `/manifest.webmanifest` defines a standalone M Tech QMS application. `/install` provides browser installation controls when supported and instructions for iPhone, Android and desktop browsers. Installation eligibility and native prompts depend on the browser. Apple touch icons and portrait startup images cover common iPhone/iPad sizes; all devices also receive the responsive in-app launch screen. The screen clears on hydration, honors reduced motion and has a CSS fallback if JavaScript fails.

The service worker caches only `/offline.html`, the public M Tech Hub logo and the 192/512 PNG icons. Navigations always use the network; failed navigations show a generic offline recovery document. Authentication, API responses, quizzes, private HTML, RSC payloads, scores and answers are never stored in Cache Storage. Quiz saves and submission require server confirmation. Unsaved choices remain in page memory only.

Worker updates wait until old windows close, or the user explicitly chooses Update on the install page. Updates never automatically reload an active quiz window.

HTML responses use a fresh CSP nonce, strict-dynamic, frame restrictions and private/no-store caching. The worker has its own restricted policy and is served without HTTP caching. Existing route-level authorization remains the access boundary.

Validation commands: lint, typecheck, npm test, npm run build, npm run test:pwa, npm run test:e2e. PWA checks run against a production build on localhost and exercise assets, CSP enforcement, responsive widths, offline recovery and cache privacy. The full application browser suite uses disposable synthetic accounts and file mail. Native installation and OS splash rendering still need a physical iPhone/Android acceptance check; desktop browser automation cannot prove every operating system's installer behavior.

Production readiness also requires a successful deployment and live smoke checks, backup/restore rehearsal, retention/support procedures and a hosted staging load test. Passing these automated checks does not establish universal security or production capacity.
