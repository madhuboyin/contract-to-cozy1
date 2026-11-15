/**
 * Phase 0 Bullet 3 (FR-ONT-8, §18 Phase 0, §19 Artifact #8):
 * Recognizer and Vocabulary Source Inventory & Retirement Manifest.
 *
 * Every pre-existing prompt recognizer and vocabulary source in Ask Cozy is
 * inventoried here with its live item count and exactly one governed FR-ONT-8
 * disposition:
 *   - MIGRATE_TO_LEXICON
 *   - MIGRATE_TO_TYPED_GRAMMAR
 *   - REPLACE_WITH_PROPERTY_RESOLUTION
 *   - RETAIN_SAFETY_BOUNDARY
 *   - RETAIN_CERTIFIED_OPTIMIZATION
 *   - RETIRE
 */
import { FAST_PATH_RULE_MANIFEST } from '../../fastPath/ruleManifest.generated';
import { DATA_POINT_DEFINITIONS } from '../../dataPoint/dataPointCatalogue';
import { ABSENCE_REQUIREMENT_REGISTRY, CROSS_ENTITY_RELATION_REGISTRY, TIME_SERIES_REGISTRY } from '../../dataPoint/queryShapeRegistries';
import { ASK_OPERATION_DEFINITIONS } from '../../askOperationRegistry';
import { ASK_SHARED_SEMANTIC_LEXICON } from '../sharedSemanticLexicon';

export const ASK_RECOGNIZER_RETIREMENT_MANIFEST_VERSION = 'phase0-recognizer-retirement-1.0.0' as const;

export type RecognizerRetirementDisposition =
  | 'MIGRATE_TO_LEXICON'
  | 'MIGRATE_TO_TYPED_GRAMMAR'
  | 'REPLACE_WITH_PROPERTY_RESOLUTION'
  | 'RETAIN_SAFETY_BOUNDARY'
  | 'RETAIN_CERTIFIED_OPTIMIZATION'
  | 'RETIRE';

export type RecognizerSourceKind =
  | 'DETERMINISTIC_OPERATION_RULE'
  | 'DATA_POINT_ALIAS_CUE'
  | 'QUERY_TEMPLATE_NOUN'
  | 'SHAPE_789_PARSER'
  | 'SEMANTIC_ROUTER_VOCABULARY'
  | 'FALLBACK_EQUIVALENCE_TABLE'
  | 'HANDLER_LOCAL_VOCABULARY'
  | 'ENTITY_RESOLUTION_VOCABULARY'
  | 'FOLLOW_UP_PATTERN'
  | 'SAFETY_BOUNDARY_RECOGNIZER';

export type RecognizerMigrationStatus =
  | 'ACTIVE_GOVERNED_BOUNDARY'
  | 'MIGRATION_IN_PROGRESS_CO_GATED'
  | 'INVENTORIED_PENDING_WAVE_MIGRATION';

export interface RecognizerRetirementEntry {
  readonly recognizerId: string;
  readonly kind: RecognizerSourceKind;
  readonly sourceFile: string;
  readonly symbolOrSection: string;
  readonly description: string;
  readonly liveItemCount: number;
  readonly disposition: RecognizerRetirementDisposition;
  readonly owner: string;
  readonly successorIdentity: string;
  readonly parityFixtures: readonly string[];
  readonly collisionEvidence: string;
  readonly status: RecognizerMigrationStatus;
  readonly deletionCriterion: string;
}

const boundaryFastPathRules = FAST_PATH_RULE_MANIFEST.filter((rule) => {
  const def = ASK_OPERATION_DEFINITIONS[rule.operationId as keyof typeof ASK_OPERATION_DEFINITIONS];
  return def ? def.safetyClass.endsWith('_BOUNDARY') : false;
});

const domainFastPathRules = FAST_PATH_RULE_MANIFEST.filter((rule) => {
  const def = ASK_OPERATION_DEFINITIONS[rule.operationId as keyof typeof ASK_OPERATION_DEFINITIONS];
  return def ? !def.safetyClass.endsWith('_BOUNDARY') : true;
});

const totalDataPointAliases = DATA_POINT_DEFINITIONS.reduce((sum, point) => sum + point.aliases.length, 0);
const totalDataPointCues = DATA_POINT_DEFINITIONS.reduce((sum, point) => sum + (point.cues?.length ?? 0) + (point.unlessCues?.length ?? 0), 0);

export const ASK_RECOGNIZER_RETIREMENT_MANIFEST: readonly RecognizerRetirementEntry[] = Object.freeze([
  {
    recognizerId: 'recognizer.fast_path.safety_and_boundary_rules',
    kind: 'SAFETY_BOUNDARY_RECOGNIZER',
    sourceFile: 'src/services/ask/askOperationRegistry.ts',
    symbolOrSection: 'resolveAskOperation (safety/restricted/emergency/medical/legal/unsupported boundary DET_* rules)',
    description: 'Raw-message safety, emergency, legal/tax/medical advice refusal, and out-of-scope boundary rules.',
    liveItemCount: boundaryFastPathRules.length,
    disposition: 'RETAIN_SAFETY_BOUNDARY',
    owner: 'ask-safety-governance',
    successorIdentity: 'Raw-message safety gate & boundary operations (FR-ONT-8 / §6 Stage 0)',
    parityFixtures: ['tests/ask/askSafetyGate.test.js', 'tests/ask/askBoundaryRecognition.test.js'],
    collisionEvidence: 'Raw-message safety evaluation runs before semantic planning and cannot be bypassed by entity/job resolution.',
    status: 'ACTIVE_GOVERNED_BOUNDARY',
    deletionCriterion: 'Retained permanently as Stage 0 raw-message safety and restricted-request boundary (FR-ONT-8).',
  },
  {
    recognizerId: 'recognizer.fast_path.domain_operation_rules',
    kind: 'DETERMINISTIC_OPERATION_RULE',
    sourceFile: 'src/services/ask/askOperationRegistry.ts',
    symbolOrSection: 'resolveAskOperation (non-boundary DET_* operation rules in FAST_PATH_RULE_MANIFEST)',
    description: 'Sentence-level regex fast-path rules that directly return flat operation IDs.',
    liveItemCount: domainFastPathRules.length,
    disposition: 'MIGRATE_TO_TYPED_GRAMMAR',
    owner: 'ask-semantic-architecture',
    successorIdentity: 'src/services/ask/semantic/deterministicSemanticParser.ts + CapabilityRegistry semantic jobs (FR-PLAN-7, FR-ONT-4)',
    parityFixtures: ['tests/ask/crossDomainSemanticArchitecturePhase1.test.js', 'tests/ask/crossDomainSemanticArchitecturePhase0.test.js'],
    collisionEvidence: 'FAST_PATH_ADJACENCY in src/services/ask/fastPath/adjacencyManifest.generated.ts tracks cross-operation hard-negative collisions.',
    status: 'INVENTORIED_PENDING_WAVE_MIGRATION',
    deletionCriterion: 'Retire per domain wave once typed-grammar + CapabilityPlanner passes exact seeded and metamorphic parity for the operation family.',
  },
  {
    recognizerId: 'recognizer.data_point_catalogue.aliases_and_cues',
    kind: 'DATA_POINT_ALIAS_CUE',
    sourceFile: 'src/services/ask/dataPoint/dataPointCatalogue.ts',
    symbolOrSection: 'DATA_POINT_DEFINITIONS.aliases / cues / unlessCues / resolveDataPointIn',
    description: '107 approved data-point definitions with per-point homeowner alias phrases, entity cues, and exclusion cues.',
    liveItemCount: totalDataPointAliases + totalDataPointCues,
    disposition: 'MIGRATE_TO_LEXICON',
    owner: 'ask-data-catalogue',
    successorIdentity: 'src/services/ask/semantic/sharedSemanticLexicon.ts + FieldRegistry (FR-ONT-2, FR-ONT-6)',
    parityFixtures: ['tests/ask/dataPointRead.test.js'],
    collisionEvidence: 'Tie-detection in resolveDataPointIn returns null on equal-weight alias matches across distinct data points.',
    status: 'INVENTORIED_PENDING_WAVE_MIGRATION',
    deletionCriterion: 'Migrate reviewed aliases into FieldRegistry overrides feeding generateSharedSemanticLexicon() per domain wave.',
  },
  {
    recognizerId: 'recognizer.data_point_shapes_789.warranty_relation_grammar',
    kind: 'SHAPE_789_PARSER',
    sourceFile: 'src/services/ask/dataPoint/dataPointShapes789.ts',
    symbolOrSection: 'planShape789 (Shape 9: NO_WARRANTY / HAS_WARRANTY)',
    description: 'Cross-entity inventory-to-warranty relation matcher (ITEM_NOUN + warranty + NO_VALUE/outside/positive).',
    liveItemCount: CROSS_ENTITY_RELATION_REGISTRY.length + 4,
    disposition: 'MIGRATE_TO_TYPED_GRAMMAR',
    owner: 'ask-semantic-architecture',
    successorIdentity: 'parseDeterministicSemanticRequest + warrantyShapeGrammarAgreement + readTransitionalWarrantyLinks',
    parityFixtures: ['tests/ask/crossDomainSemanticArchitecturePhase1.test.js', 'tests/ask/dataPointShapes789.test.js'],
    collisionEvidence: 'Co-gated by warrantyShapeGrammarAgreement (src/services/ask/semantic/legacyGrammarAgreement.ts); coverage-gap wording explicitly excluded.',
    status: 'MIGRATION_IN_PROGRESS_CO_GATED',
    deletionCriterion: 'Remove Shape 9 regex branch once Phase 2A query compiler executes directly from SemanticRequestPlan.',
  },
  {
    recognizerId: 'recognizer.data_point_shapes_789.absence_and_time_series',
    kind: 'SHAPE_789_PARSER',
    sourceFile: 'src/services/ask/dataPoint/dataPointShapes789.ts',
    symbolOrSection: 'planShape789 (Shape 7 TIME_SERIES & Shape 8 ABSENCE / STALE_SERVICE)',
    description: 'Regex and noun-list parser for tax year-over-year comparisons, missing inventory scalar fields, and stale service windows.',
    liveItemCount: TIME_SERIES_REGISTRY.length + ABSENCE_REQUIREMENT_REGISTRY.length + 5,
    disposition: 'MIGRATE_TO_TYPED_GRAMMAR',
    owner: 'ask-semantic-architecture',
    successorIdentity: 'Typed-grammar COMPARE / MISSING_FIELD / temporal predicates in SemanticRequestPlan (FR-PLAN-7, FR-QUERY-1)',
    parityFixtures: ['tests/ask/dataPointShapes789.test.js'],
    collisionEvidence: 'Requires explicit ITEM_NOUN + NO_VALUE or tax trend cue; ambiguous multi-field hits return AMBIGUOUS.',
    status: 'INVENTORIED_PENDING_WAVE_MIGRATION',
    deletionCriterion: 'Retire when inventory absence and ownership-cost tax comparison waves enable typed-grammar compilation.',
  },
  {
    recognizerId: 'recognizer.data_point_reader.item_synonyms',
    kind: 'QUERY_TEMPLATE_NOUN',
    sourceFile: 'src/services/ask/dataPoint/dataPointReader.ts',
    symbolOrSection: 'SYNONYMS / matchItemsByName',
    description: 'Appliance name synonym table (refrigerator/fridge, air conditioner/ac, dishwasher, water heater, hvac/furnace/heat pump, microwave).',
    liveItemCount: 7,
    disposition: 'REPLACE_WITH_PROPERTY_RESOLUTION',
    owner: 'ask-semantic-architecture',
    successorIdentity: 'resolvePropertyEntityReference (src/services/ask/semantic/propertyEntityResolver.ts) + sharedSemanticLexicon',
    parityFixtures: ['tests/ask/dataPointRead.test.js', 'tests/ask/crossDomainSemanticArchitecturePhase1.test.js'],
    collisionEvidence: 'Token-subset matching and multi-match ambiguity return AMBIGUOUS / MULTIPLE_MATCHES.',
    status: 'INVENTORIED_PENDING_WAVE_MIGRATION',
    deletionCriterion: 'Replace with EntityRegistry resolver adapter + lexicon-backed alias matching in Phase 2A.',
  },
  {
    recognizerId: 'recognizer.semantic_embedding.synonym_groups',
    kind: 'SEMANTIC_ROUTER_VOCABULARY',
    sourceFile: 'src/services/ask/askSemanticEmbedding.ts',
    symbolOrSection: 'SEMANTIC_SYNONYM_GROUPS (local-synonym-subword-embedding-3.0)',
    description: '40 hashed concept synonym groups used by the local feature-hashing router, including group #8 that conflated coverage, insurance, and warranty.',
    liveItemCount: 40,
    disposition: 'MIGRATE_TO_LEXICON',
    owner: 'ask-semantic-architecture',
    successorIdentity: 'ASK_SHARED_SEMANTIC_LEXICON (src/services/ask/semantic/sharedSemanticLexicon.ts, FR-ONT-6)',
    parityFixtures: ['tests/ask/crossDomainSemanticArchitecturePhase1.test.js'],
    collisionEvidence: 'Group ["coverage", ["coverage", "protection", "protections", "insurance", "warranty"]] documented in FRD §17.2 item 3 as cross-domain conflation source.',
    status: 'INVENTORIED_PENDING_WAVE_MIGRATION',
    deletionCriterion: 'Retire ad-hoc concept groups once shared semantic lexicon and two-stage retrieval own vocabulary expansion.',
  },
  {
    recognizerId: 'recognizer.prompt_minimization.domain_equivalents',
    kind: 'FALLBACK_EQUIVALENCE_TABLE',
    sourceFile: 'src/services/ask/askPromptMinimization.ts',
    symbolOrSection: 'DOMAIN_EQUIVALENTS / GENERIC_QUESTION_TOKENS',
    description: '10 domain equivalence token buckets used to rank property facts for remote fallback synthesis (where insurance bucket mixes coverage, policy, premium, claim, and warranty).',
    liveItemCount: 10,
    disposition: 'RETIRE',
    owner: 'ask-semantic-architecture',
    successorIdentity: 'Stage-1 domain candidates + Registry-backed fact selection (FR-UND-2, FR-ONT-6)',
    parityFixtures: ['tests/ask/askRemoteFallbackTypedClaims.test.js'],
    collisionEvidence: 'Mixing insurance/claim/warranty in DOMAIN_EQUIVALENTS.insurance causes cross-domain candidate pollution (§17.2 item 3).',
    status: 'INVENTORIED_PENDING_WAVE_MIGRATION',
    deletionCriterion: 'Remove DOMAIN_EQUIVALENTS once remote fallback consumes domain-scoped receipts from SemanticRequestPlan.',
  },
  {
    recognizerId: 'recognizer.entity_resolution.regex_patterns',
    kind: 'ENTITY_RESOLUTION_VOCABULARY',
    sourceFile: 'src/services/ask/askEntityResolution.ts',
    symbolOrSection: 'ENTITY_PATTERNS (MAINTENANCE_TASK, INVENTORY_ITEM, QUOTE, DECISION_THREAD)',
    description: 'Hardcoded regex noun lists for detecting entity mentions in user prompts (e.g. refrigerator|fridge|washer|dryer|dishwasher|water heater|roof|boiler|furnace).',
    liveItemCount: 4,
    disposition: 'REPLACE_WITH_PROPERTY_RESOLUTION',
    owner: 'ask-semantic-architecture',
    successorIdentity: 'resolvePropertyEntityReference (src/services/ask/semantic/propertyEntityResolver.ts, FR-ENT-1..2)',
    parityFixtures: ['tests/ask/crossDomainSemanticArchitecturePhase1.test.js'],
    collisionEvidence: 'Regex allowlist misses any property item whose name is not in the 14 hardcoded nouns (§2 failure #4, §17.2 item 4).',
    status: 'INVENTORIED_PENDING_WAVE_MIGRATION',
    deletionCriterion: 'Replace with authorised property-record matching in EntityRegistry resolver adapters.',
  },
  {
    recognizerId: 'recognizer.follow_up_context.rewrite_patterns',
    kind: 'FOLLOW_UP_PATTERN',
    sourceFile: 'src/services/ask/askFollowUpContext.ts',
    symbolOrSection: 'CONVERSATIONAL_FILTER_LEAD / STATUS_FILTER_WORDS / ROOM_FILTER_PHRASE / ENTITY_CONTINUATION_PATTERN',
    description: 'Operation-specific sentence rewrite regexes and hardcoded 20-room allowlist for follow-up turns.',
    liveItemCount: 12,
    disposition: 'MIGRATE_TO_TYPED_GRAMMAR',
    owner: 'ask-semantic-architecture',
    successorIdentity: 'Semantic conversation-state delta refinement over prior SemanticRequestPlan (FR-ENT-3, FR-PLAN-6)',
    parityFixtures: ['tests/ask/askFollowUpContext.test.js'],
    collisionEvidence: 'Hardcoded 20-room regex misses custom property rooms ("sunroom", "mudroom", "workshop") and only supports allowlisted operations (§17.2 item 9).',
    status: 'INVENTORIED_PENDING_WAVE_MIGRATION',
    deletionCriterion: 'Retire sentence-concatenation rewrites once conversation state stores prior SemanticRequestPlan and resolved room/entity references.',
  },
  {
    recognizerId: 'recognizer.handlers.domain_intent_extractors',
    kind: 'HANDLER_LOCAL_VOCABULARY',
    sourceFile: 'src/services/ask/ask*Intent.ts & src/services/ask/handlers/*.handler.ts',
    symbolOrSection: 'askInventoryIntent, askMaintenanceIntent, askCoverageIntent, askOwnershipCostsIntent, askSellerPrepIntent, askStatusBoardIntent, warranties.handler.ts',
    description: 'Handler-local regexes parsing category filters, time windows ("within 60 days", "overdue"), and status flags directly from raw message strings.',
    liveItemCount: 18,
    disposition: 'MIGRATE_TO_TYPED_GRAMMAR',
    owner: 'ask-semantic-architecture',
    successorIdentity: 'SemanticRequestPlan facet fields (where, time, projection, subject, relations) + sharedSemanticLexicon',
    parityFixtures: ['tests/ask/crossDomainSemanticArchitecturePhase0.test.js'],
    collisionEvidence: 'Handler-local regexes diverge from router rules and cause silent filter drops when phrasing varies (§17.2 item 4).',
    status: 'INVENTORIED_PENDING_WAVE_MIGRATION',
    deletionCriterion: 'Remove handler raw-message regex parsing as each domain wave migrates to executing validated SemanticRequestPlan facets.',
  },
] as const);

const ALLOWED_DISPOSITIONS = new Set<RecognizerRetirementDisposition>([
  'MIGRATE_TO_LEXICON',
  'MIGRATE_TO_TYPED_GRAMMAR',
  'REPLACE_WITH_PROPERTY_RESOLUTION',
  'RETAIN_SAFETY_BOUNDARY',
  'RETAIN_CERTIFIED_OPTIMIZATION',
  'RETIRE',
]);

export function validateRecognizerRetirementManifest(): string[] {
  const issues: string[] = [];
  const seenIds = new Set<string>();

  for (const entry of ASK_RECOGNIZER_RETIREMENT_MANIFEST) {
    if (seenIds.has(entry.recognizerId)) {
      issues.push(`${entry.recognizerId}: duplicate recognizerId`);
    }
    seenIds.add(entry.recognizerId);

    if (!ALLOWED_DISPOSITIONS.has(entry.disposition)) {
      issues.push(`${entry.recognizerId}: invalid disposition ${entry.disposition}`);
    }
    if (entry.liveItemCount <= 0) {
      issues.push(`${entry.recognizerId}: liveItemCount must be > 0 (got ${entry.liveItemCount})`);
    }
    if (!entry.owner.trim() || !entry.successorIdentity.trim() || !entry.deletionCriterion.trim()) {
      issues.push(`${entry.recognizerId}: owner, successorIdentity, and deletionCriterion are required`);
    }
    if (entry.parityFixtures.length === 0) {
      issues.push(`${entry.recognizerId}: must declare at least one parity fixture`);
    }
  }

  // Verify that every FAST_PATH_RULE_MANIFEST entry is accounted for between boundary and domain rule buckets.
  const accountedFastPath = boundaryFastPathRules.length + domainFastPathRules.length;
  if (accountedFastPath !== FAST_PATH_RULE_MANIFEST.length) {
    issues.push(`FAST_PATH_RULE_MANIFEST count mismatch: ${accountedFastPath} accounted vs ${FAST_PATH_RULE_MANIFEST.length} total`);
  }

  // Verify shared semantic lexicon is non-empty and valid as successor target.
  if (ASK_SHARED_SEMANTIC_LEXICON.length === 0) {
    issues.push('ASK_SHARED_SEMANTIC_LEXICON is empty');
  }

  return issues;
}
