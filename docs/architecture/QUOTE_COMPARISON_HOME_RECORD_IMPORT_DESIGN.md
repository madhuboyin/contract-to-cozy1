# Quote Comparison: importing a quote from a Home Record — design

**Status:** Owner rulings recorded (§0); slice 1 read-only audit done (§6). Nothing in this document is built. No implementation ships until the confirmation contract in §3.4 is accepted as written.
**Date:** October 13, 2026
**Scope:** How `createQuoteProposalFromDocument` (Quote Comparison, "add a quote from a document") moves from the legacy `Document` table to Home Records, and what that requires of extraction, review, provenance and the decision journey.
**Not in scope:** Property Tax intake, Coverage add-quote, the Project Tracker's own document store, and removing the legacy `Document` model.
**Governing documents read for this design:** `docs/product/SERVICE_PRICE_RADAR_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md` (Slice 2, SPR-005, §9.4, §9.6), `docs/product/HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md` §17 (the Documents retirement arc, especially §17.6), `docs/product/ASK_COZY_NEGOTIATION_SHIELD_DOCUMENTS_DESIGN.md` (the visibility rule this design reuses), and `docs/architecture/AUDIT_METHODOLOGY.md`.

## How claims are labelled

Every statement about existing behaviour is one of: **code-traced** (read in the source, with file and function named, not run), **executed** (run, with the command), or **inferred** (a conclusion drawn from a pattern). Nothing here is executed: no database or browser was available, and the extraction behaviour depends on a live model call. Statements about what the design *would* do are design decisions, not facts.

## 0. Owner rulings (October 13, 2026) and what changed because of them

| Decision | Ruling | Effect on this document |
|---|---|---|
| D-Q1 extraction domain | **Accept** | A dedicated `SERVICE_QUOTE` Home Records extraction domain with a typed response schema (§3.2). No further investigation. |
| D-Q2 review location | **Amend** | The workspace is the authoritative affirmation point, **only once it can display and correct every extracted fact**; generic Home Records review stays optional. Gated by D-Q6 (§3.4). |
| D-Q3 record types | **Amend** | Add `QUOTE` as a first-class `PropertyRecordType`; keep accepting `CONTRACT` and `OTHER` when classification confidently says quote; refuse `INVOICE` by default (§3.3). |
| D-Q4 visibility | **Accept** | The service enforces `HOUSEHOLD` visibility and also validates property, record/version relationship, lifecycle and scan status (§3.1). |
| D-Q5 provenance | **Amend** | The audit comes first. P1 is acceptable only if every reader tolerates a null legacy id and the invariant can be enforced safely; otherwise a separate Home Record provenance model (§3.5, §6). |
| D-Q6 bulk confirmation | **Deferral rejected** | Must be resolved before the richer extractor ships, and it gates D-Q2 (§3.4). |

Five requirements are launch-blocking, not incidental (§3.9): idempotency, atomicity, no empty-quote fallback, version behaviour, and classification confidence.

## 1. What exists today

### 1.1 The import path (code-traced)

1. The desktop page uploads the file with `api.analyzeDocument(file, propertyId)` (`QuoteComparisonWorkspaceClient.tsx`, `uploadQuoteDocument`). That calls the legacy document route (`document.routes.ts`), which runs `documentIntelligenceService.analyzeDocument`, stores the file, and creates a legacy `Document` row with `metadata` set to the whole `DocumentInsights` object.
2. The page then posts the new document's id to `POST …/quote-comparison/workspaces/:workspaceId/quotes/from-document` (`createQuoteFromDocumentSchema`: `{ documentId }`).
3. `createQuoteProposalFromDocument` (`quoteComparison.service.ts`) reads `prisma.document` for `{ id, name, metadata, parserVersion }`, builds a proposal with `extractedProposal(metadata, fallbackName)`, and creates a quote with one `QuoteComparisonExtraction` (`documentId`, `schemaVersion: 'quote-proposal-v1'`, `model: parserVersion`, `rawResultJson: metadata`), plus one `QuoteComparisonFactConfirmation` per fact in status `EXTRACTED_UNCONFIRMED`.
4. It then links the document to the decision journey as `entityType: 'DOCUMENT'` and advances the journey to `SCOPE_REVIEW`.
5. Nothing is final until the homeowner calls `confirmQuoteProposal`, which in one transaction marks every unconfirmed line item, term and fact `HOMEOWNER_CONFIRMED`, sets the quote's `homeownerConfirmedAt` and recomputes readiness.

### 1.2 The extractor does not produce quote data (code-traced)

This is the finding that changes the shape of the design.

- `DOCUMENT_ANALYSIS_PROMPT` and `DocumentInsights.extractedData` (`documentIntelligence.service.ts`) cover warranty, receipt, manual, inspection, invoice and insurance fields: `productName`, `vendor`, `amount`, `category`, dates, carrier and policy fields. There is no `lineItems`, no `terms`, no scope, no quote date or expiry, no provider licence.
- `extractedProposal` reads `insights.lineItems`, `insights.terms`, `insights.scopeSummary`, `insights.quoteDate`, `provider.licenseNumber` and so on (`quoteComparison.service.ts`). None of those keys is written by the extractor.
- Tracing the keys that *are* written: the stored `metadata` is `{ documentType, confidence, extractedData: { vendor, amount, … }, suggestedActions }`. `extractedProposal` selects `root.extractedData` as `insights`, reads the vendor through `record(insights.provider ?? insights.vendor …)` — and `insights.vendor` is a string, so `record()` returns an empty object and the vendor name falls back to the file name — and reads the amount through `insights.amount`, which does match.
- The consequence, inferred from the above: an imported quote today is a shell. It carries an amount when the model found one, a vendor that is usually the file name, and no line items, terms or scope. The comparability and readiness rules in `evaluateQuoteReadiness` (SPR §9.4) then treat it as incomplete until the homeowner fills it in by hand. Whether the model returns a better-shaped object for a quote than the prompt asks for was not observed.

So "a proper adapter from the canonical extraction envelope to `quote-proposal-v1`" cannot be only a mapping: the envelope the current extractor produces has no quote-shaped fields to map from.

### 1.3 Home Records extraction (code-traced)

- `HomeRecordsExtractionService.runExtraction` accepts only record types `WARRANTY`, `RECEIPT` and `INSURANCE_POLICY` and rejects every other type with `PROPERTY_RECORD_EXTRACTION_UNSUPPORTED_TYPE`. It requires a `CLEAN` scan, is idempotent per version (an existing candidate set is returned unchanged), and stores `ExtractedFactCandidate` rows with a `targetDomain`.
- `ExtractedFactTargetDomain` is `WARRANTY | EXPENSE | INSURANCE_POLICY | OTHER`. There is no quote domain.
- A candidate is never a source of truth until a person marks it `CONFIRMED` or `CORRECTED` (`reviewCandidate`); promotion functions then read only those values. `ExtractionEnvelope` (`extractionEnvelope.contract.ts`) carries `documentVersionId`, `extractorId`, `extractorVersion`, `modelId`, `parseStatus` and per-field confidence, and `validateExtractionEnvelope` rejects a `FAILED` envelope that carries candidates.
- `PropertyRecordType` has no quote or estimate value (`INVOICE`, `CONTRACT`, `OTHER` are the nearest). `PropertyRecordLinkEntityType` has no quote entity.

### 1.4 Other places the import touches the legacy store (code-traced)

- `QuoteComparisonExtraction.documentId` is a non-null foreign key to `Document` with `onDelete: Cascade`, indexed but not unique.
- `linkServiceQuoteDecisionContext` validates `entityType: 'DOCUMENT'` by looking the id up in `prisma.document`, scoped to the property (`serviceQuoteDecisionJourney.service.ts`), so a Home Record id passed to it would be refused. `ServiceQuoteDecisionEntityType` has no Home Record value.
- **Correction found by the audit (§6):** `advanceServiceQuoteDecision` also upserts a context link for its `relatedEntityType`/`relatedEntityId`, inside its own transaction and **with no scope validation**. The import passes the document through both. A Home Record id passed as `relatedEntityId` with the existing `'DOCUMENT'` type would therefore be stored, labelled as a document, without being checked. An earlier draft of this document said the id "would be refused"; that is only true of the explicit link function.
- The import is not idempotent: no uniqueness exists on `(workspace, document)`, so importing the same document twice creates two quotes. The quote create is one nested write, but the journey link and stage advance that follow are separate calls, so a failure after the create leaves a quote with no journey link.
- Existing imports are legacy documents. This design does not migrate them.
- The records plan's S5f row lists "quote comparison" among the files it touched, but §17.6 of the same plan found `quoteComparison.service.ts` still reading the legacy `Document` table; the code above is what governs, and it is still legacy.

## 2. Outcomes required, and what is only one way to get there

Requirements (outcomes):

- **R1.** A homeowner can add a quote from a document that is a Home Record they can see, without the legacy store.
- **R2.** The facts on the resulting quote were extracted from a specific record version, and that version is recorded.
- **R3.** No extracted fact is trusted until the homeowner has affirmed it; a corrected value is distinguishable from a confirmed one.
- **R4.** An unsupported, unreadable, stale or unreviewed extraction is refused with a reason a person can act on, not turned into an empty quote.
- **R5.** Record-level visibility is respected: the quote workspace is shared, so a record some members cannot see is not an input to it.
- **R6.** The legacy import keeps working until nothing sends it a legacy id.

Mechanisms (candidate designs, not requirements): where the quote fields are extracted, where the homeowner reviews them, and how provenance is stored. Section 3 sets out the options and a recommendation for each.

## 3. Design

### 3.1 Resolving the source

The import takes `{ recordId, versionId? }`. The service resolves the record with `resolvePropertyDocuments` for the acting role (Home Records only, never trashed, record-level visibility applied) and then:

- uses the record's **current version** when `versionId` is omitted, and records the version id actually used;
- refuses a version that does not belong to the record, a version whose scan status is not `CLEAN`, and a record that is trashed;
- validates that the record belongs to the property, that the version belongs to the record, that the record is `ACTIVE` (not archived or trashed) and that the version's scan status is `CLEAN`;
- refuses a record whose visibility is not `HOUSEHOLD` (R5). This is the rule Negotiation Shield attach uses (design D-A1): the workspace is shared, so an owner-only record is never an input, even to an owner.

**D-Q4 (accepted):** the household-visibility rule is enforced by the service, in addition to the picker, so the desktop and Ask cannot differ.

### 3.2 Where the quote facts come from — choose one

**Option A (accepted, D-Q1): add a quote extraction domain to Home Records.**
Add `SERVICE_QUOTE` to `ExtractedFactTargetDomain` and a quote branch to `runExtraction`, with its own prompt and a response schema that actually asks for quote facts: provider name and licence, total, quote and expiry dates, service category and location, scope kind and summary, line items (kind, description, quantity, unit, unit price, total), and terms (type, value, included). Each candidate carries its source excerpt and page where the model supplies them (the envelope already has `evidence`). Candidates reuse the existing review and `CONFIRMED`/`CORRECTED` mechanism, and a new `promoteServiceQuote` creates the quote from reviewed values only.

- For: it follows the established Home Records pattern (extract → review → promote), the review UI already exists, and "reviewed extraction rather than raw upload" (R3) is satisfied by construction.
- Against: a new prompt and response schema, a new enum value (one `prisma db push`), a new record type decision (§3.3), and tests of model output that cannot be verified without a live model. It is also a change to a shared extraction service other domains depend on.

**Option B: reuse the existing insights and map them.** Rejected (and the rejection is ratified). §1.2 shows the existing extraction has no line items, terms, scope or dates to map; this option reproduces today's shell import with a new provenance column.

**Option C: keep extraction in the legacy analyzer and only attach the result to a Home Record.** Rejected as a design: it keeps the legacy store as the extraction source and still needs the record to be the evidence, which is two sources of truth for one document.

### 3.3 Which records may be imported (D-Q3, amended)

- Add `QUOTE` to `PropertyRecordType`. New quote uploads are `QUOTE`. This touches record filters, labels, search and the Home Records upload picker, which is an accepted cost because this work already requires schema changes and a contractor estimate has no semantically correct existing type (an `INVOICE` is billed or completed work, a `CONTRACT` is an agreed one).
- Existing records of type `CONTRACT` or `OTHER` may be imported when extraction classifies the file as a quote **and** the minimum-evidence rule of §3.9(5) is met.
- `INVOICE` is refused by default, with the explanation that an invoice is billed work, not an active proposal.
- Every other type is refused with the record's own type named.

### 3.4 The confirmation contract (D-Q2 and D-Q6, decided together)

D-Q2 and D-Q6 cannot be separated: the workspace may be the affirmation point only if the confirmation affirms what the person was shown. Today `confirmQuoteProposal` marks every unconfirmed line item, term and fact `HOMEOWNER_CONFIRMED` in one transaction, whether or not the workspace displayed them (code-traced, §1.1). This design therefore changes that operation as part of this work; it is not left as a known gap.

**Contract.** Confirming a quote affirms exactly the set of values the review step displayed. The review step must:

1. **Display every value that will be confirmed**: the headline facts (provider, total, quote and expiry dates, category, location, scope kind and summary, licence), **every line item and every term**. A value that is not displayed is not confirmed.
2. **Distinguish three states** on each value: extracted and unconfirmed, corrected by the person, and already confirmed. A corrected value shows the extracted value it replaced.
3. **Allow correction and rejection before confirmation.** A rejected line item or term is removed from the proposal (and from readiness), not confirmed.
4. **Recompute readiness from the reviewed values** at confirmation, not from the extracted ones.
5. **Confirm nothing hidden or omitted.** The confirm request carries the identifiers (and the extracted-value fingerprints) of the values the person was shown. The service confirms those and refuses, with a refresh, if the stored set differs from the request (a value was added or changed since display). It never confirms a row that was not in the request.

A single "Confirm quote" button is acceptable: it affirms the complete, visible set, and the confirmation text says how many facts, line items and terms it covers. Per-field buttons are not required.

**Where the review lives.** The Quote Comparison workspace (D-Q2, amended). Home Records candidate review is optional and does not substitute for it. If a candidate was reviewed in Home Records, its `CORRECTED` value arrives in the proposal as a *correction* (shown as such), not as a confirmation.

**Consequence for sequencing.** The richer extractor (slice 2) does not ship before the contract is implemented (slice 3). Until then the existing bulk confirm applies only to the shell imports it applies to today.

### 3.5 Provenance (D-Q5, amended; decided after the audit in §6)

`QuoteComparisonExtraction` is the provenance row. The durable evidence source is the **exact `PropertyRecordVersion`**, not the record.

**Option P1: extend the row.** `source` discriminator (`LEGACY_DOCUMENT | HOME_RECORD`), `documentId` nullable, new nullable `propertyRecordId` and `propertyRecordVersionId`, a uniqueness rule on `(workspaceId-of-quote, propertyRecordVersionId)`, application-level validation at every write boundary, and, if the owner wants the invariant below the service layer, a `CHECK` that exactly one source column is set and matches the discriminator, **supplied as a user-managed database change**: `prisma db push` does not create it from the Prisma schema.

**Option P2: a separate Home Record provenance model.** A new table keyed to the quote and the version; the legacy table is untouched.

**What the audit found for this choice (§6):** the legacy `document` relation is read unconditionally by one include (`quoteInclude`) that backs every quote read, and the frontend dereferences `extraction.document.name` without a null check. P1 therefore requires changing that include and that frontend line in the same slice, and the DOCUMENT-typed journey link. The audit found **three** in-repo readers, which is small enough for P1 to be viable. The deciding risk is not the reader count but that the uniqueness rule spans a join (the quote carries the workspace, the extraction carries the version), which a plain unique index cannot express. **Recommendation: P2**, with `workspaceId` and `propertyRecordVersionId` both on the new table so the idempotency rule is a plain unique index and no legacy reader changes. The owner may still choose P1.

**Retention and deletion.** Trashing a record offers an impact decision only for `PropertyRecordLink` rows (code-traced, `homeRecords.service.ts`); a foreign key with `SetNull` is invisible to that decision, and the purge job hard-deletes the record (`propertyRecord.delete`), after which provenance would be a pair of null ids. This design therefore also writes a `PropertyRecordLink` (a new `SERVICE_QUOTE` link entity type, purpose `SOURCE`, with the version id), following the savings-outcome precedent in the records plan §17.4, so that deleting a quote's source shows up in the deletion impact. The provenance row keeps immutable source metadata (version id, `sha256`, original file name, extractor id and version) so that, if the household chooses to remove the link and purge, what the quote came from is still stated. Whether a quote whose source was purged keeps its confirmed facts (recommended: yes, they were affirmed by a person) is **D-Q7**.

Idempotency is scoped to the operation, not to current state (AUDIT_METHODOLOGY item 14): importing the same record **version** into the same workspace returns the existing quote with an "already imported" result.

### 3.6 Decision journey and atomicity

- Add `HOME_RECORD` to `ServiceQuoteDecisionEntityType`; validate it with `resolvePropertyDocuments` (Home Records only); leave the legacy `DOCUMENT` validation as is. Because `advanceServiceQuoteDecision` upserts its own context link without validating it (§1.4), validation for the new type must live in that function's link step as well, not only in the explicit link function.
- **Atomicity (launch-blocking).** The quote create, the provenance row, the `PropertyRecordLink`, the context link and the stage advance are one transaction. `advanceServiceQuoteDecision` opens its own `$transaction`, so it cannot be nested; the audit found **no transaction-aware variant**. Slice 1b extracts its body into a function that takes a `tx` and keeps the exported function as a wrapper.

### 3.7 Stale, unsupported and failed extraction (R4)

| Situation | Behaviour |
|---|---|
| Record trashed, or not visible to the actor | Refused: "not found" (the resolver does not distinguish) |
| Version not `CLEAN` | Refused: not validated yet |
| Extraction `parseStatus` is `FAILED` | Refused with the existing unreadable message; no quote is created, no empty quote |
| Classification is not a quote | Refused, naming the classification |
| Record has a newer current version than the one requested | Allowed (the version is explicit and recorded), but the review says a newer version exists |
| Version superseded after import | The quote keeps its provenance row; the workspace shows "a newer version of this document exists" and offers a re-import, which is a new quote |
| Extraction schema version differs from what promotion understands | Refused with the versions named |

### 3.8 Ask and the desktop page

- Ask gets an import command on the Quote Comparison answer: a picker over household-visible Home Records of the accepted types, a review that names the record and version, and a confirmation that calls the same service. Uploading stays out of Ask.
- The desktop page's upload moves from `api.analyzeDocument` to `uploadRecordForWorkflow` (already used by buyer closing, Negotiation Shield and others), then calls the import. The legacy route remains until no caller sends a legacy id.

### 3.9 Launch-blocking requirements

1. **Idempotency.** The same record version into the same workspace returns the existing quote and says it was already imported. It never creates a second. (§3.5.)
2. **Atomicity.** One transaction for quote, provenance, record link, journey context and stage advance. (§3.6.)
3. **No empty-quote fallback.** The current import produces a zero-amount quote whose provider is the file name when the fields are missing (§1.2). The new path never does. If a required fact (provider and either a total or at least one priced line item) is missing, the result is an actionable review state naming what is missing, or a refusal; no quote is created.
4. **Version behaviour.** Importing a newer version of a record already imported into this workspace does not silently create another active quote. The service returns the earlier quote and asks the person to choose: replace it (the earlier quote is marked superseded and keeps its provenance) or retain both as separate submissions. Ask and the desktop page must both present that choice.
5. **Classification confidence.** `_documentType` from the model is not sufficient. A file is treated as a quote only if the typed response validates against the quote schema **and** a minimum recognisable quote evidence is present: a provider name plus a price, or at least one priced line item. Anything else is refused as "does not look like a quote or estimate".

## 4. Decisions

| ID | Decision | Status |
|---|---|---|
| D-Q1 | New `SERVICE_QUOTE` extraction domain | **Accepted** |
| D-Q2 | Workspace confirmation is the affirmation, once it shows and can correct every fact | **Amended**, gated by D-Q6 |
| D-Q3 | Add `QUOTE` record type; accept `CONTRACT`/`OTHER` when classified; refuse `INVOICE` by default | **Amended** |
| D-Q4 | Service enforces household visibility plus property, version, lifecycle and scan checks | **Accepted** |
| D-Q5 | Provenance: P1 only if readers and invariant are safe, else a separate model | **Amended**; audit recommends P2 (§3.5), owner to finalize |
| D-Q6 | Bulk confirmation must be resolved before the richer extractor ships | **Deferral rejected**; contract in §3.4 awaiting acceptance |
| D-Q7 | Does a quote keep its confirmed facts when its source record is purged (recommended: yes) | Open |

## 5. Slices (each independently shippable, in order)

1. **Read-only audit (done, §6).** Then **1b**: the transaction-aware journey variant and the `HOME_RECORD` entity type, with `quoteInclude` and the frontend line made null-tolerant. *Exit:* `tsc` clean; existing quote and journey tests pass; owner runs `prisma db push` for the enum value.
2. **Confirmation contract (§3.4)**, implemented against the existing shell imports first: the review shows every fact, line item and term; confirm carries the displayed set; rejected values are removed; readiness recomputed from reviewed values. *Exit:* tests that a value not in the request is never confirmed and that a stale set is refused. **No extractor change ships before this slice.**
3. **Schema:** `QUOTE` record type, `SERVICE_QUOTE` domain and link entity type, the provenance model (P1 or P2), with the owner-run database constraint if P1.
4. **Quote extraction domain** (prompt, typed response schema, candidate mapping, envelope validation, minimum-evidence rule). *Exit:* fixture-envelope tests; a documented live-model fixture evaluation of extraction quality (multi-page line items, terms, totals, page attribution), which does not block the architecture.
5. **Import service** with §3.1, §3.7, §3.9. *Exit:* a test per refusal and per launch-blocking requirement, including replay and the newer-version choice.
6. **Desktop and Ask.** *Exit:* component and command tests; legacy path still passes.
7. **Retire the legacy branch** when no caller sends a legacy id (not scheduled).

## 6. Adversarial pass and open items

Claims in this document that could be falsified, and the scenario that would do it:

- **"The extractor produces no line items or terms" (§1.2).** Falsified if the model returns extra keys the prompt does not ask for, or if a quote-specific extractor exists elsewhere. Checked: `grep -n -i "quote\|lineItems" documentIntelligence.service.ts` finds only the `vendor` fields and no quote schema, and `documentIntelligenceExtractionEnvelope.adapter.ts` has no quote mapping. Not checked: a live model response for a real quote.
- **"An imported quote is a shell" (§1.2).** This is inferred from the key-tracing, not observed. It would be falsified by an observed import that carried line items.
- **"`runExtraction` rejects every other type" (§1.3).** Falsified by another entry point that extracts quote candidates. Checked: `ExtractedFactTargetDomain` has no quote value and the three branches in `runExtraction` are the only mappings.
- **"A Home Record id would be refused by the journey link" (§1.4).** Code-traced: the `DOCUMENT` branch queries `prisma.document` by id and property. Would be falsified by a Home Record id also existing in `documents`, which the inventory service's own header rules out ("a document lives in exactly one of them"); that is a stated convention, not a database constraint, and was not checked against data.
- **"Importing twice creates two quotes" (§1.4).** Code-traced from the absence of a uniqueness check and constraint; not executed.
- **"Existing imports need no migration" (§1.4).** Holds only if every reader keeps a legacy branch (§3.5, P1). Not verified; it is the reader audit's job.

### Slice 1 audit results (read-only; code-traced, October 13, 2026)

Searches were `grep -rn` over `apps/backend/src`, `apps/workers/src` and `apps/frontend/src`, excluding generated code.

| Question | Finding |
|---|---|
| Readers and writers of `QuoteComparisonExtraction` | **One write path:** `createQuoteProposalFromDocument` (nested create). **One update:** `confirmQuoteProposal` (`updateMany` to `CONFIRMED`). **One read:** the `extractions` include in `quoteInclude`, which also selects the legacy `document` relation (`id, name, fileUrl, mimeType`). `quoteInclude` is used by 8 call sites in `quoteComparison.service.ts`. No reader in workers or elsewhere in the backend. |
| Frontend consumers | `servicePriceRadarApi.ts` types `extractions[].document` as non-optional; `quoteDecisionUi.ts` reads `extraction.document.name` with no null check; the workspace client uses only `extractions.length`. A row with a null document would break `quoteDecisionUi.ts`. |
| `DOCUMENT` journey-context branches | Two writers: `linkServiceQuoteDecisionContext` (validates against `prisma.document`) and `advanceServiceQuoteDecision` (upserts the link **unvalidated**). `quoteComparison.service.ts` passes the document id through both. Readers: `contextLinks` includes only; one `projectTracker.service.ts` query reads `PROJECT` links. |
| Delete behaviour and provenance consumers | Legacy `Document`: soft-deleted with `deletedAt` (the document route); the extraction row is removed only if the document row is hard-deleted (`onDelete: Cascade`). Home Records: trash creates a purge job and the worker hard-deletes the record (`propertyRecord.delete`); deletion impact is computed from `PropertyRecordLink` only. A `SetNull` foreign key is invisible to that decision. |
| Existing uniqueness assumptions | `QuoteComparisonExtraction`: none (indexed on `documentId` and `(quoteId, createdAt)`). `ServiceQuoteDecisionContextLink`: unique on `(workspaceId, entityType, entityId)`, so linking the same entity twice upserts. Quotes: no uniqueness per source. |
| Transaction-aware journey operations | **None.** `advanceServiceQuoteDecision` opens its own `$transaction` and takes no `tx`; `linkServiceQuoteDecisionContext` uses the client directly. |
| Raw SQL or workers touching the table | None found. |

Conclusion for D-Q5: three in-repo readers and no worker or SQL dependency make P1 viable on reader count alone; the uniqueness rule spanning a join and the invisibility of `SetNull` to deletion impact favour P2 plus a `PropertyRecordLink`. The owner finalizes.

**Open items not resolved here:**

- D-Q7 (what a quote keeps when its source is purged) and the final P1/P2 choice.
- Whether `promoteServiceQuote` runs inside the same transaction as candidate state changes in `HomeRecordsExtractionService` (the existing promotions were not read for this).
- Behaviour on a multi-page quote where line items span pages (the envelope has `page` per field; how the model is asked to split them is a prompt decision made in slice 2).
- Cost and rate limits of a second extraction prompt per upload.
