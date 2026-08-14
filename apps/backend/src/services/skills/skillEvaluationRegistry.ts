import type { AskOperationId } from '../ask/askOperationRegistry';
import type { SkillConsumer, SkillDefinition, VersionedSkillReference } from './skill.contract';
import { getAskOperationDefinition } from '../ask/askOperationRegistry';
import { SKILL_DEFINITIONS } from './skillRegistry';

export type SkillRoutingFixtureMode = 'EXACT' | 'PARAPHRASED' | 'COLLOQUIAL';
export type SkillContextFixtureState = 'KNOWN' | 'MISSING' | 'STALE' | 'CONFLICTING' | 'UNAUTHORIZED' | 'UNAVAILABLE';

export interface SkillEvaluationPackage {
  id: string;
  skillId: string;
  skillVersion: string;
  routingCases: readonly { mode: SkillRoutingFixtureMode; message: string; expectedOperationId: AskOperationId }[];
  operationCases: readonly { operationId: AskOperationId; expectedAdapter: VersionedSkillReference }[];
  ambiguityCases: readonly { message: string; candidateOperationIds: readonly AskOperationId[]; expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' }[];
  policyCases: readonly { consumer: SkillConsumer; operationId: AskOperationId; allowed: boolean }[];
  contextCases: readonly { state: SkillContextFixtureState; expectedBehavior: 'READY' | 'CAPTURE_OR_BLOCK' | 'DISCLOSE_OR_BLOCK' | 'BLOCK' | 'DEGRADED_OR_BLOCK' }[];
  negativeCases: readonly { message: string; expectedBehavior: 'DO_NOT_SELECT_SKILL' }[];
  degradedModeCases: readonly { dependencyType: 'ADAPTER' | 'CONTEXT_PROVIDER'; dependency: VersionedSkillReference; expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' }[];
  expectedAdapters: readonly VersionedSkillReference[];
  prohibitedAdapters: readonly string[];
  expectedContextProviders: readonly VersionedSkillReference[];
  prohibitedContextProviders: readonly string[];
  modelDisabledCase: { message: string; expectedOperationId: AskOperationId };
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
  input: Omit<SkillEvaluationPackage, 'id' | 'skillId' | 'skillVersion' | 'operationCases' | 'contextCases' | 'expectedAdapters' | 'expectedContextProviders'>,
): SkillEvaluationPackage {
  return deepFreeze({
    ...input,
    id: skill.evaluationSuite,
    skillId: skill.id,
    skillVersion: skill.version,
    operationCases: operationCases(skill),
    contextCases: CONTEXT_CASES,
    expectedAdapters: Object.freeze(skill.allowedAdapters.map((adapter) => Object.freeze({ ...adapter }))),
    expectedContextProviders: Object.freeze([...skill.requiredContextProviders, ...skill.optionalContextProviders].map((provider) => Object.freeze({ ...provider }))),
  });
}

const maintenance = SKILL_DEFINITIONS.maintenance;
const repairReplace = SKILL_DEFINITIONS['repair-replace'];
const refinance = SKILL_DEFINITIONS.refinance;
const propertyRecord = SKILL_DEFINITIONS['property-record'];

export const SKILL_EVALUATION_PACKAGES: Readonly<Record<string, SkillEvaluationPackage>> = Object.freeze({
  [maintenance.evaluationSuite]: evaluationPackage(maintenance, {
    routingCases: [
      { mode: 'EXACT', message: 'What maintenance is overdue?', expectedOperationId: 'MAINTENANCE_STATUS' },
      { mode: 'PARAPHRASED', message: 'Create a maintenance task to clean gutters', expectedOperationId: 'MAINTENANCE_TASK_CREATE' },
      { mode: 'COLLOQUIAL', message: 'Mark the gutter cleaning task complete', expectedOperationId: 'MAINTENANCE_TASK_COMPLETE' },
    ],
    ambiguityCases: [{ message: 'Help with my maintenance reminders and service schedule', candidateOperationIds: ['MAINTENANCE_STATUS', 'HOME_DEADLINE_MONITOR'], expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' }],
    policyCases: [
      { consumer: 'ASK', operationId: 'MAINTENANCE_STATUS', allowed: true },
      { consumer: 'PROACTIVE', operationId: 'MAINTENANCE_STATUS', allowed: false },
    ],
    negativeCases: [{ message: 'Should I refinance my mortgage?', expectedBehavior: 'DO_NOT_SELECT_SKILL' }],
    degradedModeCases: [{ dependencyType: 'CONTEXT_PROVIDER', dependency: maintenance.requiredContextProviders[0], expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' }],
    prohibitedAdapters: ['refinance.analysis'],
    prohibitedContextProviders: ['undeclared.financial-context'],
    modelDisabledCase: { message: 'What maintenance is overdue?', expectedOperationId: 'MAINTENANCE_STATUS' },
    handoffCase: { suggestedNextSkillId: 'repair-replace', suggestedGoal: 'analyze-repair-or-replace', reasonCodes: ['AGING_ITEM_NEEDS_DECISION'] },
    performanceCase: { message: 'What maintenance is overdue?', maxSkillCandidates: 10, maxOperationCandidates: 3, smokeCeilingMs: 100 },
  }),
  [repairReplace.evaluationSuite]: evaluationPackage(repairReplace, {
    routingCases: [
      { mode: 'EXACT', message: 'Should I repair or replace my furnace?', expectedOperationId: 'HVAC_DECISION_START' },
      { mode: 'PARAPHRASED', message: 'Should I repair or replace my refrigerator?', expectedOperationId: 'REPLACEMENT_GUIDANCE' },
      { mode: 'COLLOQUIAL', message: 'Should I fix or replace my refrigerator?', expectedOperationId: 'REPLACEMENT_GUIDANCE' },
    ],
    ambiguityCases: [{ message: 'Help with my repair or replace decision', candidateOperationIds: ['REPLACEMENT_GUIDANCE', 'HVAC_DECISION_START'], expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' }],
    policyCases: [
      { consumer: 'ASK', operationId: 'REPLACEMENT_GUIDANCE', allowed: true },
      { consumer: 'HOME_ACTIONS', operationId: 'REPLACEMENT_GUIDANCE', allowed: false },
    ],
    negativeCases: [{ message: 'Show my appliance inventory without analyzing it', expectedBehavior: 'DO_NOT_SELECT_SKILL' }],
    degradedModeCases: [{ dependencyType: 'ADAPTER', dependency: repairReplace.allowedAdapters[0], expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' }],
    prohibitedAdapters: ['refinance.analysis'],
    prohibitedContextProviders: ['undeclared.mortgage-context'],
    modelDisabledCase: { message: 'Should I repair or replace my furnace?', expectedOperationId: 'HVAC_DECISION_START' },
    handoffCase: { suggestedNextSkillId: 'maintenance', suggestedGoal: 'create-maintenance-task', reasonCodes: ['DECISION_REQUIRES_FOLLOW_UP_WORK'] },
    performanceCase: { message: 'Should I repair or replace my refrigerator?', maxSkillCandidates: 10, maxOperationCandidates: 3, smokeCeilingMs: 100 },
  }),
  [refinance.evaluationSuite]: evaluationPackage(refinance, {
    routingCases: [
      { mode: 'EXACT', message: 'Should I refinance now?', expectedOperationId: 'REFINANCE_ANALYSIS' },
      { mode: 'PARAPHRASED', message: 'Alert me when mortgage rates drop below 5 percent', expectedOperationId: 'REFINANCE_RATE_MONITOR' },
      { mode: 'COLLOQUIAL', message: 'Is refinancing worth it now?', expectedOperationId: 'REFINANCE_ANALYSIS' },
    ],
    ambiguityCases: [{ message: 'Help with refinancing and mortgage rate alerts', candidateOperationIds: ['REFINANCE_ANALYSIS', 'REFINANCE_RATE_MONITOR'], expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' }],
    policyCases: [
      { consumer: 'ASK', operationId: 'REFINANCE_ANALYSIS', allowed: true },
      { consumer: 'PROACTIVE', operationId: 'REFINANCE_ANALYSIS', allowed: false },
    ],
    negativeCases: [{ message: 'Tell me which lender will approve me', expectedBehavior: 'DO_NOT_SELECT_SKILL' }],
    degradedModeCases: [{ dependencyType: 'ADAPTER', dependency: refinance.allowedAdapters[0], expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' }],
    prohibitedAdapters: ['maintenance.create'],
    prohibitedContextProviders: ['undeclared.credit-report'],
    modelDisabledCase: { message: 'Should I refinance now?', expectedOperationId: 'REFINANCE_ANALYSIS' },
    handoffCase: { suggestedNextSkillId: 'property-record', suggestedGoal: 'summarize-property-record', reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'] },
    performanceCase: { message: 'Should I refinance now?', maxSkillCandidates: 10, maxOperationCandidates: 3, smokeCeilingMs: 100 },
  }),
  [propertyRecord.evaluationSuite]: evaluationPackage(propertyRecord, {
    routingCases: [
      { mode: 'EXACT', message: 'Summarize my home record', expectedOperationId: 'PROPERTY_SUMMARY' },
      { mode: 'PARAPHRASED', message: 'Show my appliance inventory', expectedOperationId: 'INVENTORY_LOOKUP' },
      { mode: 'COLLOQUIAL', message: 'What do you know about my home?', expectedOperationId: 'PROPERTY_SUMMARY' },
    ],
    ambiguityCases: [{ message: 'Show my home record and item details', candidateOperationIds: ['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP'], expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' }],
    policyCases: [
      { consumer: 'HOME_ACTIONS', operationId: 'PROPERTY_SUMMARY', allowed: true },
      { consumer: 'HOME_ACTIONS', operationId: 'INVENTORY_LOOKUP', allowed: false },
    ],
    negativeCases: [{ message: 'Prove this house has no electrical hazards', expectedBehavior: 'DO_NOT_SELECT_SKILL' }],
    degradedModeCases: [{ dependencyType: 'ADAPTER', dependency: propertyRecord.allowedAdapters[0], expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' }],
    prohibitedAdapters: ['maintenance.create'],
    prohibitedContextProviders: ['undeclared.document-corpus'],
    modelDisabledCase: { message: 'Summarize my home record', expectedOperationId: 'PROPERTY_SUMMARY' },
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
  const routingModes = new Set<SkillRoutingFixtureMode>(['EXACT', 'PARAPHRASED', 'COLLOQUIAL']);
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
    if (!suite.ambiguityCases.length || !suite.negativeCases.length || !suite.policyCases.length || !suite.degradedModeCases.length) issues.push(`${skill.id}: incomplete ambiguity, negative, policy, or degraded evaluation coverage`);
    for (const fixture of suite.ambiguityCases) {
      if (fixture.candidateOperationIds.length < 2 || fixture.candidateOperationIds.some((operationId) => !skillOperations.has(operationId))) issues.push(`${skill.id}: invalid ambiguity operation candidates`);
    }
    for (const fixture of suite.policyCases) {
      const declared = skill.consumerPolicy.find((policy) => policy.consumer === fixture.consumer)?.operations.includes(fixture.operationId) ?? false;
      if (!skillOperations.has(fixture.operationId) || declared !== fixture.allowed) issues.push(`${skill.id}: policy evaluation mismatch for ${fixture.consumer}/${fixture.operationId}`);
    }
    if (JSON.stringify(refs(suite.expectedAdapters)) !== JSON.stringify(refs(skill.allowedAdapters))) issues.push(`${skill.id}: expected adapter coverage differs from manifest`);
    const providers = [...skill.requiredContextProviders, ...skill.optionalContextProviders];
    if (JSON.stringify(refs(suite.expectedContextProviders)) !== JSON.stringify(refs(providers))) issues.push(`${skill.id}: expected provider coverage differs from manifest`);
    if (suite.prohibitedAdapters.some((id) => skill.allowedAdapters.some((adapter) => adapter.id === id))) issues.push(`${skill.id}: prohibited adapter is allowed by manifest`);
    if (suite.prohibitedContextProviders.some((id) => providers.some((provider) => provider.id === id))) issues.push(`${skill.id}: prohibited provider is allowed by manifest`);
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
