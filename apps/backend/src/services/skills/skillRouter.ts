import { createHash } from 'node:crypto';
import type { AskRoutingDecision } from '../ask/askRoutingCascade';
import type { AskOperationId } from '../ask/askOperationRegistry';
import { getSkillForOperation, SKILL_DEFINITIONS } from './skillRegistry';
import type { SkillConsumer, SkillDefinition } from './skill.contract';
import { deriveSkillHealthForDefinition, type SkillHealthControls } from './skillHealth';

export type SkillRoutingOutcome =
  | 'RESOLVED'
  | 'AMBIGUOUS_SKILL'
  | 'AMBIGUOUS_OPERATION'
  | 'UNSUPPORTED'
  | 'BLOCKED'
  | 'UNAVAILABLE';

export type SkillRoutingPath = 'SAFETY' | 'OPERATION_OWNERSHIP' | 'SEMANTIC_INDEX' | 'NONE';

export interface SkillRoutingCandidate {
  skillId: string;
  skillVersion: string;
  confidence: number;
  reasonCodes: string[];
}

export interface HierarchicalSkillRoutingDecision {
  outcome: SkillRoutingOutcome;
  path: SkillRoutingPath;
  selectedSkill: { id: string; version: string; domain: string } | null;
  selectedOperationId: AskOperationId | null;
  skillCandidates: SkillRoutingCandidate[];
  operationCandidates: Array<{ operationId: AskOperationId; confidence: number }>;
  semanticIndexVersion: string;
}

export interface SkillSemanticIndexEntry {
  skillId: string;
  skillVersion: string;
  domain: string;
  tokens: ReadonlySet<string>;
  exactPhrases: readonly string[];
}

export interface SkillSemanticIndex {
  version: string;
  entries: readonly SkillSemanticIndexEntry[];
}

const STOP_WORDS = new Set([
  'a', 'about', 'all', 'am', 'an', 'and', 'are', 'can', 'do', 'for', 'from', 'help', 'how', 'i', 'in', 'is', 'it',
  'me', 'my', 'of', 'on', 'the', 'to', 'what', 'when', 'which', 'with', 'home', 'house', 'property',
]);

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function semanticText(skill: SkillDefinition): string[] {
  return [skill.displayName, skill.description, ...skill.supportedGoals, ...skill.aliases];
}

export function buildSkillSemanticIndex(
  definitions: Readonly<Record<string, SkillDefinition>> = SKILL_DEFINITIONS,
): SkillSemanticIndex {
  const skills = Object.values(definitions).sort((left, right) => left.id.localeCompare(right.id));
  const versionBasis = skills.map((skill) => `${skill.id}@${skill.version}`).join('|');
  return Object.freeze({
    version: createHash('sha256').update(versionBasis).digest('hex').slice(0, 16),
    entries: Object.freeze(skills.map((skill) => {
      const phrases = semanticText(skill).map((value) => value.toLowerCase().replace(/[-_]+/g, ' ').trim());
      return Object.freeze({
        skillId: skill.id,
        skillVersion: skill.version,
        domain: skill.domain,
        tokens: new Set(phrases.flatMap((phrase) => [...tokenize(phrase)])),
        exactPhrases: Object.freeze(phrases.filter((phrase) => phrase.length >= 4)),
      });
    })),
  });
}

export const SKILL_SEMANTIC_INDEX = buildSkillSemanticIndex();

function scoreSkill(message: string, entry: SkillSemanticIndexEntry): SkillRoutingCandidate | null {
  const normalized = message.toLowerCase().replace(/[-_]+/g, ' ');
  const messageTokens = tokenize(normalized);
  const matches = [...messageTokens].filter((token) => entry.tokens.has(token)).length;
  const exactMatch = entry.exactPhrases.some((phrase) => normalized.includes(phrase));
  if (!exactMatch && matches < 2) return null;
  const tokenScore = matches / Math.sqrt(Math.max(1, messageTokens.size * entry.tokens.size));
  const confidence = Math.min(0.99, tokenScore + (exactMatch ? 0.55 : 0));
  return {
    skillId: entry.skillId,
    skillVersion: entry.skillVersion,
    confidence: Number(confidence.toFixed(4)),
    reasonCodes: [exactMatch ? 'REGISTERED_PHRASE' : 'REGISTERED_METADATA_TOKENS'],
  };
}

export function detectSkillSemanticConflicts(
  definitions: Readonly<Record<string, SkillDefinition>> = SKILL_DEFINITIONS,
): string[] {
  const conflicts: string[] = [];
  const owners = new Map<string, string>();
  for (const skill of Object.values(definitions)) {
    for (const phrase of [...skill.supportedGoals, ...skill.aliases]) {
      const normalized = phrase.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
      const owner = owners.get(normalized);
      if (owner && owner !== skill.id) conflicts.push(`${normalized}: claimed by ${owner} and ${skill.id}`);
      else owners.set(normalized, skill.id);
    }
  }
  return conflicts.sort();
}

function eligibleSkill(
  skill: SkillDefinition,
  consumer: SkillConsumer,
  controls: SkillHealthControls,
): boolean {
  const health = deriveSkillHealthForDefinition(skill, consumer, controls);
  return health.status === 'HEALTHY' || health.status === 'DEGRADED';
}

function eligibleSkillOperation(
  skill: SkillDefinition,
  operationId: AskOperationId,
  consumer: SkillConsumer,
  controls: SkillHealthControls,
): boolean {
  const health = deriveSkillHealthForDefinition(skill, consumer, controls);
  return health.operations.some((operation) => operation.operationId === operationId && operation.status !== 'UNAVAILABLE');
}

function operationOwner(
  operationId: AskOperationId,
  definitions: Readonly<Record<string, SkillDefinition>>,
): SkillDefinition | undefined {
  if (definitions === SKILL_DEFINITIONS) return getSkillForOperation(operationId);
  return Object.values(definitions).find((skill) => skill.operations.some((operation) => operation.operationId === operationId));
}

export function resolveHierarchicalSkillRouting(
  message: string,
  operationDecision: AskRoutingDecision,
  options: {
    definitions?: Readonly<Record<string, SkillDefinition>>;
    index?: SkillSemanticIndex;
    consumer?: SkillConsumer;
    consumerEnabled?: SkillHealthControls['consumerEnabled'];
    domainEnabled?: SkillHealthControls['domainEnabled'];
    skillEnabled?: (skillId: string) => boolean;
    operationEnabled?: (operationId: AskOperationId) => boolean;
    adapterEnabled?: (adapterId: string) => boolean;
    contextProviderEnabled?: (providerId: string) => boolean;
    minimumConfidence?: number;
    ambiguityMargin?: number;
  } = {},
): HierarchicalSkillRoutingDecision {
  const definitions: Readonly<Record<string, SkillDefinition>> = options.definitions ?? SKILL_DEFINITIONS;
  const index = options.index ?? (definitions === SKILL_DEFINITIONS ? SKILL_SEMANTIC_INDEX : buildSkillSemanticIndex(definitions));
  const consumer = options.consumer ?? 'ASK';
  const skillEnabled = options.skillEnabled ?? (() => true);
  const runtimeControls: SkillHealthControls = {
    consumerEnabled: options.consumerEnabled,
    domainEnabled: options.domainEnabled,
    skillEnabled,
    operationEnabled: options.operationEnabled,
    adapterEnabled: options.adapterEnabled,
    contextProviderEnabled: options.contextProviderEnabled,
  };
  const minimum = options.minimumConfidence ?? 0.42;
  const ambiguityMargin = options.ambiguityMargin ?? 0.1;

  if (operationDecision.stage === 'SAFETY') {
    return {
      outcome: 'BLOCKED', path: 'SAFETY', selectedSkill: null,
      selectedOperationId: operationDecision.operation.operationId,
      skillCandidates: [], operationCandidates: operationDecision.candidates,
      semanticIndexVersion: index.version,
    };
  }

  if (!operationDecision.requiresClarification && operationDecision.stage !== 'REMOTE_FALLBACK') {
    const skill = operationOwner(operationDecision.operation.operationId, definitions);
    if (!skill) {
      return {
        outcome: 'UNSUPPORTED', path: 'NONE', selectedSkill: null,
        selectedOperationId: operationDecision.operation.operationId,
        skillCandidates: [], operationCandidates: operationDecision.candidates,
        semanticIndexVersion: index.version,
      };
    }
    if (!eligibleSkillOperation(skill, operationDecision.operation.operationId, consumer, runtimeControls)) {
      return {
        outcome: 'UNAVAILABLE', path: 'OPERATION_OWNERSHIP', selectedSkill: null,
        selectedOperationId: operationDecision.operation.operationId,
        skillCandidates: [{ skillId: skill.id, skillVersion: skill.version, confidence: operationDecision.operation.confidence, reasonCodes: ['OPERATION_OWNER'] }],
        operationCandidates: operationDecision.candidates, semanticIndexVersion: index.version,
      };
    }
    return {
      outcome: 'RESOLVED', path: 'OPERATION_OWNERSHIP',
      selectedSkill: { id: skill.id, version: skill.version, domain: skill.domain },
      selectedOperationId: operationDecision.operation.operationId,
      skillCandidates: [{ skillId: skill.id, skillVersion: skill.version, confidence: operationDecision.operation.confidence, reasonCodes: ['OPERATION_OWNER'] }],
      operationCandidates: operationDecision.candidates, semanticIndexVersion: index.version,
    };
  }

  const candidates = index.entries
    .flatMap((entry) => {
      const skill = definitions[entry.skillId];
      if (!skill || !eligibleSkill(skill, consumer, runtimeControls)) return [];
      const candidate = scoreSkill(message, entry);
      return candidate ? [candidate] : [];
    })
    .sort((left, right) => right.confidence - left.confidence || left.skillId.localeCompare(right.skillId))
    .slice(0, 10);
  const strongest = candidates[0];
  const runnerUp = candidates[1];
  if (!strongest || strongest.confidence < minimum) {
    return {
      outcome: 'UNSUPPORTED', path: 'NONE', selectedSkill: null, selectedOperationId: null,
      skillCandidates: candidates, operationCandidates: operationDecision.candidates,
      semanticIndexVersion: index.version,
    };
  }
  if (runnerUp && runnerUp.confidence >= minimum && strongest.confidence - runnerUp.confidence < ambiguityMargin) {
    return {
      outcome: 'AMBIGUOUS_SKILL', path: 'SEMANTIC_INDEX', selectedSkill: null, selectedOperationId: null,
      skillCandidates: candidates.slice(0, 3), operationCandidates: operationDecision.candidates,
      semanticIndexVersion: index.version,
    };
  }

  const skill = definitions[strongest.skillId];
  const skillHealth = deriveSkillHealthForDefinition(skill, consumer, runtimeControls);
  const candidateOperations = skill.operations
    .filter((operation) => skillHealth.operations.some((health) => health.operationId === operation.operationId && health.status !== 'UNAVAILABLE'))
    .map((operation) => ({ operationId: operation.operationId, confidence: strongest.confidence }));
  if (candidateOperations.length !== 1) {
    return {
      outcome: 'AMBIGUOUS_OPERATION', path: 'SEMANTIC_INDEX',
      selectedSkill: { id: skill.id, version: skill.version, domain: skill.domain }, selectedOperationId: null,
      skillCandidates: candidates.slice(0, 3), operationCandidates: candidateOperations.slice(0, 3),
      semanticIndexVersion: index.version,
    };
  }
  return {
    outcome: 'RESOLVED', path: 'SEMANTIC_INDEX',
    selectedSkill: { id: skill.id, version: skill.version, domain: skill.domain },
    selectedOperationId: candidateOperations[0].operationId,
    skillCandidates: candidates.slice(0, 3), operationCandidates: candidateOperations,
    semanticIndexVersion: index.version,
  };
}
