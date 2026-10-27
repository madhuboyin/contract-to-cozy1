# Ask Cozy — Negotiation Shield documents (attach, read, parse): design

**Status:** Decisions accepted as recommended (2026-10-12). D-A3 (the visibility correction) is built and verified (section 8a; FRD v1.300). 3a (attach, with the Documents list) is built and verified (section 8b; FRD v1.301); attach was widened to buyer reviews in FRD v1.433. 3b (parse) and 3c (upload) are designed in section 13 (2026-10-26) and not built.
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

## 8a. D-A3 — the visibility correction (built; FRD v1.300)

- **Attach:** after the caller-role check, the record must also be `HOUSEHOLD`-visible and not trashed, else 409 `NEGOTIATION_SHIELD_DOCUMENT_NOT_SHARED`. A non-owner still gets the existing 404, so existence is not hinted.
- **Read:** a non-household record keeps its type and link (counted by the analysis) but is returned as "Private document" with no link, key, type or size, regardless of who reads. This closes G9 for records attached before the check as well.
- **Parse:** refuses a non-household record before any text is read (closes the G10 write side: private text never lands in a shared input).
- **Tests (executed, stubs):** `tests/unit/negotiationShieldDocumentVisibility.test.js` (5).
- **Not verified:** a database and a real file store; the existing page's behaviour for a pre-existing private attachment (it now shows "Private document" with no link).

## 8b. 3a — attach (built; FRD v1.301)

- **Built as designed.** One form (role, then record) instead of two steps; the Documents block carries the action because the review summary is already at the three-action cap.
- **Concrete rules:** records come from `listPropertyDocuments` (Home Records only), filtered to household visibility, active lifecycle, allowed sensitivity, not already attached; bounded at 25; the confirmation re-reads the record, not the form.
- **Reader:** the review reader now also returns the attached documents (link id, record id, role, title or "Private document", shared, ready), selected without storage key, file link or file name.
- **Executed finding:** the answer-trust validator does not strip an un-allowlisted action from a GROUPED_LIST block's own actions (it does from a SUMMARY), so the allowlist for this action is asserted directly.
- **Not done:** parse (3b), upload (3c), detach.
- **Not verified:** a database and a real file store; the rendered Documents block and form.

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

---

## 13. Upload (3c) and parse (3b): detailed design (2026-10-26)

Written after attach reached every review kind (FRD v1.433) and the buyer edit and completion-evidence work. Same labels as section 3: **code-traced** (read in source, not run), **inferred**. Nothing here was run; the repository has no database or browser.

### 13.1 What changed since sections 3 to 11 were written

| # | Fact | Label | Effect on the design |
| --- | --- | --- | --- |
| H1 | **Ask can already store an uploaded file as a Home Record.** A capture field `DOCUMENT_MULTI_SELECT` with `allowUpload: true` and `uploadTarget: 'HOME_RECORDS'` makes `AttachEvidenceControl` call `uploadRecordForWorkflow` (the page's own helper) and return the record id; Project Tracker uses it (owner ruling D-P5). | code-traced | **G7 is stale for this purpose.** The legacy-`Document` problem applies only to the older `ASK_EVIDENCE` store, which this design does not use. |
| H2 | `uploadRecordForWorkflow` creates the record `HOUSEHOLD`-visible, treats `PROPERTY_RECORD_DUPLICATE_CONTENT` as "use the existing record" (returning that record's id, whatever its visibility or sensitivity), and the Ask control hard-codes `recordType: 'OTHER'`, `sensitivity: 'STANDARD'`, JPEG/PNG/WEBP/PDF, 10 MB. The page maps the Negotiation Shield role to a record type (claim notice to `CLAIM`, premium notice to `INSURANCE_POLICY`, inspection report to `INSPECTION_REPORT`, the rest `OTHER`) and also uses `STANDARD`. | code-traced | A record uploaded from Ask is eligible for attach by construction (household, STANDARD). The record type will differ from the page's mapping unless the control is told the role (D-U2). |
| H3 | **The scan is not asynchronous.** `scanStatus: 'CLEAN'` and `integrityStatus: 'VERIFIED'` are written when the record or version is created; the code comments say CLEAN means magic-byte and content-threat heuristics passed, not antivirus. A failed storage write marks the version `FAILED`. | code-traced | **G4's "still being scanned" latency and the section 11 risk do not apply to a normal upload.** A file is parseable the moment it exists. The 409 is only reachable for a `FAILED` or mismatched version. |
| H4 | `parseCaseDocument` now (a) refuses a record that is not `HOUSEHOLD`-visible (409 `NEGOTIATION_SHIELD_DOCUMENT_NOT_SHARED`), (b) supports all five scenarios including `BUYER_INSPECTION_NEGOTIATION`, (c) refreshes **one parsed input per case document** (`_meta.caseDocumentId`), so re-parsing is idempotent. It takes `(propertyId, caseId, caseDocumentId)` and no role; the HTTP route supplies the contributor floor. | code-traced | G10 is partly closed (visibility). The sensitivity rule of D-A2 is still not enforced at parse (13.4). |
| H5 | Parsing is local: `pdf-parse` (text layer only), `sharp` + `tesseract.js` for images (resized to 2,200 px wide, English), then label/regex extraction. No model call. The Desktop shows the parsed fields and lets the household correct them with manual input, which wins. | code-traced | A scanned PDF with no text layer yields little text; the result must say so (13.4). OCR time and memory on the Pi remain **unmeasured** (G11). |
| H6 | The attach form's context version is `sha(caseId + sorted ids of the offered options)`. | code-traced | An upload changes the offered list, so the form's own version goes stale the moment the upload succeeds (13.3). |
| H8 | **`DOCUMENT_MULTI_SELECT` always submits an array**, even with `maxItems: 1` (`['record-id']`), and the attach answer parser requires `recordId` to be a string. | code-traced | The field cannot replace `recordId` as-is; see 13.3. |
| H9 | **Two different "nothing found" cases.** Extracted text under 20 characters makes `parseNegotiationShieldDocument` throw 422 `NEGOTIATION_SHIELD_DOCUMENT_PARSE_EMPTY` before any write. Text of 20 or more characters with **zero extracted fields** is not an error: `parseCaseDocument` still creates or updates the parsed input (raw text, warnings, `parsedFieldCount: 0`). | code-traced | The first draft of 13.4 said an empty parse leaves the review unchanged; that is true only for the first case. See 13.4. |
| H10 | `AttachEvidenceControl` writes the upload's description as `Project document: <field title>` and records `recordType: 'OTHER'`, `sensitivity: 'STANDARD'` unconditionally. | code-traced | Both must become configurable for this use (13.3). |
| H7 | The Ask Edit form pre-fills only the manual input's values; parsed values are not shown there (parsed inputs are immutable and merged under the manual one). | code-traced | After a parse, fields the parser filled look empty in Edit details. Recorded as a limitation, not blocking (13.5). |

### 13.2 Order

1. **3c Upload first.** It reuses an existing, owner-approved Ask pattern (H1), needs no OCR, and has no unmeasured cost.
2. **Measure OCR on the Pi** (13.5), which can run in parallel with 3c.
3. **3b Parse**, only after the measurement says synchronous is safe or a background job is chosen.

They stay separate operations. A combined "attach and read" step is a later convenience, not part of either slice.

### 13.3 Slice 3c: upload a new file into the attach form

**Behavior.** In the existing Attach a document form, the Document field becomes "pick a record or upload a file":

- The `recordId` field changes from a plain select to `DOCUMENT_MULTI_SELECT` (`maxItems: 1`, `allowUpload: true`, `uploadTarget: 'HOME_RECORDS'`), with the same options as today. **Because that field submits an array (H8), the answer key becomes `recordIds`**; the answer schema requires exactly one non-empty string in it and normalizes it to the single `recordId` the rest of the handler, the stored confirmation parameters and the canonical call already use. Tests: an empty array, two ids, a non-string or empty element, a bare string (the old shape, now rejected), and the one-element array an upload produces. Stored confirmation parameters keep `recordId`, so a confirmation opened before the change still validates (household-visible, active, allowed sensitivity, not already attached, newest 25, titles only).
- Choosing "Upload document" opens the file picker; the file is stored as a Home Record by the shared workflow upload and its id is selected. The role field ("What is it?") stays; the existing review and confirmation steps follow unchanged. **Uploading never attaches by itself** (FRD IW-CONV-023); attach still needs the review and the confirm.
- **Pre-confirmation copy, shown before the file picker opens** (owner decision D-U1): "Uploading adds this file to this home's shared Home Records immediately. You will review and confirm separately before it is attached to this negotiation review." The confirmation step must not imply that declining the attachment removes the uploaded record; it does not. This is the one real side effect outside the case, and it happens before confirmation (the same trade Project Tracker accepted in D-P5).
- **Upload metadata is configurable (H10).** `AttachEvidenceControl` takes the record type, sensitivity and description from the field instead of hard-coding them. For this form the description is neutral ("Workflow document: <review title>"), never "Project document". Project Tracker keeps its current values as the control's defaults, so nothing changes there.
- **Record type follows the chosen role (owner decision D-U2),** passed from the form's "What is it?" answer to the control: premium notice to `INSURANCE_POLICY`; claim settlement notice or repair estimate to `CLAIM`; inspection report to `INSPECTION_REPORT`; quote, contractor estimate, contractor recommendation, buyer request and supporting document to `OTHER` (the page's own mapping). If the role is not yet chosen when the file is picked, the control asks for the role first or the field is disabled until it is chosen. If this dependency makes 3c materially larger, `OTHER` is acceptable only as a documented first-slice limitation, not the intended end state. Sensitivity stays `STANDARD`, as on the page.

**Server changes.**
- `captureRequest` in `negotiationShieldAttach.handler.ts` emits the upload-enabled field. Nothing is written to storage by the backend handler; the client does the upload, as for projects.
- **Context version.** Bind it to the case and the ids already attached (the thing that actually decides whether a second attach is stale), not to the offered list. The offered list's drift is already covered by the re-query of the record at confirmation. Without this change every successful upload would fail its own submit with `ASK_CONTEXT_VERSION_CONFLICT` (H6).
- **A just-uploaded record must be accepted.** `negotiationShieldAttachResult` finds the chosen record in the freshly computed offer, which includes it (newest first, within 25) because the offer is recomputed on submit. If it is not found, the existing "That record is not available to attach" path runs.
- **Duplicate content (H2).** The upload may return an existing record. If it is already attached, say "That file is already attached to this review" rather than the generic message. If it is not offerable (private, or a sensitivity Ask does not offer), say that a copy already exists in Home Records but is not shared in a way Ask can attach, and that nothing was added. The duplicate helper returns the id without regard to eligibility, so the server-side filter is the control.
- No change to the confirmation, the execution-time record check or the canonical `attachDocumentMetadata` call.

**Differences from the page, stated.** Ask accepts only JPEG, PNG, WEBP and PDF up to 10 MB (owner decision D-U3); the page's accepted types were not compared.

**Not in this slice.** Replacing a file with a new version, detaching, and multi-file upload.

### 13.4 Slice 3b: read an attached document into the review

**Operation.** `NEGOTIATION_SHIELD_DOCUMENT_PARSE`, adapter `negotiation-shield.parse`, contributor floor, declared-action only, confirmation-gated, like attach and analyze.

**Entry.** A **Read this document** action on each row of the Documents block (the rows are `GROUPED_LIST` items, so this needs per-item actions), for a contributor or owner, on any of the five scenarios. The row already shows type and a ready flag. The launch carries the case id and the `NegotiationShieldDocument` link id (the id `parseCaseDocument` takes).

**Flow.**
1. Re-read the link inside the property, the record's visibility, lifecycle, sensitivity and current version state. Refuse, with a plain reason, if: not found; not `HOUSEHOLD` (H4); sensitivity not in the D-A2 set (new check, defense in depth because HTTP-attached records are not filtered); version not `CLEAN` and `VERIFIED` (H3: only reachable for a failed upload).
2. Confirmation: "This reads *<title>* on the server and saves the details it finds with this review. Details you entered yourself always take priority, and you can still edit them. Nothing is sent to anyone." If a parsed input already exists for this document, add: "This replaces the details found last time."
3. On confirm, call `NegotiationShieldService.parseCaseDocument` through a dynamic import (the module pulls in OCR; Ask's reads avoid it, as attach does). Re-check the record again at execution time.
4. Result block: the count of fields found; the **normalized fields** as label and value pairs where the value is a number, a date, a yes/no or a short string; for long text fields (inspection issues, requested repairs, notes) only "found" and its length, never the text; the parser's warnings in plain words; and **never** the raw text, the file name or a link (D-P3). Actions: **Review** and, if details exist, **Run the analysis** or **Run it again** (the existing "details changed after the analysis" signal covers the stale case).
5. **Two outcomes, kept distinct (H9), preserving the canonical service rather than changing it.**
   - *No readable text* (under 20 characters; the service throws 422 before any write): the review is unchanged. Say "Ask could not read any text in this file" and, for a PDF, that it may be a scan, because the PDF path does not OCR (H5); suggest a clearer photo.
   - *Text read, no details found* (zero fields): the service **does** save a parsed input with its raw text, warnings and a field count of zero, and Ask reports it honestly: "Ask read the file but could not find any details in it." That attempt is recorded on purpose: it keeps retries, diagnostics and the "this replaces the details found last time" wording coherent. The receipt must not say "nothing was saved". Note that a zero-field re-parse replaces an earlier parse that did find fields; the confirmation's replace sentence (step 2) is what warns of that.

**Idempotency.** Re-parsing refreshes the same parsed input for that case document (H4), so a retried confirmation is safe. The operation identity is the link id.

**Precedence, stated in the UI.** Manual fields win; parsed fields fill gaps (G6). This is already the service's rule; Ask only explains it.

**Cost and safety (D-P2 stays open until measured).**
- One parse at a time per API process: a second concurrent parse returns "busy, try again in a moment" instead of queueing OCR workers on the Pi.
- The request must finish inside the existing Ask execution budget; if the measurement says it cannot, the alternative is a background job with a status read, a separate larger design that this one does not assume.
- A parser that throws (including the under-20-character case) writes nothing, so the review is unchanged and the receipt says so. A zero-field parse is not a failure and is not unchanged (13.4, step 5).

### 13.5 Measurement before 3b is built (D-P2)

On the production-class Pi, time and peak memory for: a one-page text PDF; a three-page text PDF; a 4 MB phone photo of a quote; a scanned PDF with no text layer; and two parses started together. Record the timings in this section. If the worst realistic case is well inside the Ask request budget and memory headroom, parse runs synchronously behind the confirmation; otherwise 3b waits for a job design. This is the one decision I cannot make from the code.

### 13.6 Limitations to record, not fix here

- **H7:** Edit details shows only manual values, so fields filled from a document look empty there. A "found in a document" hint on that form is a possible follow-up. Typing a value saves it as manual, and it then wins.
- The page can detach nothing and neither can Ask (D-X).
- If the role-to-type mapping is deferred, uploads are filed as `OTHER` (13.3).

### 13.7 Registry and validation checklist (3b adds an operation; 3c does not)

3b needs: the operation in the operation registry with its adapter key; the declared message and action id in the allowlists (an action id outside `OPERATION_ACTION_IDS` is silently stripped); `KNOWN_UNGOVERNED_OPERATIONS` (a skill-less operation missing from it crash-loops the API at boot); the domain command registry entry (contributor floor, confirmation-gated, no typed route); discovery inventory and noun-phrase aliases if it should be discoverable (probably not: declared-action only); and `startupRegistryValidation.test.js` run. 3c adds no operation; it changes the attach capture field and its context version.

### 13.8 Tests that must fail on HEAD

**3c**
- The answer schema takes `recordIds` with exactly one id (empty, two, malformed and bare-string values are rejected) and normalizes to `recordId`; an upload's one-element array is accepted.
- The upload control sends the neutral description and the role-derived record type; Project Tracker's default values are unchanged.
- The attach form's document field declares `uploadTarget: 'HOME_RECORDS'` and `allowUpload`.
- A record that was not in the form's option list at open time (the just-uploaded one) is accepted on submit; the old version, bound to the option list, refuses it.
- A duplicate-content record that is already attached, and one that is private or of a sensitivity Ask does not offer, each get their specific message and write nothing.
- The confirmation and the canonical call are unchanged for an uploaded record.

**3b**
- A non-household, wrongly sensitive, failed-scan or other-property document is refused before any parse call.
- The confirmation states manual-wins and that nothing is sent; a re-parse says it replaces the earlier details.
- The result lists fields and warnings and contains no raw text, file name or link (assert on the serialized blocks).
- A second concurrent parse returns "busy"; unreadable text (the 422) leaves the review unchanged and says so; a zero-field parse persists and the receipt says the file was read but no details were found; a throwing parser writes nothing.
- The Documents block shows **Read this document** to a contributor and not to a viewer, for all five scenarios, and every action id survives the answer-trust validator.

### 13.9 Decisions

Recorded from the owner's review (2026-10-26) unless marked open.

| # | Decision | Outcome | Notes |
| --- | --- | --- | --- |
| D-U1 | Household-visible Home Record created before the attach is confirmed | **Accepted** | With the pre-confirmation copy in 13.3; the confirmation must not imply that declining removes the record. |
| D-U2 | Record type for an Ask upload | **Follow the chosen role** (mapping in 13.3); `OTHER` only as a documented first-slice fallback | Durable records should file and search properly; the page already maps them. |
| D-U3 | Upload limits | **Keep JPEG, PNG, WEBP, PDF, 10 MB** | Do not widen merely because the parser reads more. |
| D-U4 | Answer shape | **`recordIds`, exactly one, normalized to `recordId`** (H8) | Cleaner than a temporary dual-shape parser. |
| D-P1 | Gate for parse: owner has seen attach working | **Not satisfied.** Attach is code-traced and unit-tested only; no browser or database run. 3b stays gated until an owner observation is recorded here | Live verification of upload plus attach (3c) is the natural way to satisfy it. |
| D-P2 | Synchronous parse | **Open: decide from 13.5** | Needs the Pi measurement. |
| D-P3 | Show fields and warnings only | **Yes**; long text shown as "found", not quoted | Unchanged. |
| D-P4 | Enforce the D-A2 sensitivity rule at parse | **Yes**, in Ask's check at confirmation and execution | The service does not. |
| D-P5 | Zero-field parse | **Preserve the canonical behavior** (persist and report honestly); the under-20-character case stays an unchanged-review error (H9) | Recording the attempt keeps retries, diagnostics and the replace wording coherent. |

**Sequence.** (1) This amendment; (2) make the upload description and metadata configurable; (3) build 3c with the current limits and the pre-confirmation copy; (4) verify upload and attach through the real UI and record it here; (5) measure OCR on the Pi; (6) build synchronous 3b only if the measurement fits the request and memory budgets, otherwise design the background job.

### 13.10 Risks and what stays unverified

- Everything here is code-traced. The upload control inside an Ask form has not been exercised for this field, only for Project Tracker's; whether `CaptureFieldControl` renders the same way in the Ask capture form is **inferred** from Project Tracker's use of the same field type.
- OCR time and memory on the Pi (G11) are unmeasured.
- The `DOCUMENT_MULTI_SELECT` field has been exercised in Ask by Project Tracker only; that its array answer reaches this handler as `recordIds` is **inferred** from the capture path and is covered only by the new tests.
- The synchronous "CLEAN" flag is a heuristic, not antivirus (H3). Ask's parse and attach inherit exactly the page's assurance, no more.

