# DATA_POINT_READ proposal: reserve and ownership costs (D13 domain 4)

**Status: PROPOSAL for owner approval. Nothing here is in the catalogue and nothing is readable through Ask.** The 2026-11-12 approval covers the 33 ids at catalogue version 1 only, and a test fails for any catalogued id that is not approved. Approving this list means bumping `DATA_POINT_CATALOGUE_VERSION` to 2 and extending `APPROVED_DATA_POINT_IDS`. Evidence: schema read on 2026-11-12 (`prisma/schema.prisma`) and `entityDispositions.json`; **no code was changed and no query was run.**

## Scope from the Phase 0b manifest
`reserve-ownership-costs` holds 50 entities; 39 have a plain `propertyId` column, 11 do not (child rows reached through a parent: contributions, line items, snapshot lines, tax-appeal events/packets/reminders/documents, extracted fields, decision history, partner complaints). Excluded by presumption (owner-only, FRD 2026-11-12): `PropertyFinancingProfile`, `PropertyFinancingProfileChange`, `EquityPosition`, `FinancingScenario`, `Refinance*`, `HomeSavingsAccount` (mortgage/equity/financing, bank/payment). Not proposed: JSON blobs (`rawDataJson`, `rateComponentsJson`, `installmentsJson`, `dueDatesJson`, `exemptionsJson`, `capsJson`), source URLs and ids.

## Proposed first slice: 3 entities, 14 points
| Entity | Point id | Field | Family | Proposed floor |
|---|---|---|---|---|
| HomeReserveFund | reserve.balance | currentBalanceCents | money | CONTRIBUTOR |
| HomeReserveFund | reserve.monthlyContribution | recommendedMonthlyContributionCents | money | CONTRIBUTOR |
| HomeReserveFund | reserve.shortfall | currentShortfallCents | money | CONTRIBUTOR |
| HomeReserveFund | reserve.posture | posture | enum | VIEWER |
| HomeReserveFund | reserve.horizonYears | horizonYears | number | VIEWER |
| HomeReserveFund | reserve.lastRecalculated | lastRecalculatedAt | date | VIEWER |
| PropertyTaxBillRecord | taxBill.amount | billAmount | dollars | CONTRIBUTOR |
| PropertyTaxBillRecord | taxBill.effectiveRate | effectiveTaxRate | percent | VIEWER |
| PropertyTaxBillRecord | taxBill.issueDate | issueDate | date | VIEWER |
| PropertyTaxAssessmentRecord | taxAssessment.totalAssessedValue | totalAssessedValue | dollars | CONTRIBUTOR |
| PropertyTaxAssessmentRecord | taxAssessment.taxableValue | taxableValue | dollars | CONTRIBUTOR |
| PropertyTaxAssessmentRecord | taxAssessment.landValue | landValue | dollars | CONTRIBUTOR |
| PropertyTaxAssessmentRecord | taxAssessment.improvementValue | improvementValue | dollars | CONTRIBUTOR |
| PropertyTaxAssessmentRecord | taxAssessment.assessmentDate | assessmentDate | date | VIEWER |

Money follows the v1 rule (contributor and up). `Expense` is deliberately **not** in the first slice: it is scoped by `homeownerProfileId` with a nullable `propertyId`, and Ask's expense surface is own-profile only (FRD 1.467), so a property-scoped read would cross that boundary. Decision needed (below).

## Reader changes this needs (why it is not "just more catalogue rows")
1. **Record selection.** The v1 reader picks records by matching a name in the message. `HomeReserveFund` is one row per property (`propertyId @unique`), so it needs a *singleton* mode. Tax bills and assessments are many rows per `taxYear` with `status` and `supersededById`; the read must take the latest ACTIVE, non-superseded record for the named or latest tax year, and say which year it used. Both are new `ENTITY_SPECS` modes, each with its own test.
2. **Provenance and confidence.** Tax records carry `sourceType` and `confidence`; an answer from a low-confidence or non-authoritative record must say so (FR-REC-2 style limitation), not state the number plainly.
3. **Cue words** per entity ("reserve", "savings fund" vs "property tax", "assessment"), so a bare "how much" never picks a domain; ties return no point (existing rule).
4. **Child entities** without `propertyId` are out until a relation read exists (same gap as claims).

## Decisions needed from the owner
1. Approve, edit or reject the 14 ids and floors above (or approve a subset); approval is for catalogue version 2 and these exact ids.
2. `Expense`: allow a household-wide property read, or keep expenses own-profile only (then it stays out of DATA_POINT_READ and stays an Ask command).
3. Confirm tax bill/assessment amounts as CONTRIBUTOR (they are public records but are the owner's tax figures).
4. Claims (domain 3 remainder) is still blocked: `Claim` has no plain `propertyId` read and needs the relation-read design.

## Not done / unproven
No reader code, handler change, fixture or measurement exists for these points. Reachability gain is unmeasured.
