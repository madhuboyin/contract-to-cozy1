# Project Tracker: moving the project document store to Home Records — design

**Status:** Decisions D-P1 to D-P8 ruled by the owner on October 13, 2026 (§7, which supersedes §4 and the parts of §3 it amends). Slices 0 (correctness and inventory, FRD v1.375) 1 (links, child entity types and the dual-write transaction, v1.376) and 2 (the dispute package as a Home Record, v1.377) and 3 (pickers, Home Record uploads and retired key inputs, v1.378) are built; slice 4 is not.
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

## 7. Owner rulings (October 13, 2026) and what changed because of them

| Decision | Ruling | Direction |
|---|---|---|
| D-P1 | **Amend** | Home Record id plus link only with a declared canonical source and atomic dual writes. The stored id and version are the workflow's durable reference; the `PropertyRecordLink` is the deletion-impact and reverse-navigation projection. Both are written in one database transaction, a write fails if either cannot be created, readers use the stored id and version and verify the link, and a repair check finds missing or mismatched links. The link's uniqueness is `(recordId, entityType, entityId, purpose)` with no `versionId`, and the transaction helper is a no-op on conflict, so choosing a newer version for the same entity and purpose would not update the binding: decide per use whether replacing evidence updates the link's `versionId` (contracts, receipts, current attachments) or several versions coexist and `versionId` joins the uniqueness (historical evidence in a dispute or a completion declaration). |
| D-P2 | Accept | Add the five child entity types. |
| D-P3 | Accept | Household-visible, active, clean, any type; sensitivity shown, not filtered. |
| D-P4 | **Amend** | A dedicated `PROJECT_DISPUTE_PACKAGE` record type, not `OTHER`, with a `LEGAL` or `CLAIM` sensitivity and an immutable generated version. Object storage cannot join a database transaction, so: render and upload the PDF; in one database transaction create the Home Record and version, the package row and the link; if that fails delete or enqueue cleanup of the orphaned object, and record a failed cleanup for retry. Never hold a transaction open while rendering or uploading. This corrects §3.3's "same transaction". |
| D-P5 | Accept | Project uploads go to Home Records through the canonical upload service. |
| D-P6 | **Amend** | No automatic rewrite, but the read-only inventory runs in slice 0. Classes: valid Home Record and version; valid legacy; missing or dangling; raw key resolving to an object only; raw key resolving to no object; ambiguous or duplicated. A legacy reference is accepted only if it is already stored on that exact record, belongs to the same property, no new write reproduces it, and it is never offered as a new option. |
| D-P7 | Accept | Fix completion and evidence validation first. |
| D-P8 | Accept | Store a user id consistently and audit existing mixed values. See §7.2: the codebase's own convention is not what the column comment says, so the writer change was not made without the owner knowing. |

For the PDF: never fall back to printing a storage key; print "Contract document unavailable" or "Contract document removed".

### 7.1 Slice 0 as built (FRD v1.375)

- **One resolver:** `projectDocuments.service.ts` (`listProjectDocumentOptions`, `resolveProjectDocuments`, `assertProjectDocuments`) with the D-P3 rule; a legacy id is accepted only through `transitionalLegacyIds` (the ids already stored on that exact record) and never listed.
- **Ask:** options and validation read Home Records; the selected ids are what completion looks up, so the §1.3 failure is fixed (the regression test failed 4 of 4 before the change); a warranty document goes in as the `warranty` proof, not as a storage key; contract documents are stored as `contractDocumentIds` on create and edit; issue attachments are stored as `evidenceDocumentIds`. The upload control is removed from project document fields because the shared route stores a legacy Document (D-P5 is slice 3).
- **Fields removed from Ask until slice 1:** payment receipt, change-order supporting document and progress photos. Their only stored shape is a copied storage key and there is no id column to hold a Home Record reference; storing the id in a key column would be a lie. The forms say photos are not attached from Ask yet. This is a deliberate, disclosed regression of three optional fields, not an oversight.
- **Services:** issue notes, issue create and update, change-order compliance review (previously unvalidated) and the dispute package's evidence use the resolver; a recheck cannot be completed with typed ids that resolve to nothing in this property. Completion proofs (both loops) require an active, household-visible, clean Home Record of the property. The handoff's `contractDocumentIds` and Material Specs' document check accept eligible Home Records (Material Specs also still accept a legacy document of the property, because that domain's own migration is separate and its desktop form takes typed ids).
- **Dispute package:** the snapshot is `project-dispute-package-v2` and carries the contract document's label and state instead of a key, and each evidence item's exact `versionId`. The PDF prints the document's title, "Contract document unavailable" or "Contract document removed", never a key.
- **Inventory:** `prisma/project-document-reference-inventory.pgadmin.sql` (read only) classifies every id and key column and the `uploadedBy` kinds.
- **Not built in slice 0:** links, entity types and the dual-write transaction (slice 1); ids written by slice 0 therefore have no link until slice 1's backfill and repair check, which is an interim state the ruling on D-P1 would not accept as a final one; the dispute package as a Home Record and the cleanup of its object (slice 2); desktop pickers and Home Record uploads from Ask (slice 3).

### 7.2 The `uploadedBy` finding

`Document.uploadedBy` is commented as a user id. The legacy document routes, the Ask evidence upload and the `documentAuth` uploader check (`document.uploadedBy === homeownerProfile.id`) use the **homeowner profile id**; `providerCredential` compares it to a **user id**; the dispute-package writer stores a **user id**. Changing the evidence-upload writer to a user id, as ruled, would make `documentAuth` stop recognising the uploader of every new Ask upload, and the "my documents" list (`where: { uploadedBy: homeownerProfile.id }`) would stop listing them. So the writers were left as they are and the inventory classifies the existing values (user id, profile id, both, neither). **Decision needed:** keep the profile-id convention for the legacy routes and correct the column comment and the dispute writer; or change every writer and reader together as one slice.

### 7.3 Slice 1 as built (FRD v1.376)

**Canonical source, declared (D-P1):** the Home Record id stored on the project's own row (and, for evidence, the exact version in a stored map) is the workflow's durable reference. The link is the deletion-impact projection. Every writer creates or changes both in one database transaction through `syncProjectDocumentLinks`, so a write fails if the link cannot be written; readers use the stored reference; `findProjectDocumentLinkProblems` is the repair check.

**Schema (edited, not pushed):** five `PropertyRecordLinkEntityType` values (`PROJECT_PAYMENT`, `PROJECT_CHANGE_ORDER`, `PROJECT_PROGRESS_LOG`, `PROJECT_ISSUE`, `PROJECT_ISSUE_NOTE`); id columns for the three references that only had a key (`ProjectPayment.receiptDocumentId`, `ProjectChangeOrder.supportingDocumentId`, `ProjectProgressLog.photoDocumentIds`); and version maps for evidence (`ProjectChangeOrder.complianceEvidenceVersionIds`, `ProjectIssue.evidenceVersionIds`, `ProjectIssueNote.evidenceVersionIds`).

**The link-uniqueness question, decided per use (the `(recordId, entityType, entityId, purpose)` key has no `versionId` and is left as it is, because quote, savings and tax code upsert on it):**

| Use | Rule | Why |
|---|---|---|
| Contract document, payment receipt, change-order supporting document, progress photos | `REPLACE`: another record removes the old link; the same record's link moves to the version it was chosen at | the current document is the one that matters |
| Issue evidence, issue-note evidence, change-order compliance evidence | `KEEP_BOUND_VERSION`: a record already cited keeps its bound version; new records bind to the version chosen; unlisted records lose their link | the evidence is what was shown when it was cited. Multiple versions of one record never coexist on one entity, and each note or issue is its own entity, so a later note binds the record's version at that time |
| Dispute package | slice 2 | its snapshot already records each evidence item's `versionId` |

**Writers:** contract documents (create, edit, handoff), payment receipt (mark paid), change-order supporting document (create, edit) and compliance evidence (review; cleared with the review when the impact changes), progress photos, issue evidence (create, edit), issue-note evidence. The Ask fields removed in slice 0 are back and write the id columns. The milestone photo gate and the photo count now count Home Record photos too, which would otherwise have made a photo chosen in Ask invisible to the gate; the desktop log page and Ask's log list count both. The gate does not check that a Home Record photo still exists after a purge.

**Repair:** `scripts/repair-project-document-links.ts` is a dry run by default and, with `--apply`, creates missing links, moves a mismatched link to the version the entity bound, removes orphan links, binds evidence written before version maps existed to the version its link has (or the current one, and says so), and re-checks.

**Interim state from slice 0 closes here:** ids written between the two slices have no link until the repair is run.

**Not built:** the dispute package as a Home Record (slice 2), desktop pickers and Home Record uploads from Ask (slice 3), retirement of the transitional path (slice 4). The key columns are no longer written by Ask; the desktop's typed-key paths remain until slice 3.

### 7.4 Slice 2 as built (FRD v1.377)

**Sequence (D-P4, corrected from §3.3):** render the PDF; stage the object through `homeRecordsService.stageGeneratedDocument` (pre-allocated record and version ids, the canonical storage key, the checksum header); then one database transaction creates the Home Record (`PROJECT_DISPUTE_PACKAGE`, `LEGAL`, household-visible, verified by the system at generation), its first and current version (`CLEAN`, integrity `VERIFIED`, the object's etag), the `ProjectDisputePackage` row (`documentId` is the record id, `storageKey` the version's object) and the link (`PROJECT_ISSUE`, purpose `SOURCE`, bound to the version). No transaction is open during rendering or upload. If the transaction fails, `discardStagedObject` deletes the object, or records its key in `OrphanedStorageObject` when deletion fails; the purge worker's tick retries recorded keys until they are gone (`retryOrphanedObjectCleanup`). A failure to even record the key is logged with the key.

**Schema (edited, not pushed):** `PropertyRecordType.PROJECT_DISPUTE_PACKAGE` and the `OrphanedStorageObject` table. The record type is not in the Home Records upload route's list, so a person cannot create one; the Home Records page labels it "Project dispute package".

**What changed for the legacy store:** `generateDisputePackage` no longer creates a `Document` row; the dispute-package path was the project service's last unconditional legacy writer (the completion fallback for a keyless proof remains until slice 4). Existing packages keep their legacy `documentId` and are not rewritten (D-P6); the link audit skips them as legacy and checks new ones.

**Link rule:** each package version is its own record with its own `SOURCE` link to the issue, so the helper's replace semantics are not used (they would remove earlier versions' links). The repair check now expects the link for every package whose `documentId` is a Home Record.

**Not covered:** the evidence documents a package cites are not linked (the package is not a link entity type, D-P2); their versions are in the immutable snapshot. Purging a package record leaves the package row's `documentId` dangling, which the deletion-impact link exists to disclose beforehand.

### 7.5 Slice 3 as built (FRD v1.378)

- **Desktop:** the change-order compliance review's evidence field was a comma-separated string of ids; it is now `ProjectDocumentPicker`, which lists active, household-visible, clean Home Records with type and sensitivity, says how many owner-only records were left out, selects by record id, and adds a file through `uploadRecordForWorkflow` (the canonical Home Records upload; an exact duplicate reuses the existing record). Receipt, photo and issue-evidence attachment have never had a desktop control, so there was no typed field to replace for them; adding one is a new feature, not part of this slice.
- **Ask uploads (D-P5):** a project document field declares `uploadTarget: 'HOME_RECORDS'`; `AttachEvidenceControl` takes a `store` and, for `HOME_RECORDS`, stores the file with `uploadRecordForWorkflow` and returns the record id. The shared Ask evidence route (which stores a legacy `Document`) is unchanged and remains the default for every other Ask capture; changing it was ruled out of this arc.
- **Key inputs retired (D-P6):** `contractDocumentKey`, `receiptDocumentKey`, `supportingDocumentKey`, `photoKeys`, `attachmentKeys` are removed from the project, handoff, payment, change-order, log and issue request schemas, so a request cannot reference an object by key. The id fields replace them (`contractDocumentIds` (one), `receiptDocumentId`, `supportingDocumentId`, `photoDocumentIds`, `evidenceDocumentIds`). A new project's contract document is validated as an eligible Home Record in `createProject`.
- **Not changed (deliberate):** the Material Specs documents on the project materials page (typed ids; a separate domain with its own validator and a transitional legacy-or-record check); completion's `warrantyDocumentKey` and `completionRecordKey` and the legacy fallback for a proof with no id (slice 4); existing stored keys, which remain readable.
