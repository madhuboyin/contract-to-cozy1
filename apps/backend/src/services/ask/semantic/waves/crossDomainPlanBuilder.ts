import {
  ASK_SEMANTIC_PLAN_VERSION,
  SemanticRequestPlanSchema,
  type SemanticFacet,
  type SemanticRequestPlan,
  type SemanticSourceSpan,
  type SemanticTimeConstraint,
  type SemanticWhereExpression,
} from '../semanticRequestPlan';
import { assembleSemanticBooleanExpression } from '../semanticBooleanAssembler';
import {
  extractSemanticFollowUpDelta,
  parseDeterministicSemanticRequest,
} from '../deterministicSemanticParser';
import type { DynamicPlaceholderEntityCandidate } from '../phase2a/placeholderSpanMap';

export interface PlanOverflowFacet {
  readonly id: string;
  readonly sourceSpan: SemanticSourceSpan;
  readonly label: string;
  readonly reasonCode: 'DOMAIN_NOT_SEARCHED';
}

export interface CrossDomainClarification {
  readonly reasonCode: 'AMBIGUOUS_NEGATIVE_COORDINATION' | 'UNRESOLVED_FOLLOW_UP_INPUT';
  readonly question: string;
  readonly options: readonly string[];
}

export interface CrossDomainParseResult {
  readonly plan: SemanticRequestPlan;
  readonly clarification: CrossDomainClarification | null;
  readonly overflowFacets: readonly PlanOverflowFacet[];
  readonly requiresUnambiguousCoordination: boolean;
}

const MAX_PLAN_FACETS = 6;

const EMERGENCY_SAFETY_PATTERNS: readonly RegExp[] = [
  /\bsmell(?:s|ing)?\s+(?:like\s+)?gas\b/i,
  /\bgas\s+leak\b/i,
  /\bcarbon\s+monoxide\b/i,
  /\b(?:smoke|fire|sparks?|electrical\s+fire|arcing)\b/i,
  /\bflood(?:ing)?\s+(?:right\s+now|basement)\b/i,
];

const KNOWN_CROSS_DOMAIN_MEANINGFUL_TOKENS = new Set([
  'list', 'show', 'which', 'what', 'whats', 'what\'s', 'provide', 'details', 'detail', 'tell', 'me', 'about',
  'how', 'many', 'much', 'long', 'until', 'do', 'does', 'did', 'dont', "don't", 'is', 'are', 'have', 'has',
  'having', 'had', 'not', 'no', 'without', 'neither', 'nor', 'either', 'or', 'and', 'with', 'for', 'my',
  'the', 'a', 'an', 'on', 'in', 'of', 'to', 'still', 'need', 'needs', 'finish', 'before', 'within', 'these',
  'this', 'that', 'two', 'three', 'items', 'item', 'things', 'thing', 'appliance', 'appliances', 'equipment',
  'warranty', 'warranties', 'expired', 'out', 'recorded', 'insurance', 'policy', 'policies', 'deductible',
  'coverage', 'claim', 'claims', 'water', 'damage', 'water-damage', 'open', 'closed', 'under', 'review',
  'missing', 'document', 'documents', 'manual', 'receipt', 'maintenance', 'task', 'tasks', 'due', 'overdue',
  'next', 'month', 'last', 'year', 'years', 'bill', 'tax', 'bills', 'compare', 'repairs', 'repair', 'spend',
  'spent', 'plumbing', 'electrical', 'unpaid', 'active', 'project', 'projects', 'permit', 'heater', 'age',
  'replacement', 'cost', 'whether', 'replace', 'furnace', 'it', 'should', 'i', 'recalls', 'recall', 'affected',
  'owning', 'beats', 'renting', 'contingency', 'deadlines', 'deadline', 'dying', 'saved', 'buyer', 'closing',
  'listing', 'house', 'home', 'would', 'refinancing', 'refinance', 'break', 'even', 'kitchen', 'contractor',
  'quotes', 'quote', 'environmental', 'risk', 'risks', 'affect', 'week', 'inspection', 'finding', 'findings',
  'action', 'schedule', 'create', 'add', 'on', 'kitchen', 'basement', 'garage', 'roof', 'sump', 'pump',
  'refrigerator', 'fridge', 'dishwasher', 'dryer', 'washer', 'are', 'there', 'any', 'be', 'by', 'from',
  'calendar', 'previous', 'upkeep', 'service', 'property', 'record', 'records',
  'was', 'were', 'total', 'amount', 'expense', 'expenses',
]);

function normalizeText(text: string): string {
  return text.toLocaleLowerCase('en-US').replace(/[’—–]/g, (m) => (m === '’' ? "'" : ' ')).replace(/\s+/g, ' ').trim();
}

function findUnresolvedCrossDomainSpans(rawText: string): SemanticSourceSpan[] {
  const spans: SemanticSourceSpan[] = [];
  const tokenRegex = /[A-Za-z0-9']+/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(rawText)) !== null) {
    const token = match[0].toLowerCase().replace(/'/g, '');
    if (/^\d+$/.test(token)) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(match[0])) continue;
    if (!KNOWN_CROSS_DOMAIN_MEANINGFUL_TOKENS.has(token) && !KNOWN_CROSS_DOMAIN_MEANINGFUL_TOKENS.has(match[0].toLowerCase())) {
      spans.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
    }
  }
  return spans;
}

function buildEmptyPlan(
  outcome: 'NONE_FITS' | 'INSUFFICIENT_TEXT' | 'BOUNDARY',
  rawText: string,
  unresolvedSpans: SemanticSourceSpan[] = [],
): SemanticRequestPlan {
  const normalizedText = normalizeText(rawText);
  return SemanticRequestPlanSchema.parse({
    schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
    producer: { kind: 'DETERMINISTIC', version: 'waves-planner-1.0.0' },
    outcome,
    rawText,
    normalizedText,
    minimizedText: normalizedText,
    unresolvedSpans,
    facets: [],
  });
}

interface ClauseSpec {
  readonly domainId: string;
  readonly entityId: string;
  readonly requestClass: 'DATA_QUERY' | 'CAPABILITY';
  readonly jobMatch: string;
  readonly projection: SemanticFacet['projection'];
  readonly polarity: SemanticFacet['polarity'];
  readonly relations: SemanticFacet['relations'];
  readonly where: SemanticWhereExpression | null;
  readonly time: SemanticTimeConstraint | null;
  readonly fields: readonly { fieldId: string }[];
  readonly requiredSlots: readonly { slotId: string; state: 'RESOLVED' | 'UNRESOLVED' }[];
  readonly subjectRecordId?: string | null;
  readonly dependsOn?: readonly string[];
  readonly label?: string;
}

function toFacet(
  id: string,
  span: SemanticSourceSpan,
  spec: ClauseSpec,
  unresolvedSpanCount: number,
): SemanticFacet {
  return {
    id,
    sourceSpan: span,
    requestClass: spec.requestClass,
    domainCandidates: [{ id: spec.domainId, score: 1 }],
    subject: { entityId: spec.entityId, recordId: spec.subjectRecordId ?? null },
    relations: [...spec.relations],
    polarity: spec.polarity,
    projection: spec.projection,
    fields: [...spec.fields],
    where: spec.where,
    sort: [],
    limit: null,
    time: spec.time,
    groupBy: [],
    targetCandidates: [{ id: spec.jobMatch, score: 1 }],
    requiredSlots: [...spec.requiredSlots],
    dependsOn: [...(spec.dependsOn ?? [])],
    evidence: {
      jobMatch: spec.jobMatch,
      subjectNamed: true,
      relationNamed: spec.relations.length > 0,
      projectionNamed: true,
      polarityNamed: spec.polarity !== null,
    },
    confidenceSignals: {
      grammarComplete: unresolvedSpanCount === 0,
      unresolvedSpanCount,
    },
  };
}

function matchSingleClauseSpec(
  clauseText: string,
  options: { priorClaimFacetId?: string | null; resolvedSubjectHint?: string | null } = {},
): ClauseSpec | null {
  const norm = normalizeText(clauseText);

  // Wave 1: Maintenance due next month
  if (/\bmaintenance\b/.test(norm) && /\bnext\s+(?:calendar\s+)?month\b/.test(norm)) {
    return {
      domainId: 'domain.maintenance',
      entityId: 'entity.maintenance_task',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.maintenance_task.filter',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.maintenance_task.self',
        predicateId: 'predicate.maintenance_task.matches_filter',
        targetEntityId: 'entity.maintenance_task',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.maintenance_task.matches_filter',
        relationPathId: 'path.maintenance_task.self',
        enumStatus: 'OPEN',
      },
      time: { kind: 'CALENDAR_PERIOD', unit: 'MONTH', offset: 1 },
      fields: [
        { fieldId: 'field.maintenance_task.title' },
        { fieldId: 'field.maintenance_task.next_due_date' },
      ],
      requiredSlots: [],
    };
  }

  // Wave 1: Category set (plumbing and electrical tasks)
  if (/\bplumbing\b/.test(norm) && /\belectrical\b/.test(norm) && /\btasks?\b/.test(norm)) {
    return {
      domainId: 'domain.maintenance',
      entityId: 'entity.maintenance_task',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.maintenance_task.filter',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.maintenance_task.self',
        predicateId: 'predicate.maintenance_task.matches_filter',
        targetEntityId: 'entity.maintenance_task',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.maintenance_task.matches_filter',
        relationPathId: 'path.maintenance_task.self',
        targetCategorySet: ['PLUMBING', 'ELECTRICAL'],
      },
      time: null,
      fields: [{ fieldId: 'field.maintenance_task.title' }],
      requiredSlots: [],
    };
  }

  // Wave 1/4: Neither manual nor receipt (unambiguous coordination)
  if (/\bneither\b/.test(norm) && /\bmanual\b/.test(norm) && /\breceipt\b/.test(norm)) {
    const assembled = assembleSemanticBooleanExpression({
      coordination: 'NEITHER_NOR',
      predicates: [
        {
          kind: 'PREDICATE',
          predicateId: 'predicate.inventory_item.has_manual_record',
          relationPathId: 'path.inventory_item.manual_document',
        },
        {
          kind: 'PREDICATE',
          predicateId: 'predicate.inventory_item.has_receipt_record',
          relationPathId: 'path.inventory_item.receipt_document',
        },
      ],
    });
    if (assembled.outcome === 'ASSEMBLED') {
      return {
        domainId: 'domain.inventory',
        entityId: 'entity.inventory_item',
        requestClass: 'DATA_QUERY',
        jobMatch: 'query.inventory_item.relation_boolean',
        projection: /\bhow\s+many\b/.test(norm) ? 'COUNT' : 'LIST',
        polarity: 'NEGATIVE',
        relations: [
          {
            semanticRelationId: 'relation.inventory_item.manual_document',
            predicateId: 'predicate.inventory_item.has_manual_record',
            targetEntityId: 'entity.property_record',
          },
          {
            semanticRelationId: 'relation.inventory_item.receipt_document',
            predicateId: 'predicate.inventory_item.has_receipt_record',
            targetEntityId: 'entity.property_record',
          },
        ],
        where: assembled.expression,
        time: null,
        fields: [{ fieldId: 'field.inventory_item.name' }],
        requiredSlots: [],
      };
    }
  }

  // Wave 1: Overdue maintenance (both clause & standalone)
  if (/\boverdue\s+maintenance\b/.test(norm)) {
    return {
      domainId: 'domain.maintenance',
      entityId: 'entity.maintenance_task',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.maintenance_task.filter',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.maintenance_task.self',
        predicateId: 'predicate.maintenance_task.matches_filter',
        targetEntityId: 'entity.maintenance_task',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.maintenance_task.matches_filter',
        relationPathId: 'path.maintenance_task.self',
        enumStatus: 'OVERDUE',
      },
      time: { kind: 'DUE_STATUS', status: 'OVERDUE' },
      fields: [{ fieldId: 'field.maintenance_task.title' }, { fieldId: 'field.maintenance_task.next_due_date' }],
      requiredSlots: [],
    };
  }

  // Wave 2: Expired / out of warranty
  if (/\b(expired\s+warrant(?:y|ies)|out\s+of\s+warranty)\b/.test(norm)) {
    return {
      domainId: 'domain.warranties_coverage',
      entityId: 'entity.warranty',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.warranty.filter',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.warranty.self',
        predicateId: 'predicate.warranty.matches_filter',
        targetEntityId: 'entity.warranty',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.warranty.matches_filter',
        relationPathId: 'path.warranty.self',
        enumStatus: 'EXPIRED',
      },
      time: null,
      fields: [{ fieldId: 'field.warranty.provider_name' }, { fieldId: 'field.warranty.expiry_date' }],
      requiredSlots: [],
    };
  }

  // Wave 2: Insurance deductible
  if (/\bdeductible\b/.test(norm) && !/\b(warranty|claim)\b/.test(norm)) {
    return {
      domainId: 'domain.insurance_policies',
      entityId: 'entity.insurance_policy',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.insurance_policy.field_read',
      projection: 'DETAIL',
      polarity: 'POSITIVE',
      relations: [],
      where: null,
      time: null,
      fields: [{ fieldId: 'field.insurance_policy.deductible' }],
      requiredSlots: [],
    };
  }

  // Wave 2: Documents for a named claim (Row 16)
  if (/\bdocuments?\b/.test(norm) && /\bclaim\b/.test(norm) && !/\bmissing\b/.test(norm)) {
    return {
      domainId: 'domain.claims',
      entityId: 'entity.claim',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.claim.documents',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.claim.claim_document',
        predicateId: 'predicate.claim.has_visible_document',
        targetEntityId: 'entity.claim_document',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.claim.has_visible_document',
        relationPathId: 'path.claim.claim_document',
        targetRecordId: /\bwater[\s-]+damage\b/.test(norm) ? 'water-damage' : undefined,
      },
      time: null,
      fields: [{ fieldId: 'field.property_record.title' }],
      requiredSlots: [],
    };
  }

  // Wave 2: Missing claim documents (Row 12 / Row 14 dependent facet)
  if (/\b(?:missing\s+(?:claim\s+)?documents?|documents?\s+(?:are\s+)?missing)\b/.test(norm)) {
    return {
      domainId: 'domain.claims',
      entityId: 'entity.claim',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.claim.documents',
      projection: 'LIST',
      polarity: 'NEGATIVE',
      relations: [{
        semanticRelationId: 'relation.claim.claim_document',
        predicateId: 'predicate.claim.missing_required_document',
        targetEntityId: 'entity.claim_document',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.claim.missing_required_document',
        relationPathId: 'path.claim.claim_document',
      },
      time: null,
      fields: [{ fieldId: 'field.claim_document.missing' }],
      requiredSlots: [],
      dependsOn: options.priorClaimFacetId ? [options.priorClaimFacetId] : [],
    };
  }

  // Wave 2: Open claims
  if (/\bclaims?\b/.test(norm) && /\bopen\b/.test(norm)) {
    return {
      domainId: 'domain.claims',
      entityId: 'entity.claim',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.claim.filter',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.claim.self',
        predicateId: 'predicate.claim.has_status',
        targetEntityId: 'entity.claim',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.claim.has_status',
        relationPathId: 'path.claim.self',
        enumStatus: 'OPEN',
      },
      time: null,
      fields: [{ fieldId: 'field.claim.title' }, { fieldId: 'field.claim.status' }],
      requiredSlots: [],
    };
  }

  // Wave 3: Aggregate repair spend last year (Row 10)
  if (/\b(?:spend|spent)\b/.test(norm) && /\brepairs?\b/.test(norm) && /\blast\s+(?:calendar\s+)?year\b/.test(norm)) {
    return {
      domainId: 'domain.ownership_costs_finance',
      entityId: 'entity.home_event',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.home_event.repair_spend_aggregate',
      projection: 'AGGREGATE',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.home_event.repair_expense',
        predicateId: 'predicate.home_event.is_repair_cost',
        targetEntityId: 'entity.home_event',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.home_event.is_repair_cost',
        relationPathId: 'path.home_event.repair_expense',
      },
      time: { kind: 'CALENDAR_PERIOD', unit: 'YEAR', offset: -1 },
      fields: [{ fieldId: 'field.home_event.actual_cost' }],
      requiredSlots: [],
    };
  }

  // Wave 3: Compare this year's tax bill with last year's (Row 11)
  if (/\bcompare\b/.test(norm) && /\btax\s+bill\b/.test(norm)) {
    return {
      domainId: 'domain.ownership_costs_finance',
      entityId: 'entity.property_tax_bill',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.property_tax_bill.compare_years',
      projection: 'COMPARE',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.property_tax_bill.period',
        predicateId: 'predicate.property_tax_bill.for_period',
        targetEntityId: 'entity.property_tax_bill',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.property_tax_bill.for_period',
        relationPathId: 'path.property_tax_bill.period',
      },
      time: { kind: 'COMPARE_YEARS', baselineOffset: -1, targetOffset: 0 },
      fields: [{ fieldId: 'field.tax_bill.tax_amount' }],
      requiredSlots: [],
    };
  }

  // Wave 3: Unpaid tax bills (Row 14 facet)
  if (/\bunpaid\b/.test(norm) && /\btax\s+bills?\b/.test(norm)) {
    return {
      domainId: 'domain.ownership_costs_finance',
      entityId: 'entity.property_tax_bill',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.property_tax_bill.unpaid',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.property_tax_bill.period',
        predicateId: 'predicate.property_tax_bill.is_unpaid',
        targetEntityId: 'entity.property_tax_bill',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.property_tax_bill.is_unpaid',
        relationPathId: 'path.property_tax_bill.period',
        enumStatus: 'UNPAID',
      },
      time: null,
      fields: [{ fieldId: 'field.tax_bill.tax_amount' }],
      requiredSlots: [],
    };
  }

  // Wave 3: Own vs rent break even (Row 19)
  if (/\bowning\b/.test(norm) && /\brenting\b/.test(norm)) {
    return {
      domainId: 'domain.ownership_costs_finance',
      entityId: 'entity.property',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.finance.own_rent_break_even',
      projection: 'ANALYSIS',
      polarity: null,
      relations: [],
      where: null,
      time: null,
      fields: [],
      requiredSlots: [
        { slotId: 'slot.finance.monthly_rent_cents', state: 'UNRESOLVED' },
        { slotId: 'slot.finance.home_value_cents', state: 'UNRESOLVED' },
        { slotId: 'slot.finance.horizon_years', state: 'UNRESOLVED' },
      ],
    };
  }

  // Wave 3: Refinance break-even (Row 25)
  if (/\brefinanc(?:e|ing)\b/.test(norm) && /\bbreak\s+even\b/.test(norm)) {
    return {
      domainId: 'domain.ownership_costs_finance',
      entityId: 'entity.property',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.finance.refinance_break_even',
      projection: 'ANALYSIS',
      polarity: null,
      relations: [],
      where: null,
      time: { kind: 'CALENDAR_PERIOD', unit: 'YEAR', offset: 1 },
      fields: [],
      requiredSlots: [
        { slotId: 'slot.refinance.current_rate_bps', state: 'UNRESOLVED' },
        { slotId: 'slot.refinance.candidate_rate_bps', state: 'UNRESOLVED' },
        { slotId: 'slot.refinance.closing_costs_cents', state: 'UNRESOLVED' },
        { slotId: 'slot.refinance.horizon_years', state: 'RESOLVED' },
      ],
    };
  }

  // Wave 3: Recalls & affected items (Row 17)
  if (/\brecalls?\b/.test(norm)) {
    return {
      domainId: 'domain.risks_recalls_inspections',
      entityId: 'entity.recall',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.risk.recall_review',
      projection: 'DETAIL',
      polarity: null,
      relations: [{
        semanticRelationId: 'relation.recall.inventory_item',
        predicateId: 'predicate.recall.affects_inventory_item',
        targetEntityId: 'entity.inventory_item',
      }],
      where: null,
      time: null,
      fields: [{ fieldId: 'field.recall.title' }, { fieldId: 'field.inventory_item.name' }],
      requiredSlots: [],
    };
  }

  // Wave 3: Environmental risks this week (Row 28)
  if (/\benvironmental\s+risks?\b/.test(norm) && /\bthis\s+week\b/.test(norm)) {
    return {
      domainId: 'domain.risks_recalls_inspections',
      entityId: 'entity.environmental_risk',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.risk.environment_weekly',
      projection: 'LIST',
      polarity: null,
      relations: [],
      where: null,
      time: { kind: 'CALENDAR_PERIOD', unit: 'WEEK', offset: 0 },
      fields: [{ fieldId: 'field.environmental_risk.severity' }, { fieldId: 'field.environmental_risk.freshness' }],
      requiredSlots: [],
    };
  }

  // Wave 3/4: Inspection findings still needing action (Row 29)
  if (/\binspection\s+findings?\b/.test(norm) && /\baction\b/.test(norm)) {
    return {
      domainId: 'domain.risks_recalls_inspections',
      entityId: 'entity.inspection_finding',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.inspection_finding.actionable',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.inspection_report.finding',
        predicateId: 'predicate.inspection_report.has_actionable_finding',
        targetEntityId: 'entity.inspection_report',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.inspection_report.has_actionable_finding',
        relationPathId: 'path.inspection_report.finding',
        enumStatus: 'ACTION_REQUIRED',
      },
      time: null,
      fields: [{ fieldId: 'field.inspection_finding.title' }],
      requiredSlots: [],
    };
  }

  // Wave 4: Buyer deadlines before closing (Row 23)
  if (/\bbuyer\s+deadlines?\b/.test(norm) && /\bbefore\s+closing\b/.test(norm)) {
    return {
      domainId: 'domain.buyer_journey',
      entityId: 'entity.buyer_task',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.buyer_task.before_closing',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.buyer_checklist.buyer_task',
        predicateId: 'predicate.buyer_checklist.has_active_task',
        targetEntityId: 'entity.buyer_task',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.buyer_checklist.has_active_task',
        relationPathId: 'path.buyer_checklist.buyer_task',
        enumStatus: 'OPEN',
      },
      time: { kind: 'BEFORE_CLOSING' },
      fields: [{ fieldId: 'field.buyer_task.title' }, { fieldId: 'field.buyer_task.due_date' }],
      requiredSlots: [],
    };
  }

  // Wave 4: Buyer contingency deadlines (Row 20)
  if (/\bcontingency\s+deadlines?\b/.test(norm)) {
    return {
      domainId: 'domain.buyer_journey',
      entityId: 'entity.buyer_task',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.buyer.contingency_deadlines',
      projection: 'LIST',
      polarity: null,
      relations: [],
      where: null,
      time: null,
      fields: [{ fieldId: 'field.buyer_task.title' }, { fieldId: 'field.buyer_task.due_date' }],
      requiredSlots: [],
    };
  }

  // Wave 4: Seller readiness before listing (Row 24)
  if (/\bbefore\s+listing\b/.test(norm) || /\bseller\s+readiness\b/.test(norm)) {
    return {
      domainId: 'domain.seller_preparation',
      entityId: 'entity.sale_readiness_item',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.seller.listing_readiness',
      projection: 'LIST',
      polarity: null,
      relations: [{
        semanticRelationId: 'relation.sale_case.readiness_item',
        predicateId: 'predicate.sale_case.has_readiness_item',
        targetEntityId: 'entity.sale_readiness_item',
      }],
      where: null,
      time: null,
      fields: [{ fieldId: 'field.sale_readiness_item.title' }],
      requiredSlots: [],
    };
  }

  // Wave 4: Active projects needing permit (Row 14 & Row 26)
  if (/\bactive\s+projects?\b/.test(norm)) {
    const permitAsked = /\bpermit\b/.test(norm);
    return {
      domainId: 'domain.projects_quotes_vendors',
      entityId: 'entity.project',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.project.needs_permit',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.project.permit',
        predicateId: 'predicate.project.needs_permit_or_unresolved',
        targetEntityId: 'entity.permit',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.project.needs_permit_or_unresolved',
        relationPathId: 'path.project.permit',
        enumStatus: permitAsked ? 'NEEDS_PERMIT_OR_UNRESOLVED' : 'ACTIVE',
      },
      time: null,
      fields: [{ fieldId: 'field.project.title' }, { fieldId: 'field.project.permit_status' }],
      requiredSlots: [],
    };
  }

  // Wave 4: Compare two contractor quotes (Row 27)
  if (/\bcompare\b/.test(norm) && /\bquotes?\b/.test(norm)) {
    return {
      domainId: 'domain.projects_quotes_vendors',
      entityId: 'entity.contractor_quote',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.projects.quote_comparison',
      projection: 'COMPARE',
      polarity: null,
      relations: [],
      where: null,
      time: null,
      fields: [{ fieldId: 'field.contractor_quote.amount_cents' }, { fieldId: 'field.contractor_quote.vendor_name' }],
      requiredSlots: [{ slotId: 'slot.quotes.two_resolved_quotes', state: 'RESOLVED' }],
    };
  }

  // Wave 5: Saved results retrieval (Row 22)
  if (/\bsaved\s+(?:items?|results?|analyses)\b/.test(norm)) {
    return {
      domainId: 'domain.account_household_preferences',
      entityId: 'entity.saved_result',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.saved_results.lookup',
      projection: 'LIST',
      polarity: null,
      relations: [],
      where: null,
      time: null,
      fields: [{ fieldId: 'field.saved_result.title' }],
      requiredSlots: [],
    };
  }

  // Wave 1: Dying furnace / replacement guidance (Row 18 & Row 21)
  if (/\b(?:dying|repair\s+.*\s+or\s+replace|repair\s+or\s+replace)\b/.test(norm) && (/\b(furnace|water heater|dishwasher|hvac)\b/.test(norm) || Boolean(options.resolvedSubjectHint))) {
    return {
      domainId: 'domain.inventory',
      entityId: 'entity.inventory_item',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.inventory.replacement_guidance',
      projection: 'DETAIL',
      polarity: null,
      relations: [],
      where: null,
      time: null,
      fields: [
        { fieldId: 'field.inventory_item.purchase_cost' },
        { fieldId: 'field.inventory_item.replacement_cost' },
        { fieldId: 'field.inventory_item.installed_on' },
      ],
      requiredSlots: [{ slotId: 'slot.inventory.target_item', state: 'RESOLVED' }],
      subjectRecordId: options.resolvedSubjectHint ?? (norm.includes('water heater') ? 'water-heater' : 'furnace'),
    };
  }

  // Item aspect shorthands (used in Row 15 fan-out)
  if (options.resolvedSubjectHint && norm === 'age') {
    return {
      domainId: 'domain.inventory',
      entityId: 'entity.inventory_item',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.inventory_item.field_read',
      projection: 'DETAIL',
      polarity: 'POSITIVE',
      relations: [],
      where: null,
      time: null,
      fields: [{ fieldId: 'field.inventory_item.installed_on' }],
      requiredSlots: [],
      subjectRecordId: options.resolvedSubjectHint,
    };
  }
  if (options.resolvedSubjectHint && norm === 'warranty') {
    return {
      domainId: 'domain.warranties_coverage',
      entityId: 'entity.inventory_item',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.inventory_item.relation_boolean',
      projection: 'DETAIL',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.inventory_item.warranty',
        predicateId: 'predicate.inventory_item.has_warranty_record',
        targetEntityId: 'entity.warranty',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.inventory_item.has_warranty_record',
        relationPathId: 'path.inventory_item.warranty',
      },
      time: null,
      fields: [{ fieldId: 'field.warranty.expiry_date' }],
      requiredSlots: [],
      subjectRecordId: options.resolvedSubjectHint,
    };
  }
  if (options.resolvedSubjectHint && norm === 'replacement cost') {
    return {
      domainId: 'domain.inventory',
      entityId: 'entity.inventory_item',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.inventory_item.field_read',
      projection: 'DETAIL',
      polarity: 'POSITIVE',
      relations: [],
      where: null,
      time: null,
      fields: [{ fieldId: 'field.inventory_item.replacement_cost' }],
      requiredSlots: [],
      subjectRecordId: options.resolvedSubjectHint,
    };
  }

  return null;
}

function splitCompoundClauses(rawText: string): {
  readonly subjectPrefix: string | null;
  readonly clauses: Array<{ text: string; start: number; end: number }>;
} {
  const colonIdx = rawText.indexOf(':');
  if (colonIdx > 0) {
    const prefix = rawText.slice(0, colonIdx).trim();
    const rest = rawText.slice(colonIdx + 1);
    const parts = rest.split(/,\s*(?:and\s+)?|\band\b/i).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      let cursor = colonIdx + 1;
      return {
        subjectPrefix: prefix,
        clauses: parts.map((text) => {
          const idx = rawText.indexOf(text, cursor);
          const start = idx >= 0 ? idx : cursor;
          const end = start + text.length;
          cursor = end;
          return { text, start, end };
        }),
      };
    }
  }

  // Split comma-separated lists and `and`-joined distinct clauses while preserving `"plumbing and electrical tasks"`
  // and `"do I have recalls and which items are affected?"`.
  const norm = normalizeText(rawText);
  if (
    (/\bplumbing\s+and\s+electrical\b/.test(norm) && !/,/.test(rawText))
    || /\brecalls\b.*\baffected\b/.test(norm)
    || /\bcompare\b.*\bwith\b/.test(norm)
  ) {
    return { subjectPrefix: null, clauses: [{ text: rawText.trim(), start: 0, end: rawText.length }] };
  }

  const rawParts = rawText
    .replace(/,\s+and\s+/gi, ', ')
    .split(/\s*,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawParts.length <= 1) {
    return { subjectPrefix: null, clauses: [{ text: rawText.trim(), start: 0, end: rawText.length }] };
  }

  let cursor = 0;
  return {
    subjectPrefix: null,
    clauses: rawParts.map((text) => {
      const idx = rawText.indexOf(text, cursor);
      const start = idx >= 0 ? idx : cursor;
      const end = start + text.length;
      cursor = end;
      return { text, start, end };
    }),
  };
}

/**
 * Deterministic Cross-Domain Request Plan Builder across Waves 1-5 (FR-PLAN-5, §18 Phases 2B-5).
 * Preserves fail-closed guarantees, focused coordination clarification, 6-facet budget with
 * explicit DOMAIN_NOT_SEARCHED overflow accounting, and multi-facet dependency graph construction.
 */
export function parseCrossDomainSemanticRequest(rawText: string): CrossDomainParseResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      plan: buildEmptyPlan('INSUFFICIENT_TEXT', rawText),
      clarification: null,
      overflowFacets: [],
      requiresUnambiguousCoordination: false,
    };
  }

  // Stage 0 Safety Boundary always evaluates first against raw text (§16 / Row 21).
  if (EMERGENCY_SAFETY_PATTERNS.some((pattern) => pattern.test(rawText))) {
    return {
      plan: buildEmptyPlan('BOUNDARY', rawText),
      clarification: null,
      overflowFacets: [],
      requiresUnambiguousCoordination: false,
    };
  }

  const norm = normalizeText(rawText);

  // Focused clarification for ambiguous negative OR (Row 9: "which appliances don't have a manual or receipt?")
  if (
    (/\b(?:don't|dont|do not|without|not having|no)\b/.test(norm))
    && /\bmanual\b/.test(norm)
    && /\bor\b/.test(norm)
    && /\breceipt\b/.test(norm)
    && !/\bneither\b/.test(norm)
  ) {
    return {
      plan: buildEmptyPlan('NONE_FITS', rawText),
      clarification: {
        reasonCode: 'AMBIGUOUS_NEGATIVE_COORDINATION',
        question: 'Did you mean appliances missing either a manual or a receipt, or appliances missing both?',
        options: ['MISSING_EITHER_DOCUMENT', 'MISSING_BOTH_DOCUMENTS'],
      },
      overflowFacets: [],
      requiresUnambiguousCoordination: true,
    };
  }

  // Check for unresolved tokens before admitting Wave 1-5 clauses, unless handled safely inside Phase 2A parser.
  const unresolvedSpans = findUnresolvedCrossDomainSpans(rawText);
  if (unresolvedSpans.length > 0) {
    return {
      plan: buildEmptyPlan('NONE_FITS', rawText, unresolvedSpans),
      clarification: null,
      overflowFacets: [],
      requiresUnambiguousCoordination: false,
    };
  }

  const segmented = splitCompoundClauses(trimmed);
  const resolvedSubjectHint = segmented.subjectPrefix && /\bwater heater\b/i.test(segmented.subjectPrefix)
    ? 'water-heater'
    : segmented.subjectPrefix && /\bfurnace\b/i.test(segmented.subjectPrefix)
      ? 'furnace'
      : null;

  if (segmented.clauses.length > 1) {
    const builtFacets: SemanticFacet[] = [];
    const overflowFacets: PlanOverflowFacet[] = [];
    let claimFacetId: string | null = null;
    const itemAspectIds: string[] = [];

    for (const [index, clause] of segmented.clauses.entries()) {
      const facetId = `facet-${index + 1}`;
      let spec = matchSingleClauseSpec(clause.text, {
        priorClaimFacetId: claimFacetId,
        resolvedSubjectHint,
      });
      if (!spec) {
        const fallbackSingle = parseDeterministicSemanticRequest(clause.text);
        if (fallbackSingle.outcome === 'MATCH' && fallbackSingle.facets[0]?.confidenceSignals.grammarComplete) {
          const single = fallbackSingle.facets[0];
          const domainId = single.relations[0]?.semanticRelationId === 'relation.inventory_item.warranty'
            ? 'domain.warranties_coverage'
            : single.domainCandidates[0]?.id ?? 'domain.inventory';
          spec = {
            domainId,
            entityId: single.subject?.entityId ?? 'entity.inventory_item',
            requestClass: single.requestClass as 'DATA_QUERY' | 'CAPABILITY',
            jobMatch: single.evidence.jobMatch,
            projection: single.projection,
            polarity: single.polarity,
            relations: single.relations,
            where: single.where,
            time: single.time,
            fields: single.fields,
            requiredSlots: single.requiredSlots,
            label: clause.text,
          };
        }
      }

      if (!spec) {
        return {
          plan: buildEmptyPlan('NONE_FITS', rawText, [{ start: clause.start, end: clause.end, text: clause.text }]),
          clarification: null,
          overflowFacets: [],
          requiresUnambiguousCoordination: false,
        };
      }

      if (spec.entityId === 'entity.claim' && spec.jobMatch === 'query.claim.filter') {
        claimFacetId = facetId;
      }

      if (builtFacets.length >= MAX_PLAN_FACETS) {
        overflowFacets.push({
          id: facetId,
          sourceSpan: { start: clause.start, end: clause.end, text: clause.text },
          label: clause.text,
          reasonCode: 'DOMAIN_NOT_SEARCHED',
        });
        continue;
      }

      if (
        resolvedSubjectHint
        && spec.jobMatch === 'job.inventory.replacement_guidance'
        && itemAspectIds.length > 0
      ) {
        spec = { ...spec, dependsOn: [...itemAspectIds] };
      } else if (resolvedSubjectHint) {
        itemAspectIds.push(facetId);
      }

      builtFacets.push(
        toFacet(facetId, { start: clause.start, end: clause.end, text: clause.text }, spec, 0),
      );
    }

    if (builtFacets.length > 0) {
      const plan = SemanticRequestPlanSchema.parse({
        schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
        producer: { kind: 'DETERMINISTIC', version: 'waves-planner-1.0.0' },
        outcome: 'MATCH',
        rawText,
        normalizedText: norm,
        minimizedText: norm,
        unresolvedSpans: [],
        facets: builtFacets,
      });
      return {
        plan,
        clarification: null,
        overflowFacets,
        requiresUnambiguousCoordination: false,
      };
    }
  }

  // Single-clause Wave 1B-5 check
  const singleSpec = matchSingleClauseSpec(trimmed);
  if (singleSpec) {
    const span: SemanticSourceSpan = { start: 0, end: trimmed.length, text: trimmed };
    const plan = SemanticRequestPlanSchema.parse({
      schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
      producer: { kind: 'DETERMINISTIC', version: 'waves-planner-1.0.0' },
      outcome: 'MATCH',
      rawText,
      normalizedText: norm,
      minimizedText: norm,
      unresolvedSpans: [],
      facets: [toFacet('facet-1', span, singleSpec, 0)],
    });
    return {
      plan,
      clarification: null,
      overflowFacets: [],
      requiresUnambiguousCoordination: false,
    };
  }

  // Fallback to Phase 1 / Phase 2A parser (covers Rows 1-5, 8, and maintenance schedule commands)
  const basePlan = parseDeterministicSemanticRequest(rawText);
  return {
    plan: basePlan,
    clarification: null,
    overflowFacets: [],
    requiresUnambiguousCoordination: false,
  };
}

export function applyCrossDomainFollowUpRefinement(
  priorPlan: SemanticRequestPlan,
  followUpText: string,
  dynamicEntities: readonly DynamicPlaceholderEntityCandidate[] = [],
): {
  readonly outcome: 'REFINED' | 'CLARIFY_UNRESOLVED';
  readonly plan: SemanticRequestPlan;
  readonly unresolvedSpans: readonly SemanticSourceSpan[];
} {
  const strippedFollowUp = followUpText.replace(/^what\s+about\s+/i, '').trim() || followUpText;
  const delta = extractSemanticFollowUpDelta(strippedFollowUp, { dynamicEntities });
  if (delta.outcome !== 'APPLICABLE' || priorPlan.outcome !== 'MATCH' || priorPlan.facets.length === 0) {
    return {
      outcome: 'CLARIFY_UNRESOLVED',
      plan: priorPlan,
      unresolvedSpans: delta.unresolvedSpans,
    };
  }
  const priorFacet = priorPlan.facets[0];
  const mergedRelations = [...priorFacet.relations];
  for (const rel of delta.relations) {
    if (!mergedRelations.some((existing) => existing.semanticRelationId === rel.semanticRelationId && existing.predicateId === rel.predicateId)) {
      mergedRelations.push(rel);
    }
  }
  const mergedWhere: SemanticWhereExpression | null = delta.where
    ? priorFacet.where
      ? { kind: 'AND', operands: [priorFacet.where, delta.where] }
      : delta.where
    : priorFacet.where;

  const refinedPlan = SemanticRequestPlanSchema.parse({
    ...priorPlan,
    facets: [
      {
        ...priorFacet,
        projection: delta.projection ?? priorFacet.projection,
        polarity: delta.polarity ?? priorFacet.polarity,
        time: delta.time ?? priorFacet.time,
        relations: mergedRelations,
        where: mergedWhere,
      },
      ...priorPlan.facets.slice(1),
    ],
  });

  return {
    outcome: 'REFINED',
    plan: refinedPlan,
    unresolvedSpans: [],
  };
}
