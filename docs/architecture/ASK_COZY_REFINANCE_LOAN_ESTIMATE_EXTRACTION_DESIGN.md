# Ask Cozy — Loan Estimate extraction (read an official Loan Estimate into a comparison): design

**Status:** Decisions D-L1 to D-L9 accepted as recommended (2026-10-27). The two prerequisites (configurable upload sensitivity; the widened offer form checked against Desktop's schema) are built (section 13). The read step and everything after it are **not built** and stay gated on the Pi measurement (D-L7, section 6).
**Date:** October 27, 2026
**Parent:** `ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md` (Mortgage Refinance Radar row); FRD revisions 1.435–1.438.
**Template:** `ASK_COZY_NEGOTIATION_SHIELD_DOCUMENTS_DESIGN.md` §13 (upload 3c is built; parse 3b is designed and gated).
**Method:** `AUDIT_METHODOLOGY.md`. Claims are labelled **code-traced** (read in source), **executed** (run) or **inferred**. This repository has no database or browser; nothing here was run against either.

---

## 1. What this is for

On Desktop a homeowner can choose a Loan Estimate PDF (or up to three page images), have the figures read out of it, review them in an editable offer, and compare. In Ask a homeowner must type every figure of both offers (27 fields). The owner confirmed (2026-10-27) that this is a real parity item and not a permanent boundary, and asked for: the shared Home Records upload, an explicit extracted-field review, privacy and retention copy, and the Pi OCR timing gate before choosing synchronous or background execution.

## 2. What Desktop does today (code-traced)

| Step | Behaviour | Where |
| --- | --- | --- |
| Pick | One PDF **or** one to three images (JPEG, PNG, WEBP), 10 MB each; a PDF plus anything else is refused ("not a mixed batch"). | `LoanEstimateComparisonCard.tsx` `extractDocuments`; route multer `files`, max 3 |
| Read | `POST …/refinance-radar/loan-estimates/extract`, **synchronous in the request**, behind `uploadRateLimiter` and `ocrRateLimiter`. The file is held in memory (`multer.memoryStorage`) and **never stored**. | `refinanceRadar.routes.ts` |
| Method | PDF with a text layer: `pdf-parse` then regex. No text layer: render pages (`pdf-to-img`, scale 2.5, **max 3 pages**) and OCR them with `tesseract.js` (one worker created per request and terminated after). Images: `sharp` preprocessing then OCR. **Deterministic parser, no AI model.** | `refinanceLoanEstimateExtraction.service.ts` |
| Result | 17 fields, each `{ value, confidence HIGH/MEDIUM/MISSING, sourceLabel }`; `requiredFieldsFound / requiredFieldCount`; `extractionMethod`; `documentConfidencePct`; `pageCount`; page integrity (`COMPLETE`, `PARTIAL`, `DUPLICATE`, `OUT_OF_ORDER`, `UNVERIFIED`); warnings; `reviewRequired: true`. | same |
| Provenance | The response also carries an `ExtractionEnvelope` and an HMAC `serverAttestation` (24 h, bound to property and envelope hash). The client holds both and sends them back inside the saved offer; `saveRefinanceLoanEstimateComparison` **verifies the attestation** and emits a `DOCUMENT_PROMOTED` property change with the lowest field confidence. | `…Attestation.ts`, `refinanceLoanEstimateSnapshot.service.ts` |
| Review | "Apply" copies the values into an **editable** offer and says "Review every field against the PDF before comparing". Low-confidence fields are badged. Nothing is saved until the homeowner saves the comparison. | `applyExtraction` |
| Analytics | `refinance_loan_estimate_extracted` with method and counts only. | controller |

Two consequences that shape the design:

1. **Desktop retains nothing.** Ask's shared upload picker stores a **Home Record** (household-visible). Doing it the Ask way is therefore a real change in retention, not parity. This is the central decision (D-L1).
2. **Desktop's offer has more figures than Ask's form.** The extractor reads discount points (% and $), the five-year total and principal paid, and the issued date. The Ask offer form has none of them, and the comparison's five-year metrics need the pair. Extraction without those fields would drop figures Desktop keeps (D-L5).

## 3. Design principles

1. **Extraction never writes a comparison.** It produces a candidate; the existing review and confirmation save it.
2. **Review before the values enter the form.** The homeowner sees what was read, how sure the reader was, and what was not found, before any field is prefilled.
3. **The server holds the proof.** The envelope and attestation stay in the execution's stored parameters; the client never carries them, so there is nothing to forge or lose.
4. **Say what is kept.** The upload creates a Home Record; the copy before the file picker opens says so (§4).
5. **Deterministic and bounded.** Same parser, same limits, same rate limiters as Desktop; no LLM.
6. **Declared-action only; no desktop link** (owner rule 2026-10-10). The file never leaves the server.

## 4. Proposed flow

**Entry.** On the saved-comparisons answer and on the "Compare Loan Estimates" action: **Fill from a Loan Estimate file**, for a contributor or owner (an upload and a save both need it).

**Step 1: choose the files (one capture form).**
- Two optional `DOCUMENT_MULTI_SELECT` fields, `offerAFiles` and `offerBFiles` (`allowUpload`, `uploadTarget: 'HOME_RECORDS'`), each "one PDF **or** one to three images"; at least one is required. A homeowner can fill one offer from a file and type the other.
- **Copy shown before the file picker opens (D-L2):** "Uploading adds this file to this home's Home Records, where members of your household with access can see it, and it stays there until someone deletes it. A Loan Estimate shows your name, address and loan details. Ask reads it on the server to find the figures; it does not send the file or the figures anywhere."
- The upload is the shared workflow upload (D-U3 limits: JPEG, PNG, WEBP, PDF, 10 MB). **Uploading never extracts by itself.**
- Record type `CLOSING_DOCUMENT` and sensitivity `FINANCIAL` (D-L3). The upload control currently hard-codes `STANDARD`; making sensitivity configurable next to the existing configurable type and description is a small prerequisite change. `FINANCIAL` is already in the set Ask will offer for attach (`NEGOTIATION_ATTACH_ALLOWED_SENSITIVITIES`).

**Step 2: read (the extraction operation).**
- Re-read each record inside the property: visibility `HOUSEHOLD`, current version scan `CLEAN` and integrity `VERIFIED`, type and sensitivity as uploaded, a PDF alone or images only (the Desktop mix rule), at most three images. Refuse with a plain reason otherwise.
- Fetch the bytes through the same signed-URL path the Negotiation Shield parse uses, run `extractLoanEstimateFromUpload` per file and `combineLoanEstimateExtractions`, build the envelope and attestation exactly as the controller does, with `documentId` set to the Home Record id (D-L4).
- Execution: synchronous or background, per §6.
- Emit `refinance_loan_estimate_extracted` with the same counts and an Ask source.

**Step 3: review table (the explicit review).** A TABLE block per offer: field, value, confidence (High / Medium / Not found), and the Loan Estimate section it came from; above it, one line with the method ("read from the PDF's text", "read from an image with OCR", "read from a scanned PDF with OCR"), pages detected and page-set status in plain words, required fields found (n of m), and the parser's warnings. Medium and not-found rows are marked **Check this against your Loan Estimate**. No raw text, no file name and no link (as D-P3). Actions: **Use these values** and **Don't use them**.

**Step 4: the existing form, prefilled.** "Use these values" opens the existing Loan Estimate comparison form (D-L5 adds the missing fields) with the extracted values filled in and every field editable. Required fields the reader did not find are blank and must be typed. The other offer is blank unless it was also read.

**Step 5: the existing confirmation, with provenance.** The confirmation lists every figure; for an extracted offer each line also shows its tier, so a Medium figure is approved knowingly. On confirm the comparison is saved through `saveRefinanceLoanEstimateComparison` with each extracted offer's `extractionProvenance` taken from the stored parameters (Desktop attaches it even when the homeowner edited values; the attestation proves what was read, not that nothing was corrected). The existing revalidation, idempotency and reconciliation apply unchanged. If the attestation has expired (24 h), the save is refused with a message to read the file again.

## 5. What changes, by area

| Area | Change |
| --- | --- |
| Frontend | `AttachEvidenceControl` takes sensitivity from the field (default `STANDARD`, so Project Tracker and Negotiation Shield are unchanged). `CaptureFieldControl` already passes `uploadRecordFor`; a new field config supplies the Loan Estimate record. A two-field multi-file form needs `maxItems: 3` and a mixed-batch check on the client as well as the server. |
| Backend | New command kind or operation (§7) with the read step; a function that reads a Home Record's bytes (reuse the negotiation helper, extracted); stored parameters `refinanceExtraction` per offer; widened offer schema and form fields (D-L5); confirm path attaches provenance. |
| Registry | New action ids in `OPERATION_ACTION_IDS`; if a new operation: operation registry, domain command registry, `KNOWN_UNGOVERNED_OPERATIONS`, discovery inventory decision (declared-action only), `startupRegistryValidation.test.js`. |
| Docs | FRD revision; parity register row; this document's §9 updated with the measurement. |

## 6. Execution: synchronous or background (the Pi gate)

The extraction runs inside a request on Desktop. In Ask it would run inside an Ask execution, behind a capture submit, on the production Raspberry Pi. What is unknown and cannot be decided from code: wall-clock time and peak memory of OCR there.

**Facts from code.** A text-layer PDF is fast (`pdf-parse` plus regex). A scanned PDF renders up to three pages at scale 2.5, then OCRs each with a freshly created Tesseract worker (English data loaded per request, `cacheMethod: 'none'`). Images run `sharp` (2400 px wide, grayscale, normalize, sharpen) then OCR. Three images means three OCR passes in one request.

**Measurement to run before any build (owner, on the Pi), recorded in this section:**
1. A one-page and a three-page **text** PDF.
2. A three-page **scanned** PDF (the worst case: render plus three OCR passes).
3. Three phone photos of 3 to 4 MB each (preprocess plus three OCR passes).
4. Two extractions started together.
For each: elapsed time and peak resident memory of the API process.

**Decision rule.** If the worst realistic case (items 2 and 3) finishes well inside the Ask request budget with memory headroom, run **synchronously behind the capture submit**, with one extraction at a time per API process (a second concurrent request answers "busy, try again in a moment" rather than queueing OCR workers). If not, build a background job with a status read, which is a larger design this document does not assume. A text-layer PDF may be run synchronously either way if it measures fast; the scanned path alone could be the deferred one. **No code until this is measured.**

## 7. Operation shape (to decide with D-L6)

Recommended: a **new command kind on `REFINANCE_COMMAND`** (`READ_LOAN_ESTIMATE`) for the read-and-review (contributor floor, declared-action only), reusing its capture, stored-parameters, context-version and reconcile machinery, with the save staying the existing `ADD_COMPARISON` confirmation. A separate operation would duplicate that machinery for no gain. `REFINANCE_COMMAND` must then be allowed to return the review TABLE (already allowed) and nothing else new.

The read step is not a write to the refinance record, but it does create a Home Record (the upload) and calls OCR, so it is confirmation-free but contributor-only, and the privacy copy sits on the upload, not on a confirmation.

## 8. Tests that must fail on HEAD

- A PDF with images, more than three images, or a non-household / wrongly sensitive / unscanned / other-property record is refused **before** any extraction call.
- Extraction output is shown with tiers and warnings and contains no raw text, file name or link (assert on the serialized blocks).
- "Use these values" prefills every extracted field, leaves not-found required fields blank, and the form still requires them.
- The confirmation shows each extracted figure with its tier; the saved offer carries `extractionProvenance` that `verifyLoanEstimateExtractionAttestation` accepts; an expired or foreign attestation is refused.
- The client never receives the envelope or attestation (assert on the response and on the stored `resultJson`).
- Concurrent second extraction returns "busy"; a parser that throws (unreadable PDF, OCR failure, page limit) writes nothing and says so, but the **uploaded record remains** and the message says it does.
- The widened offer schema accepts discount points, five-year pair (both or neither) and issued date; a hand-typed offer without them is unchanged.
- The upload control sends `FINANCIAL`; Project Tracker and Negotiation Shield uploads still send `STANDARD`.
- Through `submitAskCapture` (the recording-fake harness in `refinanceParityCommands.test.js`): a retried submit returns the stored review and does not extract twice or emit analytics twice; a changed comparison list does not invalidate a pending extraction.

## 9. Decisions

Owner (2026-10-27): **go with the recommendations on D-L1 to D-L9.** D-L1 to D-L6, D-L8 and D-L9 are therefore settled; D-L7 stays a measurement-gated rule.

| # | Decision | Recommendation | Why |
| --- | --- | --- | --- |
| D-L1 | Where the bytes live: **Home Records** (retained, household-visible) or **read-only, not stored** (as Desktop) | **Home Records**, as you directed, with D-L2 copy; revisit only if the household-visible retention of a loan document is unacceptable | The shared upload is the only upload path Ask has; a not-stored read would need a second, Ask-specific multipart route and a client that posts files outside the capture protocol. It also gives the homeowner a durable copy of the document the comparison came from. |
| D-L2 | Pre-upload copy | As §4, shown before the picker | Retention and visibility are real side effects before any confirmation (same trade as D-U1). |
| D-L3 | Record type and sensitivity | `CLOSING_DOCUMENT`, `FINANCIAL` | Files and searches properly; `FINANCIAL` is already attachable by Ask. Needs the configurable-sensitivity change. |
| D-L4 | `documentId` in the envelope | The Home Record id (Desktop sends null) | Provenance can then point at the stored document. The attestation covers the envelope as built, so this is safe. |
| D-L5 | Widen the Ask offer form to carry discount points, five-year pair and issued date | **Yes**, optional fields, both-or-neither for the five-year pair | Otherwise extraction drops figures Desktop keeps and Ask's comparison cannot show five-year metrics. The form is already long (27 fields); splitting it into one step per offer is advisable and is a separate small change. |
| D-L6 | Operation shape | New kind on `REFINANCE_COMMAND` (§7) | Reuses the proven machinery. |
| D-L7 | Execution model | **Open: decide from §6** (the rule stands: synchronous behind the capture submit, one at a time per process, only if the measured worst case fits; otherwise a background job) | Needs the Pi measurement; the owner's "go with your recommendations" has no recommendation to adopt here beyond that rule. |
| D-L8 | Confirmation shows confidence per extracted figure | Yes | The "explicit review" asked for; costs one line per figure. |
| D-L9 | Who may read | Contributor and owner | The upload and the save both require it; a viewer reading would create nothing usable. |

## 10. Limitations to record, not fix here

- A scanned PDF is limited to three pages; a longer one is refused as on Desktop.
- Page images are not de-duplicated or re-ordered by Ask; the parser's page-integrity status reports it and the review shows it.
- The parser is regex over the standard TRID layout; a non-standard or altered form may read poorly, which is what the tiers and warnings are for. Lender name is not extracted and is always typed.
- A failed extraction leaves the uploaded Home Record in place (the upload happened first). Removing it is a Home Records action; Ask has no delete (consistent with Negotiation Shield D-X).
- The signed-URL read inherits the page's assurance about the "CLEAN" flag, which is a synchronous heuristic, not antivirus (Negotiation Shield H3).

## 11. Risks and what stays unverified

- Everything here is code-traced. The multi-file `DOCUMENT_MULTI_SELECT` (up to three items) has not been exercised in Ask; the single-item case is built for Negotiation Shield 3c and is itself not browser-verified.
- OCR time and memory on the Pi are unmeasured (§6).
- That a signed URL can be fetched server-side from inside the Ask execution worker is **inferred** from the Negotiation Shield service, which does it inside a request.
- The attestation secret falls back to `JWT_SECRET`; behaviour when neither is set throws, as on Desktop.

## 12. Suggested order

1. Owner decisions D-L1 to D-L9 and the Pi measurement (§6).
2. Prerequisite: configurable upload sensitivity; widen the offer fields and schema (D-L5), which is useful on its own.
3. Build the read step and review table behind the measured execution model.
4. Wire prefill, confirmation tiers and provenance on save; tests of §8.
5. FRD revision; parity register; record the measurement here.

## 13. Prerequisites built (2026-10-27)

Both were agreed in §12 step 2 and are useful without the read step.

1. **Configurable upload sensitivity (D-L3).** `DocumentUploadRecord` (frontend and backend contract) gains an optional `sensitivity`; `CaptureFieldControl` passes it and `AttachEvidenceControl` uses it, defaulting to `STANDARD`, so Project Tracker and Negotiation Shield uploads are unchanged. Jest: a field declaring `FINANCIAL` files `FINANCIAL`; a field declaring nothing still files `STANDARD`.
2. **The widened offer (D-L5).** The Ask comparison form and answer schema gain, per offer: discount points (% and $), total and principal paid in the first five years, and the issued date, all optional, with **blank meaning absent, never $0**. A shared `refinanceOfferFromAnswer` builds the canonical input used for both validation and save.
3. **Ask offers now meet Desktop's rules.** Before the confirmation, Ask runs both offers through Desktop's own `compareLoanEstimatesSchema` (five-year pair both-or-neither and principal not above total, points consistency, real calendar dates, ranges). A failure keeps the form with the schema's message ("Offer 1: ...") and saves nothing. **Before this change Ask built offers without any of those cross-field checks**, so this also closes a quiet gap for hand-typed offers.

Tests: `refinanceParityCommands.test.js` (blank is absent; figures kept; the canonical rules reject a half pair, principal above total and 2026-02-30; the command path returns the caution form and accepts a valid pair).

Not done, on purpose: the read step, the review table, the upload field on the comparison form, the provenance on save, and any change to the form's length (one step per offer remains advisable).
