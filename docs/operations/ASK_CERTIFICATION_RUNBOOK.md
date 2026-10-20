# Ask Cozy: certification and operations runbook

Sole Homeowner Interface, Phase 9. How to run the certification checks, what they prove and do not prove, the manual pass that automation cannot replace, and what to do when something in the interface degrades.

## 1. What is automated, and where it runs

| Check | Command | Needs | Proves |
| --- | --- | --- | --- |
| Backend contracts and drills | `cd apps/backend && node --test tests/ask/askPhase9Drills.test.js tests/ask/askMutationImpactRegistry.test.js tests/ask/askIntake*.test.js` | nothing | provider time limits, model-independence of every destination, reconciliation rules |
| Production-like database | `cd apps/backend && scripts/certification/scratch-db.sh start`, then `ASK_CERT_DATABASE_URL=... npm run certify:ask-db` | local PostgreSQL 15 | authorization, paging, reconciliation, export, retention, intake and notifications against real SQL; latency and payload budgets |
| Browser: accessibility, journeys, offline | `cd apps/frontend && npm run test:ask-certification:e2e` | Chromium and WebKit installed by Playwright | WCAG 2.2 AA rules (axe), reflow at 200% and 400%, reduced motion, keyboard reach, dialog focus, announced failures, the notification, search, record, viewer, add-a-file and offline journeys |

The scratch database script never touches another database: the certification tests refuse any URL that is not a local database whose name contains `cert`. Stop it with `scripts/certification/scratch-db.sh stop`.

To refresh the browser fixtures after a contract change, with the scratch database running:
`ASK_CERT_DATABASE_URL=... node scripts/certification/captureAskContracts.js ../frontend/e2e/ask-certification/contracts`
A changed JSON file is a changed contract; review it like code.

## 2. Performance budgets

Budgets live in `apps/backend/src/services/ask/governance/askPerformanceBudgets.ts` and are PROPOSED until an owner approves them (`approvedBy`). Measure them on the hardware that matters:

1. On the Raspberry Pi, restore a copy of the production database into a scratch database named with `cert`.
2. `ASK_CERT_DATABASE_URL=... ASK_CERT_RUNS=50 npm run certify:ask-db` prints p50, p95 and payload per destination.
3. If the Pi misses a budget, either raise the budget deliberately (and say why) or fix the read. `ASK_CERT_BUDGET_FACTOR=2` scales latency budgets for a slower machine; use it only to find out by how much a budget is missed, never to certify.
4. Record the approved numbers and the run in the plan document, then set `approvedBy` and `approvedAt`.

Browser budget: destination chrome (header and navigation) must not wait for slow data; `journeys.spec.ts` serves a 3-second data delay and asserts the chrome appears within the budget and a loading state is announced.

## 3. Manual pass (required before a retirement decision)

Automation finds a class of defects. It cannot tell whether a screen reader reads a page sensibly, whether a phone is usable one-handed, or whether copy makes sense. Before any workflow is retired, a person completes this on real devices and records the result.

Devices: iPhone with VoiceOver and Safari; Android phone with TalkBack and Chrome; a desktop with a screen reader (VoiceOver with Safari, NVDA with Firefox or Chrome) and keyboard only; the browser at 200% and 400% zoom; "Reduce motion" on.

For each of the ten journeys in FRD section 19, complete it start to finish and check:
- Every control can be reached and operated, and its name says what it does.
- The order of reading matches the order on screen. Headings let you skip to Work, Record, Saved, Notifications.
- Loading, empty, partial, error and success states are announced, not only shown.
- A dialog (Search, Add a file) takes focus when it opens, keeps it inside, and gives it back to the button that opened it.
- Nothing needs voice, camera, drag, gesture, or color alone: Add a file works with the file chooser and the keyboard.
- On a phone, upload, review, confirm, receipt and reopen all complete one-handed with the keyboard open.
- Contrast holds in sunlight (brightness at maximum) and in dark mode if enabled.

Record who ran it, the date, the device and version, and every defect. A P0 or P1 defect in a retirement candidate blocks that retirement.

## 4. Four journeys that must be run with real files (Phase 7)

Fake-backed tests prove wiring, not that the readers work. With real storage, the AI reader and the OCR engine, add: an inspection PDF, an insurance policy, a receipt or invoice, and a photo of an appliance label. For each, confirm the proposed details are right, that rejecting writes nothing, that accepted details create exactly what was accepted, and that the original opens from the record. Do it once with the antivirus engine connected and once without.

## 5. When something degrades

**The AI service is unavailable.** Destinations, search, notifications, history, and every write continue: only reading a newly added file and the one open-ended guidance answer need the model. The person is told in plain words. To force the mode (a drill or an outage): `ASK_REMOTE_GENERATION_ENABLED=false`, `ASK_SEMANTIC_RETRIEVAL_ENABLED=false`, `ASK_EMBEDDING_RETRIEVAL_ENABLED=false`, `ASK_CONSTRAINED_CLASSIFIER_ENABLED=false`, then restart the API. The certification suite proves nothing else depends on the model.

**A provider is slow or down (Work, Saved, Record counts, Search).** Each provider is cut off after its limit (4 seconds; 3 for Search) and the page says which kind could not be read and that it may be incomplete. No total is claimed. Find the slow reader in the logs by the `Ask Work provider failed`, `Ask Saved type failed` or search telemetry lines, which carry `timedOut`. A page that is partial for a long time is an incident for that provider's owner.

**An answer is marked "may be out of date".** A confirmed write changed what it shows and the refresh did not complete. The write is safe. The person can choose Refresh. If many answers stay stale after a deploy, check that the API can run the operation behind them (`refreshAskExecutionDetailed` failures are logged as reconciliation warnings). Stale marks are stored in the answer's `parametersJson.reconciliation` and cleared by the next successful refresh.

**Uploads are refused with "could not be checked for malware".** The antivirus engine is configured (`CLAMAV_HOST`) but not reachable; uploads fail closed by design. Restore the daemon, or unset `CLAMAV_HOST` to fall back to the content-threat heuristics (the product then states that no antivirus engine is connected).

**Unknown outcomes.** A confirmed action whose result could not be established is reported as an unknown outcome in Work, never as a failure. The sweep is `npm run reconcile:ask-pending` (run by cron); reconcile one by confirming again, which is idempotent.

**Retention.** Expired conversations and answers are purged by the scheduled retention job; a person can delete their own conversation at any time. Notifications dismissed by a person are hidden, not deleted.

**Schema changes.** Never write a migration script. Edit `prisma/schema.prisma`, run `npx prisma db push` in `apps/backend`, and `npx prisma generate` in `apps/workers`.
