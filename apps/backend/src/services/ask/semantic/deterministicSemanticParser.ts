import { createHash } from 'crypto';
import { ASK_SHARED_SEMANTIC_LEXICON, ASK_SHARED_LEXICON_VERSION, type GeneratedSemanticLexeme } from './sharedSemanticLexicon';
import {
  ASK_SEMANTIC_PLAN_VERSION,
  SemanticRequestPlanSchema,
  type SemanticRequestPlan,
  type SemanticSourceSpan,
  type SemanticTimeConstraint,
  type SemanticWhereExpression,
} from './semanticRequestPlan';
import { assembleSemanticBooleanExpression } from './semanticBooleanAssembler';
import { buildSemanticTextEnvelope, type DynamicPlaceholderEntityCandidate } from './slice/placeholderSpanMap';

interface SemanticPredicateAtom {
  kind: 'PREDICATE';
  predicateId: string;
  relationPathId: string;
  targetRecordId?: string | null;
  thresholdYears?: number;
}

/** "older than 10 years" / "more than 10 years old": whole years only; never a bare number, and never a phrase that cannot be located in the text. */
// "over 5 years old" counts, but a bare "over 5 years" does not: without "old" it is a duration, not an age ("over 2 years since the last service").
const AGE_PHRASE = /\b(?:older|more)\s+than\s+(\d{1,3})\s*(?:years?|yrs?)\b(?:\s+old)?|\bover\s+(\d{1,3})\s*(?:years?|yrs?)\s+old\b/i;
function findAgePhrase(raw: string): { years: number; span: SemanticSourceSpan } | null {
  const match = AGE_PHRASE.exec(raw);
  if (!match || match.index === undefined) return null;
  const years = Number(match[1] ?? match[2]);
  if (!Number.isInteger(years) || years < 1 || years > 100) return null;
  return { years, span: { start: match.index, end: match.index + match[0].length, text: match[0] } };
}

export type NegativeOrReading = 'EITHER_OR' | 'NEITHER_NOR';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchedDynamicRooms(
  rawText: string,
  dynamicEntities?: readonly DynamicPlaceholderEntityCandidate[]
): Array<{ recordId: string; name: string; start: number }> {
  if (!dynamicEntities?.length) return [];
  const matches: Array<{ recordId: string; name: string; start: number }> = [];
  const seenIds = new Set<string>();
  for (const candidate of dynamicEntities) {
    if (candidate.kind !== 'ROOM' || !candidate.authorized || seenIds.has(candidate.recordId)) continue;
    let earliest: number | null = null;
    for (const name of candidate.names) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const match = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, 'i').exec(rawText);
      if (match && (earliest === null || match.index < earliest)) {
        earliest = match.index;
      }
    }
    if (earliest !== null) {
      seenIds.add(candidate.recordId);
      matches.push({
        recordId: candidate.recordId,
        name: candidate.safeDisplayLabel ?? candidate.names[0] ?? candidate.recordId,
        start: earliest,
      });
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}

export const ASK_DETERMINISTIC_SEMANTIC_PARSER_VERSION = 'typed-grammar-0.5.0' as const;

interface Annotation extends SemanticSourceSpan {
  lexeme: GeneratedSemanticLexeme;
}
const STOP_WORDS = new Set([
  'a', 'all', 'an', 'any', 'are', 'did', 'do', 'does', 'for', 'i', 'in', 'is', 'me', 'my',
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
  // A projection phrase that begins INSIDE an earlier, longer entity/field phrase is part of that phrase, not a projection
  // ("serial number of my fridge": "number of" must not make this a COUNT). Longest-phrase-wins across roles.
  return annotations.filter((candidate) => candidate.lexeme.role !== 'PROJECTION'
    || !annotations.some((other) => other.lexeme.role !== 'PROJECTION' && other.start < candidate.start && other.end > candidate.start));
}

function unresolved(
  tokens: readonly SemanticSourceSpan[],
  annotations: readonly Annotation[],
  dynamicSpans: readonly SemanticSourceSpan[] = []
): SemanticSourceSpan[] {
  return tokens.filter((token) => {
    const normalized = token.text.toLocaleLowerCase('en-US').replace('’', "'");
    return !STOP_WORDS.has(normalized)
      && !annotations.some((annotation) => token.start >= annotation.start && token.end <= annotation.end)
      && !dynamicSpans.some((span) => token.start >= span.start && token.end <= span.end);
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

export function parseDeterministicSemanticRequest(
  rawText: string,
  options?: {
    readonly dynamicEntities?: readonly DynamicPlaceholderEntityCandidate[];
    /**
     * The homeowner's answer to the "no A or B" question (see describeNegativeOrAmbiguity): EITHER_OR is "no A, or B" (the negation belongs to the first condition and
     * the second stands on its own), NEITHER_NOR is "neither A nor B". Without it a bare "no A or B" is the ambiguous shape and is asked, never guessed.
     */
    readonly coordinationReading?: NegativeOrReading;
  }
): SemanticRequestPlan {
  const { normalized, tokens } = normalizedWithOffsets(rawText);
  const envelope = buildSemanticTextEnvelope(rawText, {
    normalizedText: normalized,
    dynamicEntities: options?.dynamicEntities,
  });
  const base = {
    schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
    producer: { kind: 'DETERMINISTIC' as const, version: `${ASK_DETERMINISTIC_SEMANTIC_PARSER_VERSION}+${ASK_SHARED_LEXICON_VERSION}` },
    rawText,
    normalizedText: normalized,
    minimizedText: envelope.minimizedText,
  };
  if (!tokens.length) return SemanticRequestPlanSchema.parse({ ...base, outcome: 'INSUFFICIENT_TEXT', facets: [], unresolvedSpans: [] });

  const annotations = annotate(rawText, tokens);
  const inventorySubject = annotations.find((annotation) => annotation.lexeme.semanticId === 'entity.inventory_item');
  const warrantyRelation = annotations.find((annotation) => annotation.lexeme.semanticId === 'relation.inventory_item.warranty');
  const maintenanceRelation = annotations.find((annotation) => annotation.lexeme.semanticId === 'relation.inventory_item.maintenance_task');
  const roomRelation = annotations.find((annotation) => annotation.lexeme.semanticId === 'relation.inventory_item.room');
  const projectionAnnotation = first(annotations, 'PROJECTION');
  const timeAnnotation = first(annotations, 'TIME');
  const coordinatorAnnotations = annotations.filter((annotation) => annotation.lexeme.role === 'COORDINATOR');
  const matchedRooms = findMatchedDynamicRooms(rawText, options?.dynamicEntities);
  // Explicit negation governs the relation even when an affirmative auxiliary
  // is also present ("have no warranty", "does not have"). This is scope
  // resolution over semantic annotations, not lexicon insertion order.
  const polarityAnnotation = annotations.find((annotation) => annotation.lexeme.semanticId === 'polarity.negative')
    ?? annotations.find((annotation) => annotation.lexeme.semanticId === 'polarity.positive');
  const dynamicSpans: SemanticSourceSpan[] = envelope.spanMap.map((entry) => ({
    start: entry.rawStart,
    end: entry.rawEnd,
    text: rawText.slice(entry.rawStart, entry.rawEnd),
  }));
  const agePhrase = findAgePhrase(rawText);
  const unresolvedSpans = unresolved(tokens, annotations, agePhrase ? [...dynamicSpans, agePhrase.span] : dynamicSpans);
  const facetId = `facet-${createHash('sha256').update(`${rawText}:0`).digest('hex').slice(0, 12)}`;

  // 0A. Phase 2A analysis capability: replacement guidance
  const replacementGuidanceJob = annotations.find((annotation) => annotation.lexeme.semanticId === 'job.inventory.replacement_guidance');
  if (replacementGuidanceJob) {
    if (unresolvedSpans.length > 0) {
      return SemanticRequestPlanSchema.parse({ ...base, outcome: 'NONE_FITS', facets: [], unresolvedSpans });
    }
    return SemanticRequestPlanSchema.parse({
      ...base,
      outcome: 'MATCH',
      unresolvedSpans,
      facets: [{
        id: facetId,
        sourceSpan: { start: 0, end: rawText.length, text: rawText },
        requestClass: 'CAPABILITY',
        domainCandidates: [{ id: 'domain.inventory', score: 1 }],
        subject: { entityId: 'entity.inventory_item', recordId: null },
        relations: [],
        polarity: 'POSITIVE',
        projection: 'ANALYSIS',
        fields: [],
        where: null,
        sort: [], limit: null, time: null, groupBy: [],
        targetCandidates: [{ id: 'capability.inventory.replacement_guidance', score: 1 }],
        requiredSlots: [], dependsOn: [],
        evidence: {
          jobMatch: 'job.inventory.replacement_guidance',
          subjectNamed: Boolean(inventorySubject),
          relationNamed: false,
          projectionNamed: Boolean(projectionAnnotation),
          polarityNamed: Boolean(polarityAnnotation),
        },
        confidenceSignals: { grammarComplete: unresolvedSpans.length === 0, unresolvedSpanCount: unresolvedSpans.length },
      }],
    });
  }

  // 0B. Phase 2A command preview: create / schedule maintenance task
  const createMaintenanceJob = annotations.find((annotation) => annotation.lexeme.semanticId === 'job.maintenance.create');
  if (createMaintenanceJob) {
    if (unresolvedSpans.length > 0) {
      return SemanticRequestPlanSchema.parse({ ...base, outcome: 'NONE_FITS', facets: [], unresolvedSpans });
    }
    const dueDateMatch = rawText.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? null;
    const commandTime: SemanticTimeConstraint | null = dueDateMatch
      ? { kind: 'EXACT_DATE', isoDate: dueDateMatch }
      : null;
    return SemanticRequestPlanSchema.parse({
      ...base,
      outcome: 'MATCH',
      unresolvedSpans,
      facets: [{
        id: facetId,
        sourceSpan: { start: 0, end: rawText.length, text: rawText },
        requestClass: 'COMMAND',
        domainCandidates: [{ id: 'domain.maintenance', score: 1 }],
        subject: { entityId: 'entity.maintenance_task', recordId: null },
        relations: [],
        polarity: 'POSITIVE',
        projection: 'DETAIL',
        fields: [],
        where: null,
        sort: [], limit: null, time: commandTime, groupBy: [],
        targetCandidates: [{ id: 'command.maintenance.create_preview', score: 1 }],
        requiredSlots: [], dependsOn: [],
        evidence: {
          jobMatch: 'job.maintenance.create',
          subjectNamed: true,
          relationNamed: false,
          projectionNamed: Boolean(projectionAnnotation),
          polarityNamed: Boolean(polarityAnnotation),
        },
        confidenceSignals: { grammarComplete: unresolvedSpans.length === 0, unresolvedSpanCount: unresolvedSpans.length },
      }],
    });
  }

  // 0C. Phase 2A multi-relation / Boolean coordination over inventory_item
  const hasEffectiveRoomRelation = Boolean(roomRelation) || matchedRooms.length > 0;
  const relationCount = [warrantyRelation, maintenanceRelation, hasEffectiveRoomRelation, agePhrase].filter(Boolean).length;
  const hasAnd = coordinatorAnnotations.some((annotation) => annotation.lexeme.semanticId === 'coordinator.and');
  const hasOr = coordinatorAnnotations.some((annotation) => annotation.lexeme.semanticId === 'coordinator.or');
  const hasNeitherNor = coordinatorAnnotations.some((annotation) => annotation.lexeme.semanticId === 'coordinator.neither')
    && coordinatorAnnotations.some((annotation) => annotation.lexeme.semanticId === 'coordinator.nor');
  const hasBooleanCoordinator = hasAnd || hasOr || hasNeitherNor;
  if (inventorySubject && (relationCount >= 2 || (relationCount >= 1 && (maintenanceRelation || hasEffectiveRoomRelation || agePhrase || hasBooleanCoordinator)))) {
    const projection = projectionAnnotation?.lexeme.semanticId === 'projection.count' ? 'COUNT'
      : projectionAnnotation?.lexeme.semanticId === 'projection.detail' ? 'DETAIL'
      : projectionAnnotation?.lexeme.semanticId === 'projection.exists' ? 'EXISTS' : 'LIST';
    const polarity = polarityAnnotation?.lexeme.semanticId === 'polarity.negative' ? 'NEGATIVE'
      : polarityAnnotation?.lexeme.semanticId === 'polarity.positive' ? 'POSITIVE' : 'UNKNOWN';

    // An age condition ("older than 10 years") restates its own predicate, so "no warranty or older than 10 years" is not the ambiguous "no A or B" shape:
    // the negation belongs to the first condition and the second stands on its own.
    let coordination = hasNeitherNor ? 'NEITHER_NOR' as const
      : polarity === 'NEGATIVE' && hasOr && !agePhrase ? 'AMBIGUOUS_NEGATIVE_OR' as const
      : hasOr ? 'EITHER_OR' as const
      : hasAnd ? 'AND' as const
      : 'SINGLE' as const;

    const expressions: SemanticWhereExpression[] = [];
    let roomListGrouped = 0;
    const relations: Array<{ semanticRelationId: string; predicateId: string; targetEntityId: string }> = [];
    const isOverdue = timeAnnotation?.lexeme.semanticId === 'time.maintenance.overdue';
    const queryTime: SemanticTimeConstraint | null = isOverdue
      ? { kind: 'DUE_STATUS', status: 'OVERDUE' }
      : timeAnnotation?.lexeme.semanticId === 'time.maintenance.due'
        ? { kind: 'DUE_STATUS', status: 'DUE' }
        : null;

    // The homeowner answered the "no A or B" question: apply their reading to the same message. Under EITHER_OR the negation belongs to the condition named first.
    const ambiguousNegativeOr = coordination === 'AMBIGUOUS_NEGATIVE_OR';
    if (ambiguousNegativeOr && options?.coordinationReading) coordination = options.coordinationReading;
    const eitherAfterNegation = ambiguousNegativeOr && options?.coordinationReading === 'EITHER_OR';
    const firstOperand: 'warranty' | 'maintenance' | null = warrantyRelation && maintenanceRelation ? (warrantyRelation.start < maintenanceRelation.start ? 'warranty' : 'maintenance') : null;
    const negatedHere = (operand: 'warranty' | 'maintenance') => polarity === 'NEGATIVE' && (!eitherAfterNegation || firstOperand === null || firstOperand === operand);

    if (warrantyRelation) {
      // "Neither a warranty nor …" is "no warranty record AND …". It used to negate "has a warranty", which counted an unknown or conflicted warranty state as "no
      // warranty"; those states are never counted either way.
      const predicateId = coordination === 'NEITHER_NOR'
        ? 'predicate.inventory_item.has_no_warranty_record'
        : negatedHere('warranty') ? 'predicate.inventory_item.has_no_warranty_record'
        : polarity === 'POSITIVE' ? 'predicate.inventory_item.has_warranty_record'
        : 'predicate.inventory_item.warranty_state_unknown';
      expressions.push({ kind: 'PREDICATE', predicateId, relationPathId: 'path.inventory_item.warranty' });
      relations.push({ semanticRelationId: 'relation.inventory_item.warranty', predicateId, targetEntityId: 'entity.warranty' });
    }
    if (maintenanceRelation) {
      const predicateId = isOverdue
        ? 'predicate.inventory_item.has_overdue_maintenance'
        : coordination === 'NEITHER_NOR'
          ? 'predicate.inventory_item.has_no_due_maintenance'
          : negatedHere('maintenance') ? 'predicate.inventory_item.has_no_due_maintenance'
          : 'predicate.inventory_item.has_due_maintenance';
      const atom: SemanticPredicateAtom = { kind: 'PREDICATE', predicateId, relationPathId: 'path.inventory_item.maintenance_task' };
      const shouldNegateAtom = isOverdue
        && (coordination === 'NEITHER_NOR' || (negatedHere('maintenance') && coordination !== 'AMBIGUOUS_NEGATIVE_OR'));
      expressions.push(shouldNegateAtom ? { kind: 'NOT', operand: atom } : atom);
      relations.push({ semanticRelationId: 'relation.inventory_item.maintenance_task', predicateId, targetEntityId: 'entity.maintenance_task' });
    }
    if (hasEffectiveRoomRelation) {
      const predicateId = 'predicate.inventory_item.in_room';
      const roomAtoms: SemanticPredicateAtom[] = matchedRooms.length > 0
        ? matchedRooms.map((room) => ({
            kind: 'PREDICATE',
            predicateId,
            relationPathId: 'path.inventory_item.room',
            targetRecordId: room.recordId,
          }))
        : [{ kind: 'PREDICATE', predicateId, relationPathId: 'path.inventory_item.room' }];
      relations.push({ semanticRelationId: 'relation.inventory_item.room', predicateId, targetEntityId: 'entity.room' });

      if (roomAtoms.length >= 2 && (warrantyRelation || maintenanceRelation || agePhrase)) {
        // A list of rooms ("in the kitchen or laundry room", or "kitchen and laundry room") is ONE positive group of places, inclusive whatever the other
        // conditions' polarity says ("MISSING receipts in the kitchen or laundry room": the negation belongs to the receipts, not to the rooms). The group is
        // then combined with the other conditions below. It used to be asked as a "neither/either" question, and where it was not, the top-level join was
        // switched to OR, so "has a warranty in the kitchen or basement" returned every item.
        const assembledRooms = assembleSemanticBooleanExpression({ coordination: 'EITHER_OR', predicates: roomAtoms });
        // Under "neither … nor" the whole room list is excluded; negated here because "neither" is built as an AND of explicit negations (see below).
        if (assembledRooms.outcome === 'ASSEMBLED') expressions.push(coordination === 'NEITHER_NOR' ? { kind: 'NOT', operand: assembledRooms.expression } : assembledRooms.expression);
        roomListGrouped = roomAtoms.length;
      } else if (roomAtoms.length === 1) {
        // "no warranty in the kitchen": the negation belongs to the warranty. A room is negated only when it is the only condition ("items not in the kitchen").
        const shouldNegateRoom = coordination === 'NEITHER_NOR'
          || (polarity === 'NEGATIVE' && relationCount === 1 && coordination !== 'AMBIGUOUS_NEGATIVE_OR');
        expressions.push(shouldNegateRoom ? { kind: 'NOT', operand: roomAtoms[0] } : roomAtoms[0]);
      } else {
        expressions.push(...roomAtoms);
      }
    }

    if (agePhrase) {
      const predicateId = 'predicate.inventory_item.older_than_years';
      const atom: SemanticPredicateAtom = { kind: 'PREDICATE', predicateId, relationPathId: 'path.inventory_item.age', thresholdYears: agePhrase.years };
      // Negation never attaches to the age condition unless it is the only condition ("which appliances are not older than 10 years").
      expressions.push(coordination === 'NEITHER_NOR' || (polarity === 'NEGATIVE' && relationCount === 1) ? { kind: 'NOT', operand: atom } : atom);
      relations.push({ semanticRelationId: 'relation.inventory_item.age', predicateId, targetEntityId: 'entity.inventory_item' });
    }

    if (roomListGrouped > 0) {
      // The "or" words between the rooms belong to the room list; only an "or" beyond them coordinates the conditions (and then a negated "no A or B" is still the
      // ambiguous shape). Otherwise the conditions are all required: "no warranty in the kitchen or basement" is no warranty AND in either room.
      const orWords = coordinatorAnnotations.filter((annotation) => annotation.lexeme.semanticId === 'coordinator.or').length;
      const orBeyondRooms = orWords > roomListGrouped - 1;
      coordination = hasNeitherNor || coordination === 'NEITHER_NOR' ? 'NEITHER_NOR'
        : orBeyondRooms ? (polarity === 'NEGATIVE' && !agePhrase ? 'AMBIGUOUS_NEGATIVE_OR' : 'EITHER_OR')
        : expressions.length >= 2 ? 'AND' : 'SINGLE';
    }

    // "Neither A nor B" is every condition excluded, built from explicit negations above (a "has no …" predicate, or NOT of a positive one), so the assembler must not
    // negate them again.
    if (coordination === 'NEITHER_NOR') coordination = expressions.length >= 2 ? 'AND' : 'SINGLE';

    if (coordination === 'SINGLE' && expressions.length >= 2) {
      coordination = 'AND';
    }

    const assembled = assembleSemanticBooleanExpression({ coordination, predicates: expressions });
    // Words that were not understood are reported as such BEFORE any question about the words that were: asking "neither or either?" about half a sentence
    // whose other half was dropped is the partial interpretation FR-PLAN-5 forbids (live prompt #15 asked it about rooms while "receipts" was not understood).
    if (unresolvedSpans.length > 0) {
      return SemanticRequestPlanSchema.parse({ ...base, outcome: 'NONE_FITS', facets: [], unresolvedSpans });
    }
    if (assembled.outcome === 'CLARIFY') {
      return SemanticRequestPlanSchema.parse({ ...base, outcome: 'BOUNDARY', facets: [], unresolvedSpans });
    }
    if (assembled.outcome === 'ASSEMBLED') {
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
          relations,
          polarity,
          projection,
          fields: [],
          where: assembled.expression,
          sort: [], limit: null, time: queryTime, groupBy: [], targetCandidates: [{ id: 'data-point-read.read', score: 1 }],
          requiredSlots: [], dependsOn: [],
          evidence: {
            jobMatch: 'query.inventory_item.relation_boolean',
            subjectNamed: true,
            relationNamed: true,
            projectionNamed: Boolean(projectionAnnotation),
            polarityNamed: Boolean(polarityAnnotation),
          },
          confidenceSignals: { grammarComplete: unresolvedSpans.length === 0, unresolvedSpanCount: unresolvedSpans.length },
        }],
      });
    }
  }

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
  // (e.g. purchase_cost, replacement_cost, serial_number, installed_on) unless a clear
  // projection (list/count/detail/exists) is given with no unsupported nouns/relations,
  // so unsupported relations like "which appliances have no guarantee" fail closed with NONE_FITS.
  const hasUnsupportedInventoryToken = unresolvedSpans.some(
    (span) => !['i', 'and', 'or', 'either', 'neither', 'nor'].includes(span.text.toLocaleLowerCase('en-US'))
  );
  if (inferredEntityId === 'entity.inventory_item' && !primaryField && (!projectionAnnotation || hasUnsupportedInventoryToken)) {
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
  const showScalarDetail =
    projectionAnnotation?.lexeme.semanticId === 'projection.list'
    && /^show$/i.test(projectionAnnotation.text)
    && fields.length > 0
    && !/\b(?:list|all|warranties|policies|items|appliances|tasks|bills|records|events|rooms)\b/i.test(rawText);
  const projection = projectionAnnotation?.lexeme.semanticId === 'projection.count' ? 'COUNT'
    : projectionAnnotation?.lexeme.semanticId === 'projection.detail' || showScalarDetail ? 'DETAIL'
    : projectionAnnotation?.lexeme.semanticId === 'projection.exists' ? 'EXISTS'
    : projectionAnnotation?.lexeme.semanticId === 'projection.list' ? 'LIST'
    : fields.length > 0 && meta.defaultProjection === 'DETAIL' ? 'DETAIL' : meta.defaultProjection;
  const polarity = polarityAnnotation?.lexeme.semanticId === 'polarity.negative' ? 'NEGATIVE' : 'POSITIVE';
  const grammarComplete = unresolvedSpans.length === 0;
  if (inferredEntityId === 'entity.maintenance_task' && !grammarComplete) {
    return SemanticRequestPlanSchema.parse({ ...base, outcome: 'NONE_FITS', facets: [], unresolvedSpans });
  }
  const maintenanceTime: SemanticTimeConstraint | null = inferredEntityId === 'entity.maintenance_task' && timeAnnotation
    ? {
        kind: 'DUE_STATUS',
        status: timeAnnotation.lexeme.semanticId === 'time.maintenance.overdue' ? 'OVERDUE' : 'DUE',
      }
    : null;

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
      sort: [], limit: null, time: maintenanceTime, groupBy: [],
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

export interface SemanticFollowUpDelta {
  readonly outcome: 'APPLICABLE' | 'UNRESOLVED' | 'INSUFFICIENT_TEXT';
  readonly unresolvedSpans: readonly SemanticSourceSpan[];
  readonly projection: 'EXISTS' | 'COUNT' | 'LIST' | 'DETAIL' | null;
  readonly polarity: 'POSITIVE' | 'NEGATIVE' | null;
  readonly time: SemanticTimeConstraint | null;
  readonly relations: ReadonlyArray<{ semanticRelationId: string; predicateId: string; targetEntityId: string }>;
  readonly where: SemanticWhereExpression | null;
}

/**
 * Extracts typed semantic refinement deltas from a follow-up utterance using
 * the shared lexicon and dynamic property entities so callers refine the prior
 * validated SemanticRequestPlan directly without rewriting raw text.
 */
export function extractSemanticFollowUpDelta(
  followUpText: string,
  options?: { readonly dynamicEntities?: readonly DynamicPlaceholderEntityCandidate[] }
): SemanticFollowUpDelta {
  const { normalized, tokens } = normalizedWithOffsets(followUpText);
  if (!tokens.length) {
    return {
      outcome: 'INSUFFICIENT_TEXT',
      unresolvedSpans: [],
      projection: null,
      polarity: null,
      time: null,
      relations: [],
      where: null,
    };
  }
  const envelope = buildSemanticTextEnvelope(followUpText, {
    normalizedText: normalized,
    dynamicEntities: options?.dynamicEntities,
  });
  const dynamicSpans: SemanticSourceSpan[] = envelope.spanMap.map((entry) => ({
    start: entry.rawStart,
    end: entry.rawEnd,
    text: followUpText.slice(entry.rawStart, entry.rawEnd),
  }));
  const annotations = annotate(followUpText, tokens);
  const unresolvedSpans = unresolved(tokens, annotations, dynamicSpans);
  const projectionAnnotation = first(annotations, 'PROJECTION');
  const timeAnnotation = first(annotations, 'TIME');
  const polarityAnnotation = annotations.find((annotation) => annotation.lexeme.semanticId === 'polarity.negative')
    ?? annotations.find((annotation) => annotation.lexeme.semanticId === 'polarity.positive');

  const projection = projectionAnnotation?.lexeme.semanticId === 'projection.count' ? 'COUNT'
    : projectionAnnotation?.lexeme.semanticId === 'projection.detail' ? 'DETAIL'
    : projectionAnnotation?.lexeme.semanticId === 'projection.exists' ? 'EXISTS'
    : projectionAnnotation?.lexeme.semanticId === 'projection.list' ? 'LIST'
    : null;
  const polarity = polarityAnnotation?.lexeme.semanticId === 'polarity.negative' ? 'NEGATIVE'
    : polarityAnnotation?.lexeme.semanticId === 'polarity.positive' ? 'POSITIVE'
    : null;
  const time: SemanticTimeConstraint | null = timeAnnotation?.lexeme.semanticId === 'time.maintenance.overdue'
    ? { kind: 'DUE_STATUS', status: 'OVERDUE' }
    : timeAnnotation?.lexeme.semanticId === 'time.maintenance.due'
      ? { kind: 'DUE_STATUS', status: 'DUE' }
      : null;

  const warrantyRelation = annotations.find((annotation) => annotation.lexeme.semanticId === 'relation.inventory_item.warranty');
  const maintenanceRelation = annotations.find((annotation) => annotation.lexeme.semanticId === 'relation.inventory_item.maintenance_task');
  const roomRelation = annotations.find((annotation) => annotation.lexeme.semanticId === 'relation.inventory_item.room');
  const matchedRooms = findMatchedDynamicRooms(followUpText, options?.dynamicEntities);
  const coordinatorAnnotations = annotations.filter((annotation) => annotation.lexeme.role === 'COORDINATOR');
  const hasOr = coordinatorAnnotations.some((annotation) => annotation.lexeme.semanticId === 'coordinator.or');
  const hasNeitherNor = coordinatorAnnotations.some((annotation) => annotation.lexeme.semanticId === 'coordinator.neither')
    && coordinatorAnnotations.some((annotation) => annotation.lexeme.semanticId === 'coordinator.nor');

  const relations: Array<{ semanticRelationId: string; predicateId: string; targetEntityId: string }> = [];
  const expressions: SemanticWhereExpression[] = [];

  if (warrantyRelation) {
    const predicateId = polarity === 'NEGATIVE'
      ? 'predicate.inventory_item.has_no_warranty_record'
      : 'predicate.inventory_item.has_warranty_record';
    relations.push({ semanticRelationId: 'relation.inventory_item.warranty', predicateId, targetEntityId: 'entity.warranty' });
    expressions.push({ kind: 'PREDICATE', predicateId, relationPathId: 'path.inventory_item.warranty' });
  }
  if (maintenanceRelation) {
    const isOverdue = time?.kind === 'DUE_STATUS' && time.status === 'OVERDUE';
    const predicateId = isOverdue
      ? 'predicate.inventory_item.has_overdue_maintenance'
      : polarity === 'NEGATIVE'
        ? 'predicate.inventory_item.has_no_due_maintenance'
        : 'predicate.inventory_item.has_due_maintenance';
    relations.push({ semanticRelationId: 'relation.inventory_item.maintenance_task', predicateId, targetEntityId: 'entity.maintenance_task' });
    const atom: SemanticPredicateAtom = { kind: 'PREDICATE', predicateId, relationPathId: 'path.inventory_item.maintenance_task' };
    expressions.push(isOverdue && polarity === 'NEGATIVE' ? { kind: 'NOT', operand: atom } : atom);
  }
  if (roomRelation || matchedRooms.length > 0) {
    const predicateId = 'predicate.inventory_item.in_room';
    relations.push({ semanticRelationId: 'relation.inventory_item.room', predicateId, targetEntityId: 'entity.room' });
    const roomAtoms: SemanticPredicateAtom[] = matchedRooms.length > 0
      ? matchedRooms.map((room) => ({ kind: 'PREDICATE', predicateId, relationPathId: 'path.inventory_item.room', targetRecordId: room.recordId }))
      : [{ kind: 'PREDICATE', predicateId, relationPathId: 'path.inventory_item.room' }];
    if (roomAtoms.length === 1) {
      expressions.push(polarity === 'NEGATIVE' ? { kind: 'NOT', operand: roomAtoms[0] } : roomAtoms[0]);
    } else {
      const roomCoord = hasNeitherNor ? 'NEITHER_NOR' : hasOr ? 'EITHER_OR' : 'AND';
      const assembledRooms = assembleSemanticBooleanExpression({ coordination: roomCoord, predicates: roomAtoms });
      if (assembledRooms.outcome === 'ASSEMBLED') {
        expressions.push(assembledRooms.expression);
      }
    }
  }

  let where: SemanticWhereExpression | null = null;
  if (expressions.length === 1) {
    where = expressions[0];
  } else if (expressions.length >= 2) {
    const coord = hasNeitherNor ? 'NEITHER_NOR' : hasOr ? 'EITHER_OR' : 'AND';
    const assembled = assembleSemanticBooleanExpression({ coordination: coord, predicates: expressions });
    if (assembled.outcome === 'ASSEMBLED') {
      where = assembled.expression;
    }
  }

  const hasAnySemanticChange = Boolean(projection || polarity || time || relations.length > 0 || where);
  const outcome = unresolvedSpans.length > 0 || !hasAnySemanticChange ? 'UNRESOLVED' : 'APPLICABLE';

  return { outcome, unresolvedSpans, projection, polarity, time, relations, where };
}


/**
 * The two conditions of a bare "no A or B" over warranty and maintenance, in the order the homeowner named them, or null when the question is any other shape. It is the
 * one thing a card needs to say what the two readings are in plain words ("items with no warranty and no maintenance due") instead of fixed text.
 */
export function describeNegativeOrAmbiguity(rawText: string): { readonly operands: readonly ['warranty' | 'maintenance', 'warranty' | 'maintenance'] } | null {
  const { normalized, tokens } = normalizedWithOffsets(rawText);
  if (!tokens.length) return null;
  const annotations = annotate(rawText, tokens);
  const warranty = annotations.find((annotation) => annotation.lexeme.semanticId === 'relation.inventory_item.warranty');
  const maintenance = annotations.find((annotation) => annotation.lexeme.semanticId === 'relation.inventory_item.maintenance_task');
  const coordinators = annotations.filter((annotation) => annotation.lexeme.role === 'COORDINATOR');
  const negative = annotations.some((annotation) => annotation.lexeme.semanticId === 'polarity.negative');
  const hasOr = coordinators.some((annotation) => annotation.lexeme.semanticId === 'coordinator.or');
  const neither = coordinators.some((annotation) => annotation.lexeme.semanticId === 'coordinator.neither');
  void normalized;
  if (!warranty || !maintenance || !negative || !hasOr || neither || findAgePhrase(rawText)) return null;
  return { operands: warranty.start < maintenance.start ? ['warranty', 'maintenance'] : ['maintenance', 'warranty'] };
}
