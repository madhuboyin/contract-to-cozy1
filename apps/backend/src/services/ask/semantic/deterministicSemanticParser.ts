import { createHash } from 'crypto';
import { ASK_SHARED_SEMANTIC_LEXICON, ASK_SHARED_LEXICON_VERSION, type GeneratedSemanticLexeme } from './sharedSemanticLexicon';
import { ASK_SEMANTIC_PLAN_VERSION, SemanticRequestPlanSchema, type SemanticRequestPlan, type SemanticSourceSpan } from './semanticRequestPlan';

export const ASK_DETERMINISTIC_SEMANTIC_PARSER_VERSION = 'typed-grammar-0.1.0' as const;

interface Annotation extends SemanticSourceSpan {
  lexeme: GeneratedSemanticLexeme;
}
const STOP_WORDS = new Set(['all', 'are', 'of', 'please', 'provide', 'the', 'which']);

function normalizedWithOffsets(raw: string): { normalized: string; tokens: SemanticSourceSpan[] } {
  const tokens: SemanticSourceSpan[] = [];
  for (const match of raw.matchAll(/[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g)) {
    const start = match.index ?? 0;
    tokens.push({ start, end: start + match[0].length, text: match[0] });
  }
  return { normalized: tokens.map((token) => token.text.toLocaleLowerCase('en-US').replace('’', "'")).join(' '), tokens };
}

function annotate(raw: string, tokens: readonly SemanticSourceSpan[]): Annotation[] {
  const normalizedTokens = tokens.map((token) => token.text.toLocaleLowerCase('en-US').replace('’', "'"));
  const annotations: Annotation[] = [];
  const occupiedByRole = new Map<string, Set<number>>();
  for (const lexeme of ASK_SHARED_SEMANTIC_LEXICON) {
    const phraseTokens = lexeme.phrase.split(' ');
    for (let index = 0; index <= normalizedTokens.length - phraseTokens.length; index += 1) {
      if (!phraseTokens.every((token, offset) => normalizedTokens[index + offset] === token)) continue;
      const occupied = occupiedByRole.get(lexeme.role) ?? new Set<number>();
      if (phraseTokens.some((_, offset) => occupied.has(index + offset))) continue;
      phraseTokens.forEach((_, offset) => occupied.add(index + offset));
      occupiedByRole.set(lexeme.role, occupied);
      const start = tokens[index].start;
      const end = tokens[index + phraseTokens.length - 1].end;
      annotations.push({ start, end, text: raw.slice(start, end), lexeme });
    }
  }
  return annotations;
}

function unresolved(tokens: readonly SemanticSourceSpan[], annotations: readonly Annotation[]): SemanticSourceSpan[] {
  return tokens.filter((token) => {
    const normalized = token.text.toLocaleLowerCase('en-US').replace('’', "'");
    return !STOP_WORDS.has(normalized) && !annotations.some((annotation) => token.start >= annotation.start && token.end <= annotation.end);
  });
}

function first(annotations: readonly Annotation[], role: GeneratedSemanticLexeme['role']): Annotation | undefined {
  return annotations.find((annotation) => annotation.lexeme.role === role);
}

export function parseDeterministicSemanticRequest(rawText: string): SemanticRequestPlan {
  const { normalized, tokens } = normalizedWithOffsets(rawText);
  const base = {
    schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
    producer: { kind: 'DETERMINISTIC' as const, version: `${ASK_DETERMINISTIC_SEMANTIC_PARSER_VERSION}+${ASK_SHARED_LEXICON_VERSION}` },
    rawText,
    normalizedText: normalized,
    minimizedText: rawText,
  };
  if (!tokens.length) return SemanticRequestPlanSchema.parse({ ...base, outcome: 'INSUFFICIENT_TEXT', facets: [], unresolvedSpans: [] });

  const annotations = annotate(rawText, tokens);
  const subject = annotations.find((annotation) => annotation.lexeme.semanticId === 'entity.inventory_item');
  const relation = annotations.find((annotation) => annotation.lexeme.semanticId === 'relation.inventory_item.warranty');
  const projectionAnnotation = first(annotations, 'PROJECTION');
  // Explicit negation governs the relation even when an affirmative auxiliary
  // is also present ("have no warranty", "does not have"). This is scope
  // resolution over semantic annotations, not lexicon insertion order.
  const polarityAnnotation = annotations.find((annotation) => annotation.lexeme.semanticId === 'polarity.negative')
    ?? annotations.find((annotation) => annotation.lexeme.semanticId === 'polarity.positive');
  const unresolvedSpans = unresolved(tokens, annotations);
  if (!subject || !relation) return SemanticRequestPlanSchema.parse({ ...base, outcome: 'NONE_FITS', facets: [], unresolvedSpans });

  const projection = projectionAnnotation?.lexeme.semanticId === 'projection.count' ? 'COUNT'
    : projectionAnnotation?.lexeme.semanticId === 'projection.detail' ? 'DETAIL'
    : projectionAnnotation?.lexeme.semanticId === 'projection.exists' ? 'EXISTS' : 'LIST';
  const polarity = polarityAnnotation?.lexeme.semanticId === 'polarity.negative' ? 'NEGATIVE'
    : polarityAnnotation?.lexeme.semanticId === 'polarity.positive' ? 'POSITIVE' : 'UNKNOWN';
  const predicateId = polarity === 'NEGATIVE' ? 'predicate.inventory_item.has_no_warranty_record'
    : polarity === 'POSITIVE' ? 'predicate.inventory_item.has_warranty_record'
    : 'predicate.inventory_item.warranty_state_unknown';
  const grammarComplete = unresolvedSpans.length === 0 && polarity !== 'UNKNOWN';
  const facetId = `facet-${createHash('sha256').update(`${rawText}:0`).digest('hex').slice(0, 12)}`;
  return SemanticRequestPlanSchema.parse({
    ...base,
    outcome: 'MATCH',
    unresolvedSpans,
    facets: [{
      id: facetId,
      sourceSpan: { start: 0, end: rawText.length, text: rawText },
      requestClass: 'DATA_QUERY',
      domainCandidates: [{ id: 'domain.inventory', score: 1 }],
      subject: { entityId: 'entity.inventory_item', recordId: null },
      relations: [{ semanticRelationId: 'relation.inventory_item.warranty', predicateId, targetEntityId: 'entity.warranty' }],
      polarity,
      projection,
      fields: [], where: null, sort: [], limit: null, time: null, groupBy: [], targetCandidates: [], requiredSlots: [], dependsOn: [],
      evidence: {
        jobMatch: 'query.inventory_item.warranty_relation',
        subjectNamed: true,
        relationNamed: true,
        projectionNamed: Boolean(projectionAnnotation),
        polarityNamed: Boolean(polarityAnnotation),
      },
      confidenceSignals: { grammarComplete, unresolvedSpanCount: unresolvedSpans.length },
    }],
  });
}
