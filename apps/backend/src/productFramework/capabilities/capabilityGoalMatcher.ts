import { z } from 'zod';
import type { ToolCapabilityDefinition } from './capability.contract';
import type { ToolCapabilityRegistry } from './capabilityRegistry';

const STOP_WORDS = new Set([
  'about', 'available', 'could', 'does', 'help', 'house', 'home', 'into',
  'need', 'planning', 'please', 'something', 'that', 'their', 'there',
  'these', 'this', 'tool', 'tools', 'want', 'what', 'when', 'where',
  'which', 'with', 'would', 'your',
]);

// Small, reviewed homeowner-language equivalence groups. These are deliberately
// domain bounded and deterministic; they improve recall without sending the
// homeowner's question to a model.
const EQUIVALENCE_GROUPS = [
  ['refinance', 'refinancing', 'mortgage', 'loan', 'rate'],
  ['sell', 'selling', 'sale', 'list', 'listing'],
  ['rent', 'renting', 'rental', 'landlord'],
  ['hold', 'holding', 'keep', 'retain'],
  ['quote', 'quotes', 'bid', 'bids', 'proposal', 'proposals', 'estimate'],
  ['repair', 'fix', 'replace', 'replacement', 'lifespan'],
  ['appliance', 'refrigerator', 'fridge', 'washer', 'dryer', 'dishwasher'],
  ['saving', 'savings', 'rebate', 'rebates', 'credit', 'credits', 'benefit'],
  ['coverage', 'insurance', 'premium', 'policy', 'warranty', 'protection'],
  ['maintenance', 'maintain', 'upkeep', 'seasonal', 'routine'],
  ['document', 'documents', 'record', 'records', 'paperwork', 'file'],
  ['store', 'organize', 'document', 'records', 'receipt', 'receipts'],
  ['tax', 'taxes', 'assessment', 'appeal', 'exemption'],
  ['renovation', 'remodel', 'remodeling', 'project', 'contractor'],
  ['permit', 'permits', 'inspection', 'compliance', 'approval'],
  ['budget', 'cost', 'costs', 'expense', 'expenses', 'spending'],
  ['reserve', 'reserves', 'fund', 'buffer'],
  ['diy', 'myself', 'yourself', 'hands-on'],
  ['emergency', 'urgent', 'hazard', 'unsafe', 'danger'],
] as const;

const EQUIVALENTS = new Map<string, ReadonlySet<string>>();
for (const group of EQUIVALENCE_GROUPS) {
  const values = new Set(group.map((value) => value.toLowerCase()));
  for (const value of values) {
    EQUIVALENTS.set(value, new Set([...(EQUIVALENTS.get(value) ?? []), ...values]));
  }
}

function stem(value: string): string {
  if (value.length > 5 && value.endsWith('ing')) return value.slice(0, -3);
  if (value.length > 4 && value.endsWith('ies')) return `${value.slice(0, -3)}y`;
  if (value.length > 4 && value.endsWith('ed')) return value.slice(0, -2);
  if (value.length > 4 && value.endsWith('s')) return value.slice(0, -1);
  return value;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(value: string): Set<string> {
  const result = new Set<string>();
  for (const raw of normalize(value).split(/\s+/).filter(Boolean)) {
    if (raw.length <= 2 || STOP_WORDS.has(raw)) continue;
    result.add(raw);
    result.add(stem(raw));
    for (const equivalent of EQUIVALENTS.get(raw) ?? []) {
      result.add(equivalent);
      result.add(stem(equivalent));
    }
  }
  return result;
}

function literalTokens(value: string): Set<string> {
  return new Set(normalize(value).split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .map(stem));
}

const CapabilityGoalMatchSchema = z.object({
  capabilityId: z.string().trim().min(1).max(120),
  score: z.number().int().min(0).max(100),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  matchedPhrases: z.array(z.string()).max(8),
});

export const CapabilityGoalMatchResultSchema = z.object({
  registryVersion: z.string().trim().min(1).max(160),
  normalizedGoal: z.string().max(1000),
  ambiguous: z.boolean(),
  matches: z.array(CapabilityGoalMatchSchema),
});

export type CapabilityGoalMatch = z.infer<typeof CapabilityGoalMatchSchema>;
export type CapabilityGoalMatchResult = z.infer<typeof CapabilityGoalMatchResultSchema>;

function scoreCapability(goal: string, capability: ToolCapabilityDefinition): CapabilityGoalMatch {
  const normalizedGoal = normalize(goal);
  const goalTokens = tokens(goal);
  const phrases = [
    capability.presentation.label,
    ...capability.presentation.intentAliases,
    capability.presentation.shortDescription,
    capability.productFramework.homeownerOutcome,
    capability.lifecycle.expectedOutput,
    ...capability.recommendation.triggerFamilies,
  ];
  let phraseScore = 0;
  const matchedPhrases: string[] = [];
  for (const phrase of phrases) {
    const normalizedPhrase = normalize(phrase);
    const phraseTokens = tokens(phrase);
    const overlap = [...phraseTokens].filter((token) => goalTokens.has(token)).length;
    const coverage = phraseTokens.size ? overlap / phraseTokens.size : 0;
    const direct = normalizedPhrase.length >= 4 && normalizedGoal.includes(normalizedPhrase);
    const score = direct ? 88 : Math.round(coverage * 58 + Math.min(overlap, 4) * 6);
    if (score > phraseScore) phraseScore = score;
    if ((direct || overlap >= 2 || coverage >= 0.65) && matchedPhrases.length < 8) {
      matchedPhrases.push(phrase);
    }
  }
  const idTokens = literalTokens(capability.id);
  const idOverlap = [...idTokens].filter((token) => goalTokens.has(token)).length;
  const labelDirect = normalizedGoal.includes(normalize(capability.presentation.label));
  const idCoverage = idTokens.size ? idOverlap / idTokens.size : 0;
  const canonicalNameBoost = idCoverage === 1 ? 24 : idCoverage >= 0.5 ? 8 : 0;
  const score = Math.min(100, Math.max(phraseScore, labelDirect ? 96 : 0) + canonicalNameBoost);
  return {
    capabilityId: capability.id,
    score,
    confidence: score >= 72 ? 'HIGH' : score >= 48 ? 'MEDIUM' : 'LOW',
    matchedPhrases: [...new Set(matchedPhrases)],
  };
}

/** Ranks a homeowner-stated goal against canonical capability copy and aliases. */
export function matchCapabilityGoal(input: {
  registry: ToolCapabilityRegistry;
  goal: string;
  capabilities?: readonly ToolCapabilityDefinition[];
  limit?: number;
  minimumScore?: number;
}): CapabilityGoalMatchResult {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);
  const minimumScore = input.minimumScore ?? 34;
  const matches = (input.capabilities ?? input.registry.capabilities)
    .map((capability) => scoreCapability(input.goal, capability))
    .filter((match) => match.score >= minimumScore)
    .sort((left, right) => right.score - left.score || left.capabilityId.localeCompare(right.capabilityId))
    .slice(0, limit);
  const ambiguous = matches.length > 1 && matches[0].score - matches[1].score <= 10;
  return CapabilityGoalMatchResultSchema.parse({
    registryVersion: input.registry.version,
    normalizedGoal: normalize(input.goal),
    ambiguous,
    matches,
  });
}
