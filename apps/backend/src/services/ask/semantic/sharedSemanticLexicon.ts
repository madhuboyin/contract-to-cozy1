/**
 * The first registry-derived lexicon subset (FR-PLAN-7 / FR-ONT-6).
 * Runtime consumers use only the generated artifact below. Reviewed aliases
 * remain attached to stable semantic identities instead of handler routes.
 */
export const ASK_SHARED_LEXICON_VERSION = 'phase1-subset-1.0.0' as const;

export type SemanticLexemeRole = 'DOMAIN' | 'ENTITY' | 'RELATION' | 'PROJECTION' | 'POLARITY';

interface RegistryLexeme {
  role: SemanticLexemeRole;
  semanticId: string;
  canonicalLabel: string;
  reviewedAliases: readonly string[];
}

const PHASE1_REGISTRY_LEXEMES: readonly RegistryLexeme[] = [
  { role: 'DOMAIN', semanticId: 'domain.inventory', canonicalLabel: 'inventory', reviewedAliases: ['home inventory'] },
  { role: 'ENTITY', semanticId: 'entity.inventory_item', canonicalLabel: 'inventory item', reviewedAliases: ['inventory items', 'item', 'items', 'appliance', 'appliances', 'equipment'] },
  { role: 'ENTITY', semanticId: 'entity.warranty', canonicalLabel: 'warranty', reviewedAliases: ['warranties'] },
  { role: 'RELATION', semanticId: 'relation.inventory_item.warranty', canonicalLabel: 'warranty', reviewedAliases: ['warranties', 'warranty record', 'warranty records'] },
  { role: 'PROJECTION', semanticId: 'projection.list', canonicalLabel: 'list', reviewedAliases: ['list down', 'show', 'which'] },
  { role: 'PROJECTION', semanticId: 'projection.detail', canonicalLabel: 'details', reviewedAliases: ['detail', 'provide details', 'show details'] },
  { role: 'PROJECTION', semanticId: 'projection.count', canonicalLabel: 'count', reviewedAliases: ['how many', 'number of'] },
  { role: 'PROJECTION', semanticId: 'projection.exists', canonicalLabel: 'exists', reviewedAliases: ['are there', 'do any'] },
  { role: 'POLARITY', semanticId: 'polarity.negative', canonicalLabel: 'without', reviewedAliases: ["don't have", 'do not have', 'does not have', 'not having', 'no', 'missing'] },
  { role: 'POLARITY', semanticId: 'polarity.positive', canonicalLabel: 'with', reviewedAliases: ['have', 'has', 'having'] },
] as const;

export interface GeneratedSemanticLexeme {
  role: SemanticLexemeRole;
  semanticId: string;
  phrase: string;
  lineage: 'CANONICAL_LABEL' | 'REVIEWED_ALIAS';
}

function normalizePhrase(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[’]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();
}

export function generateSharedSemanticLexicon(): readonly GeneratedSemanticLexeme[] {
  const generated = PHASE1_REGISTRY_LEXEMES.flatMap((entry) => [
    { role: entry.role, semanticId: entry.semanticId, phrase: normalizePhrase(entry.canonicalLabel), lineage: 'CANONICAL_LABEL' as const },
    ...entry.reviewedAliases.map((alias) => ({ role: entry.role, semanticId: entry.semanticId, phrase: normalizePhrase(alias), lineage: 'REVIEWED_ALIAS' as const })),
  ]);
  const identities = new Set<string>();
  return generated.filter((entry) => {
    const identity = `${entry.role}:${entry.semanticId}:${entry.phrase}`;
    if (!entry.phrase || identities.has(identity)) return false;
    identities.add(identity);
    return true;
  }).sort((left, right) => right.phrase.length - left.phrase.length || left.semanticId.localeCompare(right.semanticId));
}

export const ASK_SHARED_SEMANTIC_LEXICON = Object.freeze(generateSharedSemanticLexicon());
