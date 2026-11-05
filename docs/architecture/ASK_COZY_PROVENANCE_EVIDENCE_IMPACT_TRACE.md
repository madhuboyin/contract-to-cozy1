# Ask Cozy Provenance and Evidence Storage Impact Trace

**Date:** November 5, 2026

**Scope:** Findings Implementation Plan, Phase 6 (`ASK_COZY_TECHNICAL_ARCHITECTURE_FINDINGS_IMPLEMENTATION_PLAN.md` §10). Finding F6 of `ASK_COZY_TECHNICAL_ARCHITECTURE_REVIEW.md` said that home knowledge is spread across `PropertyFactEvidence`, `HomeEvent` (with its two evidence tables), `SignalProvenance`, `ExtractedFactCandidate` and the legacy `Document` versus Home Record stores, and that no user-visible failure had been traced. This document traces it.

**Status:** audit, and all of its defects now fixed or decided (2026-11-05, §9 and §10): F6-2 (read-time visibility filter), F6-4 (atomic attach), F6-1 (links move on a correction, OD-6.1) and F6-3 for inventory items (bridge read, OD-6.3). The link-time half of Design B (OD-6.2) was deliberately not built (§10). No schema change. One data-repair script is provided for the owner to run (§10).

**Governing documents read first:** `AUDIT_METHODOLOGY.md`; `HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md` §17 (the Documents-retirement arc); `PROJECT_TRACKER_DOCUMENT_STORE_DESIGN.md`; `ASK_COZY_NEGOTIATION_SHIELD_DOCUMENTS_DESIGN.md`; `QUOTE_COMPARISON_HOME_RECORD_IMPORT_DESIGN.md`; `PROPERTY_TAX_EVIDENCE_AND_INTAKE_IN_ASK_DESIGN.md`.

## How claims are labelled

- **Executed:** a command was run and its output observed. Every command here was a search or a file read (listed in the Appendix). **No application code, test, database, Redis or browser was run for this audit.**
- **Code-traced:** read in the source with the function and line named, not run. Every finding below is code-traced.
- **Inferred:** stated as such.
- A claim that something has "no caller", "no reader" or "no writer" rests on the searches in the Appendix across `apps/backend/src`, `apps/workers/src`, `apps/backend/scripts` and `apps/frontend/src`. It does not cover raw SQL, deployed configuration other than what is named, or runtime reflection.

## 0. Result

**F6 is not closed as pure technical debt.** Three defects that cross the store boundary are demonstrated in code, plus incidental findings. None of the three needs a schema ownership change or a universal knowledge store to fix.

| # | Finding | Class | Severity |
|---|---|---|---|
| F6-1 | Correcting a Timeline event drops its Home Record evidence from the current revision. **Fixed 2026-11-05, §10** | Provenance / referential integrity | P2 |
| F6-2 | Linked-record titles are returned to roles that cannot see the record (Timeline list and detail, Material Spec detail). **Fixed 2026-11-05, §9.** The savings-outcome path named in the first draft is not exposed: only the property's owning profile can read it (§6) | Authorization / visibility | P2 |
| F6-3 | Documents attached to inventory items, warranties, insurance policies and claims are read from the legacy store only; a Home Record linked to them is not shown by any traced read path. **Fixed for inventory items 2026-11-05, §10; warranties, insurance and claims are the same pattern and remain open** | Missing interoperability | P2 |
| F6-4 | Event evidence attach is not atomic and detach leaves the evidence row | Referential integrity (legacy-internal) | P3 |
| F6-5 | Conversational capture and Ask evidence upload are a self-consistent legacy island that grows with use | Intentional bounded-context difference, with growing debt | P3 |
| F6-6 | `SignalProvenance` has no producer or consumer; no `PropertyFactEvidence` writer found cites a document | Unused model (fragmentation is partly nominal) | Observation |
| F6-7 | `Document.uploadedBy` still holds two kinds of id | Provenance (identity), mitigated | P3 |
| F6-8 | The document-to-event promotion function noted as "live in production" has no caller | Correction to an earlier document | Observation |
| F6-9 | Trashing a legacy document leaves its event links and gives no deletion impact | Intentional difference with a presentation gap | Observation |

Two things I expected to find and did not: an export that omits Home Record documents in any visible way (§6, downgraded after an adversarial pass), and a role bypass in the coverage quote picker (§6, ruled out).

## 1. What the earlier tracing established, and whether it is still current

| Earlier conclusion | Source | Status at this snapshot |
|---|---|---|
| `HomeEventDocument.documentId` and `HomeEventEvidence.documentId` are foreign keys to the legacy `Document` | §17.2, §17.3 | **Still current.** `schema.prisma` models `HomeEventDocument` (line 7732) and `HomeEventEvidence` (line 7692) still relate to `Document` |
| Conversational capture reads legacy documents on purpose until the home-event evidence link converts | `conversationalCapture.ts:138-141` | **Still current** (`fetchRecentDocumentContext` reads `prisma.document`) |
| The Ask evidence upload route writes a legacy `Document` | Project Tracker design §1.2, D-P5 | **Still current** (`document.routes.ts:506`) |
| The dispute-package generator writes a legacy `Document` | Project Tracker design §1.2 | **Superseded.** No `document.create` remains in `projectTracker.service.ts`; slice 2 moved it to a Home Record |
| `uploadedBy` holds a user id in some writers and a profile id in others | Project Tracker design §1.2, D-P8 | **Still current**, narrower (F6-7) |
| `homeEvents.autogen.ts`'s document promotion "is live in production" | §17.6 | **Corrected** (F6-8): the env flag is on, but the function has no caller |
| Most "confirmed dead" Document callers were live | §17.6 | Not re-examined here; this audit did not rely on any "no caller" claim for a Document caller except F6-8, and re-searched that one |

## 2. The named stores: producers and consumers

| Store | Producers (code-traced) | Consumers (code-traced) | Status |
|---|---|---|---|
| Legacy `Document` | Vault upload `document.routes.ts:166`; Ask evidence upload `:506`; `inspectionReadiness`, `providerCredential`, `home-management`, `negotiationShield` fallback, `claims` (three sites) | Document routes, inventory/warranty/insurance relations, report snapshot, health and score counts via `countPropertyDocuments`, Timeline evidence, conversational capture | Live |
| `HomeEventDocument` / `HomeEventEvidence` (legacy-keyed) | `homeEvents.service.attachDocument` / `addEvidence`; correction carry-forward; `buyerClosingDay` | `getHomeEvent`, `listHomeEvents`, correction copy | Live |
| `PropertyRecord` + `PropertyRecordLink` (Home Records) | Home Records upload and extraction promotion, Project Tracker, Property Tax, Negotiation Shield, Quote import, savings outcomes, Material Spec | Timeline (`HOME_EVENT` only), Material Spec detail, savings outcomes, project and tax link services, `homeRecords.service` | Live |
| `ExtractedFactCandidate` | `homeRecordsExtraction.service.ts:377, 422` | The same service (review and promote), `quoteHomeRecordImport.service.ts:173` | Live, Home Records only |
| `PropertyFactEvidence` | Property-context capture (`capturePropertyFact`, financing, mortgage, feature context) and `property.service.ts:1219` | Property context reads and grounded answers | Live; no writer cites a document (F6-6) |
| `SignalProvenance` | **None found** | **None found** | Unused in application code (F6-6) |

## 3. Consumer matrix

Columns: the evidence id and store the workflow accepts; how provenance and confidence are represented; the visibility and role rule; the correction and deletion lifecycle; export and search; the conversion or linking boundary.

| Workflow | Accepts | Provenance and confidence | Visibility and role | Correction / deletion | Export, search | Boundary |
|---|---|---|---|---|---|---|
| Conversational event capture (EVIDENCE candidate) | Legacy `Document` id only (`fetchRecentDocumentContext`) | Event row carries capture channel, attribution and extraction confidence; the evidence link row carries only `kind`, caption and `addedByUserId` | None (legacy documents have no record-level visibility) | Correction copies legacy links forward; deletion is a soft delete that keeps the link | Counted in scores through `countPropertyDocuments(includeLegacy)`; listed in the Home Records overview as transitional | Writes `HomeEventDocument` (FK to `Document`) |
| Ask evidence attach to inventory item or warranty | Legacy id; sets `Document.inventoryItemId` / `warrantyId` | None beyond who uploaded | None | Soft delete | As above | Legacy columns, not `PropertyRecordLink` |
| Home Records upload then promotion to warranty/expense | Home Record version | `ExtractedFactCandidate` has confidence, page, excerpt hash and review status; the promoted event is `EVIDENCE_VERIFIED`, `DOCUMENT_BACKED`, source type `DOCUMENT` | Record-level (`visibleRecordWhere`); promotion requires a visible record | Transactional promotion; trash gate counts active links | Home Records list and Ask record views | `PropertyRecordLink` (`WARRANTY`, `HOME_EVENT`) written in the same transaction |
| Project Tracker documents | Home Record id (slices 0-3) | Link purpose and entity type | Household-visible, active, clean scan (D-P3) | Links disclosed in deletion impact | Pickers list Home Records | Child link entity types |
| Negotiation Shield evidence | Home Record id (`NegotiationShieldDocument.documentId` retargeted) | Case document row | `visibleRecordWhere(role)` applied | Retargeted FK, cascade | Home Records picker | FK to `PropertyRecord` |
| Timeline "Add evidence" picker | Legacy id (`addEvidence` checks `prisma.document`) | `HomeEventEvidence` has type, note, `addedByUserId`; marks the event `PENDING_CONFIRMATION` | None | Detach leaves the evidence row (F6-4) | As above | Legacy FK |
| Report export snapshot | Legacy relations for inventory, coverage, warranties | n/a | Stripped from shared copies | n/a | See §6 | Legacy only |

## 4. Journeys traced

1. **Conversational event capture with legacy document evidence.** Message → extraction candidates → EVIDENCE child execution → `confirmCaptureEvidence` → `homeEventsServiceForCapture.attachDocument` (two sequential upserts, not in a transaction; F6-4) → `HomeEventDocument` plus `HomeEventEvidence`. The document ids offered to extraction are the eight most recent **legacy** rows only, so a document uploaded to Home Records is never offered as evidence (F6-5).
2. **Home Record upload then event attachment.** Reviewed extraction promotes in one transaction: a `Warranty`, a `PropertyRecordLink(WARRANTY)`, an evidence-verified `HomeEvent` and a `PropertyRecordLink(HOME_EVENT)` (`homeRecordsExtraction.service.ts:585-650`). This is the strongest path in the codebase. Its evidence is then lost when the event is corrected (F6-1).
3. **Project Tracker and Negotiation Shield evidence selection.** Both resolve through the canonical inventory with the caller's role, and both link Home Records. Consistent with their designs.
4. **Document candidate promotion.** Home Records only (journey 2). The conversational path uses AskExecution cards, not `ExtractedFactCandidate`; the two review pipelines share no candidate model, but each carries its own confidence and review state. This is a bounded-context difference, not a defect.
5. **Correction, access loss, archive and delete, export.** Correction: F6-1. Visibility: F6-2. Archive and trash of a Home Record: gated by active links (`homeRecords.service.ts` trash). Delete of a legacy document: soft delete that keeps links (F6-9). Access loss: reads go through `propertyAuthMiddleware`; the exposure in F6-2 is by role, not by revoked access. Export: §6.

## 5. Findings

### F6-1. Correcting a Timeline event drops its Home Record evidence from the current revision (P2)

**Evidence (code-traced).** `homeEvents.service.ts` `updateHomeEvent` creates a replacement revision and copies the legacy `documents` and `evidence` to it (roughly lines 805-825), then moves child events (roughly lines 838-850). It does not touch `PropertyRecordLink`. The Timeline reads record links by the **current** event ids (`listHomeEvents` lines 252-270, `getHomeEvent` lines 558-567). A search for any update or upsert of a `HOME_EVENT` link finds none outside project, quote and tax code (Appendix A).

**Failure scenario.** A warranty is promoted from a reviewed Home Record, producing an event with a `HOME_EVENT` link. The homeowner corrects the event title. The new current revision has no record links, so the Timeline no longer shows how it is known. The record's own page still lists a link, but to the superseded revision, which the Timeline does not show.

**Why it is a store-split defect.** The legacy evidence is carried forward and the Home Record evidence is not. The code's own comment says children "belong to the logical story, not to one historical revision."

**Falsifier tried:** a later hook or controller that re-points links. None found.

### F6-2. Linked-record titles reach roles that cannot see the record (P2)

**Evidence (code-traced).** `homeRecordsAccess.ts` states the rule: only owners see owner-only records, and a member "never learns that it exists." `homeRecords.service.addLink` (line 740) lets an owner link an owner-only record to any entity type, including a `HOME_EVENT`. The Timeline list and detail endpoints are guarded only by `propertyAuthMiddleware`, which admits every household role, and `getHomeEvent(propertyId, eventId)` takes no role. They return `propertyRecordLinks[].record.{id, title, recordType, lifecycleStatus}` and version scan and integrity status for every link. The same unfiltered shape appears in `materialSpec.service.ts:743` (title, type, status). `savingsOutcome.service.ts:47` has the same query shape, but its callers are restricted to the property's owning profile (`property: { homeownerProfile: { userId } }`), so no other role reaches it (§6). Project Tracker and Property Tax avoid this by admitting only household-visible records at link time (D-P3); the Timeline, Material Spec and savings paths have no equivalent rule.

**Impact.** A viewer or contributor can read the title and type of an owner-only record. File content is not exposed here (downloads go through record routes that apply the rule). The Material Spec endpoint is guarded by `propertyAuthMiddleware` like the Timeline, so it was affected too; the savings path was traced in §6 and is not.

### F6-3. Entity documents ignore Home Record links (P2)

**Evidence (code-traced).** The only code that reads `PropertyRecordLink` is: savings outcomes, Material Spec, quote import, project links and audit, Home Records extraction, the Timeline and Home Records themselves, and property tax (Appendix B). Nothing for inventory items, warranties, insurance policies or claims reads it. `inventory.service.ts` includes the legacy `documents` relation (lines 297, 338, 453, 622), the inventory drawer renders `item.documents` (`InventoryItemDrawer.tsx:336`) and its attach control is the legacy `DocumentPickerModal`, which continuity plan §17.4 describes as not yet converted (the picker itself was not re-read here). The Home Records page lets a user link a record to `INVENTORY_ITEM`, `WARRANTY`, `INSURANCE_POLICY`, `CLAIM`, `PERMIT` and `EXPENSE` (`HomeRecordsClient.tsx:154-166`), and the generic link API accepts them (`entityExists`, `homeRecords.service.ts:1013`).

**Impact.** A document linked to an inventory item from the Home Records page does not appear in that item's drawer, and the drawer's own attach control is the legacy picker. `countPropertyDocuments({ linkedToOtherRecords })` counts those links, so scores credit a link the item screen does not show. The warranty promotion path creates a `PropertyRecordLink(WARRANTY)` and no legacy row, so a promoted warranty's document is not on any legacy relation. I did not trace the warranty, insurance or claim screens in the frontend beyond their backend read layers.

### F6-4. Event evidence attach is not atomic, and detach leaves the evidence row (P3)

`attachDocument` (around lines 1163-1195) does a `HomeEventDocument` upsert and then a `HomeEventEvidence` upsert with no transaction; its sibling `addEvidence` uses `$transaction`. `detachDocument` (line 1206) deletes only the `HomeEventDocument`; nothing deletes `HomeEventEvidence` rows except cascade (Appendix C). This is internal to the legacy store, not caused by the split, but it sits on the capture path.

### F6-5. A self-consistent legacy island that grows with use (P3)

Conversational capture, the Ask evidence upload, `assertDocumentAttachAllowed` and the `HomeEventDocument` foreign key all use the legacy store, so they agree with each other. The cost is elsewhere: every new Ask-attached document is a legacy row with no version, no record-level visibility, no deletion impact and no extraction review, and it adds to the set the "retire last" step must retarget. `legacyNotYetInRecords` hides a legacy row only when its SHA-256 matches a Home Record; the Ask upload stores no checksum, so such rows are never deduplicated. Classified as an intentional bounded-context difference, because the earlier design deliberately deferred the home-event evidence retarget.

### F6-6. Two of the named models carry no document provenance (Observation)

`SignalProvenance` has no `create`, no read and no reference outside a deletion-cascade comment and a nullable `provenanceId` on `HomeEvent` (Appendix D). `PropertyFactEvidence` writers all record property-context capture, not a document. Document provenance lives in `ExtractedFactCandidate` and the `HomeEvent` source columns. Whether the `SignalProvenance` table has rows could not be checked without a database.

### F6-7. `uploadedBy` has two meanings (P3, mitigated)

Vault upload, Ask evidence upload and `home-management` store the homeowner **profile** id; `claims` (three sites) and `inspectionReadiness` store the **user** id. `documentAuth.middleware.ts:52` compares only the profile id, then falls back to a contributor-or-higher property check for property-scoped rows. `subscription.service.ts:90-97` counts both. The one residual case is a document with no `propertyId` uploaded under a user id: its uploader is not recognised as the uploader.

### F6-8. The document promotion function noted as live has no caller (Observation)

`HomeEventsAutogen.promoteDocumentEventToSemantic` is defined and referenced nowhere else in the repository (Appendix E), and it looks for a `doc:<id>:created` event that no code creates. §17.6 of the continuity plan calls the autogen document promotion live because `HOME_EVENTS_AUTOGEN` is set in the deployment; the flag is set, but this function is unreachable. The document-upload event it would promote also no longer exists (S4).

### F6-9. Trashing a legacy document keeps its links (Observation)

The delete route documents that it keeps links so "evidence ... is not silently broken" (`document.routes.ts` around line 722). The Timeline detail still lists the trashed document and the download is denied by `documentAuth` (`deletedAt: null`). A Home Record gives a deletion impact first. Intentional, with a presentation gap.

## 6. Adversarial pass

Every absolute claim above was checked against the strongest way it could be wrong:

| Claim tried | Result |
|---|---|
| "The export omits Home Record documents" | **Weakened.** `reportSnapshot.ts:73-75, 129, 163, 177` builds entity `documents` from legacy relations only, but `renderHomeReportPackPdf.ts` never prints documents and `redaction.ts:136-137` strips `documents` and `fileUrl` from shared copies. No visible consumer was found, so it is a stored-snapshot gap only and is not a finding. It also stores legacy storage keys (`fileUrl`) in the snapshot |
| "The coverage quote picker lists records as OWNER regardless of role" | **Ruled out.** `coverageCommands.handler.ts:150, 263` returns owner-only before `quoteSources` for the kinds that use it |
| "Correction drops links" | **Held.** No re-pointing code exists (Appendix A) |
| "No reader of `PropertyRecordLink` for entity documents" | **Held** for the backend read layer. The warranty, insurance and claim screens were not traced in the frontend |
| "`SignalProvenance` is unused" | **Held in application code.** Not checked in the database |
| "Savings outcome documents reach every household role" | **Ruled out (found while implementing F6-2).** `getHiddenAssetMatchOutcomes` and its siblings begin with an ownership check on `property.homeownerProfile.userId`, so only the owning profile reaches `documentsByOutcomeId`; the owner sees owner-only records anyway |
| "A Home Record id can be stored or read as a legacy id without notice" | **Ruled out in the paths traced.** `HomeEventDocument` and `HomeEventEvidence` are foreign keys to `Document`, so a Home Record id cannot be stored there; workflows that accept both stores resolve through `resolvePropertyDocuments`, which tags `source` |

## 7. Disposition and focused designs

**Disposition.** F6 stays open as three targeted defects (F6-1, F6-2, F6-3). A universal knowledge store and any change of schema ownership are **not** recommended; the existing foreign-key retarget arc is unchanged by this audit. No migration script is proposed. Any data repair is a read-only diagnostic first, then an idempotent pgAdmin script the owner runs, per the repository rule.

### Design A: carry Home Record links through a correction (F6-1)

- **Outcome.** The current revision of an event shows the same Home Record evidence as the revision it replaced.
- **Candidate mechanism.** In the `updateHomeEvent` transaction, re-point every `PropertyRecordLink(HOME_EVENT, oldEventId)` to the replacement id, matching how children are moved. Alternative: copy the link, which leaves two links per record but keeps the superseded revision's history.
- **Owner decision OD-6.1:** move or copy. Recommendation: move, because evidence belongs to the logical story and the trash gate then reasons about one link.
- **Tests (pure, with a fake transaction):** a correction moves every link; the unique key `(recordId, entityType, entityId, purpose)` does not collide; a correction with no links is unchanged.
- **Backfill.** First a read-only count, run by the owner (not executed here):
  ```sql
  SELECT count(*) AS links_on_superseded_events
  FROM property_record_links l
  JOIN home_events e ON e.id = l."entityId"
  WHERE l."entityType" = 'HOME_EVENT' AND e."isCurrent" = false;
  ```
  If it is non-zero, an idempotent script re-points each link to the head of its `supersedesEventId` chain. It is written only after the count and OD-6.1.

### Design B: one visibility rule for every linked-record descriptor (F6-2)

- **Outcome.** No read returns a linked record's title, type or file facts to a role that could not read the record.
- **Candidate mechanism.** A single helper that applies `visibleRecordWhere(role)` to link reads, used by `listHomeEvents`, `getHomeEvent` and Material Spec detail (savings outcomes were ruled out, §6), with the role threaded in from `req.householdRole`. Optionally also refuse to link an owner-only record to an entity visible to other roles at `addLink`, as Project Tracker and Property Tax already do.
- **Owner decision OD-6.2:** filter at read only, or also restrict at link time. Recommendation: both; the read filter is non-breaking and the link rule stops new exposure.
- **Tests:** an owner-only record linked to an event is absent for viewer and contributor and present for owner, on list and on detail; the same for Material Spec.

### Design C: one read of "documents for this entity" (F6-3)

- **Outcome.** An inventory item, warranty, insurance policy or claim shows both its legacy documents and its linked Home Records, and the drawer can attach either.
- **Candidate mechanism.** A canonical `listDocumentsForEntity(entityType, entityId, role)` that unions the legacy relation and `PropertyRecordLink`, marks each row's source as the inventory does today, and applies Design B's visibility rule. The longer-term path remains the retarget arc (S5d); this is a bridge so the two stores agree meanwhile.
- **Owner decision OD-6.3:** build the bridge, or wait for the S5d retarget. Recommendation: the bridge for inventory items first (the one user-visible surface traced), since S5d has no date.
- **Tests:** an item with one legacy document and one linked record returns both with correct sources; a viewer does not receive an owner-only record; the score count and the list agree.

F6-4 through F6-9 need no design here. F6-4 is a small fix (one transaction; delete the matching evidence row on detach) that can ride with Design A. F6-8 is a one-line correction to §17.6 of the continuity plan, left for the owner because that document is product-owned.

## 8. Not traced

- Any running system: no database, so row counts and whether `SignalProvenance` or orphaned links exist are unknown.
- The frontend warranty, insurance and claim screens beyond their backend read layers.
- Raw SQL, scripts outside `apps/backend/scripts`, and deployed configuration other than `HOME_EVENTS_AUTOGEN`.
- `scripts/copy-legacy-documents-to-home-records.ts` and its effect on event links (`legacyNotYetInRecords` hides a legacy row whose checksum matches a record, but the event link still points at the legacy row).

## Appendix: searches run

- **A.** `grep -rn "propertyRecordLink.update\|propertyRecordLink.updateMany\|propertyRecordLink.upsert"` over `apps/backend/src`, `apps/workers/src`, `apps/backend/scripts`: hits only in quote import, project links and audit, Home Records and property tax.
- **B.** `grep -rln "propertyRecordLink\b\|propertyRecordLink\.\|propertyRecordLinks"` over `apps/backend/src`: ten files, none for inventory, warranties, insurance or claims.
- **C.** `grep -rn "homeEventEvidence.delete\|homeEventDocument.delete"`: one hit, `detachDocument`.
- **D.** `grep -rni "signalProvenance"` over backend and workers source: a deletion-cascade comment only; `grep -rn "provenanceId"`: two lines, both in `homeEvents.service.ts`.
- **E.** `grep -rIl "promoteDocumentEventToSemantic"` over the whole repository excluding `node_modules`: its definition and one FRD mention.
- Also read: `conversationalCapture.ts`, `document.routes.ts`, `homeEvents.service.ts`, `homeRecords.service.ts`, `homeRecordsAccess.ts`, `homeRecordsExtraction.service.ts`, `propertyDocumentInventory.service.ts`, `reportSnapshot.ts`, `redaction.ts`, `materialSpec.service.ts`, `savingsOutcome.service.ts`, `inventory.service.ts`, `InventoryItemDrawer.tsx`, `HomeRecordsClient.tsx`, `documentAuth.middleware.ts`, `subscription.service.ts`, `coverageCommands.handler.ts`, and the `schema.prisma` models named above.

## 9. Implementation of the fixes that need no ruling (2026-11-05)

**F6-2, read-time visibility (Design B, read half).**

- `homeRecordsAccess.ts` gains `DEFAULT_LINKED_RECORD_ROLE` (`VIEWER`): a read that is not told the caller's role applies the least-privileged rule, so a forgotten argument can only hide a record.
- `HomeEventsService.listHomeEvents` and `getHomeEvent`, and `MaterialSpecService.getSpec`, take the caller's role and add `record: visibleRecordWhere(role)` to the link query. The Timeline and Material Spec controllers pass `req.householdRole`; the Ask timeline handler now resolves the role first and passes it.
- The link-time restriction (refusing to link an owner-only record to an entity other roles can see) is the other half of Design B and waits on OD-6.2.
- **Not changed:** the Material Spec lifecycle check at `materialSpec.service.ts:167` counts link purposes to gate a status change; it returns no record facts to the caller, so it was left alone.

**F6-4, atomic evidence attach.** `attachDocument` writes the `HomeEventDocument` and the mirroring `HomeEventEvidence` in one transaction. `detachDocument` deletes the link and, in the same transaction, the evidence row attach created (`document:<id>`, type `DOCUMENT`, no note and no observed date). Evidence a person added deliberately, with a note or a date, is kept.

**Evidence.** `tests/unit/phase6EvidenceVisibilityAndAtomicity.test.js` (11 tests) runs the real service code against an in-memory fake that evaluates the visibility filter and transaction rollback. Against the pre-change service the six tests that encode the defects fail (an owner-only title returned to contributors and viewers on list, detail and Material Spec; a link left without its evidence row after a failed second write; evidence left after a detach), and all 11 pass on the new code. This upgrades those findings from code-traced to reproduced against the fake. It still says nothing about Prisma's SQL or a real database. `homeTimelineEventsCapabilitySlice.test.js` was updated to expect the role argument, which also proves the Ask path passes the asking user's role.

**Still waiting on the owner:** OD-6.1 (F6-1: move or copy `HOME_EVENT` links on a correction), OD-6.2 (also restrict at link time), OD-6.3 (F6-3: bridge read for entity documents, or wait for the S5d retarget).

## 10. Implementation of the owner's rulings OD-6.1 to OD-6.3 (2026-11-05)

The owner accepted the recommendations and added a steer: **keep roles minimal; most households have one default owner, so do not build elaborate role machinery.** That is applied as follows.

**OD-6.1, F6-1: a correction moves the event's Home Record links.** In the `updateHomeEvent` transaction, every `PropertyRecordLink(HOME_EVENT)` on the superseded revision is re-pointed to the replacement, after the child-event move. The legacy documents and evidence are still copied (they are rows); a link is a pointer other pages read, so it moves, which keeps one link per record and purpose. Only one place in the codebase creates revisions, so this covers every correction, including those made from Ask. A link whose entity type is not `HOME_EVENT`, or whose id merely matches, is never touched.

*Data repair for corrections that already happened:* `apps/backend/prisma/home-event-record-links-after-correction.pgadmin.sql`. Step 1 only reads; step 2 changes data in one transaction and is safe to run twice. For each link on a superseded event it finds the current revision (following `supersedesEventId` forward) and re-points the link; if the current revision already has the same record and purpose the stale link is deleted instead; an event with no current revision is left alone. **Executed** on a scratch PostgreSQL 15 database with the real unique constraint and a scenario of a three-revision chain, a duplicate, an event with no current revision, and untouched controls: step 1 reported 5 links on superseded events, 4 repairable, 1 left alone; step 2 moved 2 and removed 2 duplicates; the controls were unchanged; a second run reported 0 and moved 0. **Production check (owner, 2026-11-05):** Step 1 returned 0 links on superseded events, 0 repairable and 0 left alone, so no corrected event in production had carried Home Record evidence and there was nothing to repair. The script remains for other environments.

**OD-6.3, F6-3 for inventory items: a read-only bridge.** `entityLinkedRecords.service.ts` returns the Home Records linked to an entity, filtered by the caller's visibility, excluding trashed records and records of other properties (archived ones are shown and labelled). The inventory controller adds `homeRecordLinks` to each item on the list and the detail. The `hasDocuments` filter now counts an item as having documents if it has a legacy document **or** a visible linked record, so an item with only a linked record is no longer reported as missing documents. The inventory drawer shows the linked records read-only under the documents ("Also filed in Home Records", with a link to Home Records, where they are managed), and the card counts, the "with documents" summary and the mobile view count both kinds. Internal callers of `listItems` and `getItem` (mobile home, coverage analysis, Ask) are unchanged. The legacy `documents` relation is untouched and still authoritative for what it holds. **Not done:** warranties, insurance policies and claims have the same gap and were not bridged; the helper is written to be reused for them. Attaching from the drawer still goes through the legacy picker.

**OD-6.2, link-time restriction: not built, on purpose.** Refusing to link an owner-only record to an entity other roles can see only matters when a household has several members with different roles. For the default single-owner household it changes nothing and adds a rule and an error path. The read-time filter (§9) already stops other roles from learning that an owner-only record exists, wherever it is linked, so the exposure is closed without the extra rule. It can be added later if multi-member households become common.

**Evidence.** Backend: `phase6EvidenceVisibilityAndAtomicity.test.js` now has 15 tests (4 new for F6-1; removing the link move makes two of them fail) and `inventoryLinkedRecords.test.js` has 10 (visibility by role, trash, archive, property scoping, the `hasDocuments` filter shape, and that the controller passes the caller's role). Frontend: 8 new tests for the count helper and the linked-records list. All run against in-memory fakes or components; none touches a real database or a browser, and the drawer was not looked at in a browser.
