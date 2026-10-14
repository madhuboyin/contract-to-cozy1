# Project Tracker: moving the project document store to Home Records — design

**Status:** Proposed. Nothing in this document is built. It needs the owner decisions in §4 before slice 0.
**Date:** October 13, 2026
**Scope:** Every place a Project (`ProjectRecord`) and its children (payments, change orders, progress logs, issues, issue notes, dispute packages) refer to a document, what store each one reads and writes today, and how they move to Home Records without leaving dangling references.
**Not in scope:** Removing the legacy `Document` model (the Documents-retirement arc's "retire last" step, `HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md` §17.6), Material Specs' own document fields (a separate domain with its own validator), and the renovation case's scope documents (v1.359).
**Governing documents read:** `docs/product/HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md` §17.3 (S5e, which converted completion proofs only) and §17.6; `docs/architecture/RENOVATION_PROJECT_HANDOFF_IN_ASK_DESIGN.md` §1.5 (why the handoff carries no documents); `docs/architecture/PROPERTY_TAX_EVIDENCE_AND_INTAKE_IN_ASK_DESIGN.md` (the eligibility, link and purge rulings reused here); `docs/architecture/AUDIT_METHODOLOGY.md`.

## How claims are labelled

Every statement about existing behaviour is **code-traced** (read in the source, function named, not run), **executed** (run, with the command) or **inferred**. Nothing here is executed: no database or browser was available. The failure in §1.3 is code-traced and slice 0 includes a test that reproduces it.

## 0. Summary

1. **Project documents are written to two stores by two surfaces, and one flow cannot work today.** The desktop uploads completion proofs to Home Records. Ask uploads, lists and validates project documents against the **legacy** `Document` table, but the canonical completion service looks proof ids up in **Home Records**, so a proof chosen in Ask is refused (§1.3).
2. **The service still creates new legacy rows.** The dispute-package generator writes a legacy `Document` for every package it makes (§1.2), and the Ask evidence upload route creates legacy rows for every Ask upload.
3. **Most of the stored references are copies of storage keys, not references.** Payments, change orders, progress logs and issues store S3 keys; the contract is a key copied from the legacy row's `fileUrl`. A Home Record's purge deletes the stored object, so a key copy dangles with no signal (§1.4).
4. **Nothing reads most of them back.** The id and key columns are write-only apart from the issue-note and dispute validators, which gives the migration unusual freedom, and means a dangling reference is invisible today.
5. **Change-order compliance evidence is not validated at all** (§1.5).
6. A raw storage key is printed into the dispute-package PDF as the "Contract record" (§1.5).

## 1. What exists today

### 1.1 The stored references (code-traced: `prisma/schema.prisma` project models)

| # | Column | Holds | Written by |
|---|---|---|---|
| 1 | `ProjectRecord.contractDocumentIds` | document ids | handoff (legacy-validated), Ask create; nothing reads it |
| 2 | `ProjectRecord.contractDocumentKey` | a storage key | Ask create/edit (copied from the legacy row's `fileUrl`), handoff input; read by the dispute PDF and the desktop's has-contract check |
| 3 | `ProjectRecord.completionRecordKey`, 4 `warrantyDocumentKey` | storage keys | completion input (Ask warranty path); fall through to a legacy `Document` upsert |
| 5 | `ProjectPayment.receiptDocumentKey` | a storage key | Ask mark-paid; the desktop client type allows it, no desktop caller found |
| 6 | `ProjectChangeOrder.supportingDocumentKey` | a storage key | change-order create/update |
| 7 | `ProjectChangeOrder.complianceEvidenceDocumentIds` | document ids | change-order compliance review, **unvalidated** (§1.5) |
| 8 | `ProjectProgressLog.photoKeys` | storage keys | Ask log-progress; desktop reads a count only |
| 9 | `ProjectIssue.attachmentKeys`, 10 `evidenceDocumentIds` | keys, ids | Ask log/edit issue; ids typed on the desktop |
| 11 | `ProjectIssueNote.evidenceDocumentIds` | ids | `addIssueNote`, validated against the legacy table |
| 12 | `ProjectDisputePackage.documentId` | a document id (no foreign key) | `generateDisputePackage`, which creates the legacy row |
| 13 | `ProjectRecord.documents` / `Document.projectId` | legacy relation | dispute package and the legacy completion fallback |
| 14 | closeout declarations (JSON) `evidenceDocumentIds` | document ids | `confirmCompletion`; Ask passes an empty list |

Completion proof documents are the exception: since S5e they are Home Records linked to the `HomeEvent` (`PropertyRecordLink`, entity `HOME_EVENT`).

### 1.2 Who writes the legacy store (code-traced)

- `generateDisputePackage` renders a PDF, uploads it, and creates a legacy `Document` (type `OTHER`, `projectId`, verified, with `sha256` and metadata) inside the same transaction as the `ProjectDisputePackage`. The row's `uploadedBy` is the user id.
- `POST /api/documents/property/:propertyId/evidence-upload` (Ask's upload) creates a legacy `Document` and sets `uploadedBy` to the **homeowner profile id**. The column is documented as a user id (`uploadedBy String // userId`), and the dispute package sets a user id, so the same column holds two kinds of id depending on the writer.
- `confirmCompletion` and `completeMinorWork` keep a legacy upsert for a proof with no `documentId` and for the warranty and completion-record keys.

### 1.3 The Ask completion flow (code-traced; reproduced by a test in slice 0)

Ask's project document fields list `prisma.document.findMany({ where: { propertyId } })` (25 most recent), validate selections with `projectDocuments` against the same table, and its upload control posts to the legacy evidence-upload route. For **Complete project**, the handler passes each chosen document as `proofDocuments: [{ documentId: <legacy Document id>, … }]`. `confirmCompletion` handles an entry with a `documentId` by `tx.propertyRecord.findFirst({ where: { id: proof.documentId, … } })` and throws `409 INVALID_PROOF_DOCUMENT` when it is not found. A legacy `Document` id is never a `PropertyRecord` id, so **every proof chosen in Ask is refused**; only a completion with no proof documents, or only a warranty key, can succeed. The desktop's `ProjectProofUploader` uploads through Home Records first, so it works. The error is a 409 from the service, so it surfaces as a stale confirmation, not as a crash.

### 1.4 Key copies (code-traced)

Keys 2, 5, 6, 8 and 9 are `fileUrl` values copied from legacy rows. A Home Record has versions, each with a `storageKey` that the purge worker deletes before the row; a key copied from one is a pointer to an object that may be deleted with no link and no deletion-impact entry. No reader dereferences these keys (grep: the only readers are the dispute PDF text, the desktop's boolean check and a count of logs with photos), so today nothing breaks visibly. They also cannot show a title, a version or a verification state.

### 1.5 Defects found while reading (code-traced)

- **Unvalidated evidence.** `reviewChangeOrderCompliance` stores `complianceEvidenceDocumentIds` as received. The desktop's change-order page takes a comma-separated typed string. A recheck can be marked complete (the service requires only that the list is non-empty) with ids that belong to no document or to another property.
- **A storage key in a document people receive.** The dispute-package PDF prints `Contract record: <contractDocumentKey>`, a raw object key, to whoever the package is shared with. It should name the document.
- **Ask options are legacy only.** A household whose documents are Home Records sees an empty list in every Ask project document field.
- **No dereference check anywhere.** Deleting a legacy document or purging a Home Record leaves the id or key in the project record, and nothing reports it.

## 2. Outcomes required, and what is only one way to get there

- **R1.** A document a project cites is a Home Record the household can see, chosen from a list, never a typed id or a copied key.
- **R2.** Deleting or purging that record is disclosed beforehand (deletion impact) and leaves the project readable ("document removed"), not broken.
- **R3.** Desktop and Ask resolve, list, validate and upload against one store with one eligibility rule.
- **R4.** A generated document (the dispute package) is itself a Home Record, immutable per version.
- **R5.** Existing legacy references keep working until the retire-last step, and are countable.

Mechanisms (candidates, §3): where the reference lives, whether children get their own link entity types, and what happens to legacy data.

## 3. Design

### 3.1 One reference model: Home Record id, linked

A project document is a Home Record **id**, and the relationship is a `PropertyRecordLink` (the pattern Property Tax slice 3 and Home Records already use), so the record's deletion impact lists it and purge leaves a readable project.

- **Entity types.** `PROJECT` exists. Children need their own: `PROJECT_PAYMENT`, `PROJECT_CHANGE_ORDER`, `PROJECT_PROGRESS_LOG`, `PROJECT_ISSUE`, `PROJECT_ISSUE_NOTE` (five enum values and `entityExists` cases). Linking everything to `PROJECT` with a label would make "which payment's receipt" unrecoverable from the link, which is what the column was for.
- **Purposes** reuse the existing enum: contract and approvals `SOURCE`/`APPROVAL`, receipts `RECEIPT`, change-order support `ATTACHMENT`, compliance and issue evidence `EVIDENCE`, warranty `WARRANTY`, the dispute package `SOURCE`.
- **Version binding.** Evidence links record the version the person chose (`versionId`), so a later revision of the file does not silently change what an issue or a dispute package cited.
- **The id columns stay** (they are cheap, indexed by the existing arrays and read by the Ask forms) and hold the same ids as the links; the **key columns stop being written** (slice 3) and are read only by a transitional reader (§3.4).

### 3.2 One resolver and one eligibility rule

A single `resolveProjectDocuments(propertyId, role, ids)` in the project service replaces the three legacy checks (issue-note validation, dispute-evidence validation, Ask's `projectDocuments`) and the unvalidated change-order path. Rule, aligned with the Property Tax ruling D-T2 and the renovation evidence picker: the same property, active and not trashed, visible to the whole household (a project is shared), a current version with a clean scan, any record type; the sensitivity label is shown and is not a filter. A legacy `Document` id is accepted only through a transitional option (§3.4).

### 3.3 Generated documents are Home Records

`generateDisputePackage` creates the PDF as a Home Record through the Home Records service (new record, immutable version, `OTHER` or a dedicated type: D-P4) in the same transaction as the package, links it to the issue (`PROJECT_ISSUE`, `SOURCE`), and stores the record id in `documentId`. The checksum already stored on the package becomes verifiable against the version's recorded hash. The PDF names the contract document by title, not key.

### 3.4 Existing data (R5)

Legacy ids and keys are not rewritten automatically: copying objects between stores is the retire-last arc's work and there is no way to tell which legacy rows a project still needs. Instead: (a) a read-only **inventory** counts, per column, ids and keys that resolve to a legacy row, to a Home Record, or to nothing; (b) the resolver accepts a legacy id **only** for rows the project already holds (a transitional flag naming the column), so no new legacy reference can be created; (c) if the inventory shows no legacy references, slice 4 removes the transitional path outright.

### 3.5 Purge behaviour (R2)

Because the links exist, the record's deletion impact lists the project, payment, change order or issue that cites it. After a purge the id remains in the project's array, the link is gone with the record, and the readers show "document removed" (a resolver result of `REMOVED`), not an error. Confirmed project facts are never altered by a purge.

## 4. Decisions needed from the owner

| ID | Question | Recommendation |
|---|---|---|
| D-P1 | Reference by Home Record id plus a link, replacing copied keys? | Yes. |
| D-P2 | Add five child link entity types (`PROJECT_PAYMENT`, `PROJECT_CHANGE_ORDER`, `PROJECT_PROGRESS_LOG`, `PROJECT_ISSUE`, `PROJECT_ISSUE_NOTE`)? | Yes. |
| D-P3 | Eligibility: household-visible, active, clean scan, any type, sensitivity shown not filtered? | Yes, as the Property Tax D-T2 ruling. |
| D-P4 | Dispute package as a Home Record: which `PropertyRecordType`? | `OTHER` with a distinguishing title and metadata, unless a dedicated type is wanted. |
| D-P5 | Ask upload: should project fields upload to Home Records (a new upload variant) while the shared legacy evidence-upload route is left for the other Ask captures? | Yes; do not change the shared route in this arc. |
| D-P6 | Legacy references: no automatic rewrite, inventory first, transitional accept-only-what-exists? | Yes. |
| D-P7 | Order: fix the Ask completion and the unvalidated change-order evidence first as slice 0 (they are defects), then converge writers? | Yes. |
| D-P8 | `uploadedBy` mixed meaning (§1.2): record it as a finding and fix only the writer in this arc (store the user id)? | Yes; the column's documented meaning is user id. |

## 5. Proposed slices

0. **Correctness first.** One resolver; Ask's options, validation and proof ids read Home Records (so Complete project works); change-order evidence validated; the dispute PDF names the document. A test reproduces §1.3 before the fix and passes after. No schema change.
1. **Links and entity types.** The five enum values and `entityExists` cases; writers create links for contract, receipts, change-order support and evidence, issue and note evidence, progress photos.
2. **Dispute package as a Home Record** (§3.3).
3. **Desktop pickers and Ask upload to Home Records** (D-P5): replace the typed-id fields; Ask project upload variant; stop writing the key columns.
4. **Inventory and retire** (§3.4): the read-only inventory, then removal of the transitional path if nothing legacy remains.

Each slice carries its own FRD revision and tests. Nothing here is verified against a database or a browser.

## 6. Adversarial pass

- "Nothing reads most of them back" (§0, §1.4): grep for the key and id column names shows readers only in the dispute-package text (`contractDocumentKey`), the desktop detail page's has-contract check, `photoKeys: { isEmpty: false }` filters in two queries, and the issue-note and dispute validators. The closeout package builder's project, case, requirement and condition sections (read to line 2900) carry no project document column; the remainder, including how closeout declarations' `evidenceDocumentIds` are rendered, was not read, and if it dereferences one of these, "write-only" is too strong for that column.
- "every proof chosen in Ask is refused" (§1.3): code-traced from `confirmCompletion`'s `propertyRecord.findFirst`. It depends on a legacy document's id never also being a `PropertyRecord` id; both default to uuids, so a collision is not expected but was not checked against data.
- "the desktop has no caller for receiptDocumentKey" (§1.1): grep of the frontend source finds the client type and no component that sets it.
- "A household whose documents are Home Records sees an empty list" (§1.5): from `projectDocumentOptions` reading only `prisma.document`; Home Records visibility in that picker was not exercised.
- Corrected during drafting: an earlier note (FRD v1.359) said the Project Tracker "reads Document rows for name, file and size". The code shows it reads only the Ask handler's `fileUrl`, `name`, `fileSize` and `mimeType` at the moment of selection, to copy a key; no stored column is later dereferenced to a Document row.
