import type { AskOperationId } from '../ask/askOperationRegistry';
import { ASK_EXECUTION_STATUSES, type AskExecutionStatus, type AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import type { SkillConsumer, SkillDefinition, VersionedSkillReference } from './skill.contract';
import { getAskOperationDefinition } from '../ask/askOperationRegistry';
import { SKILL_DEFINITIONS } from './skillRegistry';
import { CAPITAL_PLANNING_SKILL_EVALUATION } from './capital-planning';
import { COVERAGE_SKILL_EVALUATION } from './coverage';
import { HOUSEHOLD_SKILL_EVALUATION } from './household';
import { OWNERSHIP_COST_SKILL_EVALUATION } from './ownership-cost';
import { PROPERTY_TAX_SKILL_EVALUATION } from './property-tax';
import { QUOTE_COMPARISON_SKILL_EVALUATION } from './quote-comparison';
import { RENOVATION_SKILL_EVALUATION } from './renovation';
import { SAVINGS_SKILL_EVALUATION } from './savings';
import { SELL_HOLD_RENT_SKILL_EVALUATION } from './sell-hold-rent';
import { SELLER_PREPARATION_SKILL_EVALUATION } from './seller-preparation';
import { BUYER_CLOSING_SKILL_EVALUATION } from './buyer-closing';
import { INCIDENT_CLAIM_SKILL_EVALUATION } from './incident-claim';
import { HOME_OPERATIONS_SKILL_EVALUATION } from './home-operations';

export type SkillRoutingFixtureMode = 'EXACT' | 'PARAPHRASED' | 'COLLOQUIAL' | 'MISSPELLED';
export type SkillContextFixtureState = 'KNOWN' | 'MISSING' | 'STALE' | 'CONFLICTING' | 'UNAUTHORIZED' | 'UNAVAILABLE';
export type SkillResolutionAmbiguityKind = 'ENTITY' | 'PROPERTY' | 'DECISION_THREAD';

export interface SkillEvaluationPackage {
  id: string;
  skillId: string;
  skillVersion: string;
  routingCases: readonly { mode: SkillRoutingFixtureMode; message: string; expectedOperationId: AskOperationId }[];
  operationCases: readonly { operationId: AskOperationId; expectedAdapter: VersionedSkillReference }[];
  ambiguityCases: readonly {
    message: string;
    candidateOperationIds?: readonly AskOperationId[];
    candidateSkillIds?: readonly string[];
    expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK';
  }[];
  policyCases: readonly { consumer: SkillConsumer; operationId: AskOperationId; allowed: boolean }[];
  contextCases: readonly { state: SkillContextFixtureState; expectedBehavior: 'READY' | 'CAPTURE_OR_BLOCK' | 'DISCLOSE_OR_BLOCK' | 'BLOCK' | 'DEGRADED_OR_BLOCK' }[];
  negativeCases: readonly { message: string; expectedBehavior: 'DO_NOT_SELECT_SKILL' }[];
  exclusionCases: readonly { message: string; expectedBehavior: 'DO_NOT_EXECUTE_SKILL' }[];
  resolutionAmbiguityCases: readonly {
    kind: SkillResolutionAmbiguityKind;
    message: string;
    expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK';
  }[];
  degradedModeCases: readonly { dependencyType: 'ADAPTER' | 'CONTEXT_PROVIDER'; dependency: VersionedSkillReference; expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' }[];
  expectedAdapters: readonly VersionedSkillReference[];
  prohibitedAdapters: readonly string[];
  expectedContextProviders: readonly VersionedSkillReference[];
  prohibitedContextProviders: readonly string[];
  expectedStatuses: readonly AskExecutionStatus[];
  expectedBlockTypes: readonly AskPresentationBlock['type'][];
  expectedCanonicalCalls: readonly VersionedSkillReference[];
  prohibitedCanonicalCalls: readonly string[];
  modelDisabledCase: { message: string; expectedOperationId: AskOperationId };
  continuationCase: { message: string; sourceOperationId: AskOperationId; expectedOperationId: AskOperationId };
  handoffCase: { suggestedNextSkillId: string; suggestedGoal: string; reasonCodes: readonly string[] };
  performanceCase: { message: string; maxSkillCandidates: number; maxOperationCandidates: number; smokeCeilingMs: number };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const CONTEXT_CASES: SkillEvaluationPackage['contextCases'] = deepFreeze([
  { state: 'KNOWN', expectedBehavior: 'READY' },
  { state: 'MISSING', expectedBehavior: 'CAPTURE_OR_BLOCK' },
  { state: 'STALE', expectedBehavior: 'DISCLOSE_OR_BLOCK' },
  { state: 'CONFLICTING', expectedBehavior: 'BLOCK' },
  { state: 'UNAUTHORIZED', expectedBehavior: 'BLOCK' },
  { state: 'UNAVAILABLE', expectedBehavior: 'DEGRADED_OR_BLOCK' },
]);

const RESOLUTION_AMBIGUITY_CASES: SkillEvaluationPackage['resolutionAmbiguityCases'] = deepFreeze([
  { kind: 'ENTITY', message: 'Continue this request for the matching item', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
]);

function operationCases(skill: SkillDefinition): SkillEvaluationPackage['operationCases'] {
  return Object.freeze(skill.operations.map((operation) => Object.freeze({
    operationId: operation.operationId,
    expectedAdapter: Object.freeze({
      id: getAskOperationDefinition(operation.operationId).adapterKey,
      version: skill.allowedAdapters.find((adapter) => adapter.id === getAskOperationDefinition(operation.operationId).adapterKey)!.version,
    }),
  })));
}

function evaluationPackage(
  skill: SkillDefinition,
  input: Omit<SkillEvaluationPackage, 'id' | 'skillId' | 'skillVersion' | 'operationCases' | 'contextCases' | 'resolutionAmbiguityCases' | 'expectedAdapters' | 'expectedContextProviders' | 'expectedBlockTypes' | 'expectedCanonicalCalls' | 'prohibitedCanonicalCalls'>,
): SkillEvaluationPackage {
  return deepFreeze({
    ...input,
    id: skill.evaluationSuite,
    skillId: skill.id,
    skillVersion: skill.version,
    operationCases: operationCases(skill),
    contextCases: CONTEXT_CASES,
    resolutionAmbiguityCases: RESOLUTION_AMBIGUITY_CASES,
    expectedAdapters: Object.freeze(skill.allowedAdapters.map((adapter) => Object.freeze({ ...adapter }))),
    expectedContextProviders: Object.freeze([...skill.requiredContextProviders, ...skill.optionalContextProviders].map((provider) => Object.freeze({ ...provider }))),
    expectedBlockTypes: Object.freeze([...new Set(skill.allowedResultBlocks)].sort()),
    expectedCanonicalCalls: Object.freeze(skill.allowedAdapters.map((adapter) => Object.freeze({ ...adapter }))),
    prohibitedCanonicalCalls: Object.freeze([...input.prohibitedAdapters]),
  });
}

const maintenance = SKILL_DEFINITIONS.maintenance;
const repairReplace = SKILL_DEFINITIONS['repair-replace'];
const refinance = SKILL_DEFINITIONS.refinance;
const propertyRecord = SKILL_DEFINITIONS['property-record'];

export const SKILL_EVALUATION_PACKAGES: Readonly<Record<string, SkillEvaluationPackage>> = Object.freeze({
  [CAPITAL_PLANNING_SKILL_EVALUATION.id]: CAPITAL_PLANNING_SKILL_EVALUATION,
  [COVERAGE_SKILL_EVALUATION.id]: COVERAGE_SKILL_EVALUATION,
  [HOUSEHOLD_SKILL_EVALUATION.id]: HOUSEHOLD_SKILL_EVALUATION,
  [OWNERSHIP_COST_SKILL_EVALUATION.id]: OWNERSHIP_COST_SKILL_EVALUATION,
  [PROPERTY_TAX_SKILL_EVALUATION.id]: PROPERTY_TAX_SKILL_EVALUATION,
  [QUOTE_COMPARISON_SKILL_EVALUATION.id]: QUOTE_COMPARISON_SKILL_EVALUATION,
  [RENOVATION_SKILL_EVALUATION.id]: RENOVATION_SKILL_EVALUATION,
  [SAVINGS_SKILL_EVALUATION.id]: SAVINGS_SKILL_EVALUATION,
  [SELL_HOLD_RENT_SKILL_EVALUATION.id]: SELL_HOLD_RENT_SKILL_EVALUATION,
  [SELLER_PREPARATION_SKILL_EVALUATION.id]: SELLER_PREPARATION_SKILL_EVALUATION,
  [BUYER_CLOSING_SKILL_EVALUATION.id]: BUYER_CLOSING_SKILL_EVALUATION,
  [INCIDENT_CLAIM_SKILL_EVALUATION.id]: INCIDENT_CLAIM_SKILL_EVALUATION,
  [HOME_OPERATIONS_SKILL_EVALUATION.id]: HOME_OPERATIONS_SKILL_EVALUATION,
  [maintenance.evaluationSuite]: evaluationPackage(maintenance, {
    routingCases: [
      { mode: 'EXACT', message: 'What maintenance is overdue?', expectedOperationId: 'MAINTENANCE_STATUS' },
      { mode: 'EXACT', message: 'What seasonal tasks are pending?', expectedOperationId: 'MAINTENANCE_STATUS' },
      { mode: 'PARAPHRASED', message: 'Create a maintenance task to clean gutters', expectedOperationId: 'MAINTENANCE_TASK_CREATE' },
      { mode: 'COLLOQUIAL', message: 'Mark the gutter cleaning task complete', expectedOperationId: 'MAINTENANCE_TASK_COMPLETE' },
      { mode: 'MISSPELLED', message: 'What maintenence is overdue?', expectedOperationId: 'MAINTENANCE_STATUS' },
    ],
    ambiguityCases: [{ message: 'Help with my maintenance reminders and service schedule', candidateOperationIds: ['MAINTENANCE_STATUS', 'HOME_DEADLINE_MONITOR'], expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' }],
    policyCases: [
      { consumer: 'ASK', operationId: 'MAINTENANCE_STATUS', allowed: true },
      { consumer: 'PROACTIVE', operationId: 'MAINTENANCE_STATUS', allowed: false },
    ],
    negativeCases: [{ message: 'Should I refinance my mortgage?', expectedBehavior: 'DO_NOT_SELECT_SKILL' }],
    exclusionCases: [{ message: 'Diagnose whether my furnace is legally safe to operate', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' }],
    degradedModeCases: [{ dependencyType: 'CONTEXT_PROVIDER', dependency: maintenance.requiredContextProviders[0], expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' }],
    prohibitedAdapters: ['refinance.analysis'],
    prohibitedContextProviders: ['undeclared.financial-context'],
    expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS', 'NEEDS_CONFIRMATION', 'COMPLETED'],
    modelDisabledCase: { message: 'What maintenance is overdue?', expectedOperationId: 'MAINTENANCE_STATUS' },
    continuationCase: { message: 'Now complete it', sourceOperationId: 'MAINTENANCE_STATUS', expectedOperationId: 'MAINTENANCE_TASK_COMPLETE' },
    handoffCase: { suggestedNextSkillId: 'repair-replace', suggestedGoal: 'analyze-repair-or-replace', reasonCodes: ['AGING_ITEM_NEEDS_DECISION'] },
    performanceCase: { message: 'What maintenance is overdue?', maxSkillCandidates: 10, maxOperationCandidates: 3, smokeCeilingMs: 100 },
  }),
  [repairReplace.evaluationSuite]: evaluationPackage(repairReplace, {
    routingCases: [
      { mode: 'EXACT', message: 'Should I repair or replace my furnace?', expectedOperationId: 'HVAC_DECISION_START' },
      { mode: 'PARAPHRASED', message: 'Should I repair or replace my refrigerator?', expectedOperationId: 'REPLACEMENT_GUIDANCE' },
      { mode: 'COLLOQUIAL', message: 'Should I fix or replace my refrigerator?', expectedOperationId: 'REPLACEMENT_GUIDANCE' },
      { mode: 'MISSPELLED', message: 'Should I repair or replce my aging appliance?', expectedOperationId: 'REPLACEMENT_GUIDANCE' },
    ],
    ambiguityCases: [{ message: 'Help with my repair or replace decision', candidateOperationIds: ['REPLACEMENT_GUIDANCE', 'HVAC_DECISION_START'], expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' }],
    policyCases: [
      { consumer: 'ASK', operationId: 'REPLACEMENT_GUIDANCE', allowed: true },
      { consumer: 'HOME_ACTIONS', operationId: 'REPLACEMENT_GUIDANCE', allowed: false },
    ],
    negativeCases: [{ message: 'Show my appliance inventory without analyzing it', expectedBehavior: 'DO_NOT_SELECT_SKILL' }],
    exclusionCases: [{ message: 'Guarantee that repairing this system is structurally safe', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' }],
    degradedModeCases: [{ dependencyType: 'ADAPTER', dependency: repairReplace.allowedAdapters[0], expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' }],
    prohibitedAdapters: ['refinance.analysis'],
    prohibitedContextProviders: ['undeclared.mortgage-context'],
    expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS', 'NEEDS_CLARIFICATION'],
    modelDisabledCase: { message: 'Should I repair or replace my furnace?', expectedOperationId: 'HVAC_DECISION_START' },
    continuationCase: { message: 'Continue that decision', sourceOperationId: 'HVAC_DECISION_START', expectedOperationId: 'HVAC_DECISION_CONTINUE' },
    handoffCase: { suggestedNextSkillId: 'maintenance', suggestedGoal: 'create-maintenance-task', reasonCodes: ['DECISION_REQUIRES_FOLLOW_UP_WORK'] },
    performanceCase: { message: 'Should I repair or replace my refrigerator?', maxSkillCandidates: 10, maxOperationCandidates: 3, smokeCeilingMs: 100 },
  }),
  [refinance.evaluationSuite]: evaluationPackage(refinance, {
    routingCases: [
      { mode: 'EXACT', message: 'Should I refinance now?', expectedOperationId: 'REFINANCE_ANALYSIS' },
      { mode: 'PARAPHRASED', message: 'Alert me when mortgage rates drop below 5 percent', expectedOperationId: 'REFINANCE_RATE_MONITOR' },
      { mode: 'COLLOQUIAL', message: 'Is refinancing worth it now?', expectedOperationId: 'REFINANCE_ANALYSIS' },
      { mode: 'MISSPELLED', message: 'Should I refinance my morgage?', expectedOperationId: 'REFINANCE_ANALYSIS' },
    ],
    ambiguityCases: [{ message: 'Help with refinancing and mortgage rate alerts', candidateOperationIds: ['REFINANCE_ANALYSIS', 'REFINANCE_RATE_MONITOR'], expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' }],
    policyCases: [
      { consumer: 'ASK', operationId: 'REFINANCE_ANALYSIS', allowed: true },
      { consumer: 'PROACTIVE', operationId: 'REFINANCE_ANALYSIS', allowed: false },
    ],
    negativeCases: [{ message: 'Tell me which lender will approve me', expectedBehavior: 'DO_NOT_SELECT_SKILL' }],
    exclusionCases: [{ message: 'Submit a refinance application to a lender for me', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' }],
    degradedModeCases: [{ dependencyType: 'ADAPTER', dependency: refinance.allowedAdapters[0], expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' }],
    prohibitedAdapters: ['maintenance.create'],
    prohibitedContextProviders: ['undeclared.credit-report'],
    expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS', 'NEEDS_CONFIRMATION', 'COMPLETED'],
    modelDisabledCase: { message: 'Should I refinance now?', expectedOperationId: 'REFINANCE_ANALYSIS' },
    continuationCase: { message: 'Use that rate for the monitor', sourceOperationId: 'REFINANCE_ANALYSIS', expectedOperationId: 'REFINANCE_RATE_MONITOR' },
    handoffCase: { suggestedNextSkillId: 'property-record', suggestedGoal: 'summarize-property-record', reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'] },
    performanceCase: { message: 'Should I refinance now?', maxSkillCandidates: 10, maxOperationCandidates: 3, smokeCeilingMs: 100 },
  }),
  [propertyRecord.evaluationSuite]: evaluationPackage(propertyRecord, {
    routingCases: [
      { mode: 'EXACT', message: 'Summarize my home record', expectedOperationId: 'PROPERTY_SUMMARY' },
      { mode: 'PARAPHRASED', message: 'Show my appliance inventory', expectedOperationId: 'INVENTORY_LOOKUP' },
      { mode: 'COLLOQUIAL', message: 'Are there any pending details to be filled for the home?', expectedOperationId: 'PROPERTY_SUMMARY' },
      { mode: 'MISSPELLED', message: 'Summarize my property recrod', expectedOperationId: 'PROPERTY_SUMMARY' },
    ],
    ambiguityCases: [{ message: 'Show my home record and item details', candidateOperationIds: ['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP'], expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' }],
    policyCases: [
      { consumer: 'HOME_ACTIONS', operationId: 'PROPERTY_SUMMARY', allowed: true },
      { consumer: 'HOME_ACTIONS', operationId: 'INVENTORY_LOOKUP', allowed: false },
    ],
    negativeCases: [{ message: 'Prove this house has no electrical hazards', expectedBehavior: 'DO_NOT_SELECT_SKILL' }],
    exclusionCases: [{ message: 'Infer restricted facts that are missing from my property record', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' }],
    degradedModeCases: [{ dependencyType: 'ADAPTER', dependency: propertyRecord.allowedAdapters[0], expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' }],
    prohibitedAdapters: ['maintenance.create'],
    prohibitedContextProviders: ['undeclared.document-corpus'],
    expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS', 'NEEDS_ENTITY'],
    modelDisabledCase: { message: 'Summarize my home record', expectedOperationId: 'PROPERTY_SUMMARY' },
    continuationCase: { message: 'Show the items from that record', sourceOperationId: 'PROPERTY_SUMMARY', expectedOperationId: 'INVENTORY_LOOKUP' },
    handoffCase: { suggestedNextSkillId: 'maintenance', suggestedGoal: 'understand-maintenance-status', reasonCodes: ['HOME_RECORD_REVIEWED'] },
    performanceCase: { message: 'Summarize my home record', maxSkillCandidates: 10, maxOperationCandidates: 3, smokeCeilingMs: 100 },
  }),
});

function refs(values: readonly VersionedSkillReference[]): string[] {
  return values.map((value) => `${value.id}@${value.version}`).sort();
}

export function validateSkillEvaluationPackages(
  definitions: Readonly<Record<string, SkillDefinition>> = SKILL_DEFINITIONS,
  packages: Readonly<Record<string, SkillEvaluationPackage>> = SKILL_EVALUATION_PACKAGES,
): string[] {
  const issues: string[] = [];
  const contextStates = new Set<SkillContextFixtureState>(['KNOWN', 'MISSING', 'STALE', 'CONFLICTING', 'UNAUTHORIZED', 'UNAVAILABLE']);
  const routingModes = new Set<SkillRoutingFixtureMode>(['EXACT', 'PARAPHRASED', 'COLLOQUIAL', 'MISSPELLED']);
  const ambiguityKinds = new Set<SkillResolutionAmbiguityKind>(['ENTITY', 'PROPERTY', 'DECISION_THREAD']);
  const validStatuses = new Set<AskExecutionStatus>(ASK_EXECUTION_STATUSES);
  for (const skill of Object.values(definitions)) {
    const suite = packages[skill.evaluationSuite];
    if (!suite) {
      issues.push(`${skill.id}: missing evaluation package ${skill.evaluationSuite}`);
      continue;
    }
    if (suite.id !== skill.evaluationSuite || suite.skillId !== skill.id || suite.skillVersion !== skill.version) issues.push(`${skill.id}: evaluation package identity mismatch`);
    const skillOperations = new Set(skill.operations.map((operation) => operation.operationId));
    const coveredOperations = new Set(suite.operationCases.map((fixture) => fixture.operationId));
    for (const operationId of skillOperations) if (!coveredOperations.has(operationId)) issues.push(`${skill.id}: operation ${operationId} lacks an evaluation case`);
    for (const fixture of [...suite.routingCases, suite.modelDisabledCase]) if (!skillOperations.has(fixture.expectedOperationId)) issues.push(`${skill.id}: evaluation references foreign operation ${fixture.expectedOperationId}`);
    for (const fixture of suite.operationCases) {
      const operation = skill.operations.find((candidate) => candidate.operationId === fixture.operationId);
      const adapter = skill.allowedAdapters.find((candidate) => candidate.id === getAskOperationDefinition(fixture.operationId).adapterKey);
      if (!operation || !adapter || fixture.expectedAdapter.id !== adapter.id || fixture.expectedAdapter.version !== adapter.version) issues.push(`${skill.id}: operation ${fixture.operationId} evaluation adapter mismatch`);
    }
    const observedModes = new Set(suite.routingCases.map((fixture) => fixture.mode));
    for (const mode of routingModes) if (!observedModes.has(mode)) issues.push(`${skill.id}: missing ${mode.toLowerCase()} routing case`);
    const observedContext = new Set(suite.contextCases.map((fixture) => fixture.state));
    for (const state of contextStates) if (!observedContext.has(state)) issues.push(`${skill.id}: missing ${state.toLowerCase()} context case`);
    if (!suite.ambiguityCases.length || !suite.negativeCases.length || !suite.exclusionCases.length || !suite.policyCases.length || !suite.degradedModeCases.length) issues.push(`${skill.id}: incomplete ambiguity, negative, exclusion, policy, or degraded evaluation coverage`);
    const observedAmbiguityKinds = new Set(suite.resolutionAmbiguityCases.map((fixture) => fixture.kind));
    for (const kind of ambiguityKinds) if (!observedAmbiguityKinds.has(kind)) issues.push(`${skill.id}: missing ${kind.toLowerCase()} ambiguity case`);
    for (const fixture of suite.ambiguityCases) {
      const validOperations = (fixture.candidateOperationIds?.length ?? 0) >= 2
        && fixture.candidateOperationIds!.every((operationId) => skillOperations.has(operationId));
      const validSkills = (fixture.candidateSkillIds?.length ?? 0) >= 2
        && fixture.candidateSkillIds!.includes(skill.id)
        && fixture.candidateSkillIds!.every((skillId) => Boolean(definitions[skillId]));
      if (!validOperations && !validSkills) issues.push(`${skill.id}: invalid ambiguity candidates`);
    }
    for (const fixture of suite.policyCases) {
      const declared = skill.consumerPolicy.find((policy) => policy.consumer === fixture.consumer)?.operations.includes(fixture.operationId) ?? false;
      if (!skillOperations.has(fixture.operationId) || declared !== fixture.allowed) issues.push(`${skill.id}: policy evaluation mismatch for ${fixture.consumer}/${fixture.operationId}`);
    }
    if (JSON.stringify(refs(suite.expectedAdapters)) !== JSON.stringify(refs(skill.allowedAdapters))) issues.push(`${skill.id}: expected adapter coverage differs from manifest`);
    if (JSON.stringify(refs(suite.expectedCanonicalCalls)) !== JSON.stringify(refs(skill.allowedAdapters))) issues.push(`${skill.id}: expected canonical call coverage differs from manifest`);
    const providers = [...skill.requiredContextProviders, ...skill.optionalContextProviders];
    if (JSON.stringify(refs(suite.expectedContextProviders)) !== JSON.stringify(refs(providers))) issues.push(`${skill.id}: expected provider coverage differs from manifest`);
    if (suite.prohibitedAdapters.some((id) => skill.allowedAdapters.some((adapter) => adapter.id === id))) issues.push(`${skill.id}: prohibited adapter is allowed by manifest`);
    if (suite.prohibitedCanonicalCalls.some((id) => skill.allowedAdapters.some((adapter) => adapter.id === id))) issues.push(`${skill.id}: prohibited canonical call is allowed by manifest`);
    if (suite.prohibitedContextProviders.some((id) => providers.some((provider) => provider.id === id))) issues.push(`${skill.id}: prohibited provider is allowed by manifest`);
    if (!suite.expectedStatuses.length || suite.expectedStatuses.some((status) => !validStatuses.has(status))) issues.push(`${skill.id}: invalid expected status coverage`);
    if (JSON.stringify([...suite.expectedBlockTypes].sort()) !== JSON.stringify([...skill.allowedResultBlocks].sort())) issues.push(`${skill.id}: expected block coverage differs from manifest`);
    if (!skillOperations.has(suite.continuationCase.sourceOperationId) || !skillOperations.has(suite.continuationCase.expectedOperationId) || !suite.continuationCase.message.trim()) issues.push(`${skill.id}: invalid continuation evaluation`);
    const handoffTarget = definitions[suite.handoffCase.suggestedNextSkillId];
    if (!handoffTarget) issues.push(`${skill.id}: handoff target ${suite.handoffCase.suggestedNextSkillId} is not registered`);
    else if (!handoffTarget.supportedGoals.includes(suite.handoffCase.suggestedGoal) || !suite.handoffCase.reasonCodes.length) issues.push(`${skill.id}: handoff evaluation is not supported by the target Skill`);
    if (suite.performanceCase.maxSkillCandidates > 10 || suite.performanceCase.maxOperationCandidates > 3 || suite.performanceCase.smokeCeilingMs > 5_000) issues.push(`${skill.id}: unbounded performance fixture`);
  }
  for (const [id, suite] of Object.entries(packages)) {
    if (id !== suite.id) issues.push(`${id}: evaluation package key mismatch`);
    if (!definitions[suite.skillId]) issues.push(`${id}: evaluation package references unknown Skill ${suite.skillId}`);
  }
  return issues.sort();
}
