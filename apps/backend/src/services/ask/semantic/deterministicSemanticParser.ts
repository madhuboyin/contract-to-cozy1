import { createHash } from 'crypto';
import { ASK_SHARED_SEMANTIC_LEXICON, ASK_SHARED_LEXICON_VERSION, type GeneratedSemanticLexeme } from './sharedSemanticLexicon';
import { ASK_SEMANTIC_PLAN_VERSION, SemanticRequestPlanSchema, type SemanticRequestPlan, type SemanticSourceSpan } from './semanticRequestPlan';

export const ASK_DETERMINISTIC_SEMANTIC_PARSER_VERSION = 'typed-grammar-0.5.0' as const;

interface Annotation extends SemanticSourceSpan {
  lexeme: GeneratedSemanticLexeme;
}
const STOP_WORDS = new Set([
  'a', 'all', 'an', 'any', 'are', 'did', 'do', 'does', 'for', 'in', 'is', 'me', 'my',
  'of', 'on', 'our', 'please', 'provide', 'that', 'the', 'these', 'this', 'those', 'to', 'was', 'were', 'what', 'when', 'which',
]);
const MIN_FUZZY_TOKEN_LENGTH = 5;
const IRREGULAR_MORPHOLOGY = new Map<string, string>([
  ['did', 'do'],
  ['does', 'do'],
  ['had', 'have'],
  ['has', 'have'],
  ['having', 'have'],
]);

function morphologicalKey(token: string): string {
  const irregular = IRREGULAR_MORPHOLOGY.get(token);
  if (irregular) return irregular;
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function tokensMatch(observed: string, registered: string): boolean {
  return observed === registered || morphologicalKey(observed) === morphologicalKey(registered);
}

function boundedEditDistance(left: string, right: string, limit: number): number | null {
  if (Math.abs(left.length - right.length) > limit) return null;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const distance = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
      current.push(distance);
      rowMinimum = Math.min(rowMinimum, distance);
    }
    if (rowMinimum > limit) return null;
    previous = current;
  }
  return previous[right.length] <= limit ? previous[right.length] : null;
}

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
      if (!phraseTokens.every((token, offset) => tokensMatch(normalizedTokens[index + offset], token))) continue;
      const occupied = occupiedByRole.get(lexeme.role) ?? new Set<number>();
      if (phraseTokens.some((_, offset) => occupied.has(index + offset))) continue;
      phraseTokens.forEach((_, offset) => occupied.add(index + offset));
      occupiedByRole.set(lexeme.role, occupied);
      const start = tokens[index].start;
      const end = tokens[index + phraseTokens.length - 1].end;
      annotations.push({ start, end, text: raw.slice(start, end), lexeme });
    }
  }

  // Fuzzy annotation is intentionally a fallback for a single registry token.
  // Requiring a unique best semantic identity prevents a typo from silently
  // selecting between two meanings that happen to be equally close.
  for (let index = 0; index < normalizedTokens.length; index += 1) {
    const observed = normalizedTokens[index];
    if (observed.length < MIN_FUZZY_TOKEN_LENGTH) continue;
    for (const role of ['ENTITY', 'FIELD', 'RELATION', 'JOB', 'PROJECTION', 'POLARITY'] as const) {
      const occupied = occupiedByRole.get(role) ?? new Set<number>();
      if (occupied.has(index)) continue;
      const candidates = ASK_SHARED_SEMANTIC_LEXICON.flatMap((lexeme) => {
        if (lexeme.role !== role || lexeme.phrase.includes(' ') || lexeme.phrase.length < MIN_FUZZY_TOKEN_LENGTH) return [];
        const distance = boundedEditDistance(observed, lexeme.phrase, 1);
        return distance === null || distance === 0 ? [] : [{ lexeme, distance }];
      });
      if (!candidates.length) continue;
      const bestDistance = Math.min(...candidates.map((candidate) => candidate.distance));
      const best = candidates.filter((candidate) => candidate.distance === bestDistance);
      if (new Set(best.map((candidate) => candidate.lexeme.semanticId)).size !== 1) continue;
      occupied.add(index);
      occupiedByRole.set(role, occupied);
      const token = tokens[index];
      annotations.push({ start: token.start, end: token.end, text: raw.slice(token.start, token.end), lexeme: best[0].lexeme });
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

const ENTITY_TO_DOMAIN_AND_JOB: Readonly<Record<string, { domainId: string; jobId: string; defaultProjection: 'DETAIL' | 'LIST' }>> = Object.freeze({
  'entity.property': { domainId: 'domain.property_core', jobId: 'query.property.fact_detail', defaultProjection: 'DETAIL' },
  'entity.inventory_room': { domainId: 'domain.rooms_areas', jobId: 'query.inventory_room.list', defaultProjection: 'LIST' },
  'entity.inventory_item': { domainId: 'domain.inventory', jobId: 'query.inventory_item.field_detail', defaultProjection: 'DETAIL' },
  'entity.home_system': { domainId: 'domain.home_systems_risk', jobId: 'query.home_system.list', defaultProjection: 'LIST' },
  'entity.maintenance_task': { domainId: 'domain.maintenance', jobId: 'query.maintenance_task.list', defaultProjection: 'LIST' },
  'entity.warranty': { domainId: 'domain.protection', jobId: 'query.warranty.list', defaultProjection: 'LIST' },
  'entity.insurance_policy': { domainId: 'domain.protection', jobId: 'query.insurance_policy.detail', defaultProjection: 'DETAIL' },
  'entity.tax_bill': { domainId: 'domain.finance_tax_cost', jobId: 'query.tax_bill.detail', defaultProjection: 'DETAIL' },
  'entity.tax_assessment': { domainId: 'domain.finance_tax_cost', jobId: 'query.tax_assessment.detail', defaultProjection: 'DETAIL' },
  'entity.reserve_fund': { domainId: 'domain.finance_tax_cost', jobId: 'query.reserve_fund.detail', defaultProjection: 'DETAIL' },
  'entity.property_record': { domainId: 'domain.documents_records', jobId: 'query.property_record.list', defaultProjection: 'LIST' },
  'entity.home_event': { domainId: 'domain.timeline_events_monitoring', jobId: 'query.home_event.list', defaultProjection: 'LIST' },
  'entity.buyer_task': { domainId: 'domain.transactions_projects', jobId: 'query.buyer_task.list', defaultProjection: 'LIST' },
  'entity.sale_readiness_item': { domainId: 'domain.transactions_projects', jobId: 'query.sale_readiness_item.list', defaultProjection: 'LIST' },
});

const FIELD_OWNER_ENTITY: Readonly<Record<string, string>> = Object.freeze({
  'field.property.year_built': 'entity.property',
  'field.property.living_area': 'entity.property',
  'field.property.roof_replacement_year': 'entity.property',
  'field.inventory_item.purchase_cost': 'entity.inventory_item',
  'field.inventory_item.replacement_cost': 'entity.inventory_item',
  'field.inventory_item.serial_number': 'entity.inventory_item',
  'field.inventory_item.model_number': 'entity.inventory_item',
  'field.inventory_item.installed_on': 'entity.inventory_item',
  'field.maintenance_task.next_due_date': 'entity.maintenance_task',
  'field.maintenance_task.priority': 'entity.maintenance_task',
  'field.warranty.expiry_date': 'entity.warranty',
  'field.insurance_policy.deductible': 'entity.insurance_policy',
  'field.insurance_policy.premium_amount': 'entity.insurance_policy',
  'field.insurance_policy.expiry_date': 'entity.insurance_policy',
  'field.tax_bill.tax_amount': 'entity.tax_bill',
  'field.reserve_fund.balance': 'entity.reserve_fund',
  'field.buyer_task.due_date': 'entity.buyer_task',
});

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
  const inventorySubject = annotations.find((annotation) => annotation.lexeme.semanticId === 'entity.inventory_item');
  const warrantyRelation = annotations.find((annotation) => annotation.lexeme.semanticId === 'relation.inventory_item.warranty');
  const projectionAnnotation = first(annotations, 'PROJECTION');
  // Explicit negation governs the relation even when an affirmative auxiliary
  // is also present ("have no warranty", "does not have"). This is scope
  // resolution over semantic annotations, not lexicon insertion order.
  const polarityAnnotation = annotations.find((annotation) => annotation.lexeme.semanticId === 'polarity.negative')
    ?? annotations.find((annotation) => annotation.lexeme.semanticId === 'polarity.positive');
  const unresolvedSpans = unresolved(tokens, annotations);
  const facetId = `facet-${createHash('sha256').update(`${rawText}:0`).digest('hex').slice(0, 12)}`;

  // 1. Migrated warranty-relation vertical slice (FAM_P1_WARRANTY_INVENTORY_RELATION)
  if (inventorySubject && warrantyRelation) {
    const projection = projectionAnnotation?.lexeme.semanticId === 'projection.count' ? 'COUNT'
      : projectionAnnotation?.lexeme.semanticId === 'projection.detail' ? 'DETAIL'
      : projectionAnnotation?.lexeme.semanticId === 'projection.exists' ? 'EXISTS' : 'LIST';
    const polarity = polarityAnnotation?.lexeme.semanticId === 'polarity.negative' ? 'NEGATIVE'
      : polarityAnnotation?.lexeme.semanticId === 'polarity.positive' ? 'POSITIVE' : 'UNKNOWN';
    const predicateId = polarity === 'NEGATIVE' ? 'predicate.inventory_item.has_no_warranty_record'
      : polarity === 'POSITIVE' ? 'predicate.inventory_item.has_warranty_record'
      : 'predicate.inventory_item.warranty_state_unknown';
    const grammarComplete = unresolvedSpans.length === 0 && polarity !== 'UNKNOWN';
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
        fields: [],
        where: {
          kind: 'PREDICATE',
          predicateId,
          relationPathId: 'path.inventory_item.warranty',
        },
        sort: [], limit: null, time: null, groupBy: [], targetCandidates: [], requiredSlots: [], dependsOn: [],
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

  // 2. Saved-results retrieval false-decline family (FAM_P1_SAVED_RESULTS_RETRIEVAL)
  const savedResultEntity = annotations.find((annotation) => annotation.lexeme.semanticId === 'entity.saved_result');
  const savedResultJob = annotations.find((annotation) => annotation.lexeme.semanticId === 'job.saved_results.lookup');
  if ((savedResultEntity || savedResultJob) && unresolvedSpans.length === 0) {
    const projection = projectionAnnotation?.lexeme.semanticId === 'projection.count' ? 'COUNT' : 'LIST';
    return SemanticRequestPlanSchema.parse({
      ...base,
      outcome: 'MATCH',
      unresolvedSpans,
      facets: [{
        id: facetId,
        sourceSpan: { start: 0, end: rawText.length, text: rawText },
        requestClass: 'CAPABILITY',
        domainCandidates: [{ id: 'domain.operations_saved_work', score: 1 }],
        subject: { entityId: 'entity.saved_result', recordId: null },
        relations: [],
        polarity: 'POSITIVE',
        projection,
        fields: [],
        where: null,
        sort: [], limit: null, time: null, groupBy: [],
        targetCandidates: [{ id: 'saved-results.read', score: 1 }],
        requiredSlots: [], dependsOn: [],
        evidence: {
          jobMatch: 'job.saved_results.lookup',
          subjectNamed: true,
          relationNamed: false,
          projectionNamed: Boolean(projectionAnnotation),
          polarityNamed: false,
        },
        confidenceSignals: { grammarComplete: true, unresolvedSpanCount: 0 },
      }],
    });
  }

  // 3. Cross-domain Phase 1 basic-read families across the 11 §5 domain groups
  const fieldAnnotations = annotations.filter((annotation) => annotation.lexeme.role === 'FIELD');
  const primaryField = fieldAnnotations[0];
  const entityAnnotations = annotations.filter((annotation) => annotation.lexeme.role === 'ENTITY');
  const explicitEntity = entityAnnotations.find((annotation) => annotation.lexeme.semanticId in ENTITY_TO_DOMAIN_AND_JOB);
  const inferredEntityId = explicitEntity?.lexeme.semanticId ?? (primaryField ? FIELD_OWNER_ENTITY[primaryField.lexeme.semanticId] : undefined);

  if (!inferredEntityId || !(inferredEntityId in ENTITY_TO_DOMAIN_AND_JOB)) {
    return SemanticRequestPlanSchema.parse({ ...base, outcome: 'NONE_FITS', facets: [], unresolvedSpans });
  }

  // Inventory-item queries without the warranty relation require a registered inventory field
  // (e.g. purchase_cost, replacement_cost, serial_number, installed_on) so unsupported relations
  // like "which appliances have no guarantee" fail closed with NONE_FITS.
  if (inferredEntityId === 'entity.inventory_item' && !primaryField) {
    return SemanticRequestPlanSchema.parse({ ...base, outcome: 'NONE_FITS', facets: [], unresolvedSpans });
  }

  // Standalone warranty entity reads ("list warranties", "show warranty expiration date") only match
  // positive polarity without unresolved tokens, so malformed negative item queries ("which itms have no warranty")
  // do not get misparsed as a list of Warranty records.
  if (
    inferredEntityId === 'entity.warranty'
    && (polarityAnnotation?.lexeme.semanticId === 'polarity.negative' || unresolvedSpans.length > 0)
  ) {
    return SemanticRequestPlanSchema.parse({ ...base, outcome: 'NONE_FITS', facets: [], unresolvedSpans });
  }

  const meta = ENTITY_TO_DOMAIN_AND_JOB[inferredEntityId];
  const fieldIds = [...new Set(
    fieldAnnotations
      .filter((annotation) => FIELD_OWNER_ENTITY[annotation.lexeme.semanticId] === inferredEntityId)
      .map((annotation) => annotation.lexeme.semanticId),
  )];
  const fields = fieldIds.map((fieldId) => ({ fieldId }));
  const projection = projectionAnnotation?.lexeme.semanticId === 'projection.count' ? 'COUNT'
    : projectionAnnotation?.lexeme.semanticId === 'projection.detail' ? 'DETAIL'
    : projectionAnnotation?.lexeme.semanticId === 'projection.exists' ? 'EXISTS'
    : projectionAnnotation?.lexeme.semanticId === 'projection.list' ? 'LIST'
    : fields.length > 0 && meta.defaultProjection === 'DETAIL' ? 'DETAIL' : meta.defaultProjection;
  const polarity = polarityAnnotation?.lexeme.semanticId === 'polarity.negative' ? 'NEGATIVE' : 'POSITIVE';
  const grammarComplete = unresolvedSpans.length === 0;

  return SemanticRequestPlanSchema.parse({
    ...base,
    outcome: 'MATCH',
    unresolvedSpans,
    facets: [{
      id: facetId,
      sourceSpan: { start: 0, end: rawText.length, text: rawText },
      requestClass: 'DATA_QUERY',
      domainCandidates: [{ id: meta.domainId, score: 1 }],
      subject: { entityId: inferredEntityId, recordId: null },
      relations: [],
      polarity,
      projection,
      fields,
      where: null,
      sort: [], limit: null, time: null, groupBy: [],
      targetCandidates: [{ id: 'data-point-read.read', score: 1 }],
      requiredSlots: [], dependsOn: [],
      evidence: {
        jobMatch: meta.jobId,
        subjectNamed: Boolean(explicitEntity),
        relationNamed: false,
        projectionNamed: Boolean(projectionAnnotation),
        polarityNamed: Boolean(polarityAnnotation),
      },
      confidenceSignals: { grammarComplete, unresolvedSpanCount: unresolvedSpans.length },
    }],
  });
}
