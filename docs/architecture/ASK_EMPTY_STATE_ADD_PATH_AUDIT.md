# Ask Empty-State Add-Path Audit

**Date:** October 10, 2026
**Scope:** eight read answers whose empty or unavailable state used to say "Open it to …" and carry a link to a desktop page.
**Governing decision:** Ask never sends the homeowner to a desktop page (owner decision, October 10, 2026; Inline Workspace FRD v1.246, IW-TRAD-002).
**Related:** `ASK_COZY_INLINE_WORKSPACE_FRD.md` v1.252; `AUDIT_METHODOLOGY.md` (this document follows it).

## 1. Method and labels

Every finding is labelled **Executed** (I ran the code and read the output), **Code-traced** (I read the source and state what it does; nothing was run, and nothing here was run against a database or a browser) or **Inferred**.

- **Executed:** the current empty-state text and actions of all eight answers, printed by calling each handler's pure `…FromView` function with an empty view (a scratch script, `node` with `ts-node` transpile-only); and `tests/ask/emptyStateAddPaths.test.js` (7 tests, passing), with three mutations each caught.
- **Code-traced:** every statement about an owning service, a route, who may call it and what a start needs.
- **Inferred:** the build order in section 5 and the cost labels.

## 2. The rule applied to each answer

For each empty state: find the canonical owning service, then decide whether Ask can honestly offer **(1)** an existing confirmation-gated command, **(2)** a reusable target selector or capture flow, **(3)** a new command specific to that tool, or **(4)** only an honest explanation with no action. Not allowed: a generic command, a confirmation bypass, or a substitute capability.

## 3. Findings

| Answer | Owning service and start (code-traced) | Who may start (code-traced) | Decision |
| --- | --- | --- | --- |
| **Guidance Overview** | `guidanceJourneyService.createUserInitiatedJourney`, reached in Ask by the existing `GUIDANCE_JOURNEY_CREATE` (confirmation-gated, contributor floor, asks which recorded item or approved service the plan covers). | Contributor or owner. | **(1) Built.** The empty list offers **Start a guided plan** to a contributor or owner. A viewer is told who can start one. A started plan refreshes a still-visible list. |
| **Home Habit Coach** | `HomeHabitCoachService.generateHabits` → `generateHabitsForProperty`. Skips templates that already have an active or snoozed habit; returns nothing when the household has switched the coach off (`PropertyHabitPreference.isEnabled`); honours hidden categories. | Any property member, a viewer included, passes the route middleware (`propertyAuthMiddleware` records the role and enforces no floor), so the API is looser than Ask; an Ask command would hold the contributor floor every other Ask write holds. | **(3) Built in FRD v1.254.** One confirmed command with no form; the receipt reports how many were created and how many already existed, including none. |
| **Do-Nothing Simulator** | `DoNothingSimulatorService.run(propertyId, userId, { horizonMonths ∈ {6,12,24,36}, scenarioId? })`. Refuses when insurance records conflict (`assertCoverageConflictFree`). | The home's primary account holder only (`homeownerProfile: { userId }`), narrower than the owner role. | **(3) Built in FRD v1.254.** A primary-account-holder check in addition to the contributor floor, a horizon choice, an optional saved scenario, and the coverage-conflict refusal as an unavailable state. |
| **Service Price Radar** | `ServicePriceRadarService.createCheck`: a service category (29 are supported; the validator refuses insurance, attorney and finance), a quote amount above zero and up to $250,000, optional vendor, label and linked records; stores a check. (The first draft of this audit said four categories; that came from the answer handler's label table, which lists four, and was wrong.) | The home's primary account holder only (same ownership test). | **(3) Built in FRD v1.254.** A small form (service, amount, optional contractor and description), the controller's compliance applicability check, and the primary-account-holder check at propose and at execution. |
| **Home Continuity Plan** | Creating the plan is small: an optional title, and `getOrCreateByProperty` bootstraps the default sections with it. Content is then sections, entries and trusted contacts. | Contributor or owner. | **(4) Honest explanation.** A started but empty plan would be a half-path with no way to fill it in Ask. Filling it means putting access notes and contact details into conversation history; the read slice was built with sensitivity PRIVACY and HOUSEHOLD_SECURITY and never shows entry content (FRD v1.54). That is a product decision, not an engineering gap. |
| **Project Tracker** | `POST /projects` with `CreateProjectSchema`: contract amount and start date are required, a provider-led project needs a contractor, permit and HOA applicability each need a decision and a basis, plus funding and fulfillment modes. | Any property member through the route middleware (no floor enforced there). | **(4) Honest explanation.** It is a contract record with compliance decisions, not a small form. Offering a partial one would create incomplete project records. |
| **Negotiation Shield** | Multi-step: create a case, save its inputs, attach and parse documents, analyse; plus a separate buyer path that starts from inspection findings. | Any property member through the route middleware (no floor enforced there). | **(4) Honest explanation.** The documents and per-scenario inputs make it more than one confirmed write. A buyer-case start from inspection findings is the one narrow candidate and belongs with the buyer inspection commands. |
| **Around Your Home** | A read of reviewed local sources and their coverage of the home; no homeowner-created records. | Read only. | **(4) Nothing to add.** The answer describes coverage and offers no action; it promises nothing Ask cannot do. |

## 4. What changed in this round

- Empty and unavailable states of all eight answers no longer invite "open it", carry no link, and offer no action except Guidance Overview's start. Where Ask cannot do the thing, the text says so plainly ("Ask cannot run a check yet", and so on). **Executed** (text printed; tests below).
- Two stale statements were corrected: Guidance Overview's boundary said completing, skipping or dismissing a step "happens on Guidance Overview" although Ask has handled those since the journey-continuation phases; Do-Nothing said a saved scenario was "ready to run" and to "open the simulator". **Code-traced** against the handlers before the change.
- `GUIDANCE_JOURNEY_CREATE` now declares `GUIDANCE_JOURNEYS_LIST` as the sibling it refreshes. The old comment said no such read existed; the list read exists. **Code-traced.**
- **Executed:** `tests/ask/emptyStateAddPaths.test.js`: all eight empty states link nowhere, invite no page and carry no action; the six "cannot yet" answers say so; the primary-owner-only and coverage-conflict states are blocked explanations with no action; the Guidance start is offered to contributor and owner and not to a viewer, is applicable for those roles and refused for a viewer; starting asks what to cover and writes nothing; naming an item gives a review card; confirming writes once with that scope and the execution id; a stale scope is refused; an invalid stored input is refused; the cancellation copy is declared. Mutations caught: a viewer given the start, a price-radar empty state that invites a page again, the stale-scope check removed.

## 5. Build order (items 1 to 3 built in FRD v1.254)

1. **Home Habit Coach generate** — no form; the receipt's honesty about "created 0" is the main design point.
2. **Do-Nothing run** — adds the primary-account-holder check, a horizon choice, an optional saved-scenario choice and the coverage-conflict refusal.
3. **Service Price Radar check** — a small form and the same primary-account-holder check; build the check once and reuse it for both tools.
4. **Product decisions needed first:** whether the Home Continuity Plan may collect access notes and contacts in a conversation; whether Project Tracker should ever be started from a conversation; whether a buyer negotiation case may start from an inspection finding in Ask.

## 6. What was not verified

- Nothing was run against a database, a real home, or a browser. The Guidance start's clarification card, and the new text, were not seen rendered.
- The reading that Habit Coach, Project Tracker and Negotiation Shield routes enforce no floor is from `propertyAuthMiddleware` and the route files I read; a stricter rule enforced inside a service I did not trace would change it.
- The wording "Ask cannot … yet" is engineering text; product has not reviewed it.
- The other read answers that may share this gap (those with a link removed in FRD v1.246 but not in this list) were not examined.

## 7. Revision notes

1. First draft, October 10, 2026. The adversarial pass in section 8 was run after the findings were written.

## 8. Adversarial pass (run after the draft)

The absolute-language grep from `AUDIT_METHODOLOGY.md` item 7 was run against this document. Each hit and the check made:

- "never" (Guidance boundary, entry content): checked against `homeDigitalWillCapabilitySlice.test.js`, which asserts the secret entry text, contact email, phone and relationship are absent from the answer. Holds for the read answer; says nothing about the plan page.
- "no action" for the six empty states: checked by the new test, which asserts `actions` is empty for each and that nothing matches `/dashboard/` or `"href"` in the empty block set. It does not check non-empty answers, whose item links the delivery filter removes.
- "only" in "primary account holder only": the ownership test `homeownerProfile: { userId }` appears in both services' `assertPropertyForUser`; a household member who is not the profile owner fails it. Not checked: whether a transfer of the profile exists elsewhere.
- "small" for creating a Continuity Plan: the create schema is one optional title and `getOrCreateByProperty` also creates the default sections (traced, line 438 onward); an empty plan is therefore not empty of sections, only of entries.
