Use this quick manual test plan in prod/staging.

1) Auto-trigger (first open)

Pick a property with incomplete setup (or create a new property).
Open: /dashboard/properties/<propertyId>.
Expected: auto-redirects to /dashboard/properties/<propertyId>/onboarding.
2) Skip behavior

On onboarding page, click Skip for now.
Expected: returns to /dashboard/properties/<propertyId>.
Expected: no forced redirect now.
Expected: “Complete setup (X/5)” checklist panel is visible with Resume setup.
3) Resume behavior

From checklist panel, click Resume setup.
Expected: opens onboarding and keeps current step.
Use left rail + Next/Back; refresh browser.
Expected: step state persists.
4) Completion signal checks (real data)

Step 1: update property details in Edit page, return to onboarding, click Refresh.
Step 2: create a room, return onboarding, Refresh.
Step 3: add inventory item, return onboarding, Refresh.
Step 4: create a maintenance task (or ensure protection signal exists), return onboarding, Refresh.
Step 5: open insights/report pages and use Generate insights button if needed.
Expected: each step flips complete, score increases by 20 each.
5) Finish behavior

Complete all steps.
Click Finish setup.
Expected: status becomes completed, no more auto-redirect for that property.
Expected: checklist panel no longer shown on property dashboard.
6) Property scope validation

Repeat with two different properties (A and B).
Expected: onboarding progress/status is independent per property.
7) API smoke checks (optional via Postman/curl)

GET /api/properties/<propertyId>/onboarding/status
POST /api/properties/<propertyId>/onboarding/set-step { "currentStep": 2 }
POST /api/properties/<propertyId>/onboarding/complete-step { "step": 3 }
POST /api/properties/<propertyId>/onboarding/skip
POST /api/properties/<propertyId>/onboarding/finish
If auto-redirect doesn’t happen, most likely that property is already SKIPPED or COMPLETED. Use Resume setup (or set-step) to move it back to IN_PROGRESS.