# Quote Comparison: importing a quote from a Home Record — design

**Status:** Proposed. Nothing in this document is built. It is for the owner to accept, amend or reject before any implementation.
**Date:** October 13, 2026
**Scope:** How `createQuoteProposalFromDocument` (Quote Comparison, "add a quote from a document") moves from the legacy `Document` table to Home Records, and what that requires of extraction, review, provenance and the decision journey.
**Not in scope:** Property Tax intake, Coverage add-quote, the Project Tracker's own document store, and removing the legacy `Document` model.
**Governing documents read for this design:** `docs/product/SERVICE_PRICE_RADAR_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md` (Slice 2, SPR-005, §9.4, §9.6), `docs/product/HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md` §17 (the Documents retirement arc, especially §17.6), `docs/product/ASK_COZY_NEGOTIATION_SHIELD_DOCUMENTS_DESIGN.md` (the visibility rule this design reuses), and `docs/architecture/AUDIT_METHODOLOGY.md`.

## How claims are labelled

Every statement about existing behaviour is one of: **code-traced** (read in the source, with file and function named, not run), **executed** (run, with the command), or **inferred** (a conclusion drawn from a pattern). Nothing here is executed: no database or browser was available, and the extraction behaviour depends on a live model call. Statements about what the design *would* do are design decisions, not facts.

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
- `linkServiceQuoteDecisionContext` validates `entityType: 'DOCUMENT'` by looking the id up in `prisma.document`, scoped to the property (`serviceQuoteDecisionJourney.service.ts`). A Home Record id would be refused. `ServiceQuoteDecisionEntityType` has no Home Record value.
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
- refuses a record whose visibility is not `HOUSEHOLD` (R5). This is the rule Negotiation Shield attach uses (design D-A1): the workspace is shared, so an owner-only record is never an input, even to an owner.

Open choice **D-Q4**: whether the household-visibility rule is enforced by the service or only by the picker. Recommendation: the service, so the desktop and Ask cannot differ.

### 3.2 Where the quote facts come from — choose one

**Option A (recommended): add a quote extraction domain to Home Records.**
Add `SERVICE_QUOTE` to `ExtractedFactTargetDomain` and a quote branch to `runExtraction`, with its own prompt and a response schema that actually asks for quote facts: provider name and licence, total, quote and expiry dates, service category and location, scope kind and summary, line items (kind, description, quantity, unit, unit price, total), and terms (type, value, included). Each candidate carries its source excerpt and page where the model supplies them (the envelope already has `evidence`). Candidates reuse the existing review and `CONFIRMED`/`CORRECTED` mechanism, and a new `promoteServiceQuote` creates the quote from reviewed values only.

- For: it follows the established Home Records pattern (extract → review → promote), the review UI already exists, and "reviewed extraction rather than raw upload" (R3) is satisfied by construction.
- Against: a new prompt and response schema, a new enum value (one `prisma db push`), a new record type decision (§3.3), and tests of model output that cannot be verified without a live model. It is also a change to a shared extraction service other domains depend on.

**Option B: reuse the existing insights and map them.** Rejected. §1.2 shows the existing extraction has no line items, terms, scope or dates to map; this option reproduces today's shell import with a new provenance column.

**Option C: keep extraction in the legacy analyzer and only attach the result to a Home Record.** Rejected as a design: it keeps the legacy store as the extraction source and still needs the record to be the evidence, which is two sources of truth for one document.

### 3.3 Which records may be imported

`PropertyRecordType` has no quote value. Options: add `QUOTE` (a schema change that touches record filters, labels and the Home Records UI), or accept `INVOICE`, `CONTRACT` and `OTHER` and let the extraction's own classification (`_documentType`) decide whether the file is a quote. Recommendation: do not add a record type now; accept those three types, and refuse with "this does not look like a quote or estimate" when the classification says otherwise. Open choice **D-Q3**.

### 3.4 Review and confirmation — one affirmation, not two

Today the homeowner confirms once, in the quote workspace, and `confirmQuoteProposal` confirms everything in bulk. With Option A, review would happen in Home Records first and then again in the workspace unless the design says otherwise.

Recommendation: **the review in the workspace is the affirmation.** Promotion creates the quote with every fact `EXTRACTED_UNCONFIRMED` and the candidate's reviewed value in `confirmedValueJson` only when the candidate was `CORRECTED`; the homeowner still confirms in the workspace, as today. Candidate review in Home Records is optional for this domain. Reasoning: a quote's facts are only meaningful in the context of the comparison (scope against other proposals), so the affirmation belongs where comparability is shown; forcing a second review in Home Records first adds a step without adding information. This preserves R3 and keeps `confirmQuoteProposal` unchanged.

Open choice **D-Q2**: if instead the owner wants review required before import (R4 strict reading), `promoteServiceQuote` would refuse an unreviewed candidate set, and the workspace confirmation would be a second, lighter step.

One thing this design does not accept silently: `confirmQuoteProposal` confirms all unconfirmed facts in one action. For a quote with many line items that is a blanket confirmation. It exists today and is out of scope, but this design records it, because an import that produces more extracted facts (Option A) makes it matter more. A per-fact confirmation is a separate change.

### 3.5 Provenance — schema options

`QuoteComparisonExtraction` is the provenance row. It must be able to say which record and which version a quote came from, and what parser produced it.

**Option P1 (recommended): extend the row.** Make `documentId` nullable; add nullable `propertyRecordId` and `propertyRecordVersionId` (relations to `PropertyRecord` and `PropertyRecordVersion`, `onDelete: SetNull`), a `source` discriminator (`LEGACY_DOCUMENT | HOME_RECORD`), and keep `provider`, `model`, `schemaVersion`. Add a database check that exactly one of `documentId` and `propertyRecordId` is set and that the discriminator matches. Copy `extractorId`, `extractorVersion` and `modelId` from the envelope into `provider`, `schemaVersion` and `model`, and store the version's `sha256` and original file name in `rawResultJson` so provenance survives a record being purged (`SetNull`).

- For: one table, one reader, the legacy rows are unchanged.
- Against: `documentId` becomes nullable, so every reader that assumes it is set must be found first (not done in this document: **an open item** — see §6). `Cascade` on the legacy link is replaced with `SetNull` on the new ones, which changes what deleting a record does to its extraction rows.

**Option P2: a new table** for Home Record extractions, leaving the legacy table untouched. Cleaner constraints, two tables to read. Choose P2 if the reader audit in §6 finds many readers of `documentId`.

Idempotency for the import is scoped to the operation, not to current state (AUDIT_METHODOLOGY item 14): a unique constraint on `(workspaceId, propertyRecordVersionId)` where the version is set, so importing the same version into the same workspace twice returns the existing quote rather than creating a second. Importing a *new* version of the same record is a different operation and creates a new quote; the earlier one is not changed.

### 3.6 Decision journey

Add `HOME_RECORD` to `ServiceQuoteDecisionEntityType` and validate it with `resolvePropertyDocuments` (Home Records only) in `linkServiceQuoteDecisionContext`; the legacy `DOCUMENT` validation stays. The quote create, the journey link and the stage advance should happen in one transaction for the Home Record path, so a failure cannot leave a quote with no journey link (§1.4).

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

## 4. Decisions the owner needs to make

| ID | Decision | Recommendation |
|---|---|---|
| D-Q1 | Where quote facts are extracted: new Home Records domain (A), map existing insights (B), keep legacy analyzer (C) | A |
| D-Q2 | Is review in Home Records required before import, or is the workspace confirmation the affirmation | Workspace confirmation |
| D-Q3 | Add a `QUOTE` record type, or accept `INVOICE`, `CONTRACT`, `OTHER` and classify | Accept existing types |
| D-Q4 | Household-visibility enforced in the service or only the picker | Service |
| D-Q5 | Provenance: extend the existing row (P1) or a new table (P2) | P1, subject to the reader audit |
| D-Q6 | Whether the bulk confirmation in `confirmQuoteProposal` is acceptable once extraction produces many facts | Out of scope here; decide separately |

## 5. Slices (each independently shippable, in order)

1. **Reader audit and schema.** Find every reader of `QuoteComparisonExtraction.documentId` and `ServiceQuoteDecisionEntityType.DOCUMENT`; then the schema edit (P1 or P2) and the entity type value. *Exit:* `tsc` clean; the audit's result recorded in this document; owner runs `prisma db push`.
2. **Quote extraction domain.** `SERVICE_QUOTE` domain, prompt and response schema, candidate mapping, envelope validation. *Exit:* unit tests for the mapping from a fixture envelope; a documented manual check against a real quote with a live model, since that cannot be asserted in a test.
3. **Import service.** `createQuoteProposalFromRecord` with the resolution rules of §3.1, the refusal table of §3.7, the transaction of §3.6 and the idempotency of §3.5. *Exit:* tests for each refusal and for replay.
4. **Desktop and Ask.** Page upload through Home Records; the Ask import command and picker. *Exit:* component and command tests; the legacy path still passes its tests.
5. **Retire the legacy branch** when no caller sends a legacy id (not scheduled).

## 6. Adversarial pass and open items

Claims in this document that could be falsified, and the scenario that would do it:

- **"The extractor produces no line items or terms" (§1.2).** Falsified if the model returns extra keys the prompt does not ask for, or if a quote-specific extractor exists elsewhere. Checked: `grep -n -i "quote\|lineItems" documentIntelligence.service.ts` finds only the `vendor` fields and no quote schema, and `documentIntelligenceExtractionEnvelope.adapter.ts` has no quote mapping. Not checked: a live model response for a real quote.
- **"An imported quote is a shell" (§1.2).** This is inferred from the key-tracing, not observed. It would be falsified by an observed import that carried line items.
- **"`runExtraction` rejects every other type" (§1.3).** Falsified by another entry point that extracts quote candidates. Checked: `ExtractedFactTargetDomain` has no quote value and the three branches in `runExtraction` are the only mappings.
- **"A Home Record id would be refused by the journey link" (§1.4).** Code-traced: the `DOCUMENT` branch queries `prisma.document` by id and property. Would be falsified by a Home Record id also existing in `documents`, which the inventory service's own header rules out ("a document lives in exactly one of them"); that is a stated convention, not a database constraint, and was not checked against data.
- **"Importing twice creates two quotes" (§1.4).** Code-traced from the absence of a uniqueness check and constraint; not executed.
- **"Existing imports need no migration" (§1.4).** Holds only if every reader keeps a legacy branch (§3.5, P1). Not verified; it is the reader audit's job.

**Open items not resolved here:**

- The reader audit of `documentId` (slice 1).
- Whether `promoteServiceQuote` runs inside the same transaction as candidate state changes in `HomeRecordsExtractionService` (the existing promotions were not read for this).
- Behaviour on a multi-page quote where line items span pages (the envelope has `page` per field; how the model is asked to split them is a prompt decision made in slice 2).
- Cost and rate limits of a second extraction prompt per upload.
