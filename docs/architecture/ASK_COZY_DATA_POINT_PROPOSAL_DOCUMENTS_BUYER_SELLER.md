# DATA_POINT_READ proposal: documents-records, buyer, seller prep (D13 domains 5-7)

**Status (updated 2026-11-12, later): FULLY RESOLVED at catalogue v4.** The 12 seller-prep/sale-case/buyer points are VIEWER (owner policy: shared journey facts); the four `PropertyRecord` points are built at VIEWER x3 and OWNER (`retainUntil`), reading through `visibleRecordWhere(role)`. The text below is the earlier PARTLY APPROVED state and is kept as history. **Earlier status:** PARTLY APPROVED. Owner decision after external review: the **12** seller-prep, sale-case and buyer ids are approved at **CONTRIBUTOR** and are in catalogue **v3** (built, singleton reads). The four `PropertyRecord` ids are **deferred** (not catalogued) until the reader reuses `visibleRecordWhere(role)` from `homeRecordsAccess.ts` and the sensitivity-vs-visibility policy is settled; `record.retainUntil` will be **OWNER** when admitted. Corrections to the original draft: all six `salePrep.*` points were wrongly proposed as VIEWER (they are CONTRIBUTOR, consistent with the stated rule); `retainUntil` was wrongly proposed as CONTRIBUTOR (retention is owner-managed, `homeRecords.service.ts`); the "HOUSEHOLD plus STANDARD" filter in change 1 below is **not** the canonical policy (owners see all records; contributors and viewers see HOUSEHOLD only; invisible records read as not found) and must not be built. Recommended, awaiting owner confirmation: visibility is the record-level access authority and sensitivity is classification, not a second access system; the data-point floor applies after `visibleRecordWhere(role)`; an invisible record is never revealed to exist. Original draft evidence: `prisma/schema.prisma` and `entityDispositions.json` read on 2026-11-12; **no code was changed and no query was run.**

## Scope from the Phase 0b manifest
documents-records 10 entities (2 operational, excluded by default); buyer 34; seller-prep 5. Presumed owner-only (FRD 2026-11-12) and **not proposed**: all purchase financing, loan offer/estimate, lender condition, closing-disclosure, title/escrow and contract entities (mortgage/financing, title/ownership). Not proposed: free-form text (`description`, `notes`, `detail`, `verificationNotes`), file locations (`fileUrl`, storage keys), hashes, JSON blobs, ids.

## Why these are smaller than the earlier domains
Most rows in these domains are children reached through a parent (`SaleReadinessItem` by `saleCaseId`, `HomeBuyerTask` / `BuyerJourneyMilestone` by `checklistId`, `PropertyRecordVersion`/`Link` by `recordId`). Same gap as claims: no plain `propertyId`, so **they stay out until a relation-read design exists** (decision 4). The first slice is the parents that are one row per property, plus `PropertyRecord`.

## Proposed first slice: 4 entities, 16 points
| Entity | Point id | Field | Family | Proposed floor |
|---|---|---|---|---|
| PropertyRecord | record.type | recordType | enum | VIEWER |
| PropertyRecord | record.verification | verificationStatus | enum | VIEWER |
| PropertyRecord | record.effectiveTo | effectiveTo | date | VIEWER |
| PropertyRecord | record.retainUntil | retainUntil | date | CONTRIBUTOR |
| PropertySalePrepProfile | salePrep.paint | paintCondition | enum | VIEWER |
| PropertySalePrepProfile | salePrep.curbAppeal | curbAppealCondition | enum | VIEWER |
| PropertySalePrepProfile | salePrep.flooring | flooringCondition | enum | VIEWER |
| PropertySalePrepProfile | salePrep.kitchen | kitchenStatus | enum | VIEWER |
| PropertySalePrepProfile | salePrep.bathroom | bathroomStatus | enum | VIEWER |
| PropertySalePrepProfile | salePrep.staging | stagingReadiness | enum | VIEWER |
| PropertySaleCase | saleCase.status | status | enum | CONTRIBUTOR |
| PropertySaleCase | saleCase.targetListDate | targetListDate | date | CONTRIBUTOR |
| PropertySaleCase | saleCase.targetCloseDate | targetCloseDate | date | CONTRIBUTOR |
| HomeBuyerChecklist | buyer.stage | stage | enum | CONTRIBUTOR |
| HomeBuyerChecklist | buyer.targetCloseDate | targetCloseDate | date | CONTRIBUTOR |
| HomeBuyerChecklist | buyer.moveInDate | moveInDate | date | CONTRIBUTOR |

Sale and buyer-journey facts are not shown to viewers (a sale in progress is sensitive); they follow the contributor floor. `PropertySaleCase.budgetRange` is **not** proposed (money about a sale; owner call).

## Reader changes this needs
1. **PropertyRecord selection and visibility.** Named by `title` (existing name matching). The read must add `lifecycleStatus: ACTIVE`, `trashedAt: null`, and honour `visibility` and `sensitivity`: a record that is not `HOUSEHOLD`/`STANDARD` is never answered here (it needs the Home Records authorization the Ask records commands already use). This is a new filter set on the allowlisted template, with its own test; it is the riskiest part and should be reviewed before building.
2. **Singleton mode** (already built for `HomeReserveFund`) for `PropertySalePrepProfile`, `PropertySaleCase` and `HomeBuyerChecklist` (all `propertyId @unique`). `HomeBuyerChecklist` also needs `status: ACTIVE`; a cancelled or completed journey says so instead of giving a stale stage.
3. **Cue words**: record / document / home records; sale prep / curb appeal / staging; selling / sale case / listing; buying / buyer journey / closing. Ties return no point.
4. **Document** (legacy table) is **not proposed**: Home Records is the retirement target (see project notes on the Documents arc) and `Document` has nullable `propertyId` plus several parent links, so a property read would miss or double count rows.

## Decisions needed from the owner
1. Approve, edit or reject the 16 ids and floors (or a subset); approval is for catalogue version 3 and these exact ids.
2. Sale and buyer-journey facts at CONTRIBUTOR (proposed) or OWNER?
3. `record.retainUntil` at CONTRIBUTOR (proposed), and may Ask answer from `PropertyRecord` at all before the visibility/sensitivity filter is reviewed?
4. Relation-read design (claims, sale readiness items, buyer tasks and milestones, record versions): design now or later.

## Not done / unproven
No reader code, handler change, fixture or measurement exists for these points. Reachability gain is unmeasured.

## Audit: existing viewer-readable buyer and seller operations (2026-11-12, executed against the registry)
`propertyRoleFloor` read from `ASK_OPERATION_DEFINITIONS`: **16 buyer/seller read operations are VIEWER-floor**: SELLER_PREP_CHECKLIST, BUYER_PLAN_STATUS, BUYER_DEADLINES, BUYER_MOVE_STATUS, BUYER_DOCUMENT_READINESS, BUYER_INSPECTION_REVIEW, BUYER_WALKTHROUGH_READINESS, BUYER_NEGOTIATION_READINESS, and the MATERIAL_DECISION reads BUYER_LOAN_ESTIMATES, BUYER_INSURANCE_READINESS, BUYER_FINANCING_READINESS, BUYER_TITLE_ESCROW_READINESS, BUYER_DISCLOSURE_FUNDS_READINESS, BUYER_CLOSING_DAY_READINESS, BUYER_CONTRACT_TIMELINE, BUYER_COST_READINESS. All 14 write/command operations are CONTRIBUTOR. So a viewer is refused `buyer.stage` by DATA_POINT_READ but can read the same journey through BUYER_PLAN_STATUS and the target close date through BUYER_DEADLINES; financing, loan and contract timelines (owner-only by the presumption for new catalogue entries) are viewer-readable today. **Not changed:** the floors are a product policy decision. Until the owner decides, the CONTRIBUTOR floor on these 12 points is enforced only for the generic read, not consistently across Ask. Decision needed: raise the 16 reads to CONTRIBUTOR (some to OWNER for financing/loan/contract), or lower the 12 points to VIEWER.
