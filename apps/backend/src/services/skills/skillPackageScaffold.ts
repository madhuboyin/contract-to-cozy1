import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ASK_OPERATION_DEFINITIONS,
  type AskOperationDefinition,
  type AskOperationId,
  type AskPropertyRoleFloor,
} from '../ask/askOperationRegistry';
import type {
  HomeownerJob,
  SkillConsumerPolicy,
  SkillDependency,
  SkillDomain,
  SkillRiskPolicy,
  VersionedSkillReference,
} from './skill.contract';
import { getSkillAdapterForOperation } from './adapters/skillAdapterRegistry';
import { getSkillContextProvider } from './context/skillContextProviderRegistry';
import { getSkillDefinition, getSkillForOperation } from './skillRegistry';
import { resolveSkillDependencyContract } from './skillDependencyRegistry';
import { isSupportedSkillDependencyVersionSpec } from './skillDependencyVersion';

export interface SkillPackageScaffoldSpec {
  id: string;
  version?: string;
  domain: SkillDomain;
  displayName: string;
  description: string;
  owner: string;
  homeownerJobs: HomeownerJob[];
  supportedGoals: string[];
  aliases: string[];
  selectionExamples: { mode: 'EXACT' | 'PARAPHRASED' | 'COLLOQUIAL' | 'MISSPELLED'; message: string; operationId: AskOperationId }[];
  exclusions: string[];
  operations: {
    operationId: AskOperationId;
    requiredContextProviders?: VersionedSkillReference[];
    optionalContextProviders?: VersionedSkillReference[];
  }[];
  consumerPolicy: SkillConsumerPolicy[];
  riskPolicy: SkillRiskPolicy;
  authorizationFloor: AskPropertyRoleFloor;
  dependencies?: SkillDependency[];
  ambiguityExamples: {
    message: string;
    candidateOperationIds?: AskOperationId[];
    candidateSkillIds?: string[];
  }[];
  negativeExamples: string[];
  prohibitedAdapters: string[];
  prohibitedContextProviders: string[];
  handoff: { suggestedNextSkillId: string; suggestedGoal: string; reasonCodes: string[] };
}

export interface SkillPackageScaffoldDependencies {
  resolveOperation?: (operationId: string) => AskOperationDefinition | undefined;
  resolveAdapter?: (operationId: AskOperationId) => { id: string; version: string } | undefined;
  resolveProvider?: (id: string, version: string) => unknown;
  operationOwner?: (operationId: AskOperationId) => { id: string } | undefined;
  resolveSkill?: (skillId: string) => { id: string; supportedGoals: string[] } | undefined;
  resolveDependency?: (dependency: SkillDependency) => unknown;
}

export interface SkillPackageScaffold {
  directoryName: string;
  files: Readonly<Record<'SKILL.md' | 'skill.manifest.ts' | 'skill.evaluation.ts' | 'index.ts', string>>;
  registration: {
    manifestImport: string;
    evaluationImport: string;
    checklist: readonly string[];
  };
}

const DOMAINS = new Set<SkillDomain>(['HOME_CARE', 'HOME_PROTECTION', 'HOME_FINANCE', 'HOME_TRANSACTION', 'HOME_PROJECTS', 'HOME_INTELLIGENCE', 'HOUSEHOLD']);
const JOBS = new Set<HomeownerJob>(['STAY_AHEAD', 'DECIDE_WITH_CONFIDENCE', 'NAVIGATE_MAJOR_MOMENTS']);
const CONSUMERS = new Set(['ASK', 'HOME_ACTIONS', 'CONCIERGE_HOME', 'PROACTIVE', 'NOTIFICATION_CONTINUATION']);
const SEMVER = /^\d+\.\d+\.\d+$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DEFAULT_CONTEXT_BUDGET = {
  maxFacts: 50,
  maxEntities: 25,
  maxDocuments: 0,
  maxHistoryEvents: 50,
  maxSerializedBytes: 64_000,
  maxProviderLatencyMs: 3_000,
  maxOverallLatencyMs: 15_000,
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function constantName(id: string): string {
  return id.replace(/[^a-z0-9]+/gi, '_').toUpperCase();
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function defaultDependencies(): Required<SkillPackageScaffoldDependencies> {
  return {
    resolveOperation: (operationId) => ASK_OPERATION_DEFINITIONS[operationId as AskOperationId],
    resolveAdapter: (operationId) => getSkillAdapterForOperation(operationId),
    resolveProvider: (id, version) => getSkillContextProvider(id, version),
    operationOwner: (operationId) => getSkillForOperation(operationId),
    resolveSkill: (skillId) => getSkillDefinition(skillId),
    resolveDependency: (dependency) => resolveSkillDependencyContract(dependency),
  };
}

export function validateSkillPackageScaffoldSpec(
  spec: SkillPackageScaffoldSpec,
  dependencies: SkillPackageScaffoldDependencies = {},
): string[] {
  const deps = { ...defaultDependencies(), ...dependencies };
  const issues: string[] = [];
  const version = spec.version ?? '1.0.0';
  if (!ID.test(spec.id)) issues.push('id must be lowercase kebab-case');
  if (!SEMVER.test(version)) issues.push('version must use semantic versioning');
  if (!DOMAINS.has(spec.domain)) issues.push('domain is not registered');
  if (!spec.displayName?.trim() || !spec.description?.trim() || !spec.owner?.trim()) issues.push('displayName, description, and owner are required');
  if (!spec.homeownerJobs?.length || spec.homeownerJobs.some((job) => !JOBS.has(job))) issues.push('homeownerJobs must contain registered jobs');
  if (!spec.supportedGoals?.length || !spec.aliases?.length) issues.push('supportedGoals and aliases are required');
  if (!spec.operations?.length) issues.push('at least one operation is required');
  if (!spec.consumerPolicy?.length) issues.push('at least one consumer policy is required');
  if (!spec.selectionExamples?.length || !spec.exclusions?.length || !spec.negativeExamples?.length || !spec.ambiguityExamples?.length) issues.push('routing, exclusions, negative, and ambiguity examples are required');
  const modes = new Set(spec.selectionExamples?.map((example) => example.mode));
  for (const mode of ['EXACT', 'PARAPHRASED', 'COLLOQUIAL', 'MISSPELLED']) if (!modes.has(mode as typeof spec.selectionExamples[number]['mode'])) issues.push(`missing ${mode.toLowerCase()} selection example`);

  const operationIds = new Set<AskOperationId>();
  const providerRefs = new Map<string, VersionedSkillReference>();
  for (const operation of spec.operations ?? []) {
    if (operationIds.has(operation.operationId)) issues.push(`duplicate operation ${operation.operationId}`);
    operationIds.add(operation.operationId);
    const definition = deps.resolveOperation(operation.operationId);
    const adapter = deps.resolveAdapter(operation.operationId);
    if (!definition) issues.push(`unknown operation ${operation.operationId}`);
    if (!adapter || (definition && adapter.id !== definition.adapterKey)) issues.push(`operation ${operation.operationId} has no compatible registered adapter`);
    const owner = deps.operationOwner(operation.operationId);
    if (owner) issues.push(`operation ${operation.operationId} is already owned by Skill ${owner.id}`);
    for (const provider of [...(operation.requiredContextProviders ?? []), ...(operation.optionalContextProviders ?? [])]) {
      providerRefs.set(`${provider.id}@${provider.version}`, provider);
      if (!deps.resolveProvider(provider.id, provider.version)) issues.push(`unknown context provider ${provider.id}@${provider.version}`);
    }
  }
  for (const example of spec.selectionExamples ?? []) if (!operationIds.has(example.operationId)) issues.push(`selection example references undeclared operation ${example.operationId}`);
  for (const policy of spec.consumerPolicy ?? []) {
    if (!CONSUMERS.has(policy.consumer)) issues.push(`unknown consumer ${policy.consumer}`);
    if (!policy.operations?.length || policy.operations.some((operationId) => !operationIds.has(operationId))) issues.push(`consumer ${policy.consumer} references undeclared operations`);
  }
  for (const ambiguity of spec.ambiguityExamples ?? []) {
    const operationAmbiguity = (ambiguity.candidateOperationIds?.length ?? 0) >= 2
      && ambiguity.candidateOperationIds!.every((operationId) => operationIds.has(operationId));
    const skillAmbiguity = (ambiguity.candidateSkillIds?.length ?? 0) >= 2
      && ambiguity.candidateSkillIds!.includes(spec.id)
      && ambiguity.candidateSkillIds!.every((skillId) => skillId === spec.id || Boolean(deps.resolveSkill(skillId)));
    if (!operationAmbiguity && !skillAmbiguity) issues.push('ambiguity examples require two owned operations or two registered Skill candidates including the new Skill');
  }
  const target = deps.resolveSkill(spec.handoff?.suggestedNextSkillId);
  if (!target || !target.supportedGoals.includes(spec.handoff?.suggestedGoal) || !spec.handoff?.reasonCodes?.length) issues.push('handoff must reference a registered target Skill, supported goal, and reason code');
  if (!spec.riskPolicy?.effects?.length || !spec.riskPolicy?.riskDomains?.length) issues.push('riskPolicy effects and riskDomains are required');
  if (spec.authorizationFloor === undefined) issues.push('authorizationFloor is required');
  if ((spec.prohibitedAdapters ?? []).some((id) => [...operationIds].some((operationId) => deps.resolveAdapter(operationId)?.id === id))) issues.push('a prohibited adapter is required by an operation');
  if ((spec.prohibitedContextProviders ?? []).some((id) => [...providerRefs.values()].some((provider) => provider.id === id))) issues.push('a prohibited provider is declared by an operation');
  const dependencyIdentities = new Set<string>([
    ...[...operationIds].map((operationId) => `OPERATION_CONTRACT:${operationId}`),
    ...[...providerRefs.values()].map((provider) => `CONTEXT_PROVIDER:${provider.id}`),
  ]);
  for (const dependency of spec.dependencies ?? []) {
    const identity = `${dependency.type}:${dependency.id}`;
    if (dependencyIdentities.has(identity)) issues.push(`duplicate dependency ${identity}`);
    dependencyIdentities.add(identity);
    if (!isSupportedSkillDependencyVersionSpec(dependency.version)) issues.push(`unsupported dependency version ${identity}@${dependency.version}`);
    else if (dependency.required && !deps.resolveDependency(dependency)) issues.push(`unresolved required dependency ${identity}@${dependency.version}`);
  }
  return unique(issues).sort();
}

export function buildSkillPackageScaffold(
  spec: SkillPackageScaffoldSpec,
  dependencies: SkillPackageScaffoldDependencies = {},
): SkillPackageScaffold {
  const issues = validateSkillPackageScaffoldSpec(spec, dependencies);
  if (issues.length) throw new Error(`Invalid Skill package spec: ${issues.join('; ')}`);
  const deps = { ...defaultDependencies(), ...dependencies };
  const version = spec.version ?? '1.0.0';
  const prefix = constantName(spec.id);
  const envId = prefix;
  const operationIds = spec.operations.map((operation) => operation.operationId);
  const adapters = [...new Map(spec.operations.map((operation) => {
    const resolved = deps.resolveAdapter(operation.operationId)!;
    const adapter: VersionedSkillReference = { id: resolved.id, version: resolved.version };
    return [`${adapter.id}@${adapter.version}`, adapter] as const;
  })).values()];
  const adapterByOperation = new Map(spec.operations.map((operation) => {
    const resolved = deps.resolveAdapter(operation.operationId)!;
    return [operation.operationId, { id: resolved.id, version: resolved.version }] as const;
  }));
  const providerRequirements = new Map<string, boolean>();
  for (const operation of spec.operations) {
    for (const provider of operation.requiredContextProviders ?? []) providerRequirements.set(`${provider.id}@${provider.version}`, true);
    for (const provider of operation.optionalContextProviders ?? []) {
      const key = `${provider.id}@${provider.version}`;
      if (!providerRequirements.has(key)) providerRequirements.set(key, false);
    }
  }
  const providers = [...providerRequirements.keys()].map((reference) => {
    const [id, providerVersion] = reference.split('@');
    return { id, version: providerVersion };
  });
  const allowedBlocks = unique(operationIds.flatMap((operationId) => deps.resolveOperation(operationId)!.allowedBlockTypes));
  const dependencyCandidates: SkillDependency[] = [
    ...spec.operations.map((operation) => ({ type: 'OPERATION_CONTRACT' as const, id: operation.operationId, version: deps.resolveOperation(operation.operationId)!.version, required: true })),
    ...providers.map((provider) => ({ type: 'CONTEXT_PROVIDER' as const, ...provider, required: providerRequirements.get(`${provider.id}@${provider.version}`) ?? false })),
    ...(spec.dependencies ?? []),
  ];
  const dependencyMap = new Map<string, SkillDependency>();
  for (const dependency of dependencyCandidates) {
    const key = `${dependency.type}:${dependency.id}@${dependency.version}`;
    const existing = dependencyMap.get(key);
    dependencyMap.set(key, existing ? { ...existing, required: existing.required || dependency.required } : dependency);
  }
  const dependenciesList = [...dependencyMap.values()];
  const requiredProviderKeys = new Set([...providerRequirements].filter(([, required]) => required).map(([key]) => key));
  const manifest = {
    id: spec.id,
    version,
    domain: spec.domain,
    displayName: spec.displayName,
    description: spec.description,
    homeownerJobs: spec.homeownerJobs,
    supportedGoals: spec.supportedGoals,
    aliases: spec.aliases,
    operations: spec.operations.map((operation) => ({ operationId: operation.operationId, version: deps.resolveOperation(operation.operationId)!.version, ...(operation.requiredContextProviders?.length ? { requiredContextProviders: operation.requiredContextProviders } : {}), ...(operation.optionalContextProviders?.length ? { optionalContextProviders: operation.optionalContextProviders } : {}) })),
    requiredContextProviders: providers.filter((provider) => requiredProviderKeys.has(`${provider.id}@${provider.version}`)),
    optionalContextProviders: providers.filter((provider) => !requiredProviderKeys.has(`${provider.id}@${provider.version}`)),
    allowedAdapters: adapters,
    allowedExternalConnectors: [],
    consumerPolicy: spec.consumerPolicy,
    riskPolicy: spec.riskPolicy,
    authorizationFloor: spec.authorizationFloor,
    allowedResultBlocks: allowedBlocks,
    dependencies: dependenciesList,
    contextBudget: DEFAULT_CONTEXT_BUDGET,
    evaluationSuite: `skill-${spec.id}-golden`,
    featureFlag: `ASK_SKILL_${envId}_ENABLED`,
    killSwitch: `ASK_SKILL_${envId}_KILL_SWITCH`,
    owner: spec.owner,
    lifecycleStatus: 'DEVELOPMENT',
    operationalStatus: 'ENABLED',
  };
  const degraded = providers[0]
    ? { dependencyType: 'CONTEXT_PROVIDER', dependency: providers[0], expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' }
    : { dependencyType: 'ADAPTER', dependency: adapters[0], expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' };
  const evaluation = {
    id: manifest.evaluationSuite,
    skillId: spec.id,
    skillVersion: version,
    routingCases: spec.selectionExamples.map((example) => ({ mode: example.mode, message: example.message, expectedOperationId: example.operationId })),
    operationCases: spec.operations.map((operation) => ({ operationId: operation.operationId, expectedAdapter: adapterByOperation.get(operation.operationId) })),
    ambiguityCases: spec.ambiguityExamples.map((example) => ({ ...example, expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' })),
    policyCases: spec.consumerPolicy.flatMap((policy) => policy.operations.map((operationId) => ({ consumer: policy.consumer, operationId, allowed: true }))),
    contextCases: [
      { state: 'KNOWN', expectedBehavior: 'READY' }, { state: 'MISSING', expectedBehavior: 'CAPTURE_OR_BLOCK' },
      { state: 'STALE', expectedBehavior: 'DISCLOSE_OR_BLOCK' }, { state: 'CONFLICTING', expectedBehavior: 'BLOCK' },
      { state: 'UNAUTHORIZED', expectedBehavior: 'BLOCK' }, { state: 'UNAVAILABLE', expectedBehavior: 'DEGRADED_OR_BLOCK' },
    ],
    negativeCases: spec.negativeExamples.map((message) => ({ message, expectedBehavior: 'DO_NOT_SELECT_SKILL' })),
    exclusionCases: spec.exclusions.map((message) => ({ message, expectedBehavior: 'DO_NOT_EXECUTE_SKILL' })),
    resolutionAmbiguityCases: [
      { kind: 'ENTITY', message: 'Continue this request for the matching item', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
      { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
      { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    ],
    degradedModeCases: [degraded],
    expectedAdapters: adapters,
    prohibitedAdapters: spec.prohibitedAdapters,
    expectedContextProviders: providers,
    prohibitedContextProviders: spec.prohibitedContextProviders,
    expectedStatuses: spec.riskPolicy.effects.includes('WRITE')
      ? ['ANSWERED', 'READY_WITH_LIMITATIONS', 'NEEDS_CONFIRMATION', 'COMPLETED']
      : ['ANSWERED', 'READY_WITH_LIMITATIONS'],
    expectedBlockTypes: allowedBlocks,
    expectedCanonicalCalls: adapters,
    prohibitedCanonicalCalls: spec.prohibitedAdapters,
    modelDisabledCase: { message: spec.selectionExamples[0].message, expectedOperationId: spec.selectionExamples[0].operationId },
    continuationCase: { message: 'Continue that request', sourceOperationId: spec.operations[0].operationId, expectedOperationId: spec.operations[0].operationId },
    handoffCase: spec.handoff,
    performanceCase: { message: spec.selectionExamples[0].message, maxSkillCandidates: 10, maxOperationCandidates: 3, smokeCeilingMs: 100 },
  };

  const skillDoc = `# ${spec.displayName} Skill\n\n## Purpose\n\n${spec.description}\n\n## Select this Skill when\n\n${spec.selectionExamples.map((example) => `- ${example.message}`).join('\n')}\n\n## Do not select this Skill when\n\n${spec.exclusions.map((exclusion) => `- ${exclusion}`).join('\n')}\n\n## Operations\n\n${operationIds.map((operationId) => `- \`${operationId}\``).join('\n')}\n\n## Consumers\n\n${spec.consumerPolicy.map((policy) => `- ${policy.consumer}: ${policy.operations.join(', ')}`).join('\n')}\n\n## Canonical ownership and boundaries\n\nOperations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.\n\nThis document provides semantic guidance only. The machine manifest, operation registry, consumer policy, adapters, providers, and canonical services control execution.\n`;
  const manifestSource = `import type { SkillDefinition } from '../skill.contract';\n\nexport const ${prefix}_SKILL = Object.freeze(${json(manifest)} satisfies SkillDefinition);\n`;
  const evaluationSource = `import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';\nimport { deepFreezeSkillPackage } from '../skillPackageFreeze';\n\nexport const ${prefix}_SKILL_EVALUATION = deepFreezeSkillPackage(${json(evaluation)} satisfies SkillEvaluationPackage);\n`;
  const indexSource = `export { ${prefix}_SKILL } from './skill.manifest';\nexport { ${prefix}_SKILL_EVALUATION } from './skill.evaluation';\n`;

  return Object.freeze({
    directoryName: spec.id,
    files: Object.freeze({ 'SKILL.md': skillDoc, 'skill.manifest.ts': manifestSource, 'skill.evaluation.ts': evaluationSource, 'index.ts': indexSource }),
    registration: Object.freeze({
      manifestImport: `import { ${prefix}_SKILL } from './${spec.id}';`,
      evaluationImport: `import { ${prefix}_SKILL_EVALUATION } from './${spec.id}';`,
      checklist: Object.freeze([
        'Register the manifest in SKILL_DEFINITIONS.',
        'Register the evaluation package in SKILL_EVALUATION_PACKAGES.',
        'Run npm run test:ask and npx tsc --noEmit.',
      ]),
    }),
  });
}

export async function createSkillPackage(
  outputRoot: string,
  spec: SkillPackageScaffoldSpec,
  dependencies: SkillPackageScaffoldDependencies = {},
): Promise<{ directory: string; scaffold: SkillPackageScaffold }> {
  const scaffold = buildSkillPackageScaffold(spec, dependencies);
  const target = join(outputRoot, scaffold.directoryName);
  const temporary = join(outputRoot, `.${scaffold.directoryName}.${randomUUID()}.tmp`);
  await mkdir(temporary, { recursive: false });
  try {
    await Promise.all(Object.entries(scaffold.files).map(([name, contents]) => writeFile(join(temporary, name), contents, { encoding: 'utf8', flag: 'wx' })));
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return { directory: target, scaffold };
}
