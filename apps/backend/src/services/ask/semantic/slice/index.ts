import { verifySliceRegistryCompleteness } from './sliceRegistry';
import { buildSemanticTextEnvelope, verifyPlaceholderSpanMapRoundTrip } from './placeholderSpanMap';
import {
  applySliceFollowUpRefinement,
  executeSemanticSlice,
  replaySliceExecutionWithAuthorization,
  type SliceAuthorizationContext,
  type SlicePropertySnapshot,
  type SliceExecutionResult,
} from './sliceExecutor';

export * from './placeholderSpanMap';
export * from './sliceRegistry';
export * from './richPresentationAdapter';
export * from './sliceExecutor';

export const SLICE_SEEDED_PROPERTY_SNAPSHOT: SlicePropertySnapshot = Object.freeze({
  propertyId: 'prop-phase2a-1',
  asOfDate: '2026-11-15',
  rooms: [
    { id: 'room-kitchen', propertyId: 'prop-phase2a-1', name: 'Kitchen' },
    { id: 'room-basement', propertyId: 'prop-phase2a-1', name: 'Basement' },
  ],
  items: [
    {
      id: 'item-fridge',
      propertyId: 'prop-phase2a-1',
      name: 'Refrigerator',
      category: 'APPLIANCE',
      brand: 'Bosch',
      modelNumber: 'B36CL80SNS',
      serialNumber: 'SN-FRG-88412',
      purchaseCostCents: 289900,
      replacementCostCents: 319900,
      installedOn: '2022-05-10',
      condition: 'GOOD_CONDITION',
      roomId: 'room-kitchen',
      propertyPlanWarrantyId: null,
      itemWarrantyIds: ['war-fridge-1'],
      coverageEvidenceStatus: 'VERIFIED',
    },
    {
      id: 'item-dishwasher',
      propertyId: 'prop-phase2a-1',
      name: 'Dishwasher',
      category: 'APPLIANCE',
      brand: 'KitchenAid',
      modelNumber: 'KDTM404KPS',
      serialNumber: 'SN-DW-44109',
      purchaseCostCents: 119900,
      replacementCostCents: 135000,
      installedOn: '2020-03-14',
      condition: 'FAIR_CONDITION',
      roomId: 'room-kitchen',
      propertyPlanWarrantyId: null,
      itemWarrantyIds: [],
      coverageEvidenceStatus: 'NONE',
    },
    {
      id: 'item-furnace',
      propertyId: 'prop-phase2a-1',
      name: 'Furnace',
      category: 'HVAC',
      brand: 'Carrier',
      modelNumber: '59TP6B',
      serialNumber: 'SN-FUR-99201',
      purchaseCostCents: 540000,
      replacementCostCents: 680000,
      installedOn: '2014-10-01',
      condition: 'REPLACE_SOON',
      roomId: 'room-basement',
      propertyPlanWarrantyId: null,
      itemWarrantyIds: [],
      coverageEvidenceStatus: 'NOT_SURE',
    },
    {
      id: 'item-water-heater',
      propertyId: 'prop-phase2a-1',
      name: 'Water Heater',
      category: 'PLUMBING',
      brand: 'Rheem',
      modelNumber: 'XE50T10H45U0',
      serialNumber: 'SN-WH-31002',
      purchaseCostCents: 145000,
      replacementCostCents: 195000,
      installedOn: '2019-08-22',
      condition: 'FAIR_CONDITION',
      roomId: 'room-basement',
      propertyPlanWarrantyId: 'war-plan-1',
      itemWarrantyIds: ['war-plan-1'],
      coverageEvidenceStatus: 'VERIFIED',
    },
    {
      id: 'item-sump-pump',
      propertyId: 'prop-phase2a-1',
      name: 'Sump Pump',
      category: 'PLUMBING',
      brand: 'Zoeller',
      modelNumber: 'M53',
      serialNumber: 'SN-SP-11223',
      purchaseCostCents: 35000,
      replacementCostCents: 55000,
      installedOn: '2021-04-12',
      condition: 'GOOD_CONDITION',
      roomId: 'room-basement',
      propertyPlanWarrantyId: 'war-plan-1',
      itemWarrantyIds: ['war-sp-2'],
      coverageEvidenceStatus: 'VERIFIED',
    },
  ],
  maintenanceTasks: [
    {
      id: 'maint-furnace-filter',
      propertyId: 'prop-phase2a-1',
      title: 'Replace furnace air filter',
      status: 'PAST_DUE',
      priority: 'HIGH_PRIORITY',
      nextDueDate: '2026-10-15',
      inventoryItemId: 'item-furnace',
    },
    {
      id: 'maint-water-heater-flush',
      propertyId: 'prop-phase2a-1',
      title: 'Flush water heater tank',
      status: 'PENDING',
      priority: 'MEDIUM_PRIORITY',
      nextDueDate: '2026-12-01',
      inventoryItemId: 'item-water-heater',
    },
    {
      id: 'maint-fridge-coils',
      propertyId: 'prop-phase2a-1',
      title: 'Clean refrigerator condenser coils',
      status: 'COMPLETED',
      priority: 'LOW_PRIORITY',
      nextDueDate: '2026-06-01',
      inventoryItemId: 'item-fridge',
    },
  ],
});

export const SLICE_OWNER_AUTH: SliceAuthorizationContext = Object.freeze({
  propertyId: 'prop-phase2a-1',
  role: 'OWNER',
  propertyAuthorized: true,
});

export const SLICE_VIEWER_AUTH: SliceAuthorizationContext = Object.freeze({
  propertyId: 'prop-phase2a-1',
  role: 'VIEWER',
  propertyAuthorized: true,
});

export interface SliceDiscoveredAbstractionChange {
  readonly id: string;
  readonly area: string;
  readonly summary: string;
  readonly actionBeforeDomainRollout: string;
}

/**
 * §18 Phase 2A / §19 Artifact #9:
 * Concrete abstraction changes discovered while running the vertical slice,
 * recorded before expanding registry generation to the remaining domains.
 */
export const SLICE_DISCOVERED_ABSTRACTION_CHANGES: readonly SliceDiscoveredAbstractionChange[] = Object.freeze([
  {
    id: 'P2A-ABS-01',
    area: 'Facet requestClass vs Receipt projection',
    summary: 'CAPABILITY facets use projection ANALYSIS in SemanticRequestPlanSchema, whereas SemanticReadReceiptSchema expects DETAIL/LIST/COUNT/EXISTS.',
    actionBeforeDomainRollout: 'Allow ANALYSIS projection on SemanticReadReceiptSchema or formalize capability-to-receipt projection mapping in registry metadata.',
  },
  {
    id: 'P2A-ABS-02',
    area: 'Multi-relation Boolean scope vs unresolved coordination tokens',
    summary: 'Inventory queries combining Boolean coordinators ("and", "either", "or", "neither", "nor") with pronouns ("I") required explicit handling alongside unresolvedSpans.',
    actionBeforeDomainRollout: 'Generate coordinator and pronoun stopword classes from the shared grammar lexicon rather than per-parser exclusion lists.',
  },
  {
    id: 'P2A-ABS-03',
    area: 'Field-level authorization redaction in presentation & receipts',
    summary: 'Role downgrade (OWNER -> VIEWER) must redact sensitive fields (serialNumber, purchaseCostCents, replacementCostCents) while keeping population counts entailed.',
    actionBeforeDomainRollout: 'Attach sensitivity classification from FieldRegistration directly to receipt/presentation redaction metadata.',
  },
]);

export interface SliceMetamorphicCase {
  readonly family: 'INFLECTION' | 'NEGATION' | 'COORDINATION' | 'TYPO' | 'WORD_ORDER';
  readonly leftPrompt: string;
  readonly rightPrompt: string;
  readonly expectedMatchedIds: readonly string[];
}

export const SLICE_METAMORPHIC_CASES: readonly SliceMetamorphicCase[] = Object.freeze([
  {
    family: 'INFLECTION',
    leftPrompt: 'which appliance has warranty',
    rightPrompt: 'which appliances have warranties',
    expectedMatchedIds: ['item-fridge', 'item-water-heater'],
  },
  {
    family: 'NEGATION',
    leftPrompt: 'which appliances do not have warranty',
    rightPrompt: 'which appliances have no warranty',
    expectedMatchedIds: ['item-dishwasher'],
  },
  {
    family: 'NEGATION',
    leftPrompt: 'which appliances do not have overdue maintenance',
    rightPrompt: 'which appliances have no overdue maintenance',
    expectedMatchedIds: ['item-fridge', 'item-dishwasher', 'item-water-heater', 'item-sump-pump'],
  },
  {
    family: 'NEGATION',
    leftPrompt: 'which maintenance tasks are not overdue',
    rightPrompt: 'list maintenance that is not overdue',
    expectedMatchedIds: ['maint-water-heater-flush', 'maint-fridge-coils'],
  },
  {
    family: 'NEGATION',
    leftPrompt: 'which appliances are not in kitchen',
    rightPrompt: 'list appliances not in the kitchen',
    expectedMatchedIds: ['item-furnace', 'item-water-heater', 'item-sump-pump'],
  },
  {
    family: 'NEGATION',
    leftPrompt: 'items that arent in the basement',
    rightPrompt: 'items that are not in the basement',
    expectedMatchedIds: ['item-fridge', 'item-dishwasher'],
  },
  {
    family: 'COORDINATION',
    leftPrompt: 'which appliances have either warranty or due maintenance',
    rightPrompt: 'which appliances have warranty or due maintenance',
    expectedMatchedIds: ['item-fridge', 'item-furnace', 'item-water-heater'],
  },
  {
    family: 'COORDINATION',
    leftPrompt: 'which appliances are in kitchen or basement',
    rightPrompt: 'which appliances are in either kitchen or basement',
    expectedMatchedIds: ['item-fridge', 'item-dishwasher', 'item-furnace', 'item-water-heater', 'item-sump-pump'],
  },
  {
    family: 'COORDINATION',
    leftPrompt: 'which appliances are in neither kitchen nor basement',
    rightPrompt: 'list appliances in neither kitchen nor basement',
    expectedMatchedIds: [],
  },
  {
    family: 'COORDINATION',
    leftPrompt: 'which appliances have warranty and are in kitchen or basement',
    rightPrompt: 'which appliances are in kitchen or basement and have warranty',
    expectedMatchedIds: ['item-fridge', 'item-water-heater'],
  },
  {
    family: 'TYPO',
    leftPrompt: 'which appliences have warranty',
    rightPrompt: 'which appliances have warrnty',
    expectedMatchedIds: ['item-fridge', 'item-water-heater'],
  },
  {
    family: 'WORD_ORDER',
    leftPrompt: 'show replacement cost for my furnace',
    rightPrompt: 'furnace replacement cost show',
    expectedMatchedIds: ['item-furnace'],
  },
]);

export interface SliceMetamorphicSuiteResult {
  readonly ok: boolean;
  readonly failures: readonly string[];
}

export function runSliceMetamorphicSuite(
  snapshot: SlicePropertySnapshot = SLICE_SEEDED_PROPERTY_SNAPSHOT,
  auth: SliceAuthorizationContext = SLICE_OWNER_AUTH
): SliceMetamorphicSuiteResult {
  const failures: string[] = [];
  for (const testCase of SLICE_METAMORPHIC_CASES) {
    const left = executeSemanticSlice({ rawText: testCase.leftPrompt, snapshot, auth });
    const right = executeSemanticSlice({ rawText: testCase.rightPrompt, snapshot, auth });
    const leftIds = [...left.activeEntityIds].sort();
    const rightIds = [...right.activeEntityIds].sort();
    const expected = [...testCase.expectedMatchedIds].sort();

    if (left.status !== 'ANSWERED' || right.status !== 'ANSWERED') {
      failures.push(`${testCase.family}:non_answered:${left.status}/${right.status}`);
      continue;
    }
    if (JSON.stringify(leftIds) !== JSON.stringify(expected)) {
      failures.push(`${testCase.family}:left_mismatch:${leftIds.join(',')}!=${expected.join(',')}`);
    }
    if (JSON.stringify(rightIds) !== JSON.stringify(expected)) {
      failures.push(`${testCase.family}:right_mismatch:${rightIds.join(',')}!=${expected.join(',')}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export interface SliceInvariantReport {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  readonly registryReport: ReturnType<typeof verifySliceRegistryCompleteness>;
  readonly metamorphicReport: SliceMetamorphicSuiteResult;
}

/**
 * Verifies every Phase 2A deliverable (§18 Phase 2A):
 * registry completeness, placeholder span-map round-trips, vertical slice scenarios,
 * follow-up refinement, authorization replay, rich presentation equivalence,
 * adjacent negatives, and metamorphic invariance.
 */
export function verifySliceInvariants(): SliceInvariantReport {
  const reasons: string[] = [];
  const registryReport = verifySliceRegistryCompleteness();
  if (!registryReport.ok) {
    reasons.push(...registryReport.missing.map((m) => `registry:${m}`));
  }

  // Span map round-trip check
  const envelope = buildSemanticTextEnvelope(
    'Schedule maintenance for my refrigerator SN-FRG-88412 in kitchen on 2026-12-10 for $150.00'
  );
  const spanCheck = verifyPlaceholderSpanMapRoundTrip(envelope);
  if (!spanCheck.ok) {
    reasons.push(...spanCheck.reasons.map((r) => `span:${r}`));
  }

  const checkAnswered = (label: string, result: SliceExecutionResult) => {
    if (result.status !== 'ANSWERED') reasons.push(`${label}:status=${result.status}`);
    if (!result.spanRoundTripOk) reasons.push(`${label}:span_round_trip_failed`);
    if (result.entailment?.outcome !== 'PASS') reasons.push(`${label}:entailment_failed`);
    if (!result.presentationEquivalence?.ok) reasons.push(`${label}:presentation_equivalence_failed`);
  };

  // Core vertical-slice queries
  const invCount = executeSemanticSlice({
    rawText: 'how many appliances do I have',
    snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
    auth: SLICE_OWNER_AUTH,
  });
  checkAnswered('inventory_count', invCount);
  if (invCount.receipt?.population.confirmedCount !== 5) reasons.push('inventory_count:expected_5');

  const warNeg = executeSemanticSlice({
    rawText: 'which appliances have no warranty',
    snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
    auth: SLICE_OWNER_AUTH,
  });
  checkAnswered('warranty_negative', warNeg);
  if (warNeg.receipt?.population.conflictedCount !== 1 || warNeg.receipt?.population.unknownCount !== 1) {
    reasons.push('warranty_negative:uncertainty_counts_mismatch');
  }

  const boolAnd = executeSemanticSlice({
    rawText: 'which appliances have warranty and due maintenance',
    snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
    auth: SLICE_OWNER_AUTH,
  });
  checkAnswered('boolean_and', boolAnd);
  if (JSON.stringify(boolAnd.activeEntityIds) !== JSON.stringify(['item-water-heater'])) {
    reasons.push('boolean_and:expected_water_heater');
  }

  const boolNeither = executeSemanticSlice({
    rawText: 'which appliances have neither warranty nor due maintenance',
    snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
    auth: SLICE_OWNER_AUTH,
  });
  checkAnswered('boolean_neither_nor', boolNeither);
  // The Sump Pump's warranty links conflict: it is not confirmed as having a warranty or as having none, so "neither a warranty nor due maintenance" does not count it.
  if (JSON.stringify(boolNeither.activeEntityIds) !== JSON.stringify(['item-dishwasher'])) {
    reasons.push('boolean_neither_nor:expected_dishwasher_only');
  }

  const guidance = executeSemanticSlice({
    rawText: 'should I repair or replace my furnace',
    snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
    auth: SLICE_OWNER_AUTH,
  });
  checkAnswered('replacement_guidance', guidance);

  const cmdPreview = executeSemanticSlice({
    rawText: 'schedule maintenance for my furnace on 2026-12-01',
    snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
    auth: SLICE_OWNER_AUTH,
  });
  if (cmdPreview.status !== 'NEEDS_CONFIRMATION') {
    reasons.push(`command_preview:expected_NEEDS_CONFIRMATION_got_${cmdPreview.status}`);
  }

  const followUp = applySliceFollowUpRefinement({
    priorResult: warNeg,
    followUpText: 'how many',
    snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
    auth: SLICE_OWNER_AUTH,
  });
  checkAnswered('follow_up_refinement', followUp);
  if (followUp.receipt?.population.confirmedCount !== 1) {
    reasons.push('follow_up_refinement:expected_1');
  }

  const serialOwner = executeSemanticSlice({
    rawText: 'show serial number for my refrigerator',
    snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
    auth: SLICE_OWNER_AUTH,
  });
  checkAnswered('serial_owner', serialOwner);
  const serialViewer = replaySliceExecutionWithAuthorization({
    priorResult: serialOwner,
    snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
    updatedAuth: SLICE_VIEWER_AUTH,
  });
  checkAnswered('serial_viewer_redacted', serialViewer);
  if (!serialViewer.redactedFields.includes('serialNumber') || JSON.stringify(serialViewer.operationResult.blocks).includes('SN-FRG-88412')) {
    reasons.push('serial_viewer_redacted:sensitive_value_leaked');
  }

  // Adjacent negatives
  const adjUnsupported = executeSemanticSlice({
    rawText: 'which appliances have no guarantee',
    snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
    auth: SLICE_OWNER_AUTH,
  });
  if (adjUnsupported.status !== 'OUT_OF_SCOPE') reasons.push('adj_unsupported:expected_OUT_OF_SCOPE');

  const adjAmbiguous = executeSemanticSlice({
    rawText: 'which appliances do not have warranty or due maintenance',
    snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
    auth: SLICE_OWNER_AUTH,
  });
  if (adjAmbiguous.status !== 'NEEDS_CLARIFICATION') reasons.push('adj_ambiguous:expected_NEEDS_CLARIFICATION');

  const metamorphicReport = runSliceMetamorphicSuite();
  if (!metamorphicReport.ok) {
    reasons.push(...metamorphicReport.failures.map((f) => `metamorphic:${f}`));
  }

  return {
    ok: reasons.length === 0,
    reasons,
    registryReport,
    metamorphicReport,
  };
}
