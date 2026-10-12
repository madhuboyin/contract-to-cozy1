# Ask Cozy — Negotiation Shield documents (attach, read, parse): design

**Status:** Design for owner decision. Nothing in this document is built.
**Date:** October 12, 2026
**Parent:** `docs/architecture/ASK_COZY_NEGOTIATION_SHIELD_SLICE2_DESIGN.md` (decision D7 deferred documents and OCR; slices 2a–2c shipped as FRD v1.297–v1.299).
**Method:** `docs/architecture/AUDIT_METHODOLOGY.md`. Each claim is labelled **code-traced** (read in source, not run), **executed** (run), or **inferred**. This repository has no database or browser; nothing here was run against either.

---

## 1. What this is for

A review's analysis is better, and its confidence higher, when the quote, the premium notice or the settlement letter is on file with it. Today that is desktop-only: the page uploads a file as a Home Record, attaches it to the case, and optionally "parses" it into saved details. Ask can start a review, analyse it and edit its details, but cannot attach or read documents (the Ask list and review say nothing about them).

## 2. Governing documents searched

| Document | What it governs here |
| --- | --- |
| `ASK_COZY_NEGOTIATION_SHIELD_SLICE2_DESIGN.md`, D4, D7 | No unrestricted pasted text in Ask; documents and OCR deferred until the earlier slices were verified, "its own design". |
| `ASK_COZY_INLINE_WORKSPACE_FRD.md` v1.119 (IW-CONV-023) | The only composer affordance is evidence for one known record; **uploading never attaches by itself**: the file still goes through review and confirm. |
| `ASK_COZY_INLINE_WORKSPACE_FRD.md`, Phase 3 "Evidence upload" (September 22, 2026) | Ask's one byte-upload route stores a legacy `Document` row with no analysis (see G7). |
| `ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md`, "Intentional boundaries: upload-driven and visual analyzers" | Fresh upload-driven analysis with no durable Ask-owned result is a recorded boundary. Negotiation Shield's parse *does* leave a durable result, so it is not that case, but the boundary shows the bar. |
| `HOME_BUYER_FRD_AND_IMPLEMENTATION_PLAN.md` §11.1–11.4 | Buyer document actions use Home Records; readiness distinguishes uploaded / unreviewed / extraction pending / confirmed / verified; **private transaction documents remain private**; verification is not a statement of authenticity. Governs the buyer scenario (2d), and the privacy stance generally. |
| Home Records access rules (`homeRecordsAccess.ts`) | Record-level visibility: an owner-only record is not returned to other roles. |

No document says Ask must or must not attach or parse. This is parity work with genuine choices (section 7).

## 3. What the traditional tool does (evidence)

| # | Fact | Label | Evidence |
| --- | --- | --- | --- |
| G1 | **Attach** takes a Home Record id, checks the *caller's* role can see it (`assertPropertyDocumentsExist`, which applies `visibleRecordWhere(role)`; an OWNER sees every record, other roles only `HOUSEHOLD`-visibility records), then links it to the case idempotently (`findFirst` on `(caseId, documentId)` before create) and recomputes `sourceType`. The no-`documentId` branch is dead and would hit a foreign-key violation. | code-traced | `negotiationShield.service.ts` `attachDocumentMetadata`; `propertyDocumentInventory.service.ts`; `homeRecordsAccess.ts` |
| G2 | The link's FK targets `PropertyRecord` (Home Records), **not** the legacy `Document` table. | code-traced | the service's own comment in `attachDocumentMetadata`; `NegotiationShieldDocument.documentId` |
| G3 | **Attaching changes the analysis even without parsing**: each scenario's rules engine counts attached documents by type (`quoteDocumentCount`, `premiumNoticeDocumentCount`, `settlementNoticeDocumentCount`, `estimateDocumentCount`, `recommendationDocumentCount`, `supportingDocumentCount`, `hasAnyDocument`) and words findings and confidence from them ("A premium notice document is attached…"). | code-traced | `Normalized*Context` types and the `ctx.*DocumentCount` / `ctx.hasAnyDocument` uses in the five scenario services |
| G4 | **Parse** requires the document's current version to be `scanStatus CLEAN` and `integrityStatus VERIFIED` (otherwise 409 "still being scanned"), signs a storage URL, runs `parseNegotiationShieldDocument` in the request, and writes or updates **one parsed input per case document** (`structuredData._meta.origin = PARSED_DOCUMENT`, `rawText` up to 12,000 characters). | code-traced | `parseCaseDocument`; `negotiationShieldDocumentParsing.service.ts` |
| G5 | The parser is **local and rule-based**: `pdf-parse` for PDFs, `tesseract.js` (in-process OCR) for images, plain text for text formats, then label/regex extraction per scenario. No model provider and no external OCR service is called. | code-traced | `extractDocumentText`; `insuranceOcr.service.ts` (`createWorker('eng')`, `provider: 'tesseract'`) |
| G6 | A parsed input merges under the manual input: **manual fields win, parsed fields fill gaps**, raw text is merged deterministically; manual save cannot overwrite a parsed input. The raw text is used only to raise confidence; **it is never echoed into findings, leverage, actions or the draft**. | code-traced | `buildMergedScenarioInput`; `ctx.rawText` uses (confidence only) in the scenario services |
| G7 | Ask's one upload route (`POST /api/documents/property/:id/evidence-upload`, `document.routes.ts`: `prisma.document.create`) creates a **legacy `Document` row**, so a file uploaded that way cannot be attached to a case (G2). Ask's existing `DOCUMENT_MULTI_SELECT` choice (Project Tracker) also lists legacy `Document` rows with `allowUpload: true`. Neither is usable for this FK. | code-traced | `projectTracker.handler.ts` `projectDocumentOptions`; FRD Phase 3 evidence upload |
| G8 | The page uploads through the Home Records create endpoint with `visibility: HOUSEHOLD` and **`sensitivity: 'STANDARD'` for every document type**, maps the NS document type to a record type (claim notices → `CLAIM`, premium notice → `INSURANCE_POLICY`, inspection report → `INSPECTION_REPORT`, the rest → `OTHER`), and treats a duplicate-content error as "use the existing record". The enum also has `PERSONAL`, `FINANCIAL`, `INSURANCE`, `CLAIM`, `SECURITY`, `LEGAL`. | code-traced | `NegotiationShieldToolClient.tsx` `uploadDocumentMutation`, `mapCaseDocumentToUploadType`; `homeRecordsApi.ts`; `schema.prisma` |
| G9 | **A visibility gap on read:** `getCaseDetail` serializes every attached document with a signed `fileUrl` and its `storageKey` to anyone who can read the case (the controller returns it unchanged, viewer floor), with no check of the record's own visibility. So an OWNER can attach an `OWNER_ONLY` record (G1 lets an owner) and every household member (including a viewer) then receives a signed link to it. The page's own upload path uses `HOUSEHOLD`, so the ordinary flow is not exposed; the HTTP API is. | code-traced (not executed) | `serializeDocument`, `getCaseDetail`; `visibleRecordWhere` |
| G10 | Parsing and attaching have the contributor floor on the HTTP routes since D9 (FRD v1.295). Parse itself does not re-check that the *caller* can see the underlying record (only attach does). | code-traced | `negotiationShield.routes.ts`; `parseCaseDocument` |
| G11 | The Pi runs in-process OCR: `tesseract.js` and `sharp` on an ARM single board, inside the API request. Time and memory for a large image were **not measured**. | inferred | memory note "Prod runs on Raspberry Pi ARM"; G5 |

## 4. Design principles

1. **Home Records only.** Ask attaches an existing Home Record by id through the canonical `attachDocumentMetadata` documentId branch. It never writes the legacy `Document` table and never reuses the Project Tracker option list (G2, G7).
2. **The household-visible rule.** A case is shared with the household, so only records the whole household may see are offered, even to an owner (closes G9 for Ask without waiting on the HTTP fix).
3. **Attaching is a write; show what is shared.** Review and confirm, naming the record, its kind, its sensitivity and who can see the review.
4. **No file contents or links in Ask.** Titles, kinds, scan and parse status only; never a URL, storage key or extracted text (slice 1 rule; G6 shows the engine never needs them echoed).
5. **Reuse the service; extract, don't copy.** Any step the controller or page adds around the service (the contributor floor, the applicability gate, analytics) is shared, not re-implemented.
6. **Smallest useful slices.** Attach (with a documents section on the review) is valuable alone (G3); parse is separable and costlier.

## 5. Proposed slices

### 3a — Attach an existing Home Record, and show what is attached

- **Documents on the review:** a compact "Documents" list on the review (title, type, "scan pending/clean", "parsed/not parsed"), with no link and no file name beyond the record title. The reader selects the link rows and the record's title, kind and the current version's scan/integrity status, not `storageKey` or `fileUrl`.
- **Entry:** an **Attach a document** action on the review (contributor and above; the four startable scenarios), also offered from the thin-evidence limitation text ("a premium notice would raise confidence").
- **Flow:** (1) choose the document's role in this review (a short choice from that scenario's types, G3 list below) → (2) choose a record from a bounded list of **household-visible, active** Home Records, most relevant kinds first (title, kind, added date, sensitivity label) → (3) confirmation: "This shares *<title>* (<kind>, <sensitivity>) with everyone who can see this review. It is not read or analyzed by attaching." → write.
- **Write:** `NegotiationShieldService.attachDocumentMetadata` with `documentId` and the chosen type (the service already de-duplicates the link). A new `NEGOTIATION_SHIELD_CASE_ATTACH` operation.
- **Idempotency:** the link is idempotent by `(caseId, documentId)` (G1), which is exactly the operation's identity, so no new key is needed.
- **Receipt:** "Document attached", with **Review** and, because G3, a note that the next analysis will count it, and **Run it again** when an analysis exists.
- **Document roles by scenario** (derived from what each rules engine counts, G3): quote → `QUOTE`, `SUPPORTING_DOCUMENT`; premium → `PREMIUM_NOTICE`, `SUPPORTING_DOCUMENT`; claim → `CLAIM_SETTLEMENT_NOTICE`, `CLAIM_ESTIMATE`, `SUPPORTING_DOCUMENT`; urgency → `CONTRACTOR_RECOMMENDATION`, `CONTRACTOR_ESTIMATE`, `SUPPORTING_DOCUMENT`. (The page's own per-scenario list was not compared; inferred equal.)
- **No detach:** the service and routes have no unlink, so there is nothing to mirror. Recorded as a traditional gap, not designed here.

### 3b — Parse an attached document (separate decision; D-P1..D-P3)

- **Entry:** **Read this document** on an attached, scanned, clean document.
- **Flow:** confirmation ("This reads the file on the server and saves the details it finds with this review. Details you entered yourself always take priority. Nothing is sent to anyone.") → `parseCaseDocument` → a result that lists **only the normalized fields it found** (count and the field/value pairs the analysis can use) and any parser warnings. Never raw text.
- **Effect:** it adds or refreshes one parsed input; the review's "details changed after the analysis" signal then offers **Run it again** (2b).
- **Not yet scanned:** the document shows "being scanned"; the action is not offered, and the service's 409 is never the user's first sight of it.
- **Cost and placement:** see D-P2.

### 3c — Upload a new file (deferred; D-U)

Needs a Home Records create call from Ask (G7: today's Ask upload makes a legacy row), a sensitivity choice, the duplicate-content handling the page has (G8), scan latency (G4), and a client upload control. It is its own design, after 3a is verified live.

## 6. Required vs how

**Required:** a contributor or owner can put an existing record in front of a review, see what is attached, and optionally have its details read, with confirmation before each write, through the canonical service, without leaking a file, a link or its text, and without exposing a record to people who could not already see it.

**How (open):** list size and ordering; whether the role choice and the record choice are one form or two steps; how parse results are summarized.

## 7. Decisions needed from the owner

| # | Decision | Recommendation | Why |
| --- | --- | --- | --- |
| D-A1 | Which records may be attached from Ask | **Household-visible, active Home Records only**, even for an owner | G9: the case is household-shared; an owner-only record would be exposed. Matches buyer FRD 11.4 (private stays private). |
| D-A2 | Sensitivity | **Offer STANDARD, FINANCIAL, INSURANCE and CLAIM; do not offer PERSONAL, SECURITY or LEGAL**, and say why when a person looks for one | Those three are unlikely to belong with a price negotiation and carry the highest exposure; the page classifies everything STANDARD (G8), so an unrelated sensitive record is the real risk. |
| D-A3 | Fix G9 in the service/HTTP path | **Yes, as its own small correction** (attach rejects a non-household-visible record, and `getCaseDetail` withholds url/key unless the record is visible to the caller) | A real exposure through the existing API; independent of Ask. |
| D-P1 | Should Ask parse at all in this phase | **After 3a is live-verified**, as 3b | It writes a durable input that changes the analysis; the owner has not yet seen attach working. |
| D-P2 | Where parse runs | **Measure first.** If a representative image/PDF finishes well inside the request budget on the Pi, run it synchronously behind the confirmation; otherwise it needs a background job with a status read (a larger design). | G11: in-process OCR on ARM, unmeasured. |
| D-P3 | What a parse shows | **Fields found and warnings only, never text** | G6: the engine does not need the text; D4's rule. |
| D-U | Upload from Ask | **Defer** | Four unresolved sub-decisions (G7, G8, scan latency, a client control). |
| D-X | Detach | **Not designed** | Not a desktop capability. |

## 8. Defects found while reading (not fixed)

1. **G9 — signed URL and storage key returned for any attached record regardless of the record's visibility.** Highest priority; see D-A3.
2. **G8 — every Negotiation Shield upload is classified `STANDARD`**, including claim and premium notices (the enum has `CLAIM` and `INSURANCE`). Product question; not changed.
3. **G10 — parse does not re-check that the caller can see the record**; only attach does. Low risk today (the link exists only if an eligible caller attached it) but not defense in depth.
4. **No detach path** (service or route).

## 9. Registry and validation checklist (per new operation)

For `NEGOTIATION_SHIELD_CASE_ATTACH` (and, later, `…_PARSE`): operation definition, internal-operations list, command registry, audience policy, semantic-package maps, trust corpus, coverage matrix, mutation-impact map (refresh the review and the list), skill-less governance entry, answer-trust action ids **in `OPERATION_ACTION_IDS`** (and the boundary id where a review is embedded in a receipt), capture path with its key and context version, orchestrator import. Then `startupRegistryValidation`, the explorer registry suite, the desktop-link guard (no "on the page" copy), and a before/after comparison of the neighbouring suites.

## 10. Tests that must fail on HEAD

- **Scope:** only household-visible, active, same-property records resolve; an owner-only, trashed or other-property id is "no longer available".
- **Sensitivity:** PERSONAL / SECURITY / LEGAL records are not offered and are refused at confirmation if forged.
- **Authorization:** a viewer is blocked before any choice; the confirm re-checks role.
- **Atomicity and idempotency:** one `attachDocumentMetadata` call with `documentId`; a replay creates no second link; `sourceType` recomputed as the page does.
- **No leaks:** results carry no `fileUrl`, `storageKey`, extracted text or desktop link.
- **Review:** the documents list shows title/type/scan/parse state only.
- **Analysis effect:** attaching changes the next analysis's document counts (service-level, with stubs).
- **3b (later):** unscanned documents are not parseable; parse output shows fields, never text; manual input still wins.

## 11. Risks and what stays unverified

- Nothing here ran against a database, a real file store, a virus scan, or the OCR engine. G11 (Pi cost of OCR) is a measurement still to be made.
- Document scan status is asynchronous; a file attached before it is clean cannot be parsed yet, and the Ask answer must say that without implying failure.
- D-A3 changes what a VIEWER receives from the existing API; a client relying on the signed URL for owner-only records would lose it (it should not have had it).

## 12. Suggested order

D-A3 (service/HTTP visibility correction, independent) → 3a (attach, with the documents list on the review) → owner live verification → measure OCR on the Pi (D-P2) → 3b (parse) → 3c (upload) as its own design.
