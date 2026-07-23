# Property Context Platform — Just-in-Time Inline Context Capture FRD

**Version:** 1.0

**Date:** 2026-07-17

**Status:** Proposed for implementation

**Audience:** Product, design, frontend, backend, workers, data, QA, security,
content operations, and analytics

**Related documents:**

- `docs/property-context/PROPERTY_CONTEXT_FRD.md`
- `docs/property-context/PROPERTY_CONTEXT_CATALOG_GOVERNANCE_FRD.md`
- `docs/functional/ADMIN_MODULE_FRD.md`

## Implementation note — coverage intelligence slice

As of July 23, 2026, `COVERAGE_INTELLIGENCE / ASSESS_ITEM_COVERAGE` implements the relational JIT pattern for a selected inventory item. It captures item confirmation, responsibility, lifecycle/condition, coverage evidence, and financial relevance without redirecting to Property Details. The item is re-evaluated inline after save.

Coverage state remains fail-closed while required applicability or evidence is unknown. **I'm not sure** produces **Coverage information incomplete**, not a coverage gap. HOA-, landlord-, and shared-managed systems remain in the Living Home Record but do not produce homeowner coverage actions. Active coverage journeys are reconciled when current Property Context invalidates their former owner-action premise, and Unified Home only promotes journeys retained by the canonical action feed.

This note records the implemented coverage slice; the broader cross-feature FRD remains the target contract for features that have not yet adopted relational JIT capture.

---

## 1. Executive summary

ContractToCozy captures the minimum information required to establish a home
during homeowner onboarding: address, city, state, and ZIP code. A property can
then be used across maintenance, planning, protection, financial, environment,
project, and advisory tools. Many of those tools become more accurate or only
become applicable when optional property details are known.

The application shall not front-load every optional question into onboarding,
and it shall not send a homeowner to the full Property Details page whenever a
tool needs one missing fact. Instead, each property-aware feature shall declare
the facts it needs and request only the smallest useful set at the moment the
homeowner invokes that feature.

The target interaction is:

```text
Homeowner invokes a property-scoped feature
                    ↓
Backend evaluates feature requirements against current Property Context
                    ↓
       ┌────────────┼─────────────────┐
       ↓            ↓                 ↓
     Ready     Ready, but optional   Required fact missing
       ↓       facts could improve          ↓
  Run tool      Run + offer inline     Capture inline in tool
                       capture               ↓
                                      Save canonical context
                                             ↓
                                      Re-evaluate and run
```

Reusable answers shall be stored in their authoritative property-domain model,
with provenance, so all authorized features can reuse them. The feature shall
remain on the same screen, preserve user input, update without a full-page
reload, and continue automatically after a successful blocking capture.

This FRD expands Sections 13–16 of the Property Context Platform FRD. It does
not replace feature-owned applicability policy or the canonical data models.

## 2. Problem statement

### 2.1 Homeowner problem

The current experience is inconsistent when optional property context is
missing:

- some features show a generic or lower-confidence result without explaining
  what would improve it;
- some features provide a correction link or redirect to Property Details;
- some features implement a local inline question;
- supported questions and wording vary by screen;
- a redirect interrupts the homeowner's task and requires them to discover the
  relevant property field, save it, navigate back, and restart the tool;
- the homeowner may be asked for facts that do not affect the feature they are
  currently using.

The result is unnecessary onboarding friction at one extreme and an
out-of-context, disruptive correction workflow at the other.

### 2.2 Product problem

Not all missing details have the same effect:

- a **required fact** may be necessary to determine applicability, protect user
  safety, or produce a meaningful result;
- an **enhancement fact** may improve precision, confidence, prioritization, or
  explanation while still allowing the feature to run;
- an unrelated optional fact must not be requested by that feature;
- a conflicted or stale fact may require confirmation rather than initial
  capture;
- an installed item, policy, warranty, inspection, or project cannot be
  captured as a simple scalar answer and requires a small relational workflow.

Without a shared contract, each feature makes these choices independently.

### 2.3 Engineering problem

The existing shared notice and direct-capture path are a useful foundation but
are not the target architecture. The current implementation includes several
limitations to remove:

- the frontend contains a fixed set of capture questions rather than rendering
  a backend-owned capture schema;
- only the first supported missing fact is captured;
- some backend-writable fact keys have no frontend renderer, while some
  catalog-writable keys have no direct canonical write implementation;
- relational facts fall back to navigation rather than inline mini-flows;
- conflicted and stale facts are not resolved inline;
- property identity may be inferred from correction URLs rather than supplied
  explicitly;
- a successful capture can trigger a full-page reload;
- a neutral notice may appear even when the feature is already ready;
- feature requirements, prompt priority, deferral behavior, and completion
  analytics are not governed by one shared contract.

## 3. Goals and outcomes

### 3.1 Goals

- G1: Ask only for facts that the invoked feature currently needs.
- G2: Keep required and enhancement capture within the current feature screen.
- G3: Allow a feature to run when only enhancement facts are missing.
- G4: Prevent a feature from producing unsafe or meaningless output when a
  required fact is missing.
- G5: Store every reusable response in its canonical typed domain.
- G6: Reuse captured facts across all authorized features without asking again.
- G7: Support scalar, structured, and relational inline capture.
- G8: Handle unknown, stale, conflicted, and insufficient-permission states
  explicitly.
- G9: Preserve the user's in-progress feature inputs and automatically continue
  after blocking capture.
- G10: Make requirements, wording, validation, provenance, and analytics
  centrally reviewable without creating a generic runtime fact store.

### 3.2 Desired homeowner outcomes

- Onboarding remains short and focused on establishing the property.
- Optional questions appear only when their value is understandable.
- A homeowner does not have to leave a tool to supply a missing detail.
- The UI explains why a detail is needed and how it affects the result.
- “Not sure” and “Skip for now” are available whenever safe.
- A supplied detail is not repeatedly requested by other features.
- The feature updates immediately after capture without losing state.

### 3.3 Success measures

- 100% of property-aware feature entry points use the shared requirement
  evaluator before requesting missing context.
- 100% of inline captures write to a registered canonical owner.
- Zero feature flows require Property Details navigation for a supported
  required or enhancement capture.
- Zero full-page reloads are required after a successful capture.
- Zero known facts are requested again unless they are stale, conflicted, or the
  homeowner explicitly chooses to correct them.
- 100% of blocking capture flows automatically resume or re-evaluate the
  invoking feature.
- 100% of feature requirement contracts have ready, missing, unknown,
  conflicted, stale, and unauthorized tests where applicable.
- Capture telemetry contains keys and states but no addresses or raw sensitive
  values.

## 4. Scope

### 4.1 In scope

- Feature-specific required and enhancement fact declarations.
- Server-side evaluation against the current Property Context snapshot.
- Shared inline capture panel and field renderers.
- Scalar capture into canonical Property Context owners.
- Structured capture for related fields that form one meaningful answer.
- Relational mini-flows for items, systems, policies, warranties, inspections,
  permits, projects, financing, and other registered domain records.
- “Not sure,” skip, dismiss, retry, confirmation, and deferral behavior.
- Inline confirmation of stale facts and resolution of supported conflicts.
- Context cache invalidation and feature re-evaluation after capture.
- Authorization, evidence, audit, accessibility, observability, and testing.
- Migration of existing feature-specific prompts and correction redirects to
  the shared experience.

### 4.2 Out of scope

- Making every optional property detail mandatory during onboarding.
- Capturing household composition, pets, lifestyle, goals, or preferences
  without the separate personalization consent flow.
- Replacing the complete Property Details workspace.
- A generic CRUD form capable of editing every database table.
- A generic runtime fact-value table replacing typed domain ownership.
- Silent inference of an answer solely to avoid a question.
- Population learning or automatic prompt optimization before real-user data
  exists.
- Automatic acceptance of conflicting evidence when no safe precedence rule
  exists.
- Creating database migration scripts. If implementation requires schema
  changes, the Prisma schema may be updated and the database change will be
  applied by the user.

## 5. Principles

1. **Ask at the point of value.** A question is eligible only after the user
   invokes a feature whose current decision depends on its answer.
2. **Ask the minimum useful set.** Do not request every incomplete property
   fact; request only the smallest dependency set needed for the current result.
3. **Do not block for precision alone.** Enhancement facts improve a result but
   never prevent an otherwise safe feature from running.
4. **Stay in context.** Capture appears inside the invoking screen, drawer,
   modal, or step. Full Property Details is a secondary manual-edit option.
5. **Store once, reuse everywhere.** Reusable answers update canonical domain
   records and evidence, not feature-local JSON.
6. **Backend-owned decision.** The backend determines requirement state and
   validates captures; the frontend renders the returned contract.
7. **Unknown is not false.** “Not sure” never becomes `false`, zero, absent, or
   a fabricated default.
8. **Explain the benefit.** Every prompt states why the feature needs the fact
   and, for enhancement facts, what becomes more precise.
9. **Preserve momentum.** Saving context must preserve tool inputs and resume
   the intended action.
10. **No prompt loops.** Deferrals, unsupported fields, errors, and permissions
    must have deterministic terminal behavior.
11. **One fact, one capture definition.** Shared field wording, answer type,
    validation, canonical owner, and evidence behavior are registered once.
12. **Feature policy remains feature-owned.** The shared platform evaluates
    declared dependencies; it does not absorb domain calculations.

## 6. Definitions

| Term | Definition |
|---|---|
| Required fact | A fact without which the current feature cannot determine applicability, operate safely, or produce a meaningful result. |
| Enhancement fact | A fact that improves precision, confidence, ranking, or explanation but is not necessary to run safely. |
| Ready | All required facts for the requested operation are usable. |
| Ready with limitations | The feature can run, but one or more enhancement facts are unavailable. |
| Missing | No usable canonical value or evidence exists. |
| Unknown | The homeowner or source explicitly cannot provide a value; this is distinct from a negative answer. |
| Stale | A value exists but exceeded the fact-specific freshness policy for this decision. |
| Conflicted | Multiple eligible sources disagree and the catalog cannot safely choose a winner. |
| Capture definition | Registered prompt, type, validation, canonical owner, and save behavior for one fact or fact group. |
| Scalar capture | A single typed field, such as year built or heating type. |
| Structured capture | A small coordinated group of fields, such as outdoor-space presence and types. |
| Relational capture | A mini-flow that creates or updates an authoritative related record, such as an inventory item or insurance policy. |
| Deferral | A recorded decision to skip an enhancement prompt for a bounded period or until the context changes. |
| Capture session | The short-lived state connecting an invoking feature, requirements response, user answers, canonical saves, and re-evaluation. |

## 7. Personas and authorization roles

### 7.1 Primary personas

- **Homeowner:** uses tools and can capture facts for properties they own.
- **Property contributor:** may use features and edit only the fact domains
  allowed by their property role.
- **Viewer:** may use read-only features but cannot save context.
- **Administrator/support operator:** may inspect evidence and correct context
  through governed admin/support workflows, not through the homeowner inline
  experience unless impersonation is explicitly authorized and audited.

### 7.2 Authorization requirements

- Requirement evaluation must verify read access to the property.
- Each capture action must separately verify write access to its canonical
  domain; access to the feature alone does not imply edit permission.
- The backend must not trust a frontend-supplied canonical owner or write path.
- A read-only user may see why a result is limited, but must not receive an
  enabled save action.
- When the current user cannot edit a required fact, the UI shall show a
  non-looping permission state and identify an authorized household role that
  can complete it, without exposing private identity data unnecessarily.

## 8. Requirement classification and decision states

### 8.1 Requirement classification

Each feature operation shall classify dependencies as:

| Class | Blocking | Skip allowed | Typical use |
|---|---:|---:|---|
| `REQUIRED_APPLICABILITY` | Yes | Only when the feature can terminate as unknown/not applicable | Private outdoor space for an outdoor-only recommendation |
| `REQUIRED_SAFETY` | Yes | No unsafe calculation or recommendation may run | Electrical system details for a safety-specific action |
| `REQUIRED_CALCULATION` | Yes | Yes only if a clearly labeled estimate mode exists | Item age/condition for repair-versus-replace |
| `ENHANCEMENT_ACCURACY` | No | Yes | Installation year for a maintenance forecast |
| `ENHANCEMENT_PERSONALIZATION` | No | Yes and consent-aware | Optional preferences handled by Personalization, not base Property Context |

Required classification must be defensible in the feature's test matrix. A
team must not mark a fact required solely because it would be convenient to
have.

### 8.2 Standard feature readiness states

```ts
type FeatureContextReadiness =
  | 'READY'
  | 'READY_WITH_LIMITATIONS'
  | 'NEEDS_REQUIRED_CONTEXT'
  | 'CONFLICT_REVIEW_REQUIRED'
  | 'NOT_APPLICABLE'
  | 'PERMISSION_REQUIRED';
```

Rules:

- `READY`: run without prompting.
- `READY_WITH_LIMITATIONS`: run immediately; offer a nonblocking improvement
  prompt only when it will materially improve the visible result.
- `NEEDS_REQUIRED_CONTEXT`: do not execute the dependent calculation or create
  its output; show blocking inline capture.
- `CONFLICT_REVIEW_REQUIRED`: show an inline confirmation or evidence-choice
  flow if registered; otherwise provide a compact explanation and manual-edit
  fallback.
- `NOT_APPLICABLE`: explain the known reason and do not prompt for unrelated
  facts.
- `PERMISSION_REQUIRED`: explain that the property context requires an
  authorized editor; do not repeatedly reopen the prompt.

### 8.3 Missing-data precedence

For the invoked operation, the evaluator shall process facts in this order:

1. authorization failure;
2. known not-applicable decision;
3. unresolved safety-critical conflict;
4. missing/conflicted/stale required facts;
5. ready state;
6. optional enhancement opportunity.

An enhancement prompt must never obscure a known not-applicable state or a
required capture.

## 9. Feature requirement contract

### 9.1 Contract

Every property-aware operation shall register an explicit dependency contract.
Dependencies may be conditional on other known facts but must not be discovered
through frontend logic.

```ts
interface FeatureContextRequirement {
  featureKey: string;
  operationKey: string;
  policyVersion: string;
  required: FactRequirement[];
  enhancements: FactRequirement[];
  promptStrategy: 'ONE_AT_A_TIME' | 'GROUP_RELATED' | 'MINIMUM_PATH';
}

interface FactRequirement {
  factKey: string;
  class:
    | 'REQUIRED_APPLICABILITY'
    | 'REQUIRED_SAFETY'
    | 'REQUIRED_CALCULATION'
    | 'ENHANCEMENT_ACCURACY';
  when?: DeclarativeCondition;
  reasonCode: string;
  priority: number;
  acceptableStates: Array<'KNOWN' | 'VERIFIED' | 'FRESH'>;
  captureKey: string;
}
```

Example:

```ts
{
  featureKey: 'PLANT_ADVISOR',
  operationKey: 'GENERATE_RECOMMENDATIONS',
  policyVersion: '1.0',
  promptStrategy: 'MINIMUM_PATH',
  required: [
    {
      factKey: 'exterior.hasPrivateOutdoorSpace',
      class: 'REQUIRED_APPLICABILITY',
      reasonCode: 'DETERMINE_AVAILABLE_GROWING_SPACE',
      priority: 10,
      acceptableStates: ['KNOWN'],
      captureKey: 'OUTDOOR_SPACE_PRESENCE'
    }
  ],
  enhancements: [
    {
      factKey: 'exterior.hasIrrigation',
      class: 'ENHANCEMENT_ACCURACY',
      reasonCode: 'IMPROVE_WATERING_GUIDANCE',
      priority: 30,
      acceptableStates: ['KNOWN'],
      captureKey: 'IRRIGATION_PRESENCE'
    }
  ]
}
```

### 9.2 Registry rules

- Feature keys and operation keys shall be stable and reviewable in code.
- High-risk applicability and financial/safety requirements remain Git-managed.
- Runtime-admin editing shall not be permitted for required fact logic.
- Every fact key must exist in the Property Context catalog.
- Every capture key must resolve to a supported capture definition.
- Conditional dependencies must be deterministic and use allowlisted operators.
- Circular conditional dependencies must fail startup/build validation.
- A registered required fact without a writable flow or documented terminal
  state must fail the Phase 1 release gate.
- API, page, worker, report, and notification variants of the same operation
  shall reference the same dependency contract.

## 10. Capture definition registry

### 10.1 Purpose

The backend shall own a typed capture registry so frontend screens do not
duplicate prompts, enum options, validation, or canonical write routing.

```ts
interface ContextCaptureDefinition {
  captureKey: string;
  factKeys: string[];
  mode: 'SCALAR' | 'STRUCTURED' | 'RELATIONAL';
  title: string;
  question: string;
  helpText?: string;
  inputSchema: CaptureInputSchema;
  allowNotSure: boolean;
  canonicalOwner: string;
  actionKey: string;
  sensitivity: 'STANDARD' | 'FINANCIAL' | 'SECURITY';
  evidencePolicy: EvidencePolicy;
}
```

### 10.2 Supported scalar inputs

- yes/no/unknown;
- single-select enum;
- multi-select enum;
- integer and decimal with unit;
- year or complete date;
- short validated text;
- currency and percentage for registered financial facts;
- address subfields only for explicit correction, not routine tool prompts.

### 10.3 Structured capture

Related fields may be captured together when the first answer determines the
next field or when splitting them would create a confusing interaction.

Examples:

- private outdoor space → balcony/patio/yard/roof deck types;
- pool present → pool type and responsibility;
- heating present → heating type and approximate installation year;
- HOA present → association responsibility boundaries;
- roof known → material/type and approximate replacement year.

The UI shall reveal dependent fields progressively and save the group
atomically when partial data would be misleading.

### 10.4 Relational capture

Relational context must use domain-specific actions rather than a generic fact
patch. Supported mini-flows shall include, as feature adoption requires:

- select an existing inventory item or add a minimal new item;
- identify an installed system and its age/condition;
- select or add an insurance policy;
- select or add a warranty;
- select or record a relevant inspection/finding;
- select or add a project, permit, or HOA approval record;
- select or establish the current financing profile;
- select an existing maintenance completion or record a recent completion.

Each mini-flow shall collect only the fields necessary for the invoked feature.
The full domain editor remains available as a secondary “Add more details”
action after the immediate flow is complete.

### 10.5 “Not sure” semantics

- “Not sure” records an explicit unknown observation only when the catalog
  permits it.
- It shall not overwrite stronger verified evidence.
- It shall not create a negative boolean.
- A required flow may offer educational help, an estimate mode, or a safe
  terminal explanation after “Not sure.”
- The same question shall not reopen during the same feature session.

## 11. Trigger and prompt selection rules

### 11.1 Trigger conditions

Inline capture may appear only when all are true:

1. the homeowner explicitly enters or invokes a property-scoped feature or
   operation;
2. the feature has a registered requirement contract;
3. the selected property has been resolved explicitly;
4. the evaluator finds a required or materially useful enhancement dependency
   that is missing, stale, conflicted, or explicitly unknown;
5. a supported capture or terminal resolution exists;
6. the current actor may view the reason for the requirement.

Background workers and notification jobs must never open prompts. They shall
apply the same policy, suppress invalid output, and optionally deep-link the
homeowner to the relevant feature where inline capture will occur.

### 11.2 Minimum-path selection

The evaluator shall choose the smallest answer path capable of changing the
current decision. For example:

- ask whether private outdoor space exists before asking its type;
- do not ask irrigation questions if no outdoor space exists;
- select the relevant item before asking item-specific age and condition;
- do not ask roof details for a project that does not touch the roof;
- do not ask every financing field when a calculation needs only mortgage
  balance and rate.

### 11.3 Prompt ordering

Within the selected path:

1. safety-required facts;
2. applicability-required facts;
3. calculation-required facts;
4. high-impact enhancement facts;
5. lower-impact enhancement facts.

Related questions may be grouped when the capture definition declares an
atomic structured flow. Otherwise, ask one concise question at a time.

### 11.4 Enhancement frequency and deferral

- The initial release shall show at most one enhancement invitation per feature
  session unless the homeowner chooses “Improve my result.”
- “Skip for now” dismisses the invitation for the current session and records a
  bounded deferral if deferral persistence is enabled.
- A deferred prompt may reappear after its cooldown, after relevant context
  changes, or when a materially different operation requires it.
- A dismissed enhancement must not prevent feature execution.
- Product configuration may reduce prompt frequency but may not turn an
  enhancement into an unreviewed blocking requirement.

## 12. User experience requirements

### 12.1 Placement

- The completion panel shall render inside the feature's primary content area,
  immediately before the result or action it affects.
- For multi-step tools, it shall appear within the current step.
- For compact dashboard cards, the action may open a feature-scoped drawer or
  modal without navigating away.
- The user shall remain on the same route throughout capture and re-evaluation.

### 12.2 Required capture presentation

The panel shall include:

- a concise title tied to the intended task;
- why the detail is needed now;
- the registered input control;
- “Not sure” when safe and supported;
- a primary save-and-continue action;
- a non-destructive cancel/back action when the tool can terminate safely;
- progress only when more than one required step is known;
- an error state that preserves the entered answer.

Example:

```text
Tell us about the item you are evaluating

Repair vs. Replace needs the item's approximate age and condition to compare
remaining life with replacement cost.

[ Select an existing item ]  [ Add an item ]
```

### 12.3 Enhancement presentation

- The feature shall first show its available result.
- The prompt shall be visually nonblocking and labeled as an accuracy or detail
  improvement, not an error.
- It shall name the benefit, such as “Improve this estimate” or “Personalize the
  maintenance timing.”
- It shall provide “Skip for now.”
- Closing it shall not remove or disable the result.

### 12.4 Save and continuation

After a successful save, the frontend shall:

1. update or invalidate the Property Context cache for the selected property;
2. re-request feature readiness using the returned context version;
3. keep all unsaved feature inputs in memory;
4. close or advance the capture panel;
5. automatically execute the originally requested operation once required
   facts are ready, unless the user must confirm a materially changed action;
6. update explanations and confidence without a full-page reload.

### 12.5 Secondary Property Details access

The inline experience may offer “View all property details” or “Edit more
details” as a secondary action. It must not be the primary way to satisfy a
registered inline requirement. If the homeowner intentionally opens the full
editor, return navigation shall preserve the originating feature route.

### 12.6 Accessibility and responsive behavior

- Meet WCAG 2.2 AA for labels, focus order, keyboard operation, contrast, error
  identification, and status announcements.
- Moving to the next question and completing capture shall be announced to
  assistive technology without moving focus unexpectedly.
- Input purpose and units shall be explicit; placeholders shall not serve as
  labels.
- Touch targets shall meet the application's mobile standards.
- A modal/drawer implementation must trap and restore focus correctly.
- Required and enhancement status must not be communicated by color alone.

## 13. API and service contract

### 13.1 Internal evaluator

```ts
evaluateFeatureContext({
  propertyId,
  actor,
  featureKey,
  operationKey,
  operationInput?
}): Promise<FeatureContextEvaluation>
```

Feature services shall use the internal evaluator before execution. The public
API exists for the frontend view model, not as a substitute for backend policy
enforcement.

### 13.2 Evaluation API

```text
POST /api/properties/:propertyId/context/feature-requirements/evaluate
```

Request:

```json
{
  "featureKey": "REPAIR_REPLACE",
  "operationKey": "COMPARE_ITEM",
  "operationInput": { "inventoryItemId": "item-id" }
}
```

Representative response:

```json
{
  "propertyId": "property-id",
  "contextVersion": "ctx-version",
  "featureKey": "REPAIR_REPLACE",
  "operationKey": "COMPARE_ITEM",
  "readiness": "NEEDS_REQUIRED_CONTEXT",
  "reasonCodes": ["ITEM_AGE_OR_CONDITION_REQUIRED"],
  "usedFactKeys": ["inventory.selectedItem"],
  "requirements": [
    {
      "requirementId": "opaque-id",
      "factKeys": ["inventory.selectedItem.installationYear", "inventory.selectedItem.condition"],
      "classification": "REQUIRED_CALCULATION",
      "state": "MISSING",
      "capture": {
        "captureKey": "ITEM_AGE_CONDITION",
        "mode": "STRUCTURED",
        "title": "Tell us about this item",
        "question": "About how old is it, and what condition is it in?",
        "helpText": "This improves the remaining-life comparison.",
        "inputSchema": {},
        "allowNotSure": true,
        "actionKey": "CAPTURE_ITEM_AGE_CONDITION"
      }
    }
  ],
  "canExecute": false
}
```

The response shall never expose internal table names, unrestricted endpoint
paths, or authorization rules.

### 13.3 Capture API

Scalar and structured capture:

```text
POST /api/properties/:propertyId/context/captures
```

```json
{
  "requirementId": "opaque-id",
  "captureKey": "OUTDOOR_SPACE_PRESENCE",
  "featureKey": "PLANT_ADVISOR",
  "operationKey": "GENERATE_RECOMMENDATIONS",
  "expectedContextVersion": "ctx-version",
  "idempotencyKey": "client-generated-key",
  "answer": { "hasPrivateOutdoorSpace": true }
}
```

The service shall map `captureKey` to an allowlisted canonical command. It must
not accept arbitrary fact keys and values as a way to bypass domain validation.
The existing fact-key patch endpoint may remain for compatible scalar
corrections, but the shared panel shall use the capture contract.

Relational capture shall dispatch to registered domain commands, either through
the same orchestrator or a domain-specific endpoint named in an opaque action
descriptor. The client must not synthesize a domain endpoint from fact keys.

### 13.4 Capture response

```json
{
  "captureId": "capture-id",
  "contextVersion": "new-context-version",
  "updatedFactKeys": ["exterior.hasPrivateOutdoorSpace"],
  "evidenceIds": ["evidence-id"],
  "evaluation": {
    "readiness": "READY_WITH_LIMITATIONS",
    "canExecute": true,
    "requirements": []
  }
}
```

Returning the updated evaluation avoids an unnecessary race, but the feature
service must still enforce current policy when the actual operation executes.

### 13.5 Concurrency and idempotency

- Capture requests shall require an idempotency key.
- `expectedContextVersion` shall detect material concurrent context changes.
- A safe non-conflicting update may be applied and re-evaluated.
- A conflicting update shall return `409` with a fresh evaluation and preserve
  the user's unsaved answer for confirmation.
- Duplicate successful requests shall return the original logical result.
- Feature execution must not rely solely on the pre-capture evaluation.

## 14. Canonical persistence and data ownership

### 14.1 Persistence rules

- Core, location, structure, systems, safety, exterior, and responsibility
  answers update their registered typed property-domain owner.
- Inventory, coverage, warranty, inspection, project, permit, HOA, maintenance,
  and financing answers update or create their registered domain records.
- A feature snapshot or tool result must never become the source of truth for a
  reusable captured fact.
- Each capture records actor, source, capture time, feature/operation origin,
  verification state, and evidence link where supported.
- Context version and affected scopes shall advance after a material canonical
  change.

### 14.2 Proposed persistence additions

The core capture can be implemented using current canonical models and fact
evidence. Persistent cross-session deferrals may require a typed record such as:

```text
PropertyContextCaptureDeferral
- id
- propertyId
- userId
- featureKey
- operationKey
- captureKey
- deferredUntil
- reason
- lastPromptedAt
- promptCount
- createdAt
- updatedAt
```

This record stores prompt behavior, not the property fact value. A capture
session table is optional; prefer request tracing and audit events unless
reliable workflow resumption demonstrates a persistence requirement.

If these models are approved, update `schema.prisma` only during implementation.
Do not create migration scripts; the user will apply the database change.

### 14.3 Writable coverage gate

Before a capture definition becomes active:

- its fact keys must have one canonical owner;
- the command must support all declared input states;
- enum values and units must match the canonical schema;
- the capture must update evidence and context version;
- another feature must be able to observe the captured fact;
- catalog “writable” metadata must match actual command support.

## 15. Provenance, conflicts, staleness, and corrections

### 15.1 Provenance

Every inline answer shall record at least:

- `USER_REPORTED` source;
- actor and property authorization context;
- capture timestamp;
- originating feature and operation;
- verification status;
- replaced or superseded evidence relationship when applicable.

### 15.2 Stale facts

- A fact is stale only according to fact-specific freshness policy and feature
  need; structural facts such as year built do not use the same cadence as
  mortgage balance or system condition.
- A stale prompt shall show the existing value and ask for confirmation or an
  update rather than pretending the value is missing.
- Confirming an unchanged value refreshes evidence without unnecessary domain
  mutation.

### 15.3 Conflicted facts

When a supported conflict affects the operation, the inline panel shall:

- explain that available records disagree;
- show safe, homeowner-understandable candidate values and their source labels;
- allow confirmation, correction, or “I’m not sure” when permitted;
- preserve evidence rather than deleting the losing source;
- apply fact-specific precedence after confirmation.

Sensitive evidence and internal source details must not be exposed. Conflicts
that cannot be safely resolved inline shall provide a concise terminal state and
a secondary governed correction workflow.

### 15.4 Manual correction

Known facts may include a “Correct this detail” action near the explanation.
Correction uses the same capture definition, validation, authorization,
evidence, versioning, and feature re-evaluation as initial capture.

## 16. Feature-domain requirements matrix

The following matrix establishes target behavior. Exact fact keys remain
governed by each feature's reviewed dependency contract.

| Domain/tool | Example required context | Example enhancements | Capture mode | Expected behavior |
|---|---|---|---|---|
| Property workspace | Selected authorized property | Dwelling type, year built, size | Scalar/structured | Workspace opens; completeness opportunities are nonblocking. |
| Inventory and Status Board | Item identity for an item-specific action | Brand, model, age, condition | Relational | Select or add the minimum item inline; reuse canonical inventory. |
| Documents | Document type/target when filing | Related item/system/policy | Relational | Upload may proceed when classification can be deferred; unsafe association is not guessed. |
| Maintenance setup | Installed system/item and responsibility for generated work | Installation year, last service date | Relational/structured | Do not generate irrelevant owner tasks; collect missing installed-item context inline. |
| Seasonal maintenance | Presence and responsibility for a task domain | Condition or last completion | Scalar/relational | Suppress known inapplicable tasks; ask only when the current task set changes. |
| Plant Advisor | Available growing-space presence/type for outdoor recommendations | Irrigation, sunlight, climate refinements | Structured | Determine applicable recommendation surfaces first; run with limited precision when safe. |
| Risk and safety | Relevant system/presence fact for risk-specific action | Detector dates, mitigation details | Scalar/structured | Safety floor remains; missing safety-critical facts block only the dependent action. |
| Incidents and claims | Incident/property association and affected item/area | Photos, policy association, item details | Relational | Incident capture remains usable; collect only missing context needed for next claim step. |
| Coverage intelligence/options | Current coverage/policy identity for comparisons that claim to analyze current protection | Limits, deductibles, replacement details | Relational | Generic education may run; personalized gap analysis waits for minimum policy data. |
| Insurance | Policy identity for policy-specific actions | Renewal date, premium, endorsements | Relational | Select or add a minimal policy inline; full policy editing is secondary. |
| Warranties | Covered item and warranty identity for coverage checks | Terms, expiration, documents | Relational | Select/add item and warranty without leaving the tool. |
| Projects and renovations | Work scope and affected property area/item | Budget, materials, target timing | Structured/relational | Ask only dependencies relevant to the selected project type. |
| Permits | Project scope and jurisdiction derived from established address | Existing permit records | Relational | Never re-ask routine onboarding address; request correction only if invalid/conflicted. |
| HOA/association | Whether an association applies when approval/responsibility depends on it | Association rules/contact, approval record | Structured/relational | Ask association presence first; do not assume from dwelling type. |
| Inspections | Inspection/finding identity for finding-specific actions | Severity, document, remediation state | Relational | Select/add the minimal finding inline. |
| Repair vs. Replace | Target item plus enough age/condition/cost data for a meaningful comparison | Service history, efficiency, warranty | Relational/structured | Preserve calculator inputs and automatically compare after capture. |
| Capital Timeline | Capital item/system identity and expected lifecycle | Condition and replacement preferences | Relational | Build partial timeline from known items; enhancements add precision without blocking the entire tool. |
| Reserve Fund | Included capital items and financial assumptions required by selected calculation | Condition, project timing, cost refinements | Relational/structured | Clearly distinguish partial estimate from complete plan. |
| Do-Nothing Simulator | Target deferred action and baseline consequence inputs | Risk/cost refinements | Relational/structured | Block only when no meaningful scenario can be constructed. |
| Home Savings/Budget Planner | Current financial profile fields used by the selected calculation | Goals and optional preferences through consented profile | Structured | Ask only the specific financial inputs used; treat financial data as sensitive. |
| True Cost/Cost Growth/Volatility/Explainer | Target item/project and baseline cost/timeframe | Local adjustments and condition | Relational/structured | Generic benchmark can run; property-specific claims require sufficient property data. |
| Planning and neighborhood change | Selected property and valid mandatory location | Optional project/ownership/responsibility facts | Scalar/relational | Do not prompt from background jobs; deep-link to the affected feature. |
| Seller preparation | Relevant property/system/item state for a recommended action | Inspection findings, documents, project history | Relational | Produce safe general checklist, then enhance item-specific guidance inline. |
| Environment and energy | Relevant installed systems and property structure for property-specific estimates | System age, envelope details | Structured/relational | Clearly label estimates; required facts depend on claim precision. |
| Dashboard, reports, guidance | Authoritative feature output | None directly | None | Never launch a large generic questionnaire; route to a feature-scoped inline flow. |

### 16.1 Onboarding fact behavior

Address, city, state, and ZIP established during onboarding shall be reused by
all features. A feature shall not routinely ask for them again. Inline address
correction is eligible only when:

- the value is invalid or incomplete for the selected operation;
- authoritative evidence conflicts with the current value;
- the homeowner explicitly chooses to correct it; or
- a supported market-specific field was not part of onboarding and is truly
  required for the invoked operation.

## 17. Frontend architecture

### 17.1 Shared components

The target frontend shall provide:

- `ContextCompletionPanel`: shared container for readiness, rationale,
  questions, progress, save, skip, and completion;
- `ContextCaptureRenderer`: schema-driven scalar and structured input renderer;
- `InlineRelatedRecordFlow`: registry of domain-specific relational mini-flows;
- `ContextConflictResolver`: supported stale/conflict confirmation flow;
- `useFeatureContextRequirements`: evaluation, state, mutation, cache
  invalidation, and resume hook;
- `FeatureContextBoundary`: optional wrapper that prevents protected operation
  execution until readiness is satisfied.

Names are indicative; implementation may follow repository conventions while
preserving the responsibilities.

### 17.2 Frontend state requirements

- `propertyId`, `featureKey`, and `operationKey` shall be explicit inputs.
- Property identity must not be parsed from a correction URL.
- Unsaved tool inputs shall live above the capture panel or in a resumable form
  state so capture does not reset them.
- Requirement and context caches shall be keyed by property, feature,
  operation, and relevant operation input identity.
- A successful capture shall update/invalidate all affected property-context
  queries and the invoking feature result.
- The frontend shall not decide that a fact is required or map a fact to a
  database field.
- Unsupported capture definitions shall render a safe error with a trace ID and
  secondary manual-edit path, not an infinite redirect or blank screen.

### 17.3 Existing notice migration

The current Property Context notice shall be migrated rather than expanded with
more local question definitions:

1. retain it temporarily as a compatibility renderer;
2. move question schemas and writable coverage to the backend registry;
3. replace reload behavior with cache invalidation and in-place re-evaluation;
4. pass property identity explicitly;
5. add structured and relational renderers;
6. remove feature-specific missing-fact prompts and correction redirects after
   each feature adopts the shared boundary;
7. retire the compatibility notice after repository-wide usage reaches zero.

## 18. Backend architecture

### 18.1 Components

- **Feature Requirement Registry:** versioned feature/operation dependencies.
- **Requirement Validator:** startup/test validation of fact keys, conditions,
  capture coverage, and canonical ownership.
- **Feature Context Evaluator:** reads bounded scopes and returns readiness.
- **Capture Definition Registry:** prompt/input/action metadata.
- **Capture Orchestrator:** authorizes, validates, dispatches canonical commands,
  records evidence, invalidates context, and re-evaluates.
- **Domain Capture Commands:** typed mutations owned by property, inventory,
  maintenance, protection, finance, planning, and other domains.
- **Impact/Reconciliation Service:** identifies affected cached or persisted
  outputs after a fact change.

### 18.2 Enforcement

- The feature API must call its policy/evaluator immediately before producing
  or persisting dependent output.
- Workers and notifications shall use the same feature policy.
- Client readiness is advisory and cannot authorize execution.
- Capture orchestration shall use transactions when a structured or relational
  answer changes multiple records atomically.
- A canonical save failure must not advance the context version or report a
  successful capture.

## 19. Error and edge-case behavior

| Condition | Required behavior |
|---|---|
| Network failure during save | Keep answer and feature inputs; show retry; do not claim completion. |
| Validation failure | Show field-level registered error; preserve other answers. |
| Concurrent context update | Re-evaluate; merge if safe or ask for confirmation on actual conflict. |
| Property access revoked | Stop capture and feature execution; show authorization error. |
| Selected property changes | Cancel the old capture state and evaluate for the newly selected property. |
| Feature input changes dependencies | Re-evaluate requirements using the new operation input. |
| User answers “No” | Re-evaluate conditional dependencies; remove now-inapplicable follow-up questions. |
| User answers “Not sure” | Mark explicit unknown where supported and choose safe limited/terminal behavior. |
| Required capture unsupported | Fail closed for the dependent operation; provide traceable fallback and log configuration defect. |
| Enhancement capture unsupported | Run the feature without it and suppress the broken prompt. |
| Canonical write succeeds but feature rerun fails | Keep saved context; show retry for the feature only. |
| Related record already exists | Offer selection/update; do not create a duplicate. |
| Deleted/archived related record | Exclude unless restoration is an explicit domain action. |

## 20. Privacy, security, and compliance

- Property facts remain separate from optional household-profile answers.
- Household/personalization questions must use their consented profile flow,
  even when surfaced near a property tool.
- Financial and security-system captures shall use sensitivity-specific logging,
  masking, retention, and access controls.
- Do not include raw answer values, addresses, policy numbers, account numbers,
  or document contents in application logs or analytics.
- CSRF, authentication, authorization, rate limiting, schema validation, and
  audit requirements apply to every capture endpoint.
- Free text shall be minimized and sanitized; registered enums are preferred.
- Admin-configurable prompt copy must not be able to change canonical write
  routing or required policy logic.
- Evidence and audit records shall be accessible only to authorized roles.

## 21. Analytics and observability

### 21.1 Product events

Track, without raw values:

- requirement evaluation by feature, operation, readiness, and fact-state
  counts;
- prompt shown by capture key and classification;
- prompt answered, skipped, deferred, cancelled, or failed;
- time to completion and number of questions;
- feature automatically resumed after required capture;
- feature run in limited mode after enhancement skip;
- manual Property Details fallback selected;
- repeated-prompt detection;
- unsupported capture and authorization terminal states.

### 21.2 Operational metrics

- evaluation latency by requested context scopes;
- capture mutation latency and error rate by action key;
- context-version conflicts;
- reconciliation success/failure;
- registry validation failures;
- required facts with no active capture definition;
- frontend/backend readiness disagreement;
- full-page reloads or route exits during capture, expected to reach zero.

### 21.3 Initial interpretation

Until real users exist, analytics validate deterministic flows and demo
archetypes only. They must not be represented as user-learning evidence or used
to automatically change requirement priority.

## 22. Non-functional requirements

- Evaluation p95 shall remain within the owning feature's API latency budget;
  bounded context scopes and batched assemblers are required.
- Scalar capture p95, excluding third-party calls, should be under 750 ms in the
  production environment.
- Capture and feature execution shall be independently retryable.
- Registry validation shall run in CI and at application startup.
- A capture definition failure must be isolated to the affected prompt.
- The experience shall support current desktop and mobile browser targets.
- User-facing copy shall be localizable and shall not be assembled from
  sentence fragments in the client.
- Every readiness and capture response shall include a trace/correlation ID in
  error scenarios.

## 23. Testing strategy

### 23.1 Unit tests

- required versus enhancement classification;
- conditional dependency evaluation and minimum-path selection;
- known, missing, unknown, stale, and conflicted fact states;
- capture schema validation and canonical command routing;
- `false` versus unknown behavior;
- prompt priority and deferral rules;
- context-version and idempotency behavior;
- feature policy re-evaluation after each answer.

### 23.2 Contract tests

- every feature requirement fact exists in the fact catalog;
- every capture key exists and has a renderer/action;
- every writable definition maps to an actual canonical command;
- enum options, validation, and canonical schema agree;
- required contracts have a safe completion or terminal path;
- API, UI, worker, and notification consumers use the same policy version.

### 23.3 Integration tests

- capture updates canonical domain and evidence;
- a second feature observes the captured value without prompting;
- structured save is atomic;
- relational mini-flow prevents duplicate records;
- context cache invalidates and version advances;
- feature resumes without page reload or lost input;
- permission changes and concurrency conflicts terminate safely.

### 23.4 End-to-end scenarios

At minimum:

1. onboarding creates a property with mandatory location only;
2. Plant Advisor asks the minimum outdoor-space question inline;
3. “No outdoor space” changes recommendations without follow-up outdoor
   questions;
4. an enhancement is skipped and the available result remains usable;
5. Maintenance selects/adds an installed system inline and generates only
   applicable tasks;
6. Repair vs. Replace selects an inventory item, captures age/condition, and
   resumes the comparison with form inputs preserved;
7. Coverage Intelligence adds/selects a policy without leaving the screen;
8. a known canonical answer is reused by another tool;
9. a stale answer is confirmed inline;
10. a conflict is resolved while preserving evidence;
11. a viewer receives a non-looping permission state;
12. changing the selected property cancels the old capture safely;
13. a worker suppresses an invalid output and the notification deep-link opens
    the correct inline feature flow;
14. no flow redirects to Property Details as its primary completion mechanism.

### 23.5 Demo archetypes

Test at least:

- detached owner-occupied home;
- condo with association responsibility;
- townhome with private patio but shared roof;
- rental property with landlord/tenant responsibility boundaries;
- home with incomplete optional context;
- home with mature inventory and protection records;
- home with conflicted or stale system details.

## 24. Delivery plan

### Slice 0 — Inventory and contract lock

- Inventory all property-aware feature entry points and existing prompts.
- Map required/enhancement facts, canonical owners, and current redirects.
- Reconcile catalog writable flags with actual backend capture support.
- Approve standard readiness and API contracts.

**Exit gate:** No active feature requirement points to an unknown fact key or
unowned write path.

### Slice 1 — Shared scalar foundation

- Implement registries, evaluator response, capture orchestrator, and shared
  frontend panel/hook.
- Migrate currently supported scalar questions.
- Make `propertyId` explicit and remove full-page reload behavior.
- Add idempotency, context-version handling, evidence, and cache invalidation.

**Exit gate:** Existing scalar inline flows save canonically, re-evaluate in
place, and have no frontend-only question definitions.

### Slice 2 — Structured capture

- Add progressive grouped flows for outdoor, system, safety, responsibility,
  structure, and registered financial field groups.
- Implement stale confirmation and safe supported conflict resolution.

**Exit gate:** Conditional follow-up questions and atomic structured saves pass
all contract and end-to-end tests.

### Slice 3 — Relational mini-flows

- Implement shared selection shell and domain-specific creation/update actions
  for inventory, systems, policies, warranties, inspections, maintenance,
  projects/permits/HOA, and finance.
- Add duplicate detection and minimal-record validation.

**Exit gate:** A homeowner can satisfy the initial relational use cases without
leaving the invoking feature.

### Slice 4 — Feature adoption

Adopt in value/risk order:

1. Maintenance, Maintenance Setup, and Plant Advisor;
2. Risk, Incidents, Claims, Coverage, Insurance, and Warranties;
3. Projects, permits, HOA, inspections, seller preparation, and planning;
4. Repair vs. Replace, Capital Timeline, Reserve Fund, and other Phase 5
   financial tools;
5. environment, energy, dashboard, reports, and shared guidance surfaces.

For each feature, remove duplicate local capture and primary correction
redirects after the shared path passes its release gate.

### Slice 5 — Deferral, telemetry, and hardening

- Add cross-session enhancement deferral only if product behavior requires it.
- Complete accessibility, mobile, latency, observability, and failure testing.
- Audit workers and notifications for shared policy reuse.
- Retire the compatibility Property Context notice.

**Exit gate:** Repository-wide audit finds no property-aware feature bypassing
the shared requirement contract and no direct capture redirect used as the
primary flow.

## 25. Functional requirements

| ID | Requirement | Priority | Acceptance |
|---|---|---:|---|
| JIT-FR-001 | Evaluate context after a user invokes a registered feature operation. | Must | No generic optional questionnaire is shown merely because the property is incomplete. |
| JIT-FR-002 | Distinguish required and enhancement facts. | Must | Enhancement absence never blocks a safe operation. |
| JIT-FR-003 | Select the minimum conditional fact path. | Must | Inapplicable follow-up questions are not shown. |
| JIT-FR-004 | Render capture on the invoking screen. | Must | Supported flows require no route change. |
| JIT-FR-005 | Preserve feature input and resume after required capture. | Must | End-to-end tests complete without re-entry or reload. |
| JIT-FR-006 | Use a backend-owned capture schema and allowlisted action. | Must | Frontend contains no canonical field-routing logic. |
| JIT-FR-007 | Persist reusable answers to canonical typed owners. | Must | Another feature reads the answer from Property Context. |
| JIT-FR-008 | Record provenance and advance context version. | Must | Evidence and version tests pass for every capture action. |
| JIT-FR-009 | Support scalar, structured, and relational modes. | Must | Registered examples in all three modes pass. |
| JIT-FR-010 | Support explicit unknown without treating it as false. | Must | Unknown fixtures never produce negative confirmed facts. |
| JIT-FR-011 | Confirm stale facts inline when the operation needs freshness. | Must | Existing value is displayed for confirmation/update. |
| JIT-FR-012 | Resolve supported conflicts inline and retain evidence. | Must | Confirmation does not delete conflicting evidence. |
| JIT-FR-013 | Enforce read and write authorization independently. | Must | Viewer cannot save; contributor is limited by domain permission. |
| JIT-FR-014 | Re-enforce feature policy server-side at execution. | Must | Forged client readiness cannot run an invalid operation. |
| JIT-FR-015 | Prevent duplicate and repeated prompts. | Must | Known fact and same-session unknown/skip are not immediately re-asked. |
| JIT-FR-016 | Provide a secondary full-editor option. | Should | Homeowner can choose deeper editing without it being required. |
| JIT-FR-017 | Apply the same policy to workers and notifications. | Must | Background paths suppress invalid output and never attempt UI capture. |
| JIT-FR-018 | Exclude raw private values from logs and analytics. | Must | Security/log inspection finds keys and states only. |
| JIT-FR-019 | Meet WCAG 2.2 AA and mobile requirements. | Must | Accessibility and responsive test gates pass. |
| JIT-FR-020 | Validate registry coverage in CI/startup. | Must | Unknown facts, actions, renderers, and circular dependencies fail validation. |
| JIT-FR-021 | Reuse mandatory onboarding location facts. | Must | Address fields are not routinely requested by downstream tools. |
| JIT-FR-022 | Keep household facts in the consented Personalization flow. | Must | Property capture cannot write optional household answers. |

## 26. Acceptance and release gates

The initiative is complete only when:

- every active property-aware feature/operation has a reviewed context
  requirement contract or an explicit “no additional context” disposition;
- every declared capture has canonical ownership, validation, authorization,
  evidence, and a tested renderer/domain action;
- required versus enhancement classification has product and domain approval;
- all supported required and enhancement flows remain on the invoking screen;
- tool state survives capture and completion requires no full-page reload;
- scalar, structured, relational, stale, conflict, unknown, permission,
  concurrency, and retry scenarios pass;
- API, workers, notifications, dashboard/report consumers reuse feature policy;
- manual Property Details navigation is secondary and never the only supported
  completion path;
- analytics and logs contain no raw sensitive capture values;
- duplicate legacy prompts, correction URL parsing, and compatibility-response
  capture behavior are removed;
- database documentation reflects any approved schema updates and no migration
  scripts are added.

## 27. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Features over-classify facts as required | Product/domain review plus a mandatory limited-mode justification test. |
| Prompt fatigue moves from onboarding to tools | Minimum-path selection, one enhancement invitation, deferral, and prompt analytics. |
| Generic capture corrupts domain data | Allowlisted capture definitions and domain-owned commands. |
| Relational mini-flows become full editors | Enforce minimum fields and provide deeper editing only after completion. |
| Frontend/backend requirements drift | Backend-owned registry and contract validation. |
| Captured data becomes stale | Fact-specific freshness, confirmation, and evidence policies. |
| Conflicts are silently overwritten | Explicit conflict state, source-aware confirmation, and retained evidence. |
| Required prompt blocks forever | Every required contract must have a supported capture or safe terminal path. |
| Feature state is lost | Feature state ownership above the capture boundary and end-to-end resume tests. |
| Excessive context queries hurt performance | Operation-specific bounded scopes and batching. |
| Sensitive financial/security values leak | Sensitivity classification, masking, least privilege, and value-free telemetry. |

## 28. Decisions and open questions

### 28.1 Decisions made

- Mandatory onboarding remains limited to the facts needed to establish the
  property, including address, city, state, and ZIP.
- Optional property facts are captured just in time by the feature that can
  immediately use them.
- Inline capture is the primary experience; Property Details is secondary.
- Required and enhancement facts have different blocking and skip behavior.
- Reusable answers are stored canonically and shared across features.
- Feature requirement logic and canonical write routing are backend-owned and
  Git-reviewed.
- Scalar, structured, and relational capture are all required for full platform
  coverage.
- Workers and notifications apply policy but never initiate interactive capture.
- No database migration scripts will be created by engineering for this work.

### 28.2 Decisions to finalize during Slice 0

- Which financial fields require step-up authentication or additional masking.
- The initial cooldown for a cross-session enhancement deferral.
- Whether capture copy is code-managed initially or editorially managed with
  locked input schema/action metadata.
- Which conflict types are safe for homeowner self-resolution.
- Whether an explicit unknown observation expires and, if so, by fact category.
- The exact collaborator-role matrix for each canonical capture domain.
- Which existing related-record forms can be safely embedded versus requiring
  purpose-built minimal flows.

These choices may tune behavior but do not change the core requirement that a
feature capture only the optional details it needs, inline, at the point of
value.
