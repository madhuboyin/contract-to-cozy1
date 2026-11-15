export * from './domainWaveManifest';
export * from './crossDomainPlanBuilder';
export * from './crossDomainWaveExecutor';

import { verifyProtectionLexemeSeparation } from '../sharedSemanticLexicon';
import {
  DOMAIN_ENABLEMENT_RECORDS,
  DOMAIN_WAVE_MANIFEST,
  verifyDomainWaveManifestIntegrity,
} from './domainWaveManifest';
import {
  applyCrossDomainFollowUpRefinement,
  parseCrossDomainSemanticRequest,
} from './crossDomainPlanBuilder';
import {
  executeCrossDomainFollowUp,
  executeCrossDomainWaves,
  replaySavedCrossDomainResult,
  type CrossDomainPropertySnapshot,
} from './crossDomainWaveExecutor';

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
        coverageEvidenceStatus: 'NONE',
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
        coverageEvidenceStatus: 'NONE',
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

export async function runCrossDomainAcceptanceBenchmarks(): Promise<{
  readonly passed: boolean;
  readonly checkedCount: number;
  readonly failures: readonly string[];
}> {
  const snapshot = buildSeededCrossDomainSnapshot();
  const failures: string[] = [];
  let checkedCount = 0;

  const expectPrompt = async (
    prompt: string,
    check: (res: Awaited<ReturnType<typeof executeCrossDomainWaves>>) => string | null,
    role: 'OWNER' | 'EDITOR' | 'VIEWER' = 'OWNER',
  ) => {
    checkedCount += 1;
    const res = await executeCrossDomainWaves({
      rawText: prompt,
      snapshot,
      role,
      propertyAuthorized: true,
    });
    const issue = check(res);
    if (issue) failures.push(`${prompt}: ${issue}`);
  };

  await expectPrompt('what maintenance is due next month?', (r) =>
    r.status === 'ANSWERED' && r.facetResults[0]?.recordIds.includes('task-plumbing-next-month') ? null : `bad status/ids ${r.status}`);
  await expectPrompt('show plumbing and electrical tasks', (r) =>
    r.facetResults[0]?.recordIds.length === 2 ? null : 'expected both plumbing and electrical tasks');
  await expectPrompt("which appliances don't have a manual or receipt?", (r) =>
    r.status === 'CLARIFY' && r.clarification?.reasonCode === 'AMBIGUOUS_NEGATIVE_COORDINATION' ? null : `expected CLARIFY got ${r.status}`);
  await expectPrompt('which appliances have neither a manual nor a receipt?', (r) =>
    r.status === 'ANSWERED' && r.facetResults[0]?.recordIds.length === 1 ? null : 'expected furnace only');
  await expectPrompt('how much did I spend on repairs last year?', (r) =>
    r.facetResults[0]?.metrics?.totalRepairSpendCents === 230000 ? null : 'expected $2300.00 repairs');
  await expectPrompt("compare this year's tax bill with last year's", (r) =>
    r.facetResults[0]?.metrics?.deltaCents === 35000 ? null : 'expected +$350.00 delta');
  await expectPrompt('what claims are open and what documents are missing?', (r) =>
    r.facetResults.length === 2 && r.facetResults[1].recordIds[0] === 'claim-water-damage:ADJUSTER_ESTIMATE' ? null : 'expected missing ADJUSTER_ESTIMATE');
  await expectPrompt('show the documents for my water-damage claim', (r) =>
    r.facetResults[0]?.recordIds.length === 1 && r.facetResults[0]?.recordIds[0] === 'doc-claim-photo' ? null : 'trashed/other-property doc leaked');
  await expectPrompt('do I have recalls and which items are affected?', (r) =>
    r.facetResults[0]?.recordIds[0] === 'rec-wh-1' ? null : 'expected recall match');
  await expectPrompt('should I repair the furnace or replace it?', (r) =>
    r.status === 'ANSWERED' ? null : 'expected replacement guidance');
  await expectPrompt('how long until owning beats renting?', (r) =>
    r.facetResults[0]?.status === 'EXECUTED' ? null : 'expected own-rent result');
  await expectPrompt('what are my contingency deadlines?', (r) =>
    r.facetResults[0]?.recordIds.length === 1 && r.facetResults[0]?.recordIds[0] === 'bt-1' ? null : 'expected contingency bt-1');
  await expectPrompt('my furnace is dying—what should I do?', (r) =>
    r.status === 'ANSWERED' ? null : 'expected non-emergency guidance');
  await expectPrompt('my furnace smells like gas', (r) =>
    r.status === 'BOUNDARY' ? null : 'expected safety boundary');
  await expectPrompt('show my saved items', (r) =>
    r.facetResults[0]?.recordIds.length === 2 ? null : 'expected 2 saved results for OWNER');
  await expectPrompt('what buyer deadlines are due before closing?', (r) =>
    r.facetResults[0]?.recordIds.length === 2 ? null : 'expected 2 buyer tasks');
  await expectPrompt('what do I still need to finish before listing the house?', (r) =>
    r.facetResults[0]?.recordIds.length === 1 && r.facetResults[0]?.recordIds[0] === 'sr-1' ? null : 'expected pending sr-1');
  await expectPrompt('would refinancing break even within three years?', (r) =>
    r.status === 'PARTIAL' && r.facetResults[0]?.missingSlots.includes('closingCostsCents') ? null : 'expected missing closingCostsCents disclosure');
  await expectPrompt('which active projects still need a permit?', (r) =>
    r.facetResults[0]?.recordIds.length === 2 && r.facetResults[0]?.receipt?.population.unknownCount === 1 ? null : 'expected confirmed=1, unknown=1, excluding confirmed not required');
  await expectPrompt('compare these two kitchen contractor quotes', (r) =>
    r.facetResults[0]?.metrics?.deltaCents === -270000 ? null : 'expected -$2700 delta');
  await expectPrompt('what environmental risks affect this home this week?', (r) =>
    r.facetResults[0]?.metrics?.sourceAvailable === true && r.facetResults[0]?.recordIds[0] === 'env-radon-1' ? null : 'expected radon alert');
  await expectPrompt('which inspection findings still need action?', (r) =>
    r.facetResults[0]?.recordIds.length === 1 && r.facetResults[0]?.recordIds[0] === 'find-1' ? null : 'expected actionable find-1 only');
  await expectPrompt('show open claims, missing claim documents, overdue maintenance, expired warranties, unpaid tax bills, and active projects', (r) =>
    r.facetResults.length === 6 && r.overflowFacets.length === 0 ? null : 'expected all 6 facets');
  await expectPrompt('tell me about my water heater: age, warranty, replacement cost, and whether to repair or replace', (r) =>
    r.facetResults.length === 4 ? null : 'expected 4 facets for water heater');

  // Role redaction & replay check
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

  // Follow-up refinement check
  checkedCount += 1;
  const followUp = executeCrossDomainFollowUp({
    priorPrompt: 'list items without warranty',
    followUpText: 'what about the kitchen?',
    snapshot,
  });
  if (followUp.outcome !== 'REFINED' || followUp.plan.outcome !== 'MATCH' || followUp.plan.facets[0].relations.length < 2) {
    failures.push('Follow-up room refinement failed to add room relation while inheriting prior plan');
  }

  // Manifest + protection token integrity
  checkedCount += 2;
  const manifestIntegrity = verifyDomainWaveManifestIntegrity();
  if (!manifestIntegrity.valid) failures.push(...manifestIntegrity.issues);
  const sep = verifyProtectionLexemeSeparation();
  if (!sep.valid) failures.push(...sep.violations);

  return {
    passed: failures.length === 0,
    checkedCount,
    failures,
  };
}

export function runCrossDomainMetamorphicSuite(): {
  readonly passed: boolean;
  readonly pairCount: number;
  readonly failures: readonly string[];
} {
  const failures: string[] = [];
  const pairs: ReadonlyArray<{ readonly name: string; readonly a: string; readonly b: string }> = [
    {
      name: 'next_month_calendar_equivalence',
      a: 'what maintenance is due next month?',
      b: 'list maintenance tasks due next calendar month',
    },
    {
      name: 'repair_spend_last_year_equivalence',
      a: 'how much did I spend on repairs last year?',
      b: 'what was my total spend on repairs last calendar year?',
    },
    {
      name: 'negative_neither_nor_order_invariance',
      a: 'which appliances have neither a manual nor a receipt?',
      b: 'list appliances that have neither a manual nor a receipt',
    },
    {
      name: 'fail_closed_noise_token',
      a: 'what claims are open florb',
      b: 'which active projects need a permit zqxw',
    },
  ];

  for (const pair of pairs) {
    const planA = parseCrossDomainSemanticRequest(pair.a).plan;
    const planB = parseCrossDomainSemanticRequest(pair.b).plan;
    if (planA.outcome !== planB.outcome) {
      failures.push(`${pair.name}: outcome mismatch (${planA.outcome} vs ${planB.outcome})`);
      continue;
    }
    if (planA.outcome === 'MATCH' && planB.outcome === 'MATCH') {
      if (planA.facets[0]?.evidence.jobMatch !== planB.facets[0]?.evidence.jobMatch) {
        failures.push(`${pair.name}: jobMatch mismatch (${planA.facets[0]?.evidence.jobMatch} vs ${planB.facets[0]?.evidence.jobMatch})`);
      }
      if (JSON.stringify(planA.facets[0]?.time) !== JSON.stringify(planB.facets[0]?.time)) {
        failures.push(`${pair.name}: time constraint mismatch`);
      }
    }
  }

  return {
    passed: failures.length === 0,
    pairCount: pairs.length,
    failures,
  };
}

export const WAVES_DELIVERY_SUMMARY = {
  waveCount: DOMAIN_WAVE_MANIFEST.length,
  enabledDomainCount: DOMAIN_ENABLEMENT_RECORDS.filter((d) => d.correctnessState === 'ENABLED_FOR_DECLARED_SCOPE').length,
  applyCrossDomainFollowUpRefinement,
} as const;
