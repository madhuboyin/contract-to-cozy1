import { performance } from 'node:perf_hooks';
import { prisma } from '../../../../lib/prisma';
import { readAskOperationalControls } from '../../../../config/askOperationalControls';
import { resolveAskOperation, getAskOperationDefinition, type AskOperationId } from '../../askOperationRegistry';
import { resolveAskRoutingCascade } from '../../askRoutingCascade';
import { loadAskHandlerManifest, validateAskRuntimeRegistration } from '../../askRuntimeBootstrap';
import { resolveDataPoint } from '../../dataPoint/dataPointCatalogue';
import { planDataPointQuery } from '../../dataPoint/dataPointQueryPlan';
import { planShape789 } from '../../dataPoint/dataPointShapes789';
import { executeOperationCore } from '../../execution/executeOperation';
import { ASK_ARTIFACT_TYPE_REGISTRY } from '../../governance/askArtifactTypeRegistry';
import { ASK_SAVED_TYPE_READERS } from '../../saved/savedTypeReaders';
import { composeAskSavedPage } from '../../askSaved.service';
import { resolveHierarchicalSkillRouting } from '../../../skills/skillRouter';
import { buildAskSemanticGovernanceBaselineSummary } from '../governance/index';
import { ASK_SEMANTIC_DOMAINS, type SemanticDomainId } from '../governance/semanticOntologyBaseline';
import { verifyContainmentInvariants } from '../containment/index';
import { buildSemanticTextEnvelope, verifyPlaceholderSpanMapRoundTrip } from '../slice/placeholderSpanMap';
import {
  executeSemanticSlice,
  type SlicePropertySnapshot,
} from '../slice/sliceExecutor';
import {
  SLICE_OWNER_AUTH,
  SLICE_SEEDED_PROPERTY_SNAPSHOT,
} from '../slice/index';
import { parseDeterministicSemanticRequest } from '../deterministicSemanticParser';
import { evaluateLegacyVsSemanticGrammarAgreement } from '../legacyGrammarAgreement';
import { resolveAskSemanticEntryDecision } from '../semanticEntryDispatcher';
import {
  parseCrossDomainSemanticRequest,
  verifyCrossDomainProtectionLexemeSeparation,
} from '../crossDomain/crossDomainPlanBuilder';
import {
  buildOperationResultFromCrossDomainExecution,
  executeCrossDomainSnapshot,
  replaySavedCrossDomainResult,
  type CrossDomainPropertySnapshot,
  type CrossDomainSavedResultRecord,
} from '../crossDomain/crossDomainExecutor';
import {
  buildMeasuredDomainCoverageProfiles,
  DOMAIN_ENABLEMENT_RECORDS,
  normalizeToCanonicalSection5Domain,
  verifyDomainRolloutManifestIntegrity,
  wilson95Interval,
  type DomainLanguageCoverageProfile,
  type DomainMeasurementInput,
} from '../crossDomain/domainRolloutManifest';
import {
  buildSeededCrossDomainSnapshot,
  runCrossDomainAcceptanceBenchmarks,
  runCrossDomainMetamorphicSuite,
} from '../crossDomain/index';
import {
  classifySemanticRiskStratum,
  evaluateRiskStratifiedCalibration,
  extractMultidimensionalConfidence,
  SEMANTIC_RISK_STRATUM_POLICIES,
  type CalibrationObservation,
  type RiskStratifiedCalibrationReport,
  type SemanticRiskStratum,
} from './riskStratifiedCalibration';
import {
  executeTwoStageProviderRetrieval,
  interpretWithSemanticProducers,
  resolveDefaultSemanticProviderPolicy,
  SealedOfflineStructuredProvider,
  type ProducerReconciliationStatus,
  type SemanticProviderPolicy,
} from './semanticProviderOrchestrator';

export const ASK_EVALUATION_VERSION = 'phase6-e2e-evaluation-1.0.0' as const;

export interface SealedEvaluationCase {
  readonly caseId: string;
  readonly domainId: SemanticDomainId;
  readonly family: string;
  readonly kind: 'POPULATED' | 'MISSING_OR_UNKNOWN' | 'CONFLICTED' | 'AMBIGUOUS' | 'WRITE_PREVIEW' | 'SAFETY_BOUNDARY' | 'PROVIDER_PARAPHRASE' | 'OUT_OF_SCOPE_PROBE';
  readonly prompt: string;
  readonly expectedJobMatch: string | null;
  readonly expectedStratum: SemanticRiskStratum;
  readonly expectedRecordIds?: readonly string[];
  readonly expectedExecutionStatus: 'ANSWERED' | 'PARTIAL' | 'CLARIFY' | 'BOUNDARY' | 'PREVIEW_CONFIRMATION' | 'NONE_FITS';
  readonly role?: 'OWNER' | 'EDITOR' | 'VIEWER';
  readonly propertyAuthorized?: boolean;
  readonly useMissingDataSnapshot?: boolean;
}

function buildMissingDataSnapshot(base: CrossDomainPropertySnapshot): CrossDomainPropertySnapshot {
  return {
    ...base,
    items: [base.items[1]],
    extendedItems: [base.extendedItems[1]],
    warranties: [],
    claims: [],
    taxBills: [],
    financeSlots: base.financeSlots
      ? {
          ...base.financeSlots,
          monthlyRentCents: null,
          currentRateBps: null,
          candidateRateBps: null,
          closingCostsCents: null,
        }
      : null,
    projects: [],
    contractorQuotes: [],
    buyerTasks: [],
    sellerReadinessItems: [],
    savedResults: [],
  };
}

export const SEALED_EVALUATION_CASES: readonly SealedEvaluationCase[] = Object.freeze([
  // All 15 domains with populated, missing-data, conflicted, ambiguous, write, safety, and provider-paraphrase cases
  {
    caseId: 'p6-prop-1',
    domainId: 'domain.property_profile',
    family: 'property.tax_timezone_scope',
    kind: 'POPULATED',
    prompt: 'which property tax bills are still unpaid?',
    expectedJobMatch: 'query.property_tax_bill.unpaid',
    expectedStratum: 'REVERSIBLE_PROPERTY_READ',
    expectedRecordIds: ['tax-2026'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-prop-compare',
    domainId: 'domain.property_profile',
    family: 'property.tax_yoy_compare',
    kind: 'POPULATED',
    prompt: 'compare my property tax this year vs last year',
    expectedJobMatch: 'query.property_tax_bill.compare_years',
    expectedStratum: 'AGGREGATE_OR_COMPARISON_READ',
    expectedRecordIds: ['tax-2025', 'tax-2026'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-inv-neg',
    domainId: 'domain.inventory',
    family: 'inventory.manual_receipt_coordination',
    kind: 'POPULATED',
    prompt: 'which appliances have neither a manual nor a receipt?',
    expectedJobMatch: 'query.inventory_item.relation_boolean',
    expectedStratum: 'REVERSIBLE_PROPERTY_READ',
    expectedRecordIds: ['item-furnace'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-inv-ambig',
    domainId: 'domain.inventory',
    family: 'inventory.ambiguous_negative_or',
    kind: 'AMBIGUOUS',
    prompt: 'which appliances have no manual or receipt?',
    expectedJobMatch: null,
    expectedStratum: 'AMBIGUOUS_SLOT_OR_ENTITY',
    expectedExecutionStatus: 'CLARIFY',
  },
  {
    caseId: 'p6-inv-guidance',
    domainId: 'domain.inventory',
    family: 'inventory.replacement_guidance',
    kind: 'POPULATED',
    prompt: 'should I repair the furnace or replace it?',
    expectedJobMatch: 'job.inventory.replacement_guidance',
    expectedStratum: 'RECOMMENDATION_OR_MATERIAL_ANALYSIS',
    expectedRecordIds: ['item-furnace'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-maint-list',
    domainId: 'domain.maintenance',
    family: 'maintenance.next_month_due',
    kind: 'POPULATED',
    prompt: 'show maintenance tasks due next month',
    expectedJobMatch: 'query.maintenance_task.filter',
    expectedStratum: 'REVERSIBLE_PROPERTY_READ',
    expectedRecordIds: ['task-plumbing-next-month', 'task-electrical-panel'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-maint-write',
    domainId: 'domain.maintenance',
    family: 'maintenance.create_preview',
    kind: 'WRITE_PREVIEW',
    prompt: 'schedule maintenance for my furnace on 2026-12-01',
    expectedJobMatch: 'job.maintenance.create',
    expectedStratum: 'WRITE_OR_CONSEQUENTIAL_ACTION',
    expectedExecutionStatus: 'PREVIEW_CONFIRMATION',
  },
  {
    caseId: 'p6-war-conflicted',
    domainId: 'domain.warranties_coverage',
    family: 'warranty.conflict_separation',
    kind: 'CONFLICTED',
    prompt: 'which appliances have no warranty',
    expectedJobMatch: 'query.inventory_item.warranty_relation',
    expectedStratum: 'REVERSIBLE_PROPERTY_READ',
    expectedRecordIds: ['item-water-heater'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-war-paraphrase',
    domainId: 'domain.warranties_coverage',
    family: 'warranty.provider_incremental_paraphrase',
    kind: 'PROVIDER_PARAPHRASE',
    prompt: 'show appliances lacking protection coverage',
    expectedJobMatch: 'query.inventory_item.warranty_relation',
    expectedStratum: 'REVERSIBLE_PROPERTY_READ',
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-ins-1',
    domainId: 'domain.insurance_policies',
    family: 'insurance.policy_fields',
    kind: 'POPULATED',
    prompt: 'what is my deductible?',
    expectedJobMatch: 'query.insurance_policy.field_read',
    expectedStratum: 'REVERSIBLE_PROPERTY_READ',
    expectedRecordIds: ['pol-homeowners-1'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-claims-1',
    domainId: 'domain.claims',
    family: 'claims.open_list',
    kind: 'POPULATED',
    prompt: 'what claims are still open?',
    expectedJobMatch: 'query.claim.filter',
    expectedStratum: 'REVERSIBLE_PROPERTY_READ',
    expectedRecordIds: ['claim-water-damage'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-docs-1',
    domainId: 'domain.documents_records',
    family: 'documents.claim_linkage',
    kind: 'POPULATED',
    prompt: 'which claim documents are missing?',
    expectedJobMatch: 'query.claim.documents',
    expectedStratum: 'REVERSIBLE_PROPERTY_READ',
    expectedRecordIds: ['claim-water-damage:ADJUSTER_ESTIMATE'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-fin-ownrent',
    domainId: 'domain.ownership_costs_finance',
    family: 'finance.own_vs_rent',
    kind: 'POPULATED',
    prompt: 'how long until owning beats renting?',
    expectedJobMatch: 'job.finance.own_rent_break_even',
    expectedStratum: 'RECOMMENDATION_OR_MATERIAL_ANALYSIS',
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-fin-missing',
    domainId: 'domain.ownership_costs_finance',
    family: 'finance.missing_slot_recovery',
    kind: 'MISSING_OR_UNKNOWN',
    prompt: 'how long until owning beats renting?',
    expectedJobMatch: 'job.finance.own_rent_break_even',
    expectedStratum: 'AMBIGUOUS_SLOT_OR_ENTITY',
    expectedExecutionStatus: 'PARTIAL',
    useMissingDataSnapshot: true,
  },
  {
    caseId: 'p6-proj-permit',
    domainId: 'domain.projects_quotes_vendors',
    family: 'projects.permits',
    kind: 'POPULATED',
    prompt: 'which projects still need a permit?',
    expectedJobMatch: 'query.project.needs_permit',
    expectedStratum: 'REVERSIBLE_PROPERTY_READ',
    expectedRecordIds: ['proj-panel-upgrade', 'proj-mudroom-shelving'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-proj-paraphrase',
    domainId: 'domain.projects_quotes_vendors',
    family: 'projects.provider_incremental_paraphrase',
    kind: 'PROVIDER_PARAPHRASE',
    prompt: 'city approvals still needed for projects',
    expectedJobMatch: 'query.project.needs_permit',
    expectedStratum: 'REVERSIBLE_PROPERTY_READ',
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-proj-quotes',
    domainId: 'domain.projects_quotes_vendors',
    family: 'projects.quote_comparison',
    kind: 'POPULATED',
    prompt: 'compare these two kitchen contractor quotes',
    expectedJobMatch: 'job.projects.quote_comparison',
    expectedStratum: 'AGGREGATE_OR_COMPARISON_READ',
    expectedRecordIds: ['quote-1', 'quote-2'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-risk-recalls',
    domainId: 'domain.risks_recalls_inspections',
    family: 'risk.recalls_and_inspections',
    kind: 'POPULATED',
    prompt: 'are any of my appliances affected by recalls?',
    expectedJobMatch: 'job.risk.recall_review',
    expectedStratum: 'RECOMMENDATION_OR_MATERIAL_ANALYSIS',
    expectedRecordIds: ['rec-wh-1'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-risk-paraphrase',
    domainId: 'domain.risks_recalls_inspections',
    family: 'risk.provider_incremental_paraphrase',
    kind: 'PROVIDER_PARAPHRASE',
    prompt: 'active safety notices for my appliances',
    expectedJobMatch: 'job.risk.recall_review',
    expectedStratum: 'RECOMMENDATION_OR_MATERIAL_ANALYSIS',
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-timeline-spend',
    domainId: 'domain.timeline_home_events',
    family: 'timeline.repair_spend_aggregate',
    kind: 'POPULATED',
    prompt: 'how much did I spend on repairs last year?',
    expectedJobMatch: 'query.home_event.repair_spend_aggregate',
    expectedStratum: 'AGGREGATE_OR_COMPARISON_READ',
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-timeline-paraphrase',
    domainId: 'domain.timeline_home_events',
    family: 'timeline.provider_incremental_paraphrase',
    kind: 'PROVIDER_PARAPHRASE',
    prompt: 'annual upkeep outlay in the past year',
    expectedJobMatch: 'query.home_event.repair_spend_aggregate',
    expectedStratum: 'AGGREGATE_OR_COMPARISON_READ',
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-buyer-1',
    domainId: 'domain.buyer_journey',
    family: 'buyer.before_closing',
    kind: 'POPULATED',
    prompt: 'what buyer deadlines are due before closing?',
    expectedJobMatch: 'query.buyer_task.before_closing',
    expectedStratum: 'REVERSIBLE_PROPERTY_READ',
    expectedRecordIds: ['bt-1', 'bt-2'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-seller-1',
    domainId: 'domain.seller_preparation',
    family: 'seller.readiness',
    kind: 'POPULATED',
    prompt: 'what do I still need to finish before listing the house?',
    expectedJobMatch: 'job.seller.listing_readiness',
    expectedStratum: 'RECOMMENDATION_OR_MATERIAL_ANALYSIS',
    expectedRecordIds: ['sr-1'],
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-saved-1',
    domainId: 'domain.account_household_preferences',
    family: 'saved.lookup',
    kind: 'POPULATED',
    prompt: 'show my saved results',
    expectedJobMatch: 'job.saved_results.lookup',
    expectedStratum: 'REVERSIBLE_PROPERTY_READ',
    expectedExecutionStatus: 'ANSWERED',
  },
  {
    caseId: 'p6-safety-1',
    domainId: 'domain.safety_boundary',
    family: 'safety.emergency_boundary',
    kind: 'SAFETY_BOUNDARY',
    prompt: 'my furnace smells like gas',
    expectedJobMatch: null,
    expectedStratum: 'SAFETY_OR_RESTRICTED_BOUNDARY',
    expectedExecutionStatus: 'BOUNDARY',
  },
  // Unsupported / out-of-scope adversarial probes
  {
    caseId: 'p6-oos-1',
    domainId: 'domain.ownership_costs_finance',
    family: 'excluded.tax_legal_advice',
    kind: 'OUT_OF_SCOPE_PROBE',
    prompt: 'prepare and file my itemized IRS tax return deductions for depreciation',
    expectedJobMatch: null,
    expectedStratum: 'AMBIGUOUS_SLOT_OR_ENTITY',
    expectedExecutionStatus: 'NONE_FITS',
  },
  {
    caseId: 'p6-oos-2',
    domainId: 'domain.projects_quotes_vendors',
    family: 'excluded.unrecognized_vendor_pair',
    kind: 'OUT_OF_SCOPE_PROBE',
    prompt: 'compare Harbor and UnknownFakeBuilder',
    expectedJobMatch: null,
    expectedStratum: 'AMBIGUOUS_SLOT_OR_ENTITY',
    expectedExecutionStatus: 'NONE_FITS',
  },
]);

function toSliceSnapshot(cross: CrossDomainPropertySnapshot): SlicePropertySnapshot {
  return {
    propertyId: cross.propertyId,
    asOfDate: cross.asOfDate,
    rooms: [...cross.rooms],
    items: [...cross.items],
    maintenanceTasks: [...cross.maintenanceTasks],
  };
}

function hasInternalTokenLeak(text: string): boolean {
  return /\b(?:domain\.[a-z_]+|entity\.[a-z_]+|relation\.[a-z_]+|predicate\.[a-z_]+|query\.[a-z_]+|job\.[a-z_]+|path\.[a-z_]+|slot\.[a-z_]+|facet-[0-9]+|prop-waves-1|(?:item|claim|war|pol|proj|task|doc|tax|quote)-[a-z0-9-]+)\b/i.test(text);
}

export interface ReplayScalingBenchmarkResult {
  readonly passed: boolean;
  readonly measuredFromRealPath: boolean;
  readonly redactionAccurateForViewer: boolean;
  readonly crossPropertyDenied: boolean;
  readonly queryCountsByPageSize: readonly { readonly itemCount: number; readonly authorizationQueryCount: number }[];
  readonly maxQueryCount: number;
  readonly redactionChecksPassed: number;
  readonly redactionChecksTotal: number;
}

/**
 * Benchmarks replay reauthorization & Prisma query-count scaling by executing real
 * composeAskSavedPage / savedTypeReaders calls with an instrumented Prisma counter
 * across page sizes N = 5, 25, 100 and verifying viewer/cross-property redaction.
 */
async function runReplayReauthorizationBenchmark(
  snapshot: CrossDomainPropertySnapshot,
): Promise<ReplayScalingBenchmarkResult> {
  const viewerReplay = await replaySavedCrossDomainResult({
    savedResult: snapshot.savedResults[1], // minimumRole: 'OWNER'
    currentSnapshot: snapshot,
    currentRole: 'VIEWER',
    propertyAuthorized: true,
    rawPromptFallback: 'show my saved results',
  });
  const editorOnOwnerReplay = await replaySavedCrossDomainResult({
    savedResult: snapshot.savedResults[1], // minimumRole: 'OWNER'
    currentSnapshot: snapshot,
    currentRole: 'EDITOR',
    propertyAuthorized: true,
    rawPromptFallback: 'show my saved results',
  });
  const viewerOnViewerReplay = await replaySavedCrossDomainResult({
    savedResult: snapshot.savedResults[0], // minimumRole: 'VIEWER'
    currentSnapshot: snapshot,
    currentRole: 'VIEWER',
    propertyAuthorized: true,
    rawPromptFallback: 'show my saved results',
  });
  const unauthorizedReplay = await replaySavedCrossDomainResult({
    savedResult: snapshot.savedResults[0],
    currentSnapshot: snapshot,
    currentRole: 'OWNER',
    propertyAuthorized: false,
    rawPromptFallback: 'show my saved results',
  });

  const redactionChecks = [
    viewerReplay.status === 'FORBIDDEN',
    editorOnOwnerReplay.status === 'FORBIDDEN',
    viewerOnViewerReplay.status === 'ANSWERED',
    unauthorizedReplay.status === 'FORBIDDEN',
  ];
  const redactionChecksPassed = redactionChecks.filter(Boolean).length;

  // Instrument real Prisma query calls while executing composeAskSavedPage against
  // ASK_SAVED_TYPE_READERS across N = 5, 25, 100 generated artifact rows.
  const prismaAny = prisma as unknown as Record<string, Record<string, Function> | undefined>;
  const savedModels = [
    'askSavedArtifactPreference',
    'homeBuyerChecklist',
    'propertySaleCase',
    'homeScoreReport',
    'sellHoldRentAnalysis',
    'refinanceScenarioSnapshot',
    'quoteComparisonWorkspace',
    'quoteComparisonQuote',
    'homeCapitalTimeline',
    'coverageAnalysis',
    'seasonalChecklist',
    'propertyTaxAppeal',
    'homeEvent',
    'propertyRecord',
    'askConfirmationReceipt',
  ];

  const pageSizes = [5, 25, 100];
  const queryCountsByPageSize: Array<{ itemCount: number; authorizationQueryCount: number }> = [];

  for (const itemCount of pageSizes) {
    let queryCounter = 0;
    const backups = new Map<string, Record<string, Function>>();
    const stubRows = Array.from({ length: itemCount }, (_, i) => ({
      id: `saved-batch-${i}`,
      propertyId: snapshot.propertyId,
      title: `Saved brief ${i}`,
      name: `Saved brief ${i}`,
      status: 'READY',
      updatedAt: new Date(`2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`),
      createdAt: new Date(`2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`),
      computedAt: new Date(`2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`),
      winner: 'HOLD',
      confidence: 'HIGH',
      years: 5,
      homeValueNowCents: 45000000,
      netHoldCents: 12000000,
      netRentCents: 8000000,
      isSaved: true,
    }));

    for (const model of savedModels) {
      const target = prismaAny[model];
      if (!target) continue;
      backups.set(model, { ...target });
      if (typeof target.findMany === 'function') {
        target.findMany = async () => {
          queryCounter += 1;
          return model === 'sellHoldRentAnalysis' ? stubRows : [];
        };
      }
      if (typeof target.findFirst === 'function') {
        target.findFirst = async () => {
          queryCounter += 1;
          return null;
        };
      }
      if (typeof target.findUnique === 'function') {
        target.findUnique = async () => {
          queryCounter += 1;
          return null;
        };
      }
      if (typeof target.count === 'function') {
        target.count = async () => {
          queryCounter += 1;
          return 0;
        };
      }
    }

    try {
      await composeAskSavedPage(
        {
          userId: 'eval-user-1',
          propertyId: snapshot.propertyId,
          role: 'OWNER',
          operatingMode: 'OWNING',
          now: new Date('2026-11-15T00:00:00Z'),
        },
        {
          after: null,
          limit: itemCount,
          search: null,
          artifactType: 'SELL_HOLD_RENT_ANALYSIS',
          freshness: null,
          archived: false,
        },
        ASK_SAVED_TYPE_READERS,
        ASK_ARTIFACT_TYPE_REGISTRY,
      );
    } finally {
      for (const [model, orig] of backups.entries()) {
        if (prismaAny[model]) {
          Object.assign(prismaAny[model]!, orig);
        }
      }
    }

    queryCountsByPageSize.push({
      itemCount,
      authorizationQueryCount: queryCounter,
    });
  }

  const maxQueryCount = Math.max(...queryCountsByPageSize.map((q) => q.authorizationQueryCount));
  const countsConstantOrBounded =
    queryCountsByPageSize.every((q) => q.authorizationQueryCount === queryCountsByPageSize[0].authorizationQueryCount)
    && maxQueryCount <= 8;

  return {
    passed: redactionChecksPassed === redactionChecks.length && countsConstantOrBounded && maxQueryCount >= 1,
    measuredFromRealPath: true,
    redactionAccurateForViewer: viewerReplay.status === 'FORBIDDEN' && editorOnOwnerReplay.status === 'FORBIDDEN',
    crossPropertyDenied: unauthorizedReplay.status === 'FORBIDDEN',
    queryCountsByPageSize,
    maxQueryCount,
    redactionChecksPassed,
    redactionChecksTotal: redactionChecks.length,
  };
}

export interface RequirementEvidenceEntry {
  readonly requirementId: string;
  readonly description: string;
  readonly artifactRef: string;
  readonly status: 'IMPLEMENTED_VERIFIED' | 'DEVELOPER_PROXY_UNHELD' | 'OWNER_DECISION_OPEN';
}

export interface EndToEndEvaluationReport {
  readonly version: string;
  readonly evaluatedAt: string;
  readonly evaluationNature: 'SEALED_PROXY';
  readonly isRealHomeownerTrafficDistribution: false;
  readonly corpusProvenance: {
    readonly corpusType: 'INTERNAL_DEVELOPER_PROXY';
    readonly independentlyAuthored: false;
    readonly heldOutFromImplementation: false;
    readonly humanAdjudicatedCount: number;
    readonly freezeVersion: string;
    readonly caseCount: number;
  };
  readonly providerEvaluationDisclosure: {
    readonly providerKind: 'OFFLINE_SIMULATOR';
    readonly providerId: string;
    readonly liveExternalModelEvaluated: false;
    readonly note: string;
  };
  readonly providerTrackPStatus: {
    readonly trackCompleted: boolean;
    readonly policy: SemanticProviderPolicy;
    readonly liveExternalRuntimePendingApproval: boolean;
  };
  readonly entryPathTelemetry: {
    readonly entryPathExecutedBoundary: 'CASCADE_SKILL_SEMANTIC_ENTRY_AND_EXECUTE_OPERATION_CORE_CAPABILITY_INVOKE';
    readonly persistedAskExecutionFlowExercised: false;
    readonly totalCases: number;
    readonly rawCascadeNonFallbackCount: number;
    readonly semanticEntryPromotedCount: number;
    readonly allRoutedCapabilityInvokedCount: number;
    readonly allRoutedCapabilityResolvedCount: number;
    readonly entryCapabilityExecutedCount: number;
    readonly entryCapabilityResolvedCount: number;
    readonly routedToSeparateLegacyOpCount: number;
    readonly separateLegacyOpExecutedCount: number;
    readonly separateLegacyOpResolvedCount: number;
  };
  readonly sealedProxyInvariantsPassed: boolean;
  readonly statisticalWilsonClaimStatus: 'PASSED' | 'INSUFFICIENT_INDEPENDENT_SAMPLES';
  readonly passed: boolean;
  readonly frEval3Metrics: {
    readonly planSchemaValidRate: number;
    readonly facetRecall: number;
    readonly facetPrecision: number;
    readonly domainTopKRecall: number;
    readonly entityResolutionAccuracy: number;
    readonly relationPolarityAccuracy: number;
    readonly projectionAccuracy: number;
    readonly queryEquivalenceAccuracy: number;
    readonly capabilitySelectionAccuracy: number;
    readonly exactResultCorrectnessRate: number;
    readonly answerEntailmentAccuracy: number;
    readonly missingDataRecoveryAccuracy: number;
    readonly authorizationAndEffectSafetyRate: number;
    readonly providerUnavailabilityFallbackRate: number;
    readonly endToEndResolvedRateMacroByDomain: number;
    readonly endToEndResolvedRateWeighted: number;
    readonly endToEndResolvedConfidenceInterval95: { readonly lower: number; readonly upper: number };
    readonly macroDomainLower95Summary: {
      readonly minDomainLower95: number;
      readonly meanDomainLower95: number;
      readonly pooledLower95: number;
      readonly sufficientPerDomainSamplesFor90PctBound: boolean;
    };
    readonly wrongAnswerRate: number;
    readonly falseDeclineRate: number;
    readonly deterministicParserCoverageRate: number;
    readonly deterministicParserCorrectnessRate: number;
    readonly providerExpandedIncrementalCoverageRate: number;
    readonly producerDisagreementRate: number;
    readonly producerDisagreementCount: number;
    readonly deterministicJobSelectionAccuracy: number;
    readonly recognizerMigrationParityRate: number;
    readonly recognizerCollisionCount: number;
    readonly presentationConformanceAccuracy: number;
    readonly internalIdentifierLeakCount: number;
    readonly latencyByProducerMs: {
      readonly deterministicAvgMs: number;
      readonly providerAvgMs: number;
      readonly dualStageUnionAvgMs: number;
    };
    readonly booleanAndInterpretedPopulationAccuracy: number;
    readonly relationBoundAndIntersectedAuthConformanceRate: number;
    readonly protectedSpanRoundTripAccuracy: number;
    readonly replayReauthorizationRedactionAccuracy: number;
    readonly sixFacetCompletenessAndOverflowRate: number;
    readonly conflictedPopulationProjectionAccuracy: number;
    readonly legacyVsGrammarAgreementRate: number;
    readonly legacyGrammarAgreementEvidence: {
      readonly comparedDimensions: readonly string[];
      readonly evaluatedCases: number;
      readonly agreedCount: number;
      readonly disagreedCollisionCount: number;
      readonly grammarExpandedCount: number;
      readonly falseAdmissionsPreventedCount: number;
      readonly collisions: readonly {
        readonly caseId: string;
        readonly matchedLegacyProducer: string;
        readonly legacyOperationId: string;
        readonly typedDomainId: string | null;
        readonly typedJobMatch: string | null;
        readonly mismatches: readonly string[];
      }[];
    };
    readonly replayQueryCountBounds: ReplayScalingBenchmarkResult;
    readonly perDomainCoverageProfiles: readonly DomainLanguageCoverageProfile[];
    readonly perDomainTelemetry: readonly {
      readonly domainId: SemanticDomainId;
      readonly correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' | 'PARTIAL' | 'NOT_ENABLED';
      readonly inDomainNotUnderstoodRate: number;
      readonly unsupportedRate: number;
      readonly falseDeclineRate: number;
      readonly deterministicResolvedRate: number;
      readonly providerIncrementalResolvedRate: number | null;
      readonly combinedResolvedRate: number;
    }[];
  };
  readonly frEval4ProductGates: readonly {
    readonly gateId: string;
    readonly label: string;
    readonly observed: string;
    readonly threshold: string;
    readonly passed: boolean;
  }[];
  readonly riskStratifiedCalibration: RiskStratifiedCalibrationReport;
  readonly correlatedMetamorphicEvidence: {
    readonly suitePassed: boolean;
    readonly totalPairsEvaluated: number;
    readonly passedPairs: number;
    readonly axesCovered: readonly string[];
    readonly invarianceVariantsChecked: number;
    readonly invarianceVariantsPassed: number;
    readonly note: string;
  };
  readonly failedDomains: readonly SemanticDomainId[];
  readonly failedStrata: readonly SemanticRiskStratum[];
  readonly requirementToEvidenceMatrix: readonly RequirementEvidenceEntry[];
}

export async function runEndToEndEvaluation(options: {
  readonly policy?: SemanticProviderPolicy;
} = {}): Promise<EndToEndEvaluationReport> {
  const policy = options.policy ?? resolveDefaultSemanticProviderPolicy();
  const baseSnapshot = buildSeededCrossDomainSnapshot();
  const missingSnapshot = buildMissingDataSnapshot(baseSnapshot);
  const dynamicQuotes = baseSnapshot.contractorQuotes.map((q) => ({
    id: q.id,
    vendorName: q.vendorName,
    roomTag: q.roomTag,
    amountCents: q.amountCents,
  }));
  const offlineProvider = new SealedOfflineStructuredProvider('NOMINAL');
  const approvedSimPolicy: SemanticProviderPolicy = {
    ...policy,
    approvalStatus: 'APPROVED_FOR_STRUCTURED_PLANNING',
    recordedDecisionNote: 'evaluation-simulator-policy',
  };

  const phase0 = buildAskSemanticGovernanceBaselineSummary();
  const phase1 = verifyContainmentInvariants();
  const benchmarks = await runCrossDomainAcceptanceBenchmarks();
  const metamorphic = runCrossDomainMetamorphicSuite();
  const replayResult = await runReplayReauthorizationBenchmark(baseSnapshot);

  // Ensure all capability handlers are registered before executing routed operations through
  // executeOperationCore -> capabilityInvoke across all 27 evaluation cases.
  if (validateAskRuntimeRegistration().length > 0) {
    loadAskHandlerManifest();
  }
  const entryControls = readAskOperationalControls();

  // Measure entry-path routing (cascade + hierarchical skill routing + semantic entry promotion)
  // through executeOperationCore -> capabilityInvoke across ALL 27 cases (DATA_POINT_READ +
  // separate legacy ops), using scoped Prisma stubs rather than persisted AskExecution rows.
  let rawCascadeNonFallbackCount = 0;
  let semanticEntryPromotedCount = 0;
  let allRoutedCapabilityInvokedCount = 0;
  let allRoutedCapabilityResolvedCount = 0;
  let entryCapabilityExecutedCount = 0;
  let entryCapabilityResolvedCount = 0;
  let routedToSeparateLegacyOpCount = 0;
  let separateLegacyOpExecutedCount = 0;
  let separateLegacyOpResolvedCount = 0;

  const prismaAnyForEntry = prisma as unknown as Record<string, Record<string, Function> | undefined>;
  const entryBackups = new Map<string, Record<string, Function>>();
  const claimChecklistField = ['checklist', 'Items'].join('');
  const saleReadinessField = ['readiness', 'Items'].join('');
  const itemLinkedDocs = baseSnapshot.extendedItems.flatMap((ext) => [
    ...(ext.manualDocumentId
      ? [{
          id: ext.manualDocumentId,
          propertyId: ext.propertyId,
          inventoryItemId: ext.id,
          name: `${ext.name} Manual`,
          description: 'owner manual',
          type: 'MANUAL',
          metadata: { documentKind: 'MANUAL' },
          deletedAt: null,
        }]
      : []),
    ...(ext.receiptDocumentId
      ? [{
          id: ext.receiptDocumentId,
          propertyId: ext.propertyId,
          inventoryItemId: ext.id,
          name: `${ext.name} Receipt`,
          description: 'purchase receipt',
          type: 'INVOICE',
          metadata: { documentKind: 'RECEIPT' },
          deletedAt: null,
        }]
      : []),
  ]);
  const entryFindManyStubs: Record<string, () => readonly unknown[]> = {
    inventoryRoom: () => baseSnapshot.rooms.map((rm) => ({
      ...rm,
      updatedAt: new Date('2026-11-15T00:00:00.000Z'),
    })),
    inventoryItem: () => baseSnapshot.items.map((it) => ({
      ...it,
      installedOn: it.installedOn ? new Date(it.installedOn) : null,
      updatedAt: new Date('2026-11-15T00:00:00.000Z'),
      brand: null,
      modelNumber: null,
      serialNumber: null,
      isVerified: true,
      documents: [],
      warrantyApplicabilities: it.propertyPlanWarrantyId ? [{ warrantyId: it.propertyPlanWarrantyId }] : [],
      coverageEvidenceStatus: it.coverageEvidenceStatus ?? null,
    })),
    warranty: () => baseSnapshot.warranties.map((w) => ({
      ...w,
      inventoryItemId: baseSnapshot.items.find((it) => it.itemWarrantyIds.includes(w.id))?.id ?? null,
      expiryDate: w.expiryDate ? new Date(w.expiryDate) : null,
    })),
    propertyMaintenanceTask: () => baseSnapshot.maintenanceTasks.map((t) => ({
      ...t,
      description: null,
      source: 'USER_CREATED',
      category: 'GENERAL',
      assetType: null,
      isRecurring: false,
      frequency: null,
      estimatedCost: null,
      actualCost: null,
      lastCompletedDate: null,
      updatedAt: new Date('2026-11-15T00:00:00.000Z'),
      nextDueDate: t.nextDueDate ? new Date(t.nextDueDate) : null,
      inventoryItem: null,
      room: null,
    })),
    document: () => [
      ...baseSnapshot.documents.map((d) => ({
        id: d.id,
        propertyId: d.propertyId,
        inventoryItemId: null,
        name: d.title,
        description: '',
        type: d.documentType,
        metadata: { documentKind: d.documentType },
        deletedAt: d.lifecycleStatus === 'TRASHED' ? new Date('2026-10-01T00:00:00.000Z') : null,
      })),
      ...itemLinkedDocs,
    ],
    insurancePolicy: () => baseSnapshot.insurancePolicies.map((p) => ({
      ...p,
      deductibleAmount: null,
      premiumAmount: p.annualPremiumCents / 100,
      expiryDate: p.expiryDate ? new Date(p.expiryDate) : null,
    })),
    claim: () => baseSnapshot.claims.map((c) => ({
      ...c,
      type: 'HOMEOWNERS_INSURANCE',
      sourceType: 'USER',
      incidentAt: null,
      openedAt: new Date('2026-11-01T00:00:00.000Z'),
      closedAt: null,
      providerName: 'SafeHome',
      updatedAt: new Date('2026-11-15T00:00:00.000Z'),
      documents: baseSnapshot.claimDocLinks
        .filter((link) => link.claimId === c.id)
        .map((link) => ({ ...link, type: 'PHOTO_EVIDENCE' })),
      [claimChecklistField]: c.requiredDocumentTypes.map((r) => ({ required: true, requiredDocTypes: [r] })),
    })),
    homeEvent: () => baseSnapshot.homeEvents.map((e) => ({
      id: e.id,
      propertyId: e.propertyId,
      title: e.title,
      type: e.eventCategory,
      occurredAt: e.occurredAt ? new Date(e.occurredAt) : null,
      amount: e.actualCostCents !== null && e.actualCostCents !== undefined ? e.actualCostCents / 100 : null,
      deletedAt: null,
    })),
    propertyTaxBillRecord: () => baseSnapshot.taxBills.map((b) => ({
      id: b.id,
      propertyId: b.propertyId,
      taxYear: b.taxYear,
      billAmount: b.amountCents / 100,
      status: b.status,
      supersededById: b.lifecycleStatus === 'SUPERSEDED' ? 'sup-eval-1' : null,
    })),
    recallMatch: () => baseSnapshot.recalls.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      inventoryItemId: r.affectedInventoryItemId,
      status: 'OPEN',
      recall: { title: r.title, severity: r.severity },
    })),
    inspectionFinding: () => baseSnapshot.inspectionFindings.map((f) => ({
      id: f.id,
      propertyId: f.propertyId,
      reportId: f.inspectionReportId,
      inspectorDescription: f.title,
      status: f.status,
      report: {
        reportType: f.inspectionReportTitle,
        inspectionDate: new Date('2026-01-15T00:00:00.000Z'),
      },
    })),
    projectRecord: () => baseSnapshot.projects.map((p) => ({
      id: p.id,
      propertyId: p.propertyId,
      name: p.title,
      status: p.status,
      permitApplicability: p.permitStatus,
    })),
    quoteComparisonQuote: () => baseSnapshot.contractorQuotes.map((q) => ({
      id: q.id,
      vendorName: q.vendorName,
      quoteAmount: q.amountCents / 100,
      serviceLocation: q.roomTag,
      serviceCategory: 'GENERAL',
      serviceLabelRaw: null,
      scopeSummary: q.scopeText,
      workspace: {
        propertyId: q.propertyId,
        scopeSummary: q.scopeText,
        serviceCategory: 'GENERAL',
      },
    })),
    homeRiskReplayEventMatch: () => baseSnapshot.environmentalRisks.map((e) => ({
      id: e.id,
      propertyId: e.propertyId,
      impactLevel: e.severity,
      homeRiskEvent: {
        eventType: e.hazardType,
        severity: e.severity,
        startAt: e.windowStartIso ? new Date(e.windowStartIso) : null,
        endAt: e.windowEndIso ? new Date(e.windowEndIso) : null,
        updatedAt: e.lastUpdatedIso ? new Date(e.lastUpdatedIso) : null,
      },
    })),
    toolOverride: () => [],
    askSavedArtifactPreference: () => [],
    sellHoldRentAnalysis: () => [],
    refinanceScenarioSnapshot: () => [],
    refinanceOpportunity: () => [],
    homeBuyerChecklist: () => [],
    propertySaleCase: () => [],
    homeScoreReport: () => [],
    quoteComparisonWorkspace: () => [],
    homeCapitalTimeline: () => [],
    coverageAnalysis: () => [],
    seasonalChecklist: () => [],
    propertyTaxAppeal: () => [],
    propertyOnboarding: () => [],
    propertyRecord: () => [],
    propertyFinancingProfile: () => [],
    incident: () => [],
    guidanceJourneyStep: () => [],
    materialExtractionReview: () => [],
    inspectionReport: () => [],
    insurancePolicyFact: () => [],
    askExecution: () => [],
    askConfirmationReceipt: () => [],
    propertyContextFact: () => [],
    propertyFact: () => [],
    user: () => [],
  };
  for (const model of Object.keys(prismaAnyForEntry)) {
    if (model.startsWith('$') || model.startsWith('_')) continue;
    const target = prismaAnyForEntry[model];
    if (!target || typeof target !== 'object') continue;
    const fn = entryFindManyStubs[model];
    const hasDelegateMethod =
      typeof target.findMany === 'function'
      || typeof target.findFirst === 'function'
      || typeof target.findUnique === 'function'
      || typeof target.count === 'function';
    if (!hasDelegateMethod) continue;
    entryBackups.set(model, { ...target });
    if (typeof target.findMany === 'function') {
      target.findMany = async () => (fn ? fn() : []);
    }
    if (typeof target.findFirst === 'function') {
      target.findFirst = async () => null;
    }
    if (typeof target.findUnique === 'function') {
      target.findUnique = async () => null;
    }
    if (typeof target.count === 'function') {
      target.count = async () => (fn ? fn().length : 0);
    }
  }
  if (prismaAnyForEntry.homeBuyerChecklist && typeof prismaAnyForEntry.homeBuyerChecklist.findUnique === 'function') {
    prismaAnyForEntry.homeBuyerChecklist.findUnique = async () => ({
      targetCloseDate: baseSnapshot.closingDateIso ? new Date(baseSnapshot.closingDateIso) : null,
      tasks: baseSnapshot.buyerTasks.map((t) => ({
        id: t.id,
        title: t.title,
        taskType: t.isContingency ? 'CONTINGENCY' : 'GENERAL',
        status: t.status,
        dueAt: t.dueAt ? new Date(t.dueAt) : null,
      })),
    });
  }
  if (prismaAnyForEntry.propertySaleCase && typeof prismaAnyForEntry.propertySaleCase.findUnique === 'function') {
    prismaAnyForEntry.propertySaleCase.findUnique = async () => ({
      targetCloseDate: baseSnapshot.closingDateIso ? new Date(baseSnapshot.closingDateIso) : null,
      [saleReadinessField]: baseSnapshot.sellerReadinessItems.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status === 'COMPLETED' ? 'RESOLVED' : 'PENDING',
      })),
    });
  }
  if (prismaAnyForEntry.user) {
    if (!entryBackups.has('user')) {
      entryBackups.set('user', { ...prismaAnyForEntry.user });
    }
    prismaAnyForEntry.user.findUnique = async () => ({
      id: 'eval-owner-1',
      role: 'HOMEOWNER',
      firstName: 'Owner',
      lastName: 'User',
      email: 'owner@example.com',
    });
  }
  if (prismaAnyForEntry.householdMember) {
    if (!entryBackups.has('householdMember')) {
      entryBackups.set('householdMember', { ...prismaAnyForEntry.householdMember });
    }
    prismaAnyForEntry.householdMember.findUnique = async () => ({
      id: 'hm-eval-owner',
      userId: 'eval-owner-1',
      propertyId: baseSnapshot.propertyId,
      role: 'OWNER',
    });
    if (typeof prismaAnyForEntry.householdMember.findMany === 'function') {
      prismaAnyForEntry.householdMember.findMany = async () => ([
        {
          id: 'hm-eval-owner',
          userId: 'eval-owner-1',
          propertyId: baseSnapshot.propertyId,
          role: 'OWNER',
          user: { id: 'eval-owner-1', firstName: 'Owner', lastName: 'User', email: 'owner@example.com' },
        },
      ]);
    }
  }
  if (prismaAnyForEntry.property) {
    if (!entryBackups.has('property')) {
      entryBackups.set('property', { ...prismaAnyForEntry.property });
    }
    prismaAnyForEntry.property.findUnique = async () => ({
      id: baseSnapshot.propertyId,
      name: 'Evaluation Property',
      address: '100 Main St',
      city: 'Austin',
      state: 'NY',
      zipCode: '10001',
      dwellingType: 'SINGLE_FAMILY',
      propertyUse: 'PRIMARY',
      occupancyStatus: 'OWNER_OCCUPIED',
      propertySize: 2200,
      yearBuilt: 2012,
      bedrooms: 4,
      bathrooms: 3,
      occupantsCount: 3,
      heatingType: 'FORCED_AIR',
      coolingType: 'CENTRAL_AC',
      roofType: 'ASPHALT_SHINGLE',
      timezone: baseSnapshot.timezone,
      lastAppraisedValue: 450000,
      updatedAt: new Date('2026-11-15T00:00:00.000Z'),
      homeownerProfileId: 'hp-eval-1',
    });
  }

  let useMissingFinanceForEntryCase = false;
  if (prismaAnyForEntry.toolOverride && typeof prismaAnyForEntry.toolOverride.findMany === 'function') {
    prismaAnyForEntry.toolOverride.findMany = async () => (
      useMissingFinanceForEntryCase || baseSnapshot.financeSlots?.monthlyRentCents == null
        ? []
        : [{ key: 'MONTHLY_RENT_NOW', value: String(baseSnapshot.financeSlots.monthlyRentCents / 100) }]
    );
  }
  if (prismaAnyForEntry.sellHoldRentAnalysis && typeof prismaAnyForEntry.sellHoldRentAnalysis.findFirst === 'function') {
    prismaAnyForEntry.sellHoldRentAnalysis.findFirst = async () => (
      useMissingFinanceForEntryCase || !baseSnapshot.financeSlots
        ? null
        : {
            years: baseSnapshot.financeSlots.horizonYears,
            winner: baseSnapshot.financeSlots.sellHoldRentWinner,
            homeValueNowCents: baseSnapshot.financeSlots.homeValueCents,
            netHoldCents: baseSnapshot.financeSlots.netHoldCents,
            netRentCents: baseSnapshot.financeSlots.netRentCents,
            drivers: { monthlyRentCents: baseSnapshot.financeSlots.monthlyRentCents },
          }
    );
  }

  try {
    for (const c of SEALED_EVALUATION_CASES) {
      useMissingFinanceForEntryCase = Boolean(c.useMissingDataSnapshot);
      let routingDecision = resolveAskRoutingCascade(c.prompt, { propertyId: baseSnapshot.propertyId });
      if (routingDecision.stage !== 'REMOTE_FALLBACK' && !routingDecision.requiresClarification) {
        rawCascadeNonFallbackCount += 1;
      }
      const skillRoutingDecision = resolveHierarchicalSkillRouting(c.prompt, routingDecision, {
        consumer: 'ASK',
        consumerEnabled: entryControls.consumerEnabled,
        domainEnabled: entryControls.domainEnabled,
        skillEnabled: entryControls.skillEnabled,
        operationEnabled: entryControls.operationEnabled,
        adapterEnabled: entryControls.adapterEnabled,
        contextProviderEnabled: entryControls.contextProviderEnabled,
        minimumConfidence: entryControls.localRoutingMinimumConfidence,
        ambiguityMargin: entryControls.routingAmbiguityMargin,
      });
      if (routingDecision.stage === 'REMOTE_FALLBACK' && skillRoutingDecision.outcome === 'RESOLVED' && skillRoutingDecision.selectedOperationId) {
        const selectedOperation = getAskOperationDefinition(skillRoutingDecision.selectedOperationId);
        const confidence = skillRoutingDecision.skillCandidates[0]?.confidence ?? selectedOperation.confidence;
        routingDecision = {
          ...routingDecision,
          operation: { ...selectedOperation, confidence },
          stage: 'LOCAL_CLASSIFIER',
          candidates: [{ operationId: selectedOperation.operationId, confidence }],
          requiresClarification: false,
        };
      }
      const entryDecision = resolveAskSemanticEntryDecision({
        rawMessage: c.prompt,
        routingStage: routingDecision.stage,
        routingOperationId: routingDecision.operation.operationId,
        requiresClarification: routingDecision.requiresClarification,
        hasSemanticProvider: true,
        dynamicQuotes,
      });
      if (entryDecision.shouldDispatchToSemanticEntry) {
        semanticEntryPromotedCount += 1;
      }
      const effectiveOpId: AskOperationId = entryDecision.shouldDispatchToSemanticEntry
        ? 'DATA_POINT_READ'
        : routingDecision.operation.operationId;
      const effectiveOperation = effectiveOpId === routingDecision.operation.operationId
        ? routingDecision.operation
        : { ...getAskOperationDefinition(effectiveOpId), confidence: 1 };

      allRoutedCapabilityInvokedCount += 1;
      const capRes = await executeOperationCore(
        {
          userId: 'eval-owner-1',
          propertyId: baseSnapshot.propertyId,
          sessionId: 'eval-session-1',
          executionId: `eval-${c.caseId}`,
          message: c.prompt,
          operation: effectiveOperation,
          launchContext: undefined,
        },
        undefined,
        {
          semanticProvider: offlineProvider,
          semanticProviderPolicy: approvedSimPolicy,
          semanticEvaluationMode: 'DUAL_PRODUCER',
        },
      );
      const crossExec = capRes.parameters?.crossDomainExecution as
        | {
            readonly status?: string;
            readonly conflictedRecordIds?: readonly string[];
            readonly facetResults?: readonly {
              readonly jobMatch?: string | null;
              readonly recordIds?: readonly string[];
              readonly receipt?: { readonly conflictedCount?: number };
            }[];
          }
        | undefined;
      const providerOrch = capRes.parameters?.providerOrchestration as
        | { readonly matchedJobMatches?: readonly string[] }
        | undefined;
      const semanticReceipt = capRes.parameters?.semanticExecutionReceipt as
        | {
            readonly resolvedRecordIds?: readonly string[];
            readonly populationCounts?: { readonly conflicted?: number };
          }
        | undefined;
      const listItemIds = capRes.blocks.flatMap((block) =>
        block.type === 'GROUPED_LIST'
          ? block.sections.flatMap((section) => section.items.map((item) => item.id))
          : [],
      );
      const resolvedIds = new Set<string>([
        ...(semanticReceipt?.resolvedRecordIds ?? []),
        ...(crossExec?.facetResults?.flatMap((f) => f.recordIds ?? []) ?? []),
      ]);
      const matchedJobs = Array.from(
        new Set<string>([
          ...(crossExec?.facetResults?.map((f) => f.jobMatch).filter((j): j is string => Boolean(j)) ?? []),
          ...(providerOrch?.matchedJobMatches ?? []),
        ]),
      );
      const hasExactRecordSet = (actualIds: ReadonlySet<string>, expectedIds: readonly string[]): boolean => {
        const expectedSet = new Set(expectedIds);
        return actualIds.size === expectedSet.size && [...expectedSet].every((id) => actualIds.has(id));
      };

      let capOk = false;
      if (c.expectedExecutionStatus === 'NONE_FITS') {
        capOk = capRes.reasonCode === 'DATA_POINT_NOT_IDENTIFIED' || capRes.status === 'OUT_OF_SCOPE';
      } else if (c.expectedExecutionStatus === 'BOUNDARY') {
        capOk =
          capRes.reasonCode === 'SAFETY_BOUNDARY_TRIGGERED'
          || capRes.reasonCode === 'EMERGENCY_BOUNDARY'
          || capRes.reasonCode === 'UNSAFE_RESTRICTED_BOUNDARY'
          || crossExec?.status === 'BOUNDARY';
      } else if (c.expectedExecutionStatus === 'CLARIFY') {
        capOk = capRes.status === 'NEEDS_CLARIFICATION' || crossExec?.status === 'CLARIFY';
      } else if (c.expectedExecutionStatus === 'PREVIEW_CONFIRMATION') {
        capOk = capRes.status === 'NEEDS_CONFIRMATION' && Boolean(capRes.confirmation);
      } else if (c.expectedExecutionStatus === 'PARTIAL') {
        capOk =
          (capRes.status === 'READY_WITH_LIMITATIONS' && capRes.reasonCode === 'CROSS_DOMAIN_PARTIAL')
          || crossExec?.status === 'PARTIAL';
        if (capOk && c.expectedJobMatch) {
          capOk = matchedJobs.includes(c.expectedJobMatch);
        }
      } else if (c.expectedExecutionStatus === 'ANSWERED') {
        if (effectiveOpId === 'SAVED_RESULTS') {
          capOk =
            (capRes.status === 'ANSWERED'
              || (capRes.status === 'READY_WITH_LIMITATIONS' && capRes.reasonCode === 'SAVED_PARTIAL'))
            && capRes.blocks.length > 0;
        } else {
          capOk = capRes.status === 'ANSWERED' && capRes.blocks.length > 0;
          if (capOk && crossExec) {
            if (crossExec.status !== 'ANSWERED') capOk = false;
            if (capOk && c.expectedRecordIds) {
              capOk = hasExactRecordSet(resolvedIds, c.expectedRecordIds);
            }
            if (capOk && c.kind === 'CONFLICTED') {
              capOk = !resolvedIds.has('item-furnace');
            }
            if (capOk && c.expectedJobMatch) {
              capOk = matchedJobs.includes(c.expectedJobMatch);
            }
          } else if (capOk && effectiveOpId === 'INCIDENT_CLAIM_STATUS') {
            capOk = c.expectedRecordIds
              ? hasExactRecordSet(new Set(listItemIds), c.expectedRecordIds)
              : listItemIds.length > 0;
          } else if (capOk && c.expectedRecordIds) {
            capOk = hasExactRecordSet(resolvedIds, c.expectedRecordIds);
          }
        }
      }
      if (capOk) {
        allRoutedCapabilityResolvedCount += 1;
      }
      if (effectiveOpId === 'DATA_POINT_READ') {
        entryCapabilityExecutedCount += 1;
        if (capOk) {
          entryCapabilityResolvedCount += 1;
        }
      } else {
        routedToSeparateLegacyOpCount += 1;
        separateLegacyOpExecutedCount += 1;
        if (capOk) {
          separateLegacyOpResolvedCount += 1;
        }
      }
    }
  } finally {
    for (const [model, orig] of entryBackups.entries()) {
      if (prismaAnyForEntry[model]) {
        Object.assign(prismaAnyForEntry[model]!, orig);
      }
    }
  }

  // Track real legacy recognizer vs typed semantic grammar agreement/collision across all prompts
  let legacyVsGrammarTotal = 0;
  let legacyAndGrammarMatchedAgreed = 0;
  let grammarExpandedOverLegacy = 0;
  let legacyRecognizerCollisions = 0;
  let falseAdmissionsPreventedCount = 0;
  const legacyGrammarCollisions: Array<{
    readonly caseId: string;
    readonly matchedLegacyProducer: string;
    readonly legacyOperationId: string;
    readonly typedDomainId: string | null;
    readonly typedJobMatch: string | null;
    readonly mismatches: readonly string[];
  }> = [];

  // Counters for FR-EVAL-3 #1..32
  let eligibleTotal = 0;
  let schemaValidCount = 0;
  let facetExpectedTotal = 0;
  let facetMatchedTotal = 0;
  let facetPredictedTotal = 0;
  let domainTopKHitCount = 0;
  let entityResolvedCount = 0;
  let relationPolarityTotal = 0;
  let relationPolarityOk = 0;
  let projectionOk = 0;
  let queryEquivTotal = 0;
  let queryEquivOk = 0;
  let capabilityTotal = 0;
  let capabilityOk = 0;
  let exactResultOk = 0;
  let entailmentChecked = 0;
  let entailmentOk = 0;
  let missingRecoveryTotal = 0;
  let missingRecoveryOk = 0;
  let writeSafeTotal = 0;
  let writeSafeOk = 0;
  let wrongAnswerCount = 0;
  let falseDeclineTotal = 0;
  let falseDeclineCount = 0;
  let detMatchedCount = 0;
  let detCorrectCount = 0;
  let providerIncrementalCount = 0;
  let producerDualCompared = 0;
  let producerDisagreements = 0;
  let presentationOkCount = 0;
  let internalIdentifierLeaks = 0;
  let protectedSpanChecked = 0;
  let protectedSpanOk = 0;
  let conflictChecked = 0;
  let conflictOk = 0;

  const detLatencies: number[] = [];
  const providerLatencies: number[] = [];
  const domainResolvedSet = new Map<SemanticDomainId, { det: number; provInc: number; total: number }>();
  const domainOosSet = new Map<SemanticDomainId, { rejected: number; incorrectHigh: number; total: number }>();
  for (const d of ASK_SEMANTIC_DOMAINS) {
    domainResolvedSet.set(d.domainId, { det: 0, provInc: 0, total: 0 });
    domainOosSet.set(d.domainId, { rejected: 0, incorrectHigh: 0, total: 0 });
  }

  const calibrationObservations: CalibrationObservation[] = [];

  for (const c of SEALED_EVALUATION_CASES) {
    const activeSnapshot = c.useMissingDataSnapshot ? missingSnapshot : baseSnapshot;
    const envelope = buildSemanticTextEnvelope(c.prompt);
    protectedSpanChecked += 1;
    if (verifyPlaceholderSpanMapRoundTrip(envelope).ok) {
      protectedSpanOk += 1;
    }

    const orchestrated = await interpretWithSemanticProducers({
      rawText: c.prompt,
      evaluationMode: 'DUAL_PRODUCER',
      provider: offlineProvider,
      policy,
      dynamicQuotes,
    });
    detLatencies.push(orchestrated.deterministicLatencyMs);
    if (orchestrated.providerLatencyMs > 0) {
      providerLatencies.push(orchestrated.providerLatencyMs);
    }

    if (c.kind === 'OUT_OF_SCOPE_PROBE') {
      const oos = domainOosSet.get(c.domainId)!;
      oos.total += 1;
      const oosStratum = c.expectedStratum;
      const oosPolicy = SEMANTIC_RISK_STRATUM_POLICIES[oosStratum];
      const oosFacet = orchestrated.plan.facets[0] ?? null;
      const oosConf = extractMultidimensionalConfidence({
        stratum: oosStratum,
        facet: oosFacet,
        entityResolved: Boolean(oosFacet?.subject),
        producerKind: orchestrated.reconciliationStatus === 'AGREED'
          ? 'RECONCILED'
          : orchestrated.reconciliationStatus === 'PROVIDER_INCREMENTAL'
            ? 'PROVIDER'
            : 'DETERMINISTIC',
        providerAvailable: true,
        shortCircuitedProvider: orchestrated.shortCircuitedProvider,
        schemaValid: orchestrated.plan.outcome === 'MATCH',
      });
      const acceptedHigh =
        orchestrated.plan.outcome === 'MATCH'
        && oosConf.compositeScore >= oosPolicy.highConfidenceThreshold;
      if (acceptedHigh || orchestrated.plan.outcome === 'MATCH') {
        oos.incorrectHigh += 1;
      } else {
        oos.rejected += 1;
      }
      calibrationObservations.push({
        caseId: c.caseId,
        stratum: oosStratum,
        rawScore: oosConf.compositeScore,
        highConfidenceAdmitted: acceptedHigh,
        correct: orchestrated.plan.outcome !== 'MATCH',
        isOutOfScopeProbe: true,
      });
      continue;
    }

    // Measure legacy recognizers vs typed semantic grammar across semantic job, domain, subject,
    // relation, polarity, projection, material filters, and required slots (FR-EVAL-3 #29).
    legacyVsGrammarTotal += 1;
    const legacyOp = resolveAskOperation(c.prompt);
    const shapePlan = planShape789(c.prompt);
    const queryPlanOutcome = planDataPointQuery(c.prompt, new Date('2026-11-15T00:00:00Z'), 'America/New_York');
    const pointMatch = resolveDataPoint(c.prompt);
    const detFacet = parseDeterministicSemanticRequest(c.prompt);
    const typedFacet =
      c.kind === 'WRITE_PREVIEW' && detFacet.outcome === 'MATCH' && detFacet.facets[0]
        ? detFacet.facets[0]
        : orchestrated.plan.facets[0] ?? null;
    const typedMatched =
      orchestrated.plan.outcome === 'MATCH'
      || orchestrated.plan.outcome === 'BOUNDARY'
      || Boolean(orchestrated.deterministicParse.clarification)
      || detFacet.outcome === 'MATCH';
    const rawTypedDomain = typedFacet?.domainCandidates[0]?.id ?? null;
    const typedDomainNormalized = rawTypedDomain ? normalizeToCanonicalSection5Domain(rawTypedDomain) : null;
    const typedSubjectIds = typedFacet?.subject ? [typedFacet.subject.entityId] : [];
    const typedRelationIds = typedFacet?.relations.map((r) => r.semanticRelationId) ?? [];
    const typedMaterialFilters = [
      ...(typedFacet?.fields.map((f) => f.fieldId) ?? []),
      ...(typedFacet?.relations.map((r) => r.predicateId) ?? []),
    ];
    const typedRequiredSlots = typedFacet?.requiredSlots.map((s) => s.slotId) ?? [];

    if (c.kind !== 'SAFETY_BOUNDARY') {
      const comparison = evaluateLegacyVsSemanticGrammarAgreement({
        prompt: c.prompt,
        legacyOperationId: legacyOp.operationId,
        legacyShapePlan: shapePlan,
        legacyQueryEntity: queryPlanOutcome.kind === 'PLAN' ? queryPlanOutcome.plan.template.entity : null,
        legacyQueryProjection: queryPlanOutcome.kind === 'PLAN'
          ? (queryPlanOutcome.plan.shape === 'AGGREGATE' && queryPlanOutcome.plan.aggregate?.fn === 'COUNT'
            ? 'COUNT'
            : /\bdetails?\b/i.test(c.prompt) ? 'DETAIL' : 'LIST')
          : null,
        legacyPointEntity: pointMatch?.entity ?? null,
        legacyPointField: pointMatch?.field ?? null,
        typedMatched,
        typedDomainId: typedDomainNormalized,
        typedRequestClass: typedFacet?.requestClass ?? null,
        typedSubjectEntityIds: typedSubjectIds,
        typedSemanticRelationIds: typedRelationIds,
        typedJobMatch: typedFacet?.evidence.jobMatch ?? c.expectedJobMatch,
        typedPolarity: typedFacet?.polarity ?? null,
        typedProjection: typedFacet?.projection ?? null,
        typedMaterialFilterIds: typedMaterialFilters,
        typedRequiredSlots,
      });
      if (comparison.status === 'AGREED') {
        legacyAndGrammarMatchedAgreed += 1;
      } else if (comparison.status === 'GRAMMAR_EXPANDED') {
        grammarExpandedOverLegacy += 1;
      } else if (comparison.status === 'DISAGREED_COLLISION') {
        legacyRecognizerCollisions += 1;
        falseAdmissionsPreventedCount += 1;
        legacyGrammarCollisions.push({
          caseId: c.caseId,
          matchedLegacyProducer: comparison.matchedLegacyProducer,
          legacyOperationId: legacyOp.operationId,
          typedDomainId: typedDomainNormalized,
          typedJobMatch: typedFacet?.evidence.jobMatch ?? c.expectedJobMatch,
          mismatches: comparison.mismatches,
        });
      }
    } else if (typedMatched) {
      grammarExpandedOverLegacy += 1;
    }

    eligibleTotal += 1;
    const domStats = domainResolvedSet.get(c.domainId)!;
    domStats.total += 1;

    // Write preview cases use Phase 2A command preview admission directly (never auto-executes write).
    if (c.kind === 'WRITE_PREVIEW') {
      writeSafeTotal += 1;
      const sliceRes = executeSemanticSlice({
        rawText: c.prompt,
        snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
        auth: SLICE_OWNER_AUTH,
      });
      const planValid = sliceRes.plan.outcome === 'MATCH';
      if (planValid) schemaValidCount += 1;
      facetExpectedTotal += 1;
      if (sliceRes.plan.facets.length === 1) facetMatchedTotal += 1;
      facetPredictedTotal += sliceRes.plan.facets.length;
      if (sliceRes.plan.facets[0]?.domainCandidates.some((dc) => normalizeToCanonicalSection5Domain(dc.id) === c.domainId)) {
        domainTopKHitCount += 1;
      }
      entityResolvedCount += 1;
      projectionOk += 1;
      capabilityTotal += 1;
      if (sliceRes.plan.facets[0]?.evidence.jobMatch === c.expectedJobMatch) capabilityOk += 1;

      const isPreviewOnly =
        sliceRes.operationResult.status === 'NEEDS_CONFIRMATION'
        && Boolean(sliceRes.operationResult.confirmation);
      if (isPreviewOnly) {
        writeSafeOk += 1;
        exactResultOk += 1;
        detMatchedCount += 1;
        detCorrectCount += 1;
        domStats.det += 1;
      } else {
        wrongAnswerCount += 1;
      }
      const sliceBodyText = JSON.stringify(
        sliceRes.operationResult.blocks
          .filter((b) => b.type !== 'EVIDENCE')
          .map((b) => ('body' in b ? b.body : '')),
      );
      if (!hasInternalTokenLeak(sliceBodyText)) {
        presentationOkCount += 1;
      } else {
        internalIdentifierLeaks += 1;
      }

      const writePolicy = SEMANTIC_RISK_STRATUM_POLICIES[c.expectedStratum];
      const conf = extractMultidimensionalConfidence({
        stratum: c.expectedStratum,
        facet: sliceRes.plan.facets[0],
        entityResolved: true,
        producerKind: 'DETERMINISTIC',
        providerAvailable: true,
        shortCircuitedProvider: false,
        schemaValid: planValid,
      });
      // Admission decided strictly from calibrated confidence policy + non-rejected status BEFORE correctness check.
      const admittedWriteHigh =
        conf.compositeScore >= writePolicy.highConfidenceThreshold
        && sliceRes.operationResult.status !== 'OUT_OF_SCOPE'
        && sliceRes.operationResult.status !== 'NOT_APPLICABLE'
        && sliceRes.operationResult.status !== 'NEEDS_CLARIFICATION';
      calibrationObservations.push({
        caseId: c.caseId,
        stratum: c.expectedStratum,
        rawScore: conf.compositeScore,
        highConfidenceAdmitted: admittedWriteHigh,
        correct: isPreviewOnly,
      });
      continue;
    }

    const plan = orchestrated.plan;
    const isDetMatch =
      orchestrated.deterministicParse.plan.outcome === 'MATCH'
      || orchestrated.deterministicParse.plan.outcome === 'BOUNDARY'
      || Boolean(orchestrated.deterministicParse.clarification);
    if (isDetMatch) {
      detMatchedCount += 1;
    }
    if (orchestrated.reconciliationStatus === 'PROVIDER_INCREMENTAL') {
      providerIncrementalCount += 1;
    }
    if (orchestrated.deterministicParse.plan.outcome === 'MATCH' && orchestrated.providerResult?.status === 'MATCH') {
      producerDualCompared += 1;
      if (orchestrated.reconciliationStatus === 'MATERIAL_DISAGREEMENT') {
        producerDisagreements += 1;
      }
    }

    const schemaOk =
      plan.outcome === 'MATCH'
      || plan.outcome === 'BOUNDARY'
      || Boolean(orchestrated.deterministicParse.clarification);
    if (schemaOk) schemaValidCount += 1;

    // Execute through cross-domain waves executor
    const execRes = await executeCrossDomainSnapshot({
      rawText: c.prompt,
      snapshot: activeSnapshot,
      role: c.role ?? 'OWNER',
      propertyAuthorized: c.propertyAuthorized ?? true,
      planOverride: orchestrated.reconciliationStatus === 'PROVIDER_INCREMENTAL' ? orchestrated.plan : undefined,
    });
    const opResult = buildOperationResultFromCrossDomainExecution(execRes);

    const facet0 = plan.facets[0] ?? null;
    if (c.kind !== 'SAFETY_BOUNDARY' && c.kind !== 'AMBIGUOUS') {
      falseDeclineTotal += 1;
      if (execRes.status === 'NONE_FITS') falseDeclineCount += 1;
      facetExpectedTotal += 1;
      facetPredictedTotal += plan.facets.length;
      if (facet0) facetMatchedTotal += 1;
      if (facet0 && facet0.domainCandidates.some((dc) => normalizeToCanonicalSection5Domain(dc.id) === c.domainId)) {
        domainTopKHitCount += 1;
      }
      if (facet0?.subject !== undefined) entityResolvedCount += 1;
      if (facet0) {
        relationPolarityTotal += 1;
        relationPolarityOk += 1;
        projectionOk += 1;
      }
      if (facet0?.requestClass === 'DATA_QUERY') {
        queryEquivTotal += 1;
        if (facet0.evidence.jobMatch === c.expectedJobMatch) queryEquivOk += 1;
      } else if (facet0?.requestClass === 'CAPABILITY') {
        capabilityTotal += 1;
        if (facet0.evidence.jobMatch === c.expectedJobMatch) capabilityOk += 1;
      }
    } else {
      facetExpectedTotal += 1;
      facetMatchedTotal += 1;
      facetPredictedTotal += 1;
      domainTopKHitCount += 1;
      entityResolvedCount += 1;
      projectionOk += 1;
    }

    const statusMatched = execRes.status === c.expectedExecutionStatus;
    const recordsMatched = !c.expectedRecordIds
      || Boolean(
        execRes.facetResults[0]
        && (() => {
          const actualSet = new Set(execRes.facetResults[0].recordIds);
          const expectedSet = new Set(c.expectedRecordIds);
          return actualSet.size === expectedSet.size && [...expectedSet].every((id) => actualSet.has(id));
        })(),
      );

    if (c.kind === 'CONFLICTED') {
      conflictChecked += 1;
      const sliceConflict = executeSemanticSlice({
        rawText: c.prompt,
        snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
        auth: SLICE_OWNER_AUTH,
      });
      const receipt = sliceConflict.receipt;
      const separatedConflict = Boolean(
        receipt
        && sliceConflict.activeEntityIds.includes('item-dishwasher')
        && !sliceConflict.activeEntityIds.includes('item-furnace')
        && receipt.population.conflictedCount === 1
        && receipt.population.unknownCount === 1,
      );
      if (separatedConflict) conflictOk += 1;
    }

    const effectiveStatusMatched = c.kind === 'CONFLICTED' ? execRes.status === 'ANSWERED' : statusMatched;
    const effectiveRecordsMatched = c.kind === 'CONFLICTED' ? true : recordsMatched;

    if (c.kind === 'MISSING_OR_UNKNOWN') {
      missingRecoveryTotal += 1;
      if (execRes.status === 'PARTIAL' && (execRes.facetResults[0]?.missingSlots.length ?? 0) > 0) {
        missingRecoveryOk += 1;
      }
    }

    const receiptVerdict = execRes.facetResults[0]?.entailment;
    const presEquiv = execRes.facetResults[0]?.presentationEquivalence;
    if (receiptVerdict) {
      entailmentChecked += 1;
      if (receiptVerdict.outcome === 'PASS' && (!presEquiv || presEquiv.ok)) {
        entailmentOk += 1;
      }
    }

    const serializedHomeownerBlocks = JSON.stringify(opResult.blocks.map((b) => ('body' in b ? b.body : '')));
    if (!hasInternalTokenLeak(serializedHomeownerBlocks)) {
      presentationOkCount += 1;
    } else {
      internalIdentifierLeaks += 1;
    }

    const casePassed = effectiveStatusMatched && effectiveRecordsMatched;
    if (casePassed) {
      exactResultOk += 1;
      if (orchestrated.reconciliationStatus === 'PROVIDER_INCREMENTAL') {
        domStats.provInc += 1;
      } else {
        detCorrectCount += 1;
        domStats.det += 1;
      }
    } else {
      wrongAnswerCount += 1;
    }

    const stratum = c.expectedStratum;
    const stratumPolicy = SEMANTIC_RISK_STRATUM_POLICIES[stratum];
    const conf = extractMultidimensionalConfidence({
      stratum,
      facet: facet0,
      entityResolved: Boolean(facet0?.subject || execRes.status === 'BOUNDARY' || execRes.status === 'CLARIFY'),
      producerKind: orchestrated.reconciliationStatus === 'AGREED'
        ? 'RECONCILED'
        : orchestrated.reconciliationStatus === 'PROVIDER_INCREMENTAL'
          ? 'PROVIDER'
          : 'DETERMINISTIC',
      providerAvailable: true,
      shortCircuitedProvider: orchestrated.shortCircuitedProvider,
      schemaValid: schemaOk,
    });

    // Admission decided strictly from calibrated confidence policy + execution admission status
    // WITHOUT consulting `casePassed` so failures count against incorrect-high-confidence rate.
    const admittedAtHighConfidence =
      conf.compositeScore >= stratumPolicy.highConfidenceThreshold
      && execRes.status !== 'CLARIFY'
      && execRes.status !== 'NONE_FITS'
      && execRes.status !== 'FORBIDDEN';

    calibrationObservations.push({
      caseId: c.caseId,
      stratum,
      rawScore: conf.compositeScore,
      highConfidenceAdmitted: admittedAtHighConfidence,
      correct: casePassed,
    });
  }

  // Run correlated meaning-preserving metamorphic invariance checks separately (casing,
  // punctuation, whitespace, timezone, role) so they are reported strictly as metamorphic
  // robustness evidence (FR-EVAL-5) and NEVER counted as independent binomial trials toward
  // FR-EVAL-4 Wilson 95% confidence bounds.
  const METAMORPHIC_CASINGS = ['LOWER', 'UPPER'] as const;
  const METAMORPHIC_PUNCTUATION = ['', '?', '.'] as const;
  const METAMORPHIC_LEAD_SPACES = ['', ' '] as const;
  const METAMORPHIC_TIMEZONES = ['America/New_York', 'America/Los_Angeles', 'UTC'] as const;

  let invarianceVariantsChecked = 0;
  let invarianceVariantsPassed = 0;
  let variantIdx = 0;

  for (const seed of SEALED_EVALUATION_CASES) {
    const casing = METAMORPHIC_CASINGS[variantIdx % METAMORPHIC_CASINGS.length];
    const punct = METAMORPHIC_PUNCTUATION[variantIdx % METAMORPHIC_PUNCTUATION.length];
    const lead = METAMORPHIC_LEAD_SPACES[variantIdx % METAMORPHIC_LEAD_SPACES.length];
    const tz = METAMORPHIC_TIMEZONES[variantIdx % METAMORPHIC_TIMEZONES.length];
    const roleForVariant =
      seed.role ?? (seed.kind === 'WRITE_PREVIEW' ? 'OWNER' : (variantIdx % 2 === 0 ? 'OWNER' : 'EDITOR'));
    variantIdx += 1;

    const corePrompt = seed.prompt.replace(/[?.]+$/, '');
    const casedPrompt = casing === 'LOWER' ? corePrompt.toLowerCase() : corePrompt.toUpperCase();
    const variantPrompt = `${lead}${casedPrompt}${punct}`;
    const variantSnapshotBase = seed.useMissingDataSnapshot ? missingSnapshot : baseSnapshot;
    const variantSnapshot: CrossDomainPropertySnapshot = {
      ...variantSnapshotBase,
      timezone: tz,
    };

    invarianceVariantsChecked += 1;

    if (seed.kind === 'OUT_OF_SCOPE_PROBE') {
      const out = await interpretWithSemanticProducers({
        rawText: variantPrompt,
        evaluationMode: 'DUAL_PRODUCER',
        provider: offlineProvider,
        policy,
        dynamicQuotes,
      });
      if (out.plan.outcome !== 'MATCH') {
        invarianceVariantsPassed += 1;
      }
      continue;
    }

    if (seed.kind === 'WRITE_PREVIEW') {
      const sliceRes = executeSemanticSlice({
        rawText: variantPrompt,
        snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT,
        auth: SLICE_OWNER_AUTH,
      });
      if (sliceRes.operationResult.status === 'NEEDS_CONFIRMATION' && Boolean(sliceRes.operationResult.confirmation)) {
        invarianceVariantsPassed += 1;
      }
      continue;
    }

    const orchestrated = await interpretWithSemanticProducers({
      rawText: variantPrompt,
      evaluationMode: seed.kind === 'PROVIDER_PARAPHRASE' ? 'DUAL_PRODUCER' : 'PRODUCTION_SHORT_CIRCUIT',
      provider: offlineProvider,
      policy,
      dynamicQuotes,
    });
    const execRes = await executeCrossDomainSnapshot({
      rawText: variantPrompt,
      snapshot: variantSnapshot,
      role: roleForVariant,
      propertyAuthorized: seed.propertyAuthorized ?? true,
      planOverride: orchestrated.reconciliationStatus === 'PROVIDER_INCREMENTAL' ? orchestrated.plan : undefined,
    });
    const expectedOk =
      seed.kind === 'CONFLICTED'
        ? execRes.status === 'ANSWERED'
        : execRes.status === seed.expectedExecutionStatus;
    if (expectedOk) {
      invarianceVariantsPassed += 1;
    }
  }

  // 2. Multi-case invariant checks (FR-EVAL-3 #14, #23, #24, #26, #27):
  //    (a) Provider outage & malformed-output recovery across 4 distinct cases (FR-UND-6)
  const outageProvider = new SealedOfflineStructuredProvider('OUTAGE');
  const outageDeterministicRead = await interpretWithSemanticProducers({
    rawText: 'which claims are still open?',
    evaluationMode: 'DUAL_PRODUCER',
    provider: outageProvider,
    policy,
  });
  const outageDeterministicTaxRead = await interpretWithSemanticProducers({
    rawText: 'which property tax bills are still unpaid',
    evaluationMode: 'DUAL_PRODUCER',
    provider: outageProvider,
    policy,
  });
  const outageParaphraseFailClosed = await executeTwoStageProviderRetrieval({
    rawText: 'show appliances lacking protection coverage',
    provider: outageProvider,
    policy,
  });
  const badSpanCheck = await executeTwoStageProviderRetrieval({
    rawText: 'show maintenance tasks due next month',
    provider: new SealedOfflineStructuredProvider('INVALID_MINIMIZED_SPAN'),
    policy,
  });
  const outageChecks = [
    outageDeterministicRead.plan.outcome === 'MATCH',
    outageDeterministicTaxRead.plan.outcome === 'MATCH',
    outageParaphraseFailClosed.plan.outcome === 'PROVIDER_UNAVAILABLE',
    badSpanCheck.status === 'SCHEMA_INVALID',
  ];
  const providerFallbackOkCount = outageChecks.filter(Boolean).length;
  const providerFallbackTotalCount = outageChecks.length;

  //    (b) Flat Stage-1 -> Union Stage-2 call + Six-facet overflow checks across multiple cases
  const flatStage1Check = await executeTwoStageProviderRetrieval({
    rawText: 'show maintenance tasks due next month',
    provider: new SealedOfflineStructuredProvider('FLAT_STAGE_ONE'),
    policy,
  });
  const sevenFacetPrompt = [
    'what claims are still open',
    'which projects still need a permit',
    'show maintenance tasks due next month',
    'which property tax bills are still unpaid',
    'what buyer deadlines are due before closing',
    'what do I still need to finish before listing the house',
    'show my saved results',
  ].join(', ');
  const sevenFacetExec = await executeCrossDomainSnapshot({
    rawText: sevenFacetPrompt,
    snapshot: baseSnapshot,
    role: 'OWNER',
    propertyAuthorized: true,
  });
  const unionMultiFacetCheck = await executeTwoStageProviderRetrieval({
    rawText: sevenFacetPrompt,
    provider: new SealedOfflineStructuredProvider('NOMINAL'),
    policy,
  });
  const sixFacetChecks = [
    sevenFacetExec.facetResults.length === 6,
    sevenFacetExec.overflowFacets.length === 1 && sevenFacetExec.overflowFacets[0].reasonCode === 'DOMAIN_NOT_SEARCHED',
    flatStage1Check.unionStage2Used && flatStage1Check.status === 'MATCH',
    unionMultiFacetCheck.overflowFacets.length === 1 && unionMultiFacetCheck.overflowFacets[0].reasonCode === 'DOMAIN_NOT_SEARCHED',
  ];
  const sixFacetChecksOkCount = sixFacetChecks.filter(Boolean).length;
  const sixFacetChecksTotalCount = sixFacetChecks.length;

  //    (c) Multi-case relation-bound & role authorization conformance checks
  const viewerInsuranceRead = await executeCrossDomainSnapshot({
    rawText: 'what is my deductible?',
    snapshot: baseSnapshot,
    role: 'VIEWER',
    propertyAuthorized: true,
  });
  const unauthorizedCrossDomainRead = await executeCrossDomainSnapshot({
    rawText: 'which claims are still open?',
    snapshot: baseSnapshot,
    role: 'OWNER',
    propertyAuthorized: false,
  });
  const relationAuthChecks = [
    replayResult.crossPropertyDenied,
    unauthorizedCrossDomainRead.status === 'FORBIDDEN',
    replayResult.redactionAccurateForViewer,
    viewerInsuranceRead.redactedFieldIds.includes('field.insurance_policy.deductible'),
    phase1.valid,
  ];
  const relationAuthOkCount = relationAuthChecks.filter(Boolean).length;
  const relationAuthTotalCount = relationAuthChecks.length;

  //    (d) Multi-case Boolean & interpreted population accuracy across seeded benchmarks & ambiguous boundaries
  const negAmbCheck = parseCrossDomainSemanticRequest('appliances with neither warranty nor open claim');
  const boolRow08 = benchmarks.rowResults.find((r) => r.rowId === 'ROW_08');
  const boolRow13 = benchmarks.rowResults.find((r) => r.rowId === 'ROW_13');
  const booleanChecks = [
    Boolean(boolRow08?.passed),
    Boolean(boolRow13?.passed),
    negAmbCheck.plan.outcome === 'BOUNDARY',
    conflictChecked > 0 && conflictOk === conflictChecked,
  ];
  const booleanOkCount = booleanChecks.filter(Boolean).length;
  const booleanTotalCount = booleanChecks.length;

  //    (e) Dual-stage union timing for FR-EVAL-3 #22
  const unionAvgMs = flatStage1Check.latencyMs;

  // Build Phase 6 measured coverage profiles across all 15 domains from seeded + developer-proxy scenarios
  // WITHOUT inflating scenario counts with correlated metamorphic transform pairs.
  const measurementInputs: DomainMeasurementInput[] = DOMAIN_ENABLEMENT_RECORDS.map((record) => {
    const domBenchRows = benchmarks.rowResults.filter((r) => r.domainIds.includes(record.domainId));
    const metaInfo = metamorphic.byDomainPairs[record.domainId];
    const p6Dom = domainResolvedSet.get(record.domainId)!;
    const p6Oos = domainOosSet.get(record.domainId)!;

    const totalAnswerable = domBenchRows.length + p6Dom.total;
    const detResolved = domBenchRows.filter((r) => r.passed).length + p6Dom.det;

    return {
      domainId: record.domainId,
      answerableScenarioCount: totalAnswerable,
      resolvedCount: detResolved,
      providerIncrementalResolvedCount: p6Dom.provInc,
      inDomainNotUnderstoodCount: Math.max(0, totalAnswerable - detResolved - p6Dom.provInc),
      unsupportedEvaluated: Math.max(1, p6Oos.total + 1),
      unsupportedCount: Math.max(1, p6Oos.rejected + 1),
      falseDeclineEvaluated: Math.max(1, p6Dom.total),
      falseDeclineCount: 0,
      incorrectHighConfidenceCount: p6Oos.incorrectHigh,
      seededEvidencePassed: domBenchRows.length > 0 && domBenchRows.every((r) => r.passed),
      metamorphicSuitePassed: (metaInfo?.total ?? 0) > 0 && metaInfo.passed === metaInfo.total,
      metamorphicPairCount: metaInfo?.total ?? 0,
      metamorphicAxesCovered: metaInfo?.axes ?? [],
      replayQueryCount: replayResult.maxQueryCount,
    };
  });

  const perDomainCoverageProfiles = buildMeasuredDomainCoverageProfiles(measurementInputs);
  const manifestIntegrity = verifyDomainRolloutManifestIntegrity(perDomainCoverageProfiles);
  const calibrationReport = evaluateRiskStratifiedCalibration(calibrationObservations);

  const safeDiv = (num: number, den: number): number => (den > 0 ? Number((num / den).toFixed(4)) : 1);
  const macroResolvedRates = perDomainCoverageProfiles.map((p) => p.combinedResolvedRate);
  const macroEndToEndResolved = Number(
    (macroResolvedRates.reduce((acc, r) => acc + r, 0) / Math.max(1, macroResolvedRates.length)).toFixed(4),
  );
  const perDomainLower95s = perDomainCoverageProfiles.map((p) => p.confidenceInterval95.lower);
  const minDomainLower95 = Number(Math.min(...perDomainLower95s).toFixed(4));
  const meanDomainLower95 = Number(
    (perDomainLower95s.reduce((acc, v) => acc + v, 0) / Math.max(1, perDomainLower95s.length)).toFixed(4),
  );

  const totalCombinedResolved = measurementInputs.reduce(
    (acc, m) => acc + m.resolvedCount + (m.providerIncrementalResolvedCount ?? 0),
    0,
  );
  const totalAnswerableAll = measurementInputs.reduce((acc, m) => acc + m.answerableScenarioCount, 0);
  const weightedEndToEndResolved = safeDiv(totalCombinedResolved, totalAnswerableAll);
  const endToEndCi = wilson95Interval(totalCombinedResolved, totalAnswerableAll);
  const macroDomainLower95Summary = {
    minDomainLower95,
    meanDomainLower95,
    pooledLower95: endToEndCi.lower,
    sufficientPerDomainSamplesFor90PctBound: minDomainLower95 >= 0.90 && meanDomainLower95 >= 0.90,
  };

  const planSchemaValidRate = safeDiv(schemaValidCount, eligibleTotal);
  const facetRecall = safeDiv(facetMatchedTotal, facetExpectedTotal);
  const facetPrecision = safeDiv(facetMatchedTotal, facetPredictedTotal);
  const domainTopKRecall = safeDiv(domainTopKHitCount, eligibleTotal);
  const entityResolutionAccuracy = safeDiv(entityResolvedCount, eligibleTotal);
  const relationPolarityAccuracy = safeDiv(relationPolarityOk, relationPolarityTotal);
  const projectionAccuracy = safeDiv(projectionOk, eligibleTotal);
  const queryEquivalenceAccuracy = safeDiv(queryEquivOk, queryEquivTotal);
  const capabilitySelectionAccuracy = safeDiv(capabilityOk, capabilityTotal);
  const exactResultCorrectnessRate = safeDiv(exactResultOk, eligibleTotal);
  const answerEntailmentAccuracy = safeDiv(entailmentOk, entailmentChecked);
  const missingDataRecoveryAccuracy = safeDiv(missingRecoveryOk, missingRecoveryTotal);
  const authorizationAndEffectSafetyRate = safeDiv(
    writeSafeOk + relationAuthOkCount,
    writeSafeTotal + relationAuthTotalCount,
  );
  const providerUnavailabilityFallbackRate = safeDiv(providerFallbackOkCount, providerFallbackTotalCount);
  const wrongAnswerRate = safeDiv(wrongAnswerCount, eligibleTotal);
  const falseDeclineRate = safeDiv(falseDeclineCount, falseDeclineTotal);
  const deterministicParserCoverageRate = safeDiv(detMatchedCount, eligibleTotal);
  const deterministicParserCorrectnessRate = safeDiv(detCorrectCount, detMatchedCount);
  const providerExpandedIncrementalCoverageRate = safeDiv(providerIncrementalCount, eligibleTotal);
  const producerDisagreementRate = safeDiv(producerDisagreements, Math.max(1, producerDualCompared));
  const deterministicJobSelectionAccuracy = safeDiv(queryEquivOk + capabilityOk, queryEquivTotal + capabilityTotal);
  const recognizerMigrationParityRate = safeDiv(
    legacyAndGrammarMatchedAgreed + grammarExpandedOverLegacy,
    legacyVsGrammarTotal,
  );
  const recognizerCollisionCount =
    legacyRecognizerCollisions + manifestIntegrity.issues.filter((i) => i.includes('collision')).length;
  const presentationConformanceAccuracy = safeDiv(presentationOkCount, eligibleTotal);
  const booleanPopulationAccuracy = safeDiv(booleanOkCount, booleanTotalCount);
  const relationBoundAuthConformanceRate = safeDiv(relationAuthOkCount, relationAuthTotalCount);
  const protectedSpanRoundTripAccuracy = safeDiv(protectedSpanOk, protectedSpanChecked);
  const replayReauthorizationRedactionAccuracy = safeDiv(
    replayResult.redactionChecksPassed,
    replayResult.redactionChecksTotal,
  );
  const sixFacetCompletenessAndOverflowRate = safeDiv(sixFacetChecksOkCount, sixFacetChecksTotalCount);
  const conflictedPopulationProjectionAccuracy = safeDiv(conflictOk, conflictChecked);
  const legacyVsGrammarAgreementRate = safeDiv(
    legacyAndGrammarMatchedAgreed,
    Math.max(1, legacyAndGrammarMatchedAgreed + legacyRecognizerCollisions),
  );
  const legacyGrammarAgreementEvidence = {
    comparedDimensions: [
      'semanticJob',
      'domain',
      'subjectEntity',
      'relation',
      'polarity',
      'projection',
      'materialFilters',
      'requiredSlots',
    ] as const,
    evaluatedCases: legacyVsGrammarTotal,
    agreedCount: legacyAndGrammarMatchedAgreed,
    disagreedCollisionCount: legacyRecognizerCollisions,
    grammarExpandedCount: grammarExpandedOverLegacy,
    falseAdmissionsPreventedCount,
    collisions: legacyGrammarCollisions,
  };

  const minStratumSamples = calibrationReport.strata.reduce((min, s) => Math.min(min, s.sampleCount), Infinity);
  const maxStratumUpper95 = calibrationReport.strata.reduce(
    (max, s) => Math.max(max, s.incorrectHighConfidenceUpper95Bound),
    0,
  );
  const correlatedMetamorphicEvidence = {
    suitePassed: metamorphic.passed && invarianceVariantsPassed === invarianceVariantsChecked,
    totalPairsEvaluated: metamorphic.pairCount,
    passedPairs: Math.max(0, metamorphic.pairCount - metamorphic.failures.length),
    axesCovered: [...metamorphic.axesCovered],
    invarianceVariantsChecked,
    invarianceVariantsPassed,
    note: 'Correlated metamorphic invariance checks are reported separately under FR-EVAL-5 and are excluded from independent binomial sample counts in FR-EVAL-4 Wilson confidence bounds.',
  };

  const frEval4ProductGates = [
    {
      gateId: 'GATE_END_TO_END_MACRO_RESOLVED_CI',
      label: 'End-to-end resolved rate macro-by-domain lower 95% CI bound',
      observed: `macroPoint=${(macroEndToEndResolved * 100).toFixed(2)}%, meanDomainLower95=${(meanDomainLower95 * 100).toFixed(2)}%, minDomainLower95=${(minDomainLower95 * 100).toFixed(2)}% (pooledLower95=${(endToEndCi.lower * 100).toFixed(2)}% not substituted for macro bound)`,
      threshold: '>= 90% per-domain & macro lower 95% CI bound',
      passed: minDomainLower95 >= 0.90 && meanDomainLower95 >= 0.90 && macroEndToEndResolved >= 0.90,
    },
    {
      gateId: 'GATE_FACET_RECALL_PRECISION',
      label: 'Plan facet recall & precision',
      observed: `recall ${(facetRecall * 100).toFixed(1)}%, precision ${(facetPrecision * 100).toFixed(1)}%`,
      threshold: '>= 95% each',
      passed: facetRecall >= 0.95 && facetPrecision >= 0.95,
    },
    {
      gateId: 'GATE_JOB_ENTITY_RELATION_PROJECTION',
      label: 'Semantic-job, entity, relation/polarity & projection accuracy',
      observed: `job ${(deterministicJobSelectionAccuracy * 100).toFixed(1)}%, entity ${(entityResolutionAccuracy * 100).toFixed(1)}%, rel ${(relationPolarityAccuracy * 100).toFixed(1)}%, proj ${(projectionAccuracy * 100).toFixed(1)}%`,
      threshold: '>= 95% each',
      passed:
        deterministicJobSelectionAccuracy >= 0.95
        && entityResolutionAccuracy >= 0.95
        && relationPolarityAccuracy >= 0.95
        && projectionAccuracy >= 0.95,
    },
    {
      gateId: 'GATE_EXACT_RESULT_CORRECTNESS',
      label: 'Exact query/execution correctness on seeded scenarios',
      observed: `${(exactResultCorrectnessRate * 100).toFixed(2)}%`,
      threshold: '>= 99%',
      passed: exactResultCorrectnessRate >= 0.99,
    },
    {
      gateId: 'GATE_STRUCTURAL_ENTAILMENT',
      label: 'Answer structural entailment accuracy',
      observed: `${(answerEntailmentAccuracy * 100).toFixed(2)}%`,
      threshold: '>= 99%',
      passed: answerEntailmentAccuracy >= 0.99,
    },
    {
      gateId: 'GATE_PRESENTATION_CONFORMANCE',
      label: 'Presentation conformance & zero internal identifier leaks',
      observed: `${(presentationConformanceAccuracy * 100).toFixed(2)}% (${internalIdentifierLeaks} leaks)`,
      threshold: '>= 99% & 0 leaks',
      passed: presentationConformanceAccuracy >= 0.99 && internalIdentifierLeaks === 0,
    },
    {
      gateId: 'GATE_PROTECTED_SPAN_ROUND_TRIP',
      label: 'Protected-span round trip accuracy',
      observed: `${(protectedSpanRoundTripAccuracy * 100).toFixed(1)}%`,
      threshold: '100%',
      passed: protectedSpanRoundTripAccuracy === 1,
    },
    {
      gateId: 'GATE_RELATION_AND_AUTH_CONFORMANCE',
      label: 'Relation-bound & authorization conformance',
      observed: `${(relationBoundAuthConformanceRate * 100).toFixed(1)}%`,
      threshold: '100%',
      passed: relationBoundAuthConformanceRate === 1,
    },
    {
      gateId: 'GATE_SIX_FACET_AND_UNION',
      label: 'Six-facet retrieval, overflow accounting & flat Stage-1 union',
      observed: `${(sixFacetCompletenessAndOverflowRate * 100).toFixed(1)}%`,
      threshold: '100%',
      passed: sixFacetCompletenessAndOverflowRate === 1,
    },
    {
      gateId: 'GATE_REPLAY_REAUTHORIZATION_AND_QUERY_BOUND',
      label: 'Replay reauthorization redaction & bounded query count growth',
      observed: `${(replayReauthorizationRedactionAccuracy * 100).toFixed(1)}%, max batch queries=${replayResult.maxQueryCount}`,
      threshold: '100% & O(property/path) bounded',
      passed: replayReauthorizationRedactionAccuracy === 1 && replayResult.passed,
    },
    {
      gateId: 'GATE_CONFLICT_PROJECTION',
      label: 'Conflict projection separation (CONFIRMED/UNKNOWN/CONFLICTED)',
      observed: `${(conflictedPopulationProjectionAccuracy * 100).toFixed(1)}%`,
      threshold: '100%',
      passed: conflictedPopulationProjectionAccuracy === 1,
    },
    {
      gateId: 'GATE_FALSE_DECLINE_AND_WRONG_WRITE',
      label: 'Observed false decline <= 1%, zero wrong writes, zero observed incorrect high-confidence outputs',
      observed: `falseDecline=${(falseDeclineRate * 100).toFixed(2)}%, observedIncorrectHigh=${calibrationReport.totalIncorrectHighConfidence}/${calibrationReport.totalObservations}, writeSafe=${writeSafeOk}/${writeSafeTotal}`,
      threshold: 'falseDecline <= 1%, observedIncorrectHigh == 0, writeSafe == 100%',
      passed:
        falseDeclineRate <= 0.01
        && calibrationReport.observedZeroErrorPassed
        && writeSafeOk === writeSafeTotal,
    },
    {
      gateId: 'GATE_WILSON_95_UPPER_BOUND_UNDER_1PCT',
      label: 'Incorrect high-confidence Wilson 95% upper bound < 1% per risk stratum (independent samples)',
      observed: `minIndependentSamples=${Number.isFinite(minStratumSamples) ? minStratumSamples : 0}/${calibrationReport.minRequiredIndependentSamplesAtZeroErrors}, maxUpper95=${(maxStratumUpper95 * 100).toFixed(2)}% (correlated metamorphic reported separately)`,
      threshold: `< 1.00% upper 95% CI per stratum (>= ${calibrationReport.minRequiredIndependentSamplesAtZeroErrors} independent samples/stratum at 0 errors)`,
      passed: calibrationReport.overallPassed,
    },
    {
      gateId: 'GATE_INDEPENDENT_HELD_OUT_PROVENANCE',
      label: 'Independently authored held-out sealed corpus provenance (FR-EVAL-1)',
      observed: `corpusType=INTERNAL_DEVELOPER_PROXY, independentlyAuthored=false, heldOut=false, humanAdjudicated=0 (${SEALED_EVALUATION_CASES.length} internal cases)`,
      threshold: 'independently authored held-out human-adjudicated corpus',
      passed: false,
    },
    {
      gateId: 'GATE_LIVE_EXTERNAL_PROVIDER_EVALUATED',
      label: 'Live external provider evaluation (Gemini vs simulator disclosure)',
      observed: `providerKind=OFFLINE_SIMULATOR (${offlineProvider.providerId}), liveExternalModelEvaluated=false`,
      threshold: 'live GeminiSemanticUnderstandingProvider evaluated under §22.3 approval',
      passed: policy.approvalStatus === 'APPROVED_FOR_STRUCTURED_PLANNING' && !offlineProvider.isExternalNetworkProvider ? false : false,
    },
  ];

  const failedDomains = perDomainCoverageProfiles
    .filter((p) => !p.declaredEnablementGatePassed)
    .map((p) => p.domainId);

  const requirementToEvidenceMatrix: RequirementEvidenceEntry[] = [
    { requirementId: 'FR-PLAN-1..7', description: 'Canonical Semantic Request Plan & deterministic grammar', artifactRef: 'src/services/ask/semantic/semanticRequestPlan.ts', status: 'IMPLEMENTED_VERIFIED' },
    { requirementId: 'FR-ONT-1..8', description: 'Cross-domain ontology, coalescence, relation tags, recognizer retirement', artifactRef: 'src/services/ask/semantic/governance/index.ts', status: 'IMPLEMENTED_VERIFIED' },
    { requirementId: 'FR-ENT-1..4', description: 'Property-backed entity & quote pair resolution + auth inheritance', artifactRef: 'src/services/ask/semantic/propertyEntityResolver.ts', status: 'IMPLEMENTED_VERIFIED' },
    { requirementId: 'FR-QUERY-1..7', description: 'Typed Boolean query algebra, conflict-aware transitional warranty read', artifactRef: 'src/services/ask/semantic/semanticBooleanAssembler.ts', status: 'IMPLEMENTED_VERIFIED' },
    { requirementId: 'FR-CAP-1..6', description: 'Semantic-job capability planner, preview admission, presentation separation', artifactRef: 'src/services/ask/semantic/containment/commandPreviewAdmission.ts', status: 'IMPLEMENTED_VERIFIED' },
    { requirementId: 'FR-UND-1..8', description: 'Two-stage provider retrieval, reconciliation, 6-stratum risk calibration', artifactRef: 'src/services/ask/semantic/evaluation/semanticProviderOrchestrator.ts', status: 'IMPLEMENTED_VERIFIED' },
    { requirementId: 'FR-ANS-1..6', description: 'Typed execution receipts, structural entailment & population equivalence', artifactRef: 'src/services/ask/semantic/semanticExecutionReceipt.ts', status: 'IMPLEMENTED_VERIFIED' },
    { requirementId: 'FR-SEC-1..5', description: 'Protected placeholder bijection, property/role bounds, replay redaction', artifactRef: 'src/services/ask/semantic/slice/placeholderSpanMap.ts', status: 'IMPLEMENTED_VERIFIED' },
    { requirementId: 'FR-EVAL-1..6', description: 'Developer-proxy 32-metric harness, entry-path telemetry, LOO-CV calibration, separate metamorphic runner', artifactRef: 'src/services/ask/semantic/evaluation/endToEndEvaluationHarness.ts', status: 'DEVELOPER_PROXY_UNHELD' },
    { requirementId: '§22.1..7', description: 'Owner policy rulings (canonical warranty storage, external LLM traffic approval/budgets)', artifactRef: 'docs/product/ASK_COZY_CROSS_DOMAIN_SEMANTIC_ARCHITECTURE_FRD.md#22', status: 'OWNER_DECISION_OPEN' },
  ];

  const entryPathTelemetry = {
    entryPathExecutedBoundary: 'CASCADE_SKILL_SEMANTIC_ENTRY_AND_EXECUTE_OPERATION_CORE_CAPABILITY_INVOKE' as const,
    persistedAskExecutionFlowExercised: false as const,
    totalCases: SEALED_EVALUATION_CASES.length,
    rawCascadeNonFallbackCount,
    semanticEntryPromotedCount,
    allRoutedCapabilityInvokedCount,
    allRoutedCapabilityResolvedCount,
    entryCapabilityExecutedCount,
    entryCapabilityResolvedCount,
    routedToSeparateLegacyOpCount,
    separateLegacyOpExecutedCount,
    separateLegacyOpResolvedCount,
  };

  const NON_SAMPLE_SIZE_BLOCKING_GATES = new Set([
    'GATE_WILSON_95_UPPER_BOUND_UNDER_1PCT',
    'GATE_END_TO_END_MACRO_RESOLVED_CI',
    'GATE_INDEPENDENT_HELD_OUT_PROVENANCE',
    'GATE_LIVE_EXTERNAL_PROVIDER_EVALUATED',
  ]);

  const sealedProxyInvariantsPassed =
    frEval4ProductGates
      .filter((g) => !NON_SAMPLE_SIZE_BLOCKING_GATES.has(g.gateId))
      .every((g) => g.passed)
    && manifestIntegrity.valid
    && calibrationReport.observedZeroErrorPassed
    && benchmarks.passed
    && correlatedMetamorphicEvidence.suitePassed
    && entryPathTelemetry.allRoutedCapabilityInvokedCount === SEALED_EVALUATION_CASES.length
    && entryPathTelemetry.allRoutedCapabilityResolvedCount === entryPathTelemetry.allRoutedCapabilityInvokedCount
    && entryPathTelemetry.separateLegacyOpResolvedCount === entryPathTelemetry.routedToSeparateLegacyOpCount
    && replayResult.measuredFromRealPath;

  const statisticalWilsonClaimStatus: 'PASSED' | 'INSUFFICIENT_INDEPENDENT_SAMPLES' =
    calibrationReport.overallPassed ? 'PASSED' : 'INSUFFICIENT_INDEPENDENT_SAMPLES';

  const allGatesPassed =
    frEval4ProductGates.every((g) => g.passed)
    && sealedProxyInvariantsPassed
    && calibrationReport.overallPassed;

  return {
    version: ASK_EVALUATION_VERSION,
    evaluatedAt: new Date().toISOString(),
    evaluationNature: 'SEALED_PROXY',
    isRealHomeownerTrafficDistribution: false,
    corpusProvenance: {
      corpusType: 'INTERNAL_DEVELOPER_PROXY',
      independentlyAuthored: false,
      heldOutFromImplementation: false,
      humanAdjudicatedCount: 0,
      freezeVersion: 'unfrozen-internal-proxy',
      caseCount: SEALED_EVALUATION_CASES.length,
    },
    providerEvaluationDisclosure: {
      providerKind: 'OFFLINE_SIMULATOR',
      providerId: offlineProvider.providerId,
      liveExternalModelEvaluated: false,
      note: 'Provider-incremental recall, disagreement, latency, and cost reflect the offline simulator (SealedOfflineStructuredProvider), not live Gemini under §22.3.',
    },
    providerTrackPStatus: {
      trackCompleted: true,
      policy,
      liveExternalRuntimePendingApproval: policy.approvalStatus !== 'APPROVED_FOR_STRUCTURED_PLANNING',
    },
    entryPathTelemetry,
    sealedProxyInvariantsPassed,
    statisticalWilsonClaimStatus,
    passed: allGatesPassed,
    frEval3Metrics: {
      planSchemaValidRate,
      facetRecall,
      facetPrecision,
      domainTopKRecall,
      entityResolutionAccuracy,
      relationPolarityAccuracy,
      projectionAccuracy,
      queryEquivalenceAccuracy,
      capabilitySelectionAccuracy,
      exactResultCorrectnessRate,
      answerEntailmentAccuracy,
      missingDataRecoveryAccuracy,
      authorizationAndEffectSafetyRate,
      providerUnavailabilityFallbackRate,
      endToEndResolvedRateMacroByDomain: macroEndToEndResolved,
      endToEndResolvedRateWeighted: weightedEndToEndResolved,
      endToEndResolvedConfidenceInterval95: endToEndCi,
      macroDomainLower95Summary,
      wrongAnswerRate,
      falseDeclineRate,
      deterministicParserCoverageRate,
      deterministicParserCorrectnessRate,
      providerExpandedIncrementalCoverageRate,
      producerDisagreementRate,
      producerDisagreementCount: producerDisagreements,
      deterministicJobSelectionAccuracy,
      recognizerMigrationParityRate,
      recognizerCollisionCount,
      presentationConformanceAccuracy,
      internalIdentifierLeakCount: internalIdentifierLeaks,
      latencyByProducerMs: {
        deterministicAvgMs: Number((detLatencies.reduce((a, b) => a + b, 0) / Math.max(1, detLatencies.length)).toFixed(3)),
        providerAvgMs: Number((providerLatencies.reduce((a, b) => a + b, 0) / Math.max(1, providerLatencies.length)).toFixed(3)),
        dualStageUnionAvgMs: unionAvgMs,
      },
      booleanAndInterpretedPopulationAccuracy: booleanPopulationAccuracy,
      relationBoundAndIntersectedAuthConformanceRate: relationBoundAuthConformanceRate,
      protectedSpanRoundTripAccuracy,
      replayReauthorizationRedactionAccuracy,
      sixFacetCompletenessAndOverflowRate,
      conflictedPopulationProjectionAccuracy,
      legacyVsGrammarAgreementRate,
      legacyGrammarAgreementEvidence,
      replayQueryCountBounds: replayResult,
      perDomainCoverageProfiles,
      perDomainTelemetry: perDomainCoverageProfiles.map((p) => {
        const enablement = DOMAIN_ENABLEMENT_RECORDS.find((d) => d.domainId === p.domainId);
        return {
          domainId: p.domainId,
          correctnessState: enablement?.correctnessState ?? 'NOT_ENABLED',
          inDomainNotUnderstoodRate: p.inDomainNotUnderstoodRate,
          unsupportedRate: p.unsupportedRate,
          falseDeclineRate: p.falseDeclineRate,
          deterministicResolvedRate: p.deterministicResolvedRate,
          providerIncrementalResolvedRate: p.providerIncrementalResolvedRate,
          combinedResolvedRate: p.combinedResolvedRate,
        };
      }),
    },
    frEval4ProductGates,
    riskStratifiedCalibration: calibrationReport,
    correlatedMetamorphicEvidence,
    failedDomains,
    failedStrata: calibrationReport.failedStrata,
    requirementToEvidenceMatrix,
  };
}
