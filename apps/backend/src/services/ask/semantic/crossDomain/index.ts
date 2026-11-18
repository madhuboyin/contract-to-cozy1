export * from './domainRolloutManifest';
export * from './crossDomainPlanBuilder';
export * from './crossDomainExecutor';

import { verifyProtectionLexemeSeparation } from '../sharedSemanticLexicon';
import { type SemanticDomainId } from '../governance/semanticOntologyBaseline';
import {
  buildMeasuredDomainCoverageProfiles,
  DOMAIN_ENABLEMENT_RECORDS,
  DOMAIN_ROLLOUT_MANIFEST,
  verifyDomainRolloutManifestIntegrity,
  type DomainLanguageCoverageProfile,
  type DomainMeasurementInput,
  type MetamorphicAxis,
} from './domainRolloutManifest';
import {
  applyCrossDomainFollowUpRefinement,
  parseCrossDomainSemanticRequest,
  verifyCrossDomainProtectionLexemeSeparation,
} from './crossDomainPlanBuilder';
import {
  executeCrossDomainFollowUp,
  executeCrossDomainSnapshot,
  replaySavedCrossDomainResult,
  type CrossDomainExecutionResult,
  type CrossDomainPropertySnapshot,
} from './crossDomainExecutor';

/**
 * Deterministic seeded cross-domain snapshot fixture spanning Waves 1-5 (§19 #17).
 * Exercises conflicted warranties, hidden/restricted records, dual-parent claim docs,
 * unknown vs confirmed-not-required permits, missing finance slots, and role visibility.
 */
export function buildSeededCrossDomainSnapshot(): CrossDomainPropertySnapshot {
  return {
    propertyId: 'prop-waves-1',
    asOfDate: '2026-11-15',
    timezone: 'America/New_York',
    closingDateIso: '2026-12-20T00:00:00.000Z',
    rooms: [
      { id: 'room-kitchen', propertyId: 'prop-waves-1', name: 'Kitchen' },
      { id: 'room-basement', propertyId: 'prop-waves-1', name: 'Basement' },
    ],
    items: [
      {
        id: 'item-furnace',
        propertyId: 'prop-waves-1',
        name: 'Furnace',
        category: 'APPLIANCE',
        brand: 'Carrier',
        modelNumber: '59TN6',
        serialNumber: 'SN-FURN-1',
        purchaseCostCents: 420000,
        replacementCostCents: 680000,
        installedOn: '2012-04-10',
        condition: 'POOR_CONDITION',
        roomId: 'room-basement',
        propertyPlanWarrantyId: null,
        itemWarrantyIds: ['war-expired-1'],
        coverageEvidenceStatus: 'UNKNOWN',
      },
      {
        id: 'item-water-heater',
        propertyId: 'prop-waves-1',
        name: 'Water Heater',
        category: 'APPLIANCE',
        brand: 'Bradford White',
        purchaseCostCents: 180000,
        replacementCostCents: 240000,
        installedOn: '2018-06-15',
        condition: 'FAIR_CONDITION',
        roomId: 'room-basement',
        propertyPlanWarrantyId: null,
        itemWarrantyIds: [],
        coverageEvidenceStatus: 'NONE',
      },
      {
        id: 'item-dishwasher',
        propertyId: 'prop-waves-1',
        name: 'Dishwasher',
        category: 'APPLIANCE',
        brand: 'Bosch',
        purchaseCostCents: 95000,
        replacementCostCents: 110000,
        installedOn: '2023-03-01',
        condition: 'GOOD_CONDITION',
        roomId: 'room-kitchen',
        propertyPlanWarrantyId: 'war-plan-1',
        itemWarrantyIds: [],
        coverageEvidenceStatus: 'UNKNOWN',
      },
    ],
    maintenanceTasks: [
      {
        id: 'task-plumbing-next-month',
        propertyId: 'prop-waves-1',
        title: 'Flush water heater sediment',
        status: 'PENDING',
        priority: 'MEDIUM_PRIORITY',
        nextDueDate: '2026-12-10T00:00:00.000Z',
        inventoryItemId: 'item-water-heater',
      },
      {
        id: 'task-electrical-panel',
        propertyId: 'prop-waves-1',
        title: 'Inspect kitchen GFCI outlets',
        status: 'PENDING',
        priority: 'HIGH_PRIORITY',
        nextDueDate: '2026-12-15T00:00:00.000Z',
        inventoryItemId: null,
      },
      {
        id: 'task-furnace-overdue',
        propertyId: 'prop-waves-1',
        title: 'Replace furnace filter',
        status: 'PAST_DUE',
        priority: 'HIGH_PRIORITY',
        nextDueDate: '2026-10-01T00:00:00.000Z',
        inventoryItemId: 'item-furnace',
      },
    ],
    extendedItems: [
      {
        id: 'item-furnace',
        slug: 'furnace',
        propertyId: 'prop-waves-1',
        name: 'Furnace',
        category: 'HVAC',
        purchaseCostCents: 420000,
        replacementCostCents: 680000,
        installedOn: '2012-04-10',
        condition: 'POOR',
        manualDocumentId: null,
        receiptDocumentId: null,
        roomId: 'room-basement',
      },
      {
        id: 'item-water-heater',
        slug: 'water-heater',
        propertyId: 'prop-waves-1',
        name: 'Water Heater',
        category: 'PLUMBING',
        purchaseCostCents: 180000,
        replacementCostCents: 240000,
        installedOn: '2018-06-15',
        condition: 'FAIR',
        manualDocumentId: 'doc-manual-wh',
        receiptDocumentId: null,
        roomId: 'room-basement',
      },
      {
        id: 'item-dishwasher',
        slug: 'dishwasher',
        propertyId: 'prop-waves-1',
        name: 'Dishwasher',
        category: 'APPLIANCE',
        purchaseCostCents: 95000,
        replacementCostCents: 110000,
        installedOn: '2023-03-01',
        condition: 'GOOD',
        manualDocumentId: 'doc-manual-dw',
        receiptDocumentId: 'doc-receipt-dw',
        roomId: 'room-kitchen',
      },
    ],
    warranties: [
      {
        id: 'war-expired-1',
        propertyId: 'prop-waves-1',
        providerName: 'Carrier 10yr Parts',
        category: 'HVAC',
        expiryDate: '2025-11-01',
      },
    ],
    maintenanceTaskMeta: [
      { taskId: 'task-plumbing-next-month', category: 'PLUMBING' },
      { taskId: 'task-electrical-panel', category: 'ELECTRICAL' },
      { taskId: 'task-furnace-overdue', category: 'HVAC' },
    ],
    insurancePolicies: [
      {
        id: 'pol-homeowners-1',
        propertyId: 'prop-waves-1',
        carrierName: 'Chubb Home',
        policyNumber: 'POL-8891',
        deductibleCents: 250000,
        annualPremiumCents: 310000,
        expiryDate: '2027-06-01',
      },
    ],
    claims: [
      {
        id: 'claim-water-damage',
        propertyId: 'prop-waves-1',
        title: 'Water-damage claim',
        slug: 'water-damage',
        status: 'OPEN',
        requiredDocumentTypes: ['ADJUSTER_ESTIMATE', 'PHOTO_EVIDENCE'],
      },
    ],
    documents: [
      {
        id: 'doc-claim-photo',
        propertyId: 'prop-waves-1',
        title: 'Basement Photo Packet',
        documentType: 'PHOTO_EVIDENCE',
        lifecycleStatus: 'ACTIVE',
        visibleToRoles: ['OWNER', 'EDITOR'],
      },
      {
        id: 'doc-claim-hidden-trashed',
        propertyId: 'prop-waves-1',
        title: 'Old Void Adjuster Report',
        documentType: 'ADJUSTER_ESTIMATE',
        lifecycleStatus: 'TRASHED',
        visibleToRoles: ['OWNER', 'EDITOR'],
      },
      {
        id: 'doc-other-property',
        propertyId: 'prop-other',
        title: 'Other Home Settlement',
        documentType: 'ADJUSTER_ESTIMATE',
        lifecycleStatus: 'ACTIVE',
        visibleToRoles: ['OWNER'],
      },
    ],
    claimDocLinks: [
      { id: 'cd-1', claimId: 'claim-water-damage', documentId: 'doc-claim-photo' },
      { id: 'cd-2', claimId: 'claim-water-damage', documentId: 'doc-claim-hidden-trashed' },
      { id: 'cd-3', claimId: 'claim-water-damage', documentId: 'doc-other-property' },
    ],
    homeEvents: [
      {
        id: 'evt-repair-2025-1',
        propertyId: 'prop-waves-1',
        title: 'Main shutoff valve repair',
        eventCategory: 'REPAIR',
        occurredAt: '2025-05-14T12:00:00.000Z',
        actualCostCents: 85000,
      },
      {
        id: 'evt-repair-2025-2',
        propertyId: 'prop-waves-1',
        title: 'Roof flashing repair',
        eventCategory: 'REPAIR',
        occurredAt: '2025-09-20T12:00:00.000Z',
        actualCostCents: 145000,
      },
      {
        id: 'evt-upgrade-2025',
        propertyId: 'prop-waves-1',
        title: 'Kitchen cabinets upgrade',
        eventCategory: 'UPGRADE',
        occurredAt: '2025-10-01T12:00:00.000Z',
        actualCostCents: 950000,
      },
    ],
    taxBills: [
      {
        id: 'tax-2025',
        propertyId: 'prop-waves-1',
        taxYear: 2025,
        amountCents: 610000,
        status: 'PAID',
        lifecycleStatus: 'ACTIVE',
      },
      {
        id: 'tax-2026',
        propertyId: 'prop-waves-1',
        taxYear: 2026,
        amountCents: 645000,
        status: 'UNPAID',
        lifecycleStatus: 'ACTIVE',
      },
    ],
    financeSlots: {
      monthlyRentCents: 320000,
      homeValueCents: 65000000,
      horizonYears: 5,
      currentRateBps: 675,
      candidateRateBps: 565,
      closingCostsCents: null,
    },
    recalls: [
      {
        id: 'rec-wh-1',
        propertyId: 'prop-waves-1',
        title: 'Bradford White Gas Valve Recall',
        severity: 'HIGH',
        affectedInventoryItemId: 'item-water-heater',
      },
    ],
    environmentalRisks: [
      {
        id: 'env-radon-1',
        propertyId: 'prop-waves-1',
        hazardType: 'Elevated Radon Zone Alert',
        severity: 'MODERATE',
        windowStartIso: '2026-11-15T00:00:00.000Z',
        windowEndIso: '2026-11-21T00:00:00.000Z',
        sourceAvailable: true,
        lastUpdatedIso: '2026-11-15T06:00:00.000Z',
      },
    ],
    inspectionFindings: [
      {
        id: 'find-1',
        propertyId: 'prop-waves-1',
        inspectionReportId: 'rep-home-2026',
        inspectionReportTitle: '2026 Annual Home Inspection',
        title: 'Double-tapped breaker in subpanel',
        status: 'ACTION_REQUIRED',
      },
      {
        id: 'find-2',
        propertyId: 'prop-waves-1',
        inspectionReportId: 'rep-home-2026',
        inspectionReportTitle: '2026 Annual Home Inspection',
        title: 'Minor deck stain wear',
        status: 'MONITORING',
      },
    ],
    buyerTasks: [
      {
        id: 'bt-1',
        propertyId: 'prop-waves-1',
        title: 'Inspection Contingency Sign-Off',
        isContingency: true,
        status: 'OPEN',
        dueAt: '2026-12-01T00:00:00.000Z',
      },
      {
        id: 'bt-2',
        propertyId: 'prop-waves-1',
        title: 'Final Wire Instructions Verification',
        isContingency: false,
        status: 'OPEN',
        dueAt: '2026-12-18T00:00:00.000Z',
      },
    ],
    sellerReadinessItems: [
      {
        id: 'sr-1',
        propertyId: 'prop-waves-1',
        title: 'Touch up hallway trim paint',
        status: 'PENDING',
      },
      {
        id: 'sr-2',
        propertyId: 'prop-waves-1',
        title: 'Power wash driveway',
        status: 'COMPLETED',
      },
    ],
    permits: [],
    projects: [
      {
        id: 'proj-panel-upgrade',
        propertyId: 'prop-waves-1',
        title: '200A Electrical Panel Upgrade',
        status: 'ACTIVE',
        permitStatus: 'NEEDS_PERMIT',
      },
      {
        id: 'proj-mudroom-shelving',
        propertyId: 'prop-waves-1',
        title: 'Mudroom Built-In Shelving',
        status: 'ACTIVE',
        permitStatus: 'UNKNOWN',
      },
      {
        id: 'proj-bedroom-paint',
        propertyId: 'prop-waves-1',
        title: 'Primary Bedroom Repaint',
        status: 'ACTIVE',
        permitStatus: 'CONFIRMED_NOT_REQUIRED',
      },
    ],
    contractorQuotes: [
      {
        id: 'quote-1',
        propertyId: 'prop-waves-1',
        roomTag: 'Kitchen',
        vendorName: 'Harbor Kitchen Craft',
        amountCents: 2850000,
        timelineDays: 21,
        warrantyMonths: 24,
      },
      {
        id: 'quote-2',
        propertyId: 'prop-waves-1',
        roomTag: 'Kitchen',
        vendorName: 'Summit Remodelers',
        amountCents: 3120000,
        timelineDays: 18,
        warrantyMonths: 36,
      },
    ],
    savedResults: [
      {
        id: 'saved-1',
        propertyId: 'prop-waves-1',
        title: 'Winterization Readiness Checklist',
        savedType: 'CHECKLIST_BRIEF',
        minimumRole: 'VIEWER',
      },
      {
        id: 'saved-2',
        propertyId: 'prop-waves-1',
        title: 'Confidential Refinance Brief',
        savedType: 'FINANCE_BRIEF',
        minimumRole: 'OWNER',
      },
    ],
  };
}

export interface FrdRowVerificationResult {
  readonly rowId: string;
  readonly domainIds: readonly SemanticDomainId[];
  readonly prompt: string;
  readonly passed: boolean;
  readonly issue: string | null;
}

export async function runCrossDomainAcceptanceBenchmarks(): Promise<{
  readonly passed: boolean;
  readonly checkedCount: number;
  readonly verifiedRowIds: readonly string[];
  readonly rowResults: readonly FrdRowVerificationResult[];
  readonly failures: readonly string[];
}> {
  const snapshot = buildSeededCrossDomainSnapshot();
  const failures: string[] = [];
  const rowResults: FrdRowVerificationResult[] = [];
  let checkedCount = 0;

  const expectRow = async (
    rowId: string,
    domainIds: readonly SemanticDomainId[],
    prompt: string,
    check: (res: CrossDomainExecutionResult) => string | null,
    opts?: {
      readonly role?: 'OWNER' | 'EDITOR' | 'VIEWER';
      readonly snapshotOverride?: CrossDomainPropertySnapshot;
      readonly enabledDomains?: ReadonlySet<SemanticDomainId>;
      readonly allowLegacyFallback?: boolean;
    },
  ) => {
    checkedCount += 1;
    const res = await executeCrossDomainSnapshot({
      rawText: prompt,
      snapshot: opts?.snapshotOverride ?? snapshot,
      role: opts?.role ?? 'OWNER',
      propertyAuthorized: true,
      enabledDomains: opts?.enabledDomains,
      allowLegacyFallback: opts?.allowLegacyFallback,
    });
    const issue = check(res);
    rowResults.push({ rowId, domainIds, prompt, passed: issue === null, issue });
    if (issue) failures.push(`${rowId} (${prompt}): ${issue}`);
  };

  // ROW_01: list items without warranty / which things have no warranty recorded?
  await expectRow('ROW_01', ['domain.inventory', 'domain.warranties_coverage'], 'list items without warranty', (r) =>
    r.status === 'ANSWERED' && r.facetResults[0]?.recordIds.includes('item-water-heater') ? null : `expected uncovered item-water-heater (${r.status}: ${r.answer})`);

  // ROW_02: provide details of all items without warranty (DETAIL projection)
  await expectRow('ROW_02', ['domain.inventory', 'domain.warranties_coverage'], 'provide details of all items without warranty', (r) =>
    r.status === 'ANSWERED' && r.facetResults[0]?.receipt?.projection === 'DETAIL' ? null : `expected DETAIL projection (${r.facetResults[0]?.receipt?.projection})`);

  // ROW_03: how many appliances are not having warranty (APPLIANCE + COUNT)
  await expectRow('ROW_03', ['domain.inventory', 'domain.warranties_coverage'], 'how many appliances are not having warranty?', (r) =>
    r.status === 'ANSWERED' && r.facetResults[0]?.receipt?.projection === 'COUNT' ? null : `expected COUNT projection (${r.facetResults[0]?.receipt?.projection})`);

  // ROW_04: conflicted warranty links counted separately from confirmed negative
  const conflictedSnapshot: CrossDomainPropertySnapshot = {
    ...snapshot,
    items: snapshot.items.map((item) =>
      item.id === 'item-furnace' || item.id === 'item-dishwasher'
        ? { ...item, propertyPlanWarrantyId: 'war-plan-a', itemWarrantyIds: ['war-item-b'], coverageEvidenceStatus: 'UNKNOWN' }
        : item,
    ),
  };
  await expectRow('ROW_04', ['domain.inventory', 'domain.warranties_coverage'], 'how many appliances have no warranty?', (r) =>
    r.status === 'ANSWERED'
    && r.facetResults[0]?.receipt?.projection === 'COUNT'
    && (r.facetResults[0]?.receipt?.population.conflictedCount ?? 0) === 2
      ? null
      : `expected conflictedCount=2, got ${r.facetResults[0]?.receipt?.population.conflictedCount}`,
  { snapshotOverride: conflictedSnapshot });

  // ROW_05: which items are having warranty (HAS_ANY)
  await expectRow('ROW_05', ['domain.inventory', 'domain.warranties_coverage'], 'which items are having warranty?', (r) =>
    r.status === 'ANSWERED' && r.facetResults[0]?.recordIds.includes('item-dishwasher') ? null : `expected item-dishwasher (${r.answer})`);

  // ROW_06: what maintenance is due next month?
  await expectRow('ROW_06', ['domain.maintenance'], 'what maintenance is due next month?', (r) =>
    r.status === 'ANSWERED' && r.facetResults[0]?.recordIds.includes('task-plumbing-next-month') ? null : `bad status/ids ${r.status}`);

  // ROW_07: show plumbing and electrical tasks
  await expectRow('ROW_07', ['domain.maintenance'], 'show plumbing and electrical tasks', (r) =>
    r.facetResults[0]?.recordIds.length === 2 ? null : 'expected both plumbing and electrical tasks');

  // ROW_08: which appliances have overdue maintenance?
  await expectRow('ROW_08', ['domain.inventory', 'domain.maintenance'], 'which appliances have overdue maintenance?', (r) =>
    r.status === 'ANSWERED' && r.facetResults[0]?.recordIds.includes('item-furnace') ? null : `expected item-furnace overdue (${r.answer})`);

  // ROW_09: which appliances don't have a manual or receipt? -> focused clarification
  await expectRow('ROW_09', ['domain.inventory', 'domain.documents_records'], "which appliances don't have a manual or receipt?", (r) =>
    r.status === 'CLARIFY' && r.clarification?.reasonCode === 'AMBIGUOUS_NEGATIVE_COORDINATION' ? null : `expected CLARIFY got ${r.status}`);

  // ROW_10: how much did I spend on repairs last year?
  await expectRow('ROW_10', ['domain.ownership_costs_finance', 'domain.timeline_home_events'], 'how much did I spend on repairs last year?', (r) =>
    r.facetResults[0]?.metrics?.totalRepairSpendCents === 230000 ? null : 'expected $2300.00 repairs');

  // ROW_11: compare this year's tax bill with last year's
  await expectRow('ROW_11', ['domain.ownership_costs_finance', 'domain.property_profile'], "compare this year's tax bill with last year's", (r) =>
    r.facetResults[0]?.metrics?.deltaCents === 35000 ? null : 'expected +$350.00 delta');

  // ROW_12: what claims are open and what documents are missing?
  await expectRow('ROW_12', ['domain.claims'], 'what claims are open and what documents are missing?', (r) =>
    r.facetResults.length === 2 && r.facetResults[1].recordIds[0] === 'claim-water-damage:ADJUSTER_ESTIMATE' ? null : 'expected missing ADJUSTER_ESTIMATE');

  // ROW_13: mixed migration wave ownership ("which appliances are out of warranty and what's my deductible?")
  await expectRow(
    'ROW_13',
    ['domain.warranties_coverage', 'domain.insurance_policies'],
    "which appliances are out of warranty and what's my deductible?",
    (r) =>
      r.facetResults.length === 2
      && r.facetResults[0].owner.owner === 'NEW_STACK'
      && r.facetResults[1].owner.owner === 'LEGACY_STACK'
      && r.facetResults[1].owner.adapterId === 'legacy.insurance_policy.deductible_and_terms'
        ? null
        : `expected 2 facets with NEW_STACK + LEGACY_STACK, got ${JSON.stringify(r.facetResults.map((f) => f.owner))}`,
    {
      enabledDomains: new Set<SemanticDomainId>(['domain.inventory', 'domain.warranties_coverage']),
      allowLegacyFallback: true,
    },
  );

  // ROW_14: 6-facet query bounded retrieval + no silent drop
  await expectRow(
    'ROW_14',
    ['domain.claims', 'domain.maintenance', 'domain.warranties_coverage', 'domain.ownership_costs_finance', 'domain.projects_quotes_vendors'],
    'show open claims, missing claim documents, overdue maintenance, expired warranties, unpaid tax bills, and active projects',
    (r) => (r.facetResults.length === 6 && r.overflowFacets.length === 0 ? null : `expected all 6 facets, got ${r.facetResults.length}`),
  );

  // ROW_15: 4-facet water heater breakdown
  await expectRow(
    'ROW_15',
    ['domain.inventory', 'domain.warranties_coverage'],
    'tell me about my water heater: age, warranty, replacement cost, and whether to repair or replace',
    (r) => (r.facetResults.length === 4 ? null : `expected 4 facets for water heater, got ${r.facetResults.length}`),
  );

  // ROW_16: show the documents for my water-damage claim (dual parent + visibility enforced)
  await expectRow('ROW_16', ['domain.claims', 'domain.documents_records'], 'show the documents for my water-damage claim', (r) =>
    r.facetResults[0]?.recordIds.length === 1 && r.facetResults[0]?.recordIds[0] === 'doc-claim-photo' ? null : 'trashed/other-property doc leaked');

  // ROW_17: do I have recalls and which items are affected?
  await expectRow('ROW_17', ['domain.risks_recalls_inspections'], 'do I have recalls and which items are affected?', (r) =>
    r.facetResults[0]?.recordIds[0] === 'rec-wh-1' ? null : 'expected recall match');

  // ROW_18: should I repair the furnace or replace it?
  await expectRow('ROW_18', ['domain.inventory'], 'should I repair the furnace or replace it?', (r) =>
    r.status === 'ANSWERED' ? null : 'expected replacement guidance');

  // ROW_19: how long until owning beats renting?
  await expectRow('ROW_19', ['domain.ownership_costs_finance', 'domain.property_profile'], 'how long until owning beats renting?', (r) => {
    const f = r.facetResults[0];
    return f?.status === 'EXECUTED'
      && typeof f.metrics?.crossoverYear === 'number'
      && typeof f.metrics?.breaksEvenWithinHorizon === 'boolean'
      && /\byear\s+\d+\b/i.test(f.summary)
      ? null
      : 'expected own-rent break-even crossover year and horizon comparison';
  });

  // ROW_20: what are my contingency deadlines?
  await expectRow('ROW_20', ['domain.buyer_journey'], 'what are my contingency deadlines?', (r) =>
    r.facetResults[0]?.recordIds.length === 1 && r.facetResults[0]?.recordIds[0] === 'bt-1' ? null : 'expected contingency bt-1');

  // ROW_21: non-emergency vs emergency safety boundary
  checkedCount += 1;
  const nonEmergency = await executeCrossDomainSnapshot({
    rawText: 'my furnace is dying—what should I do?',
    snapshot,
    role: 'OWNER',
    propertyAuthorized: true,
  });
  const emergency = await executeCrossDomainSnapshot({
    rawText: 'my furnace smells like gas',
    snapshot,
    role: 'OWNER',
    propertyAuthorized: true,
  });
  const row21Ok = nonEmergency.status === 'ANSWERED' && emergency.status === 'BOUNDARY';
  rowResults.push({
    rowId: 'ROW_21',
    domainIds: ['domain.safety_boundary', 'domain.inventory'],
    prompt: 'my furnace is dying—what should I do? / my furnace smells like gas',
    passed: row21Ok,
    issue: row21Ok ? null : `expected ANSWERED+BOUNDARY got ${nonEmergency.status}/${emergency.status}`,
  });
  if (!row21Ok) failures.push('ROW_21: emergency vs non-emergency safety boundary distinction failed');

  // ROW_22: show my saved items (+ role reauth replay check)
  await expectRow('ROW_22', ['domain.account_household_preferences'], 'show my saved items', (r) =>
    r.facetResults[0]?.recordIds.length === 2 ? null : 'expected 2 saved results for OWNER');

  // ROW_23: what buyer deadlines are due before closing?
  await expectRow('ROW_23', ['domain.buyer_journey'], 'what buyer deadlines are due before closing?', (r) =>
    r.facetResults[0]?.recordIds.length === 2 ? null : 'expected 2 buyer tasks');

  // ROW_24: what do I still need to finish before listing the house?
  await expectRow('ROW_24', ['domain.seller_preparation'], 'what do I still need to finish before listing the house?', (r) =>
    r.facetResults[0]?.recordIds.length === 1 && r.facetResults[0]?.recordIds[0] === 'sr-1' ? null : 'expected pending sr-1');

  // ROW_25: would refinancing break even within three years?
  await expectRow('ROW_25', ['domain.ownership_costs_finance', 'domain.property_profile'], 'would refinancing break even within three years?', (r) =>
    r.status === 'PARTIAL' && r.facetResults[0]?.missingSlots.includes('closingCostsCents') ? null : 'expected missing closingCostsCents disclosure');

  // ROW_26: which active projects still need a permit?
  await expectRow('ROW_26', ['domain.projects_quotes_vendors'], 'which active projects still need a permit?', (r) =>
    r.facetResults[0]?.recordIds.length === 2 && r.facetResults[0]?.receipt?.population.unknownCount === 1
      ? null
      : 'expected confirmed=1, unknown=1, excluding confirmed not required');

  // ROW_27: compare these two kitchen contractor quotes
  await expectRow('ROW_27', ['domain.projects_quotes_vendors'], 'compare these two kitchen contractor quotes', (r) =>
    r.facetResults[0]?.metrics?.deltaCents === -270000 ? null : 'expected -$2700 delta');

  // ROW_28: what environmental risks affect this home this week?
  await expectRow('ROW_28', ['domain.risks_recalls_inspections'], 'what environmental risks affect this home this week?', (r) =>
    r.facetResults[0]?.metrics?.sourceAvailable === true && r.facetResults[0]?.recordIds[0] === 'env-radon-1' ? null : 'expected radon alert');

  // ROW_29: which inspection findings still need action?
  await expectRow('ROW_29', ['domain.risks_recalls_inspections'], 'which inspection findings still need action?', (r) =>
    r.facetResults[0]?.recordIds.length === 1 && r.facetResults[0]?.recordIds[0] === 'find-1' ? null : 'expected actionable find-1 only');

  // ROW_30: follow-up refinement ("what about the kitchen?" after an inventory list)
  checkedCount += 1;
  const followUp = executeCrossDomainFollowUp({
    priorPrompt: 'list items without warranty',
    followUpText: 'what about the kitchen?',
    snapshot,
  });
  const row30Ok = followUp.outcome === 'REFINED' && followUp.plan.outcome === 'MATCH' && followUp.plan.facets[0].relations.length >= 2;
  rowResults.push({
    rowId: 'ROW_30',
    domainIds: ['domain.inventory'],
    prompt: 'what about the kitchen?',
    passed: row30Ok,
    issue: row30Ok ? null : 'Follow-up room refinement failed to add room relation while inheriting prior plan',
  });
  if (!row30Ok) failures.push('ROW_30: Follow-up room refinement failed to add room relation while inheriting prior plan');

  // Additional explicit regression checks: neither/nor coordination, role replay, protection lexemes
  checkedCount += 1;
  const neitherNor = await executeCrossDomainSnapshot({
    rawText: 'which appliances have neither a manual nor a receipt?',
    snapshot,
    role: 'OWNER',
    propertyAuthorized: true,
  });
  if (neitherNor.status !== 'ANSWERED' || neitherNor.facetResults[0]?.recordIds.length !== 1) {
    failures.push('Negative coordination neither/nor check failed to isolate furnace only');
  }

  checkedCount += 1;
  const viewerSaved = await replaySavedCrossDomainResult({
    savedResult: snapshot.savedResults[1],
    currentSnapshot: snapshot,
    currentRole: 'VIEWER',
    propertyAuthorized: true,
    rawPromptFallback: 'show my saved items',
  });
  if (viewerSaved.status !== 'FORBIDDEN') {
    failures.push('VIEWER replay of OWNER-only saved result was not blocked');
  }

  checkedCount += 2;
  const sep = verifyProtectionLexemeSeparation();
  if (!sep.valid) failures.push(...sep.violations);
  const rolloutLexSep = verifyCrossDomainProtectionLexemeSeparation();
  if (!rolloutLexSep.valid) failures.push(...rolloutLexSep.violations);

  const verifiedRowIds = rowResults.filter((r) => r.passed).map((r) => r.rowId);

  return {
    passed: failures.length === 0 && verifiedRowIds.length === 30,
    checkedCount,
    verifiedRowIds,
    rowResults,
    failures,
  };
}

interface MetamorphicPairSpec {
  readonly name: string;
  readonly domainId: SemanticDomainId;
  readonly axis: MetamorphicAxis;
  readonly a: string;
  readonly b: string;
  readonly expectOutcome?: 'MATCH' | 'NONE_FITS' | 'BOUNDARY';
  readonly expectPolarity?: 'POSITIVE' | 'NEGATIVE';
}

export function runCrossDomainMetamorphicSuite(): {
  readonly passed: boolean;
  readonly pairCount: number;
  readonly domainIdsCovered: readonly SemanticDomainId[];
  readonly axesCovered: readonly MetamorphicAxis[];
  readonly byDomainPairs: Readonly<Record<SemanticDomainId, { readonly total: number; readonly passed: number; readonly axes: readonly MetamorphicAxis[] }>>;
  readonly failures: readonly string[];
} {
  const failures: string[] = [];
  const pairs: readonly MetamorphicPairSpec[] = [
    // domain.property_profile
    {
      name: 'property_profile_tax_paraphrase',
      domainId: 'domain.property_profile',
      axis: 'PARAPHRASE',
      a: "compare this year's tax bill with last year's",
      b: 'compare tax bill this year vs last year',
    },
    {
      name: 'property_profile_tax_inflection',
      domainId: 'domain.property_profile',
      axis: 'INFLECTION',
      a: 'show unpaid tax bill',
      b: 'show unpaid tax bills',
    },
    // domain.inventory
    {
      name: 'inventory_without_warranty_negation',
      domainId: 'domain.inventory',
      axis: 'NEGATION',
      a: 'list items without warranty',
      b: 'which items have no warranty?',
      expectPolarity: 'NEGATIVE',
    },
    {
      name: 'inventory_neither_nor_order_invariance',
      domainId: 'domain.inventory',
      axis: 'COORDINATION',
      a: 'which appliances have neither a manual nor a receipt?',
      b: 'list appliances that have neither a receipt nor a manual',
    },
    // domain.maintenance
    {
      name: 'maintenance_next_month_paraphrase',
      domainId: 'domain.maintenance',
      axis: 'PARAPHRASE',
      a: 'what maintenance is due next month?',
      b: 'list maintenance tasks due next calendar month',
    },
    {
      name: 'maintenance_category_coordination',
      domainId: 'domain.maintenance',
      axis: 'COORDINATION',
      a: 'show plumbing and electrical tasks',
      b: 'list electrical and plumbing tasks',
    },
    // domain.warranties_coverage
    {
      name: 'warranty_expired_word_order',
      domainId: 'domain.warranties_coverage',
      axis: 'WORD_ORDER',
      a: 'show expired warranties',
      b: 'list warranties expired',
    },
    {
      name: 'warranty_positive_vs_negative_inflection',
      domainId: 'domain.warranties_coverage',
      axis: 'INFLECTION',
      a: 'which items are having warranty?',
      b: 'show items with warranty',
    },
    // domain.insurance_policies
    {
      name: 'insurance_deductible_paraphrase',
      domainId: 'domain.insurance_policies',
      axis: 'PARAPHRASE',
      a: "what's my deductible?",
      b: 'show my insurance deductible',
    },
    // domain.claims
    {
      name: 'claims_open_and_missing_docs_coordination',
      domainId: 'domain.claims',
      axis: 'COORDINATION',
      a: 'what claims are open and what documents are missing?',
      b: 'list open claims and missing claim documents',
    },
    {
      name: 'claims_fail_closed_noise',
      domainId: 'domain.claims',
      axis: 'TYPO_AND_NOISE',
      a: 'what claims are open florb',
      b: 'show open claims zqxw',
      expectOutcome: 'NONE_FITS',
    },
    // domain.documents_records
    {
      name: 'documents_claim_word_order',
      domainId: 'domain.documents_records',
      axis: 'WORD_ORDER',
      a: 'show the documents for my water-damage claim',
      b: 'list documents for water-damage claim',
    },
    // domain.ownership_costs_finance
    {
      name: 'finance_repair_spend_paraphrase',
      domainId: 'domain.ownership_costs_finance',
      axis: 'PARAPHRASE',
      a: 'how much did I spend on repairs last year?',
      b: 'what was my total spend on repairs last calendar year?',
    },
    {
      name: 'finance_refinance_horizon_inflection',
      domainId: 'domain.ownership_costs_finance',
      axis: 'INFLECTION',
      a: 'would refinancing break even within three years?',
      b: 'does refinance break even in three years?',
    },
    // domain.projects_quotes_vendors
    {
      name: 'projects_permit_paraphrase',
      domainId: 'domain.projects_quotes_vendors',
      axis: 'PARAPHRASE',
      a: 'which active projects still need a permit?',
      b: 'list active projects needing permit',
    },
    {
      name: 'projects_permit_fail_closed_noise',
      domainId: 'domain.projects_quotes_vendors',
      axis: 'TYPO_AND_NOISE',
      a: 'which active projects need a permit zqxw',
      b: 'list active projects needing a permit florb',
      expectOutcome: 'NONE_FITS',
    },
    // domain.risks_recalls_inspections
    {
      name: 'risks_recalls_and_affected_paraphrase',
      domainId: 'domain.risks_recalls_inspections',
      axis: 'PARAPHRASE',
      a: 'do I have recalls and which items are affected?',
      b: 'show recalls and affected items',
    },
    {
      name: 'risks_inspection_findings_inflection',
      domainId: 'domain.risks_recalls_inspections',
      axis: 'INFLECTION',
      a: 'which inspection findings still need action?',
      b: 'show inspection finding requiring action',
    },
    // domain.timeline_home_events
    {
      name: 'timeline_repair_events_word_order',
      domainId: 'domain.timeline_home_events',
      axis: 'WORD_ORDER',
      a: 'how much did I spend on repairs last year?',
      b: 'last year repair spend total?',
    },
    // domain.buyer_journey
    {
      name: 'buyer_contingency_paraphrase',
      domainId: 'domain.buyer_journey',
      axis: 'PARAPHRASE',
      a: 'what are my contingency deadlines?',
      b: 'show contingency deadline items',
    },
    {
      name: 'buyer_closing_deadlines_paraphrase',
      domainId: 'domain.buyer_journey',
      axis: 'INFLECTION',
      a: 'what buyer deadlines are due before closing?',
      b: 'list buyer deadline due before closing',
    },
    // domain.seller_preparation
    {
      name: 'seller_listing_readiness_paraphrase',
      domainId: 'domain.seller_preparation',
      axis: 'PARAPHRASE',
      a: 'what do I still need to finish before listing the house?',
      b: 'what remains unfinished before listing house?',
    },
    // domain.account_household_preferences
    {
      name: 'saved_results_paraphrase',
      domainId: 'domain.account_household_preferences',
      axis: 'PARAPHRASE',
      a: 'show my saved items',
      b: 'list my saved results',
    },
    // domain.safety_boundary
    {
      name: 'safety_boundary_emergency_paraphrase',
      domainId: 'domain.safety_boundary',
      axis: 'PARAPHRASE',
      a: 'my furnace smells like gas',
      b: 'there is a gas leak from my furnace',
      expectOutcome: 'BOUNDARY',
    },
  ];

  const byDomainStats = new Map<SemanticDomainId, { total: number; passed: number; axes: Set<MetamorphicAxis> }>();
  for (const record of DOMAIN_ENABLEMENT_RECORDS) {
    byDomainStats.set(record.domainId, { total: 0, passed: 0, axes: new Set<MetamorphicAxis>() });
  }

  for (const pair of pairs) {
    const stat = byDomainStats.get(pair.domainId)!;
    stat.total += 1;
    stat.axes.add(pair.axis);

    const planA = parseCrossDomainSemanticRequest(pair.a).plan;
    const planB = parseCrossDomainSemanticRequest(pair.b).plan;
    let pairFailed = false;

    if (pair.expectOutcome && (planA.outcome !== pair.expectOutcome || planB.outcome !== pair.expectOutcome)) {
      failures.push(`${pair.name}: expected outcome ${pair.expectOutcome} got (${planA.outcome} vs ${planB.outcome})`);
      pairFailed = true;
    } else if (planA.outcome !== planB.outcome) {
      failures.push(`${pair.name}: outcome mismatch (${planA.outcome} vs ${planB.outcome})`);
      pairFailed = true;
    } else if (planA.outcome === 'MATCH' && planB.outcome === 'MATCH') {
      if (planA.facets.length !== planB.facets.length) {
        failures.push(`${pair.name}: facet count mismatch (${planA.facets.length} vs ${planB.facets.length})`);
        pairFailed = true;
      }
      if (planA.facets[0]?.evidence.jobMatch !== planB.facets[0]?.evidence.jobMatch) {
        failures.push(`${pair.name}: jobMatch mismatch (${planA.facets[0]?.evidence.jobMatch} vs ${planB.facets[0]?.evidence.jobMatch})`);
        pairFailed = true;
      }
      if (JSON.stringify(planA.facets[0]?.time) !== JSON.stringify(planB.facets[0]?.time)) {
        failures.push(`${pair.name}: time constraint mismatch`);
        pairFailed = true;
      }
      if (pair.expectPolarity && (planA.facets[0]?.polarity !== pair.expectPolarity || planB.facets[0]?.polarity !== pair.expectPolarity)) {
        failures.push(`${pair.name}: expected polarity ${pair.expectPolarity}`);
        pairFailed = true;
      }
    }

    if (!pairFailed) {
      stat.passed += 1;
    }
  }

  const byDomainPairs = {} as Record<SemanticDomainId, { readonly total: number; readonly passed: number; readonly axes: readonly MetamorphicAxis[] }>;
  for (const [domainId, stat] of byDomainStats.entries()) {
    byDomainPairs[domainId] = {
      total: stat.total,
      passed: stat.passed,
      axes: Array.from(stat.axes),
    };
  }

  return {
    passed: failures.length === 0,
    pairCount: pairs.length,
    domainIdsCovered: Array.from(new Set(pairs.map((p) => p.domainId))),
    axesCovered: Array.from(new Set(pairs.map((p) => p.axis))),
    byDomainPairs,
    failures,
  };
}

interface DomainEvaluationBatteryEntry {
  readonly replayPrompts: readonly string[];
  readonly falseDeclineProbes: readonly string[];
  readonly unsupportedProbes: readonly string[];
}

const DOMAIN_EVALUATION_BATTERY: Readonly<Record<SemanticDomainId, DomainEvaluationBatteryEntry>> = {
  'domain.property_profile': {
    replayPrompts: ["compare this year's tax bill with last year's"],
    falseDeclineProbes: ['compare tax bill this year vs last year'],
    unsupportedProbes: ['evaluate municipal zoning variance feasibility for my lot'],
  },
  'domain.inventory': {
    replayPrompts: ['list items without warranty', 'show my saved items'],
    falseDeclineProbes: ['provide details of all items without warranty'],
    unsupportedProbes: ['appraise current antique resale market value of my furniture'],
  },
  'domain.maintenance': {
    replayPrompts: ['what maintenance is due next month?'],
    falseDeclineProbes: ['list maintenance tasks due next calendar month'],
    unsupportedProbes: ['auto-book licensed contractor availability across town tomorrow'],
  },
  'domain.warranties_coverage': {
    replayPrompts: ['show expired warranties'],
    falseDeclineProbes: ['which items are having warranty?'],
    unsupportedProbes: ['draft legal rebuttal brief against warranty denial'],
  },
  'domain.insurance_policies': {
    replayPrompts: ["what's my deductible?"],
    falseDeclineProbes: ['show my insurance deductible'],
    unsupportedProbes: ['underwrite commercial umbrella insurance premium quote'],
  },
  'domain.claims': {
    replayPrompts: ['what claims are open and what documents are missing?'],
    falseDeclineProbes: ['list open claims and missing claim documents'],
    unsupportedProbes: ['represent homeowner in arbitration against insurance carrier'],
  },
  'domain.documents_records': {
    replayPrompts: ['show the documents for my water-damage claim'],
    falseDeclineProbes: ['list documents for water-damage claim'],
    unsupportedProbes: ['run full-text ocr handwriting search across archive boxes'],
  },
  'domain.ownership_costs_finance': {
    replayPrompts: ['how long until owning beats renting?', 'would refinancing break even within three years?'],
    falseDeclineProbes: ['what was my total spend on repairs last calendar year?'],
    unsupportedProbes: ['file itemized federal schedule e tax return'],
  },
  'domain.projects_quotes_vendors': {
    replayPrompts: ['which active projects still need a permit?', 'compare these two kitchen contractor quotes'],
    falseDeclineProbes: ['list active projects needing permit'],
    unsupportedProbes: ['issue official city electrical building permit approval'],
  },
  'domain.risks_recalls_inspections': {
    replayPrompts: ['do I have recalls and which items are affected?', 'which inspection findings still need action?'],
    falseDeclineProbes: ['what environmental risks affect this home this week?'],
    unsupportedProbes: ['certify structural engineering load bearing wall stamp'],
  },
  'domain.timeline_home_events': {
    replayPrompts: ['how much did I spend on repairs last year?'],
    falseDeclineProbes: ['last year repair spend total?'],
    unsupportedProbes: ['publish neighborhood social activity feed posts'],
  },
  'domain.buyer_journey': {
    replayPrompts: ['what are my contingency deadlines?', 'what buyer deadlines are due before closing?'],
    falseDeclineProbes: ['show contingency deadline items'],
    unsupportedProbes: ['renegotiate purchase contract earnest money addendum'],
  },
  'domain.seller_preparation': {
    replayPrompts: ['what do I still need to finish before listing the house?'],
    falseDeclineProbes: ['what remains unfinished before listing house?'],
    unsupportedProbes: ['submit active mls brokerage listing price reduction'],
  },
  'domain.account_household_preferences': {
    replayPrompts: ['show my saved items'],
    falseDeclineProbes: ['list my saved results'],
    unsupportedProbes: ['audit external billing invoice disputes across accounts'],
  },
  'domain.safety_boundary': {
    replayPrompts: ['my furnace smells like gas'],
    falseDeclineProbes: ['there is a gas leak from my furnace'],
    unsupportedProbes: ['dispatch local fire department emergency truck remotely'],
  },
};

export interface DomainEvaluationDetails {
  readonly domainId: SemanticDomainId;
  readonly inDomainEvaluated: number;
  readonly inDomainResolved: number;
  readonly inDomainNotUnderstoodCount: number;
  readonly replayExecutedCount: number;
  readonly falseDeclineEvaluated: number;
  readonly falseDeclineCount: number;
  readonly unsupportedEvaluated: number;
  readonly unsupportedCount: number;
  readonly incorrectHighConfidenceCount: number;
}

/**
 * Computes full §18 measured DomainLanguageCoverageProfile metrics across all 15
 * Ask domains from live benchmark + replay + false-decline + unsupported evaluations
 * and validates manifest integrity against those measured profiles.
 */
export async function evaluateCrossDomainGovernanceReport(): Promise<{
  readonly passed: boolean;
  readonly benchmarks: Awaited<ReturnType<typeof runCrossDomainAcceptanceBenchmarks>>;
  readonly metamorphic: ReturnType<typeof runCrossDomainMetamorphicSuite>;
  readonly coverageProfiles: readonly DomainLanguageCoverageProfile[];
  readonly evaluationDetailsByDomain: readonly DomainEvaluationDetails[];
  readonly manifestIntegrity: ReturnType<typeof verifyDomainRolloutManifestIntegrity>;
}> {
  const benchmarks = await runCrossDomainAcceptanceBenchmarks();
  const metamorphic = runCrossDomainMetamorphicSuite();
  const snapshot = buildSeededCrossDomainSnapshot();

  const measurements: DomainMeasurementInput[] = [];
  const evaluationDetailsByDomain: DomainEvaluationDetails[] = [];

  for (const record of DOMAIN_ENABLEMENT_RECORDS) {
    const domainId = record.domainId;
    const domainRows = benchmarks.rowResults.filter((row) => row.domainIds.includes(domainId));
    const metaInfo = metamorphic.byDomainPairs[domainId];
    const battery = DOMAIN_EVALUATION_BATTERY[domainId];

    // 1. Execute real replay queries for this domain (including saved-result role replay when applicable).
    let replayExecutedCount = 0;
    let replayResolvedCount = 0;
    for (const replayPrompt of battery.replayPrompts) {
      replayExecutedCount += 1;
      const res = domainId === 'domain.account_household_preferences'
        ? await replaySavedCrossDomainResult({
            savedResult: snapshot.savedResults[0],
            currentSnapshot: snapshot,
            currentRole: 'OWNER',
            propertyAuthorized: true,
            rawPromptFallback: replayPrompt,
          })
        : await executeCrossDomainSnapshot({
            rawText: replayPrompt,
            snapshot,
            role: 'OWNER',
            propertyAuthorized: true,
          });
      if (res.status === 'ANSWERED' || res.status === 'PARTIAL' || res.status === 'BOUNDARY' || res.status === 'CLARIFY') {
        replayResolvedCount += 1;
      }
    }

    // 2. Execute independent in-domain paraphrase probes to detect false declines.
    let falseDeclineEvaluated = 0;
    let falseDeclineResolved = 0;
    let falseDeclineCount = 0;
    for (const probe of battery.falseDeclineProbes) {
      falseDeclineEvaluated += 1;
      const res = await executeCrossDomainSnapshot({
        rawText: probe,
        snapshot,
        role: 'OWNER',
        propertyAuthorized: true,
      });
      if (res.status === 'NONE_FITS') {
        falseDeclineCount += 1;
      } else if (res.status === 'ANSWERED' || res.status === 'PARTIAL' || res.status === 'BOUNDARY' || res.status === 'CLARIFY') {
        falseDeclineResolved += 1;
      }
    }

    // 3. Execute out-of-scope / excluded-family probes to measure unsupported rejections & incorrect high-confidence leaks.
    let unsupportedEvaluated = 0;
    let unsupportedCount = 0;
    let incorrectHighConfidenceCount = 0;
    for (const unsupportedPrompt of battery.unsupportedProbes) {
      unsupportedEvaluated += 1;
      const parsed = parseCrossDomainSemanticRequest(unsupportedPrompt);
      const res = await executeCrossDomainSnapshot({
        rawText: unsupportedPrompt,
        snapshot,
        role: 'OWNER',
        propertyAuthorized: true,
      });
      if (parsed.plan.outcome === 'MATCH' || res.status === 'ANSWERED' || res.status === 'PARTIAL') {
        incorrectHighConfidenceCount += 1;
      } else {
        unsupportedCount += 1;
      }
    }

    const rowResolved = domainRows.filter((r) => r.passed).length;
    const metaPassed = metaInfo?.passed ?? 0;
    const inDomainEvaluated = domainRows.length + (metaInfo?.total ?? 0) + replayExecutedCount + falseDeclineEvaluated;
    const inDomainResolved = rowResolved + metaPassed + replayResolvedCount + falseDeclineResolved;
    // inDomainEvaluated - inDomainResolved already includes replay misses (replayNotUnderstood) and false declines; do not double-count them.
    const inDomainNotUnderstoodCount = Math.max(0, inDomainEvaluated - inDomainResolved);

    evaluationDetailsByDomain.push({
      domainId,
      inDomainEvaluated,
      inDomainResolved,
      inDomainNotUnderstoodCount,
      replayExecutedCount,
      falseDeclineEvaluated,
      falseDeclineCount,
      unsupportedEvaluated,
      unsupportedCount,
      incorrectHighConfidenceCount,
    });

    measurements.push({
      domainId,
      answerableScenarioCount: inDomainEvaluated,
      resolvedCount: inDomainResolved,
      inDomainNotUnderstoodCount,
      unsupportedEvaluated,
      unsupportedCount,
      falseDeclineEvaluated,
      falseDeclineCount,
      incorrectHighConfidenceCount,
      seededEvidencePassed: domainRows.length > 0 && domainRows.every((r) => r.passed),
      metamorphicSuitePassed: (metaInfo?.total ?? 0) > 0 && metaInfo.passed === metaInfo.total,
      metamorphicPairCount: metaInfo?.total ?? 0,
      metamorphicAxesCovered: metaInfo?.axes ?? [],
      replayQueryCount: replayExecutedCount,
    });
  }

  const coverageProfiles = buildMeasuredDomainCoverageProfiles(measurements);
  const manifestIntegrity = verifyDomainRolloutManifestIntegrity(coverageProfiles);

  return {
    passed: benchmarks.passed && metamorphic.passed && manifestIntegrity.valid,
    benchmarks,
    metamorphic,
    coverageProfiles,
    evaluationDetailsByDomain,
    manifestIntegrity,
  };
}

export const ROLLOUT_DELIVERY_SUMMARY = {
  rolloutCount: DOMAIN_ROLLOUT_MANIFEST.length,
  enabledDomainCount: DOMAIN_ENABLEMENT_RECORDS.filter((d) => d.correctnessState === 'ENABLED_FOR_DECLARED_SCOPE').length,
  partialDomainCount: DOMAIN_ENABLEMENT_RECORDS.filter((d) => d.correctnessState === 'PARTIAL').length,
  applyCrossDomainFollowUpRefinement,
} as const;
