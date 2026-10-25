# Property Tax: appeal evidence and document intake in Ask — design

**Status:** Decisions D-T1 to D-T8 ruled by the owner on October 13, 2026 (§7, which supersedes §4 and the parts of §3 it amends). All four slices are built: 1 (URL evidence parity, FRD v1.367), 2 (Home Record evidence, v1.368), 3 (record links and purge behaviour, v1.369) and 4 (intake from a Home Record, one transaction, v1.370).
**Date:** October 13, 2026
**Scope:** What it would take for Ask to (a) record the appeal evidence that a reviewed ground requires and (b) turn a tax notice or bill that is already a Home Record into confirmed canonical tax facts, and what has to change on the desktop and in the services to make that safe.
**Not in scope:** Comparables (shipped, FRD v1.355), the appeal case lifecycle (shipped, v1.322), the homeowner-reported values path (`POST …/property-tax/record/homeowner`, §1.6), homeowner actions (`PUT …/actions/:actionId`), AI extraction of tax documents, and the Renovation project handoff.
**Governing documents read for this design:** `docs/product/PROPERTY_TAX_AND_TAX_APPEAL_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md` (§9.2, §9.9, PTA-012, Slices 4 and 5), `docs/architecture/QUOTE_COMPARISON_HOME_RECORD_IMPORT_DESIGN.md` (the confirmation contract and purge pattern this design reuses), `docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md` v1.322, v1.350, v1.355, v1.358, and `docs/architecture/AUDIT_METHODOLOGY.md`.

## How claims are labelled

Every statement about existing behaviour is **code-traced** (read in the source, file and function named, not run), **executed** (run, with the command) or **inferred**. Only one claim is executed (§1.5, the URL check). No database, browser or live model was used. Statements about what the design would do are decisions, not facts.

## 0. Summary of what the audit found

**Homeowner-facing coverage boundary.** A Home Record or homeowner-confirmed tax fact does not satisfy the official-assessment-match requirement used to select reviewed jurisdiction rules. When that match or a current rule profile is unavailable, Ask must say that Cozy manages the official match and rule activation and that there is no homeowner setup step. It may direct the homeowner to verify the assessed value, deadline, eligibility, evidence standard, and form with the local assessor, but it must not offer evidence, document, comparable, or case actions that cannot unlock the unavailable rules.

1. The register's description of this item ("needs a record picker and the reviewed rule's evidence shape") is partly wrong. **The desktop never attaches a document as appeal evidence**: its form requires a source URL and sends no `supportingDocumentId` (§1.3). A Home Record picker is therefore a new capability on both surfaces, not parity. The parity gap is narrower: Ask cannot record the three URL-based evidence shapes the desktop can.
2. **Tax document intakes already live in Home Records** (the intake's `documentId` is a `PropertyRecord`), but the only way to create one is to upload a new file in the Property Tax tool. A tax notice already in Home Records cannot be used, and Ask cannot upload, so Ask has no path at all (§1.2).
3. Two defects that exist today and would be inherited, not introduced, by Ask: the route accepts any URL scheme for evidence (§1.5), and the desktop TAX_CLASS form saves `officialRecordMismatch: true` without asking the person (§1.3).
4. Deleting the source record silently removes the intake and the document links but keeps canonical records marked `HIGH` confidence; nothing in Home Records' deletion impact mentions them (§1.7).
5. A readiness gap the desktop form cannot close: the assessed-value ground requires a canonical `valuationDate`, and the desktop document form has no field for it (§1.4).

## 1. What exists today

### 1.1 Access (code-traced)

Every route in `propertyTax.routes.ts` that touches intakes or evidence uses `authenticate`, `restrictToHomeowner`, `propertyAuthMiddleware`, and (for writes) `requireHouseholdRole('CONTRIBUTOR')`. The services then re-check ownership with `property.homeownerProfile.userId === userId` (`PropertyTaxDocumentIntakeService.createVaultIntake`, `list`, `stageManualFields`, `confirm`; `PropertyTaxRuleService.getForProperty`, which `upsertEvidence` calls first). So the effective floor is the **property's primary account holder**, matching the Ask appeal command (v1.322). A contributor who is not the primary holder passes the route and is refused inside the service with a plain `Error('Property not found')`, not an `APIError`; how that surfaces to the client (status code) was not traced.

### 1.2 Intakes (code-traced: `propertyTaxDocumentIntake.service.ts`, `propertyTax.controller.ts`)

- **Create** (`createVaultIntake`): requires `privacyConsent`, creates a Home Record through `homeRecordsService.create` with `recordType: 'TAX_DOCUMENT'`, `sensitivity: 'FINANCIAL'`, `visibility: 'HOUSEHOLD'` from an **uploaded file**, then a `PropertyTaxDocumentIntake` (`status: UPLOADED`, `extractionMethod: MANUAL`, consent version `property-tax-vault-v1`). The record create and the intake create are two separate steps (the intake is in a `$transaction`, the record is created before it). If the intake write fails, a Home Record exists with no intake. Not a data-loss path, but an orphan.
- **Stage** (`stageManualFields`): up to 20 typed fields, one upsert per field in a transaction, intake becomes `NEEDS_REVIEW`. Re-staging replaces earlier values and resets decisions.
- **Confirm** (`confirm`, one transaction): needs a decision for every staged field; a corrected value is allowed; creates (or reuses) a jurisdiction and a document-matched parcel, creates an assessment and/or bill record with `sourceType: DOCUMENT`, `confidence: 'HIGH'`, the document links, one `PropertyTaxFieldEvidence` row per field, marks the Home Record `verificationStatus: VERIFIED` with the confirming user, emits a `PropertyChange`, and marks the intake `CONFIRMED`. A second confirm of a confirmed intake returns it unchanged (idempotent by status).
- `documentId` is `@unique` on the intake (schema, code-traced), so a record has at most one intake.
- Schema relations to the record: intake `onDelete: Cascade`; assessment-document and bill-document links `onDelete: Cascade`; field-evidence `sourceDocumentId` `onDelete: SetNull`; appeal-evidence `supportingDocumentId` `onDelete: SetNull`.

**Governing-document check.** The plan's Slice 4 says the initial intake shipped "in privacy-preserving manual-review mode; no tax document is sent to an AI provider" and PTA-012's acceptance is "No extracted field becomes evidence without homeowner confirmation or qualified official match." Both hold for this path: values are typed by the person, and nothing is extracted. §9.2 of the plan says user input "is not automatically high-confidence official evidence", while `confirm` writes `confidence: 'HIGH'` for document-confirmed values. That is the plan's own "document-confirmed" label (Slice 4) and is not changed here, but it is worth the owner knowing that Ask's confirmation would produce the same `HIGH`.

### 1.3 Appeal evidence (code-traced: `upsertEvidence`, `evaluate`, `PropertyTaxClient.tsx` `saveAppealEvidence`)

- The API takes `evidenceKey`, `ground`, `type` (FACTUAL_ERROR, CONDITION, EXEMPTION_DECISION, SUPPORTING_DOCUMENT), `title`, `description`, `facts` (an unvalidated string-keyed record), `sourceUrl`, `supportingDocumentId`. It requires reviewed rules covering the property and the ground to be one the rule lists, resolves `supportingDocumentId` through `assertPropertyDocumentsExist` with the caller's household role, and upserts on `(propertyId, evidenceKey)` with `confirmedAt = now`. **Saving is confirming**: there is no unconfirmed state.
- Readiness consumes it as follows. TAX_CLASS needs a `FACTUAL_ERROR` row with string `claimedClassification`, `officialRecordMismatch === true` and a source. EXEMPTION needs an `EXEMPTION_DECISION` row with string `programName`, string `noticeDate`, a `decisionType` in the rule's accepted list and a source. Any `CONDITION` row without a source is a gap. ASSESSED_VALUE uses comparables, not evidence rows. "Has a source" is `sourceUrl || supportingDocumentId`; it does not look at what the document is.
- The desktop form always uses `evidenceKey = <ground>-primary`, so one evidence row per ground, and saving again replaces it. It requires a non-empty source URL and **never sends `supportingDocumentId`** (grep of `PropertyTaxClient.tsx`: the only evidence call is `savePropertyTaxAppealEvidence` with `sourceUrl`). For TAX_CLASS it sends `officialRecordMismatch: true` as a constant: the person is never asked whether the official record differs. Facts for CONDITION are a single `conditionAsOfValuationDate` string copied from the description.

### 1.4 What the desktop document form can and cannot supply (code-traced)

The desktop "confirm facts" step offers tax year, parcel id, assessed value, taxable value, bill amount, classification and exemptions (seven of the fifteen fields the stage route accepts). It then stages and confirms all of them as `CONFIRMED` in two consecutive calls. It has no field for `valuationDate`, `assessmentRatio`, `stage`, `effectiveTaxRate`, `billNumber`, `issueDate` or `dueDates`. The assessed-value ground's reviewed requirement lists `totalAssessedValue`, `valuationDate` and `classification` as canonical fields, and readiness emits "Confirm the canonical valuationDate field." when it is unknown. The homeowner-values route and its client input type accept `valuationDate` (`homeownerRecordSchema`; `HomeownerPropertyTaxRecordInput`), but `PropertyTaxClient.tsx` has no reference to `valuationDate` at all, so the page never sets it. Whether an official-source observation commonly supplies it was not examined. So for a property with no official source, **the desktop may name a gap it gives the person no way to close** (inferred from the above; not run).

### 1.5 URL scheme (executed)

The evidence and comparable routes validate `sourceUrl` with `z.url().max(2000)`. Executed in `apps/backend` (zod 4.1.12): `z.url().max(2000).safeParse(...)` returns success for `https://example.com/a`, `ftp://x.y/z`, `javascript:alert(1)` and `data:text/html,x`. The property-tax page renders hrefs only for observation and source-record URLs, which come from source ingestion, not from this field (lines 1379 and 1410). **Not traced:** whether the appeal packet or any export renders an evidence or comparable `sourceUrl` as a link. Until that is traced, accepting a non-http(s) scheme is a latent risk, not a demonstrated one.

### 1.6 Neighbouring paths this design does not touch (code-traced)

`POST …/property-tax/record/homeowner` records typed values without a document, and homeowner actions record decisions. Neither is in the register item. Ask has neither. They are listed so the owner can ask for them separately; building evidence and intake without them does not depend on them.

### 1.7 Deletion and purge (code-traced)

No code in `services/propertyTax/` creates a `PropertyRecordLink` (grep returned none). Home Records' `deletionImpact` is computed from `record.links`, so a tax record that backs an intake, canonical assessment and bill records, and appeal evidence shows **no active links**. Deleting it cascades the intake and the assessment/bill document links away, and sets the evidence and field-evidence document references to null. Canonical assessment and bill records remain with `confidence: 'HIGH'` and `sourceType: DOCUMENT` but no document. Appeal evidence that cited only the document falls back to "no source" at the next readiness evaluation, which is the correct visible outcome. Whether the Home Records trash flow warns about tax intakes some other way (for example through the promotion-adapter registry's notes) was not traced.

## 2. Outcomes required, and what is only one way to get there

Requirements:

- **R1.** From Ask, the primary owner can record the appeal evidence the selected ground needs, in exactly the shapes readiness consumes, with a source the household can later see.
- **R2.** From Ask, the primary owner can turn a tax notice or bill that is already a Home Record into confirmed canonical tax facts, without uploading it again.
- **R3.** No value becomes confirmed that the person was not shown. Ask never claims to have read the document.
- **R4.** A non-owner is told why, before a form, and nothing is stored.
- **R5.** Everything Ask stores, the desktop can show and replace, and the reverse.
- **R6.** Removing the source document leaves a visible, correct state.

Mechanisms (candidates, §3): where evidence keys come from, how a Home Record becomes an intake, whether the desktop changes with it, and how purge is handled.

## 3. Design

### 3.1 Evidence (R1, R3, R5)

**Implementation note (slice 1):** evidence is a second kind of record handled by the existing `PROPERTY_TAX_COMPARABLE_COMMAND` operation (its own declared messages, capture key and confirmation parameters), not a new operation, to avoid a fourteen-file registry change for no behavioural difference. The command is confirmation-gated, contributor floor at the framework with the primary-owner check in the handler, and declared-action only.

- **Shape follows the ground, corrected October 13 (§7).** TAX_CLASS → a `FACTUAL_ERROR` row (claimed class plus an explicit yes/no "the official record shows a different class"); EXEMPTION → an `EXEMPTION_DECISION` row (program, decision from the rule's accepted list only, notice date). **ASSESSED_VALUE needs no evidence row**: readiness requires canonical assessed-value facts (including `valuationDate`), an assessment ratio and effective tax rate, and qualified comparables (code-traced, `evaluate`). Its normal action is **Add a comparable sale** (shipped). `CONDITION` is optional supporting evidence on any ground whose only validation is that it carries a source; it is offered as a separate optional action and never described as satisfying a ground. A ground the rule does not list is not offered. (An earlier draft of this section mapped ASSESSED_VALUE to a condition description; that was wrong.)
- **Key:** `<ground lower case>-primary`, the desktop's key, so there is one row per ground and Ask replaces what the desktop saved and the reverse (R5). The review shows the earlier values beside the new ones when a row exists.
- **Source:** exactly one of an `https` URL or a Home Record (D-T2). A Home Record is the new capability; the URL is the parity.
- **The mismatch statement is asked, not assumed.** `officialRecordMismatch` is stored as `true` only when the person answers yes. A "no" refuses the evidence with the reason (nothing supports a factual-error claim), because readiness would otherwise record a ground that does not hold.
- **Review and confirmation:** lists every fact, the source and whether it replaces an earlier row; says saved evidence counts as confirmed (as it does on the desktop), that Ask did not read the document, and that nothing is filed. The confirmation is bound to the existing row's id and `updatedAt` (or its absence) and to the rule profile id, so a rule release or a desktop edit in between stales it.
- The write is `propertyTaxAppealReadinessService.upsertEvidence`, the route's own call.

### 3.2 Intake from a Home Record (R2, R3)

The required outcome is "a tax document on file becomes confirmed tax facts". Two mechanisms were considered.

**Option A (recommended): a new service method `createIntakeFromRecord`.** It takes `{ propertyId, userId, role, recordId, kind, privacyConsent }` and: requires the primary owner (as every method here does); resolves the record through the shared property-document resolver for the role and requires an active Home Record of type `TAX_DOCUMENT` (D-T3 asks whether other types may be used) whose current version has a clean scan; refuses a record that already has an intake by returning that intake (the `documentId` unique makes this exact, so the call is idempotent); creates the intake as `createVaultIntake` does but without creating a record, in one transaction. Ask offers it as a form step before the facts form.

- For: no duplicate upload, no orphan record, and the desktop can offer "use a document already in Home Records" with the same method. It is also the only way for Ask to reach an intake at all.
- Against: a new service method and a decision on consent (D-T4).

**Option B: Ask confirms only intakes that already exist** (uploaded on the desktop). Smaller, but it leaves Ask unable to start the flow, so the user still has to open the desktop first. Rejected as an end state; acceptable as an interim if D-T3 or D-T4 is declined.

**Facts form and confirmation (R3).** The form is the desktop's seven fields plus the fields §1.4 shows the desktop lacks and readiness needs: valuation date at minimum, and optionally effective tax rate, assessment ratio, bill number, issue date. The review lists every value the person typed and says: these are your reading of the document, Ask did not read it, confirming records them as the confirmed tax facts for the tax year and marks the document **Verified** (the buyer's own mark, as in v1.350). The confirmation calls `stageManualFields` and then `confirm` with every decision `CONFIRMED`, as the desktop does. These are two transactions, not one. If the second fails after the first succeeds, the intake is `NEEDS_REVIEW` with staged values and nothing canonical, which a retry replaces, so the failure is recoverable; a combined method that does both in one transaction is a candidate (D-T6) but not required for correctness. A confirmed intake is final in Ask (the service returns it unchanged); Ask says so before the form.

### 3.3 Purge and deletion impact (R6)

This design adds more callers that create the same dependencies §1.7 describes, so the gap becomes more reachable. Required, as a bug-class fix rather than a design choice: tax intakes, confirmed assessments and bills, and appeal evidence must register `PropertyRecordLink`s (new `PropertyRecordLinkEntityType` values or reuse of an existing type, a schema decision) so that Home Records shows the impact before a delete. What a purge does to canonical records that were confirmed from the document is a separate decision (D-T5): the quote design (D-Q7) chose to keep affirmed values and remove everything extracted. The same principle fits here (the person's confirmed values are theirs; the document is gone), and the canonical record would then need a visible "source removed" marker, as `QuoteHomeRecordSource.sourceRemovedAt` does.

### 3.4 Desktop changes this implies

- Evidence: a Home Record picker beside the URL field (same eligibility as Ask), the explicit mismatch question, and a source requirement of "URL or record".
- Intake: "Use a document already in Home Records" beside the upload, and the missing fact fields.
- Route: `sourceUrl` restricted to `http` and `https` for evidence and comparables (D-T7).

## 4. Decisions needed from the owner

| ID | Question | Recommendation |
|---|---|---|
| D-T1 | Is a Home Record accepted as appeal evidence at all (new on both surfaces), or does Ask only match the desktop's URL form? | Accept both. URL alone is the parity minimum and ships first. |
| D-T2 | Which records may be offered as evidence? | Active, visible to the whole household, of a standard, financial, insurance or claim sensitivity, as in v1.358 and Negotiation Shield D-A1. The count of owner-only records left out is shown. |
| D-T3 | Which record types may become an intake? | `TAX_DOCUMENT` only. A `CONTRACT` or `OTHER` record that is really a tax notice is retyped in Home Records first. |
| D-T4 | Does creating an intake from an existing record need a fresh privacy consent? | Yes, as an explicit statement in the review, recorded with the same consent version. The consent text concerns tax-document storage and manual review, so confirm that wording still fits. |
| D-T5 | On a purge, keep the confirmed canonical values and mark their source removed, or remove them? | Keep with a visible marker, matching the quote import (D-Q7). Needs the owner because it changes what a delete means for tax history. |
| D-T6 | Combine stage and confirm in one transaction? | Optional. Not required for correctness (§3.2). |
| D-T7 | Tighten evidence and comparable `sourceUrl` to `http`/`https` at the route? | Yes. It is a one-line schema change; the existing desktop form only sends web URLs in practice (inferred, not checked against stored rows). |
| D-T8 | Fix the desktop's implicit `officialRecordMismatch: true`? | Yes, in the same slice as the Ask evidence form, so the two surfaces ask the same question. |

## 5. Proposed slices

1. **Evidence, URL only.** `PROPERTY_TAX_EVIDENCE_COMMAND`, the mismatch question on both surfaces, the http(s) restriction (D-T7, D-T8). No schema change. This is the parity slice.
2. **Evidence with a Home Record** (D-T1, D-T2). Ask picker, desktop picker. No schema change.
3. **Record links and purge behaviour** (§3.3, D-T5). Schema change (`prisma db push` by the owner) and a purge-worker change; this should land before slice 4 makes intakes from records common.
4. **`createIntakeFromRecord`** and the Ask facts form with the extra fields (D-T3, D-T4, D-T6). The desktop picker and fields follow in the same slice.

Each slice carries its own FRD revision and tests. Nothing here is verified against a database, a browser or a reviewed rule for a real jurisdiction.

## 6. Adversarial pass

Absolute statements in this document were checked against the code before publishing:

- "the desktop never attaches a document as appeal evidence" (§0, §1.3): checked by reading `saveAppealEvidence` and grepping the client for `supportingDocumentId` outside `taxApi.ts`'s type; the only evidence call sends `sourceUrl`. A different page may call the API; the grep covered the frontend source tree for the evidence route and found only `taxApi.ts`.
- "No code in `services/propertyTax/` creates a `PropertyRecordLink`" (§1.7): grep for `PropertyRecordLink|propertyRecordLink` in that directory returned nothing. Links created elsewhere (the document-promotion adapter registry, controllers) were not searched.
- "Saving is confirming" (§1.3): `upsertEvidence` sets `confirmedAt` and `confirmedByUserId` on both create and update with no status field. True of the service; a database trigger is not conceivable here, so not checked.
- "the only way to create one is to upload" (§0 item 2): `createVaultIntake` is the only creator found by grep of `propertyTaxDocumentIntake.create`; seed or admin scripts were not searched.
- The one **executed** claim is §1.5. Zod's behaviour is for the installed 4.1.12.
- Corrected during drafting: the register said the evidence shape was "rule-shaped" in a way that needed a picker; §1.3 shows the shape is three fixed objects keyed by ground, and the picker is optional.

## 7. Owner rulings (October 13, 2026) and what changed because of them

| Decision | Ruling | Direction |
|---|---|---|
| D-T1 | Accept | Support Home Records as appeal evidence, but ship URL parity first. |
| D-T2 | **Amend** | Eligibility is enforced by the service, not by sensitivity: same property, active and not trashed, `HOUSEHOLD` visibility, current version has a clean scan, caller can access it, and a supported evidence record type or an explicit "Other supporting evidence" path. The sensitivity label is shown in the picker and the confirmation. Owner-only and recipient-selected records are never offered because the appeal workspace is household-shared. Intake creation stays stricter (D-T3). This replaces §4's sensitivity filter. |
| D-T3 | Accept | Only `TAX_DOCUMENT` may become a tax intake; retyping happens in Home Records. |
| D-T4 | **Amend** | A fresh workflow affirmation, not the storage consent unchanged (the record is already stored). Approximate wording: "Use this Home Record for manual Property Tax review, create the confirmed tax facts shown below, and mark the record verified. ContractToCozy has not automatically read or verified the document." It is recorded under a **new consent/affirmation version**, never `property-tax-vault-v1`. |
| D-T5 | Accept, with detail | Confirmed or corrected canonical facts survive a purge and are marked "Homeowner confirmed; source document removed." Document links, raw content, file URLs and unconfirmed staged values are removed. Facts are no longer presented as document-backed `HIGH` confidence without qualification, which likely means separating confidence from source availability. Deletion impact must disclose the affected intake, assessments, bills and appeal evidence before a purge (§3.3). |
| D-T6 | Accept | One canonical service operation that, in one transaction, revalidates the record, intake, role, affirmation version and displayed fact set, stages the values, applies the decisions, creates or updates canonical records and evidence, and marks the intake and record. Ask and, eventually, the desktop both call it. §3.2's "two transactions are acceptable" is withdrawn. |
| D-T7 | Accept, with guardrails | Newly stored evidence and comparable URLs are `http` or `https`, by URL parsing and an explicit protocol allowlist (not a regex), on both routes. Anything that later renders or exports a URL must still escape it and use safe external-link behaviour. |
| D-T8 | Accept | The mismatch question is asked explicitly on both surfaces. |

### 7.1 Slice 1 as built (FRD v1.367)

Scope held to URL-only evidence parity: `isHttpUrl` (`services/propertyTax/propertyTaxUrl.ts`: `new URL`, protocol allowlist, no credentials, 2,000 characters), applied in both route schemas and again inside `upsertEvidence` and `upsertComparable` so Ask's direct service call cannot bypass it (executed in the new test: `javascript:` and `data:` are refused before any write); three declared Ask kinds (class evidence on the TAX_CLASS ground, the exemption decision on the EXEMPTION ground, optional condition evidence on any ground) using the desktop's evidence keys so each surface replaces what the other saved; the mismatch statement asked explicitly in Ask and a required checkbox on the desktop; the primary-owner check before any form. Condition evidence on a ground other than assessed value uses its own key (`<ground>-condition`) so it cannot overwrite that ground's required row. Records already stored with a non-web link are not migrated or re-validated; only new writes are checked. **Not built:** slices 2 to 4, and the output-side escaping review D-T7 asks for (no renderer of an evidence or comparable `sourceUrl` was found in the property tax page, §1.5, but the packet and exports were not traced).

### 7.2 Slices 2 to 4 as built

Recorded in FRD v1.368 to v1.370. Differences from this document's earlier sections: (a) evidence eligibility is the service's rule in §7's D-T2 row (no sensitivity filter), implemented in `propertyTaxEvidenceSource.ts` and used by the desktop and Ask alike; (b) purge keeps confirmed values, adds `sourceRemovedAt` to field evidence, assessments, bills and appeal evidence, and presents a document-sourced value whose source was removed as `HOMEOWNER_CONFIRMED_SOURCE_REMOVED` with confidence capped at `MEDIUM` while the stored confidence is untouched; (c) `confirmFromRecord` is one operation that creates (or reuses) the intake, stages and confirms in one transaction, so the "two transactions are acceptable" text in §3.2 no longer applies; (d) intake from a record accepts `TAX_DOCUMENT` only and uses a distinct affirmation version `property-tax-existing-record-v1`. **Still open:** a deletion-impact message specific to tax records in the Home Records screen, re-labelling values whose source was purged before slice 3, and rendering/exporting evidence links safely (D-T7's output-side guardrail was not traced through the appeal packet).
