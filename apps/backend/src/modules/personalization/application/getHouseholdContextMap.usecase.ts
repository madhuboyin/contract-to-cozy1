import {
  loadHouseholdContextMapData,
  type HouseholdContextMapData,
} from '../infrastructure/contextMapRepository';
import { materializeRecommendationsForProperty } from './materializeRecommendations.usecase';

export type ContextMapNodeType = 'PROPERTY' | 'HOUSEHOLD' | 'PROFILE_FACT' | 'DERIVED_TRAIT' | 'RECOMMENDATION';
export type ContextMapEdgeType = 'OCCUPIES' | 'HAS_EXPLICIT_FACT' | 'HAS_DERIVED_TRAIT' | 'HAS_RECOMMENDATION';

export interface ContextMapNode {
  id: string;
  type: ContextMapNodeType;
  label: string;
  detail?: string;
  source: string;
  confidence?: number;
  validFrom: string | null;
  validTo: string | null;
}

export interface ContextMapEdge {
  from: string;
  to: string;
  type: ContextMapEdgeType;
  source: string;
  validFrom: string | null;
  validTo: string | null;
}

export interface HouseholdContextMap {
  version: 'context-map-v0';
  generatedAt: string;
  configured: boolean;
  consent: { version: string; consentedAt: string | null } | null;
  summary: Record<ContextMapNodeType, number>;
  nodes: ContextMapNode[];
  edges: ContextMapEdge[];
  limitations: string[];
}

const LIMITATIONS = [
  'Current-state view only; it is not a retained household timeline.',
  'Household profile facts come only from explicit optional answers.',
  'No future-event simulation or inferred household relationship is included.',
  'The existing Home Digital Twin remains a separate property-maintenance tool.',
];

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function humanize(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function safeScalar(value: unknown): string | undefined {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value.slice(0, 120);
  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    return safeScalar((value as { value: unknown }).value);
  }
  return undefined;
}

const DERIVED_TRAIT_LABELS: Record<string, string> = {
  roofageyears: 'Roof age',
  roofreplacementoverdue: 'Roof replacement timing',
  hvacfilterreplacementoverdue: 'HVAC filter replacement',
  hvacfilterdayssinceserviced: 'Time since HVAC filter service',
  smokedetectormissing: 'Smoke detectors',
  smokedetectorbatteryoverdue: 'Smoke-detector battery check',
  smokedetectorbatterydayssinceserviced: 'Time since smoke-detector battery service',
  dryerventcleaningoverdue: 'Dryer-vent cleaning',
  dryerventdayssinceserviced: 'Time since dryer-vent service',
};

function derivedTraitDetail(traitKey: string, value: unknown): string {
  const normalizedKey = traitKey.replace(/[_-]+/g, '').toLowerCase();
  const scalar = value && typeof value === 'object' && !Array.isArray(value) && 'value' in value
    ? (value as { value: unknown }).value
    : value;

  if (normalizedKey === 'roofageyears' && typeof scalar === 'number') {
    return `About ${scalar} year${scalar === 1 ? '' : 's'}`;
  }
  if (normalizedKey.endsWith('dayssinceserviced') && typeof scalar === 'number') {
    return `${scalar} day${scalar === 1 ? '' : 's'} ago`;
  }
  if (normalizedKey === 'roofreplacementoverdue' && typeof scalar === 'boolean') {
    return scalar ? 'May be overdue' : 'Not overdue';
  }
  if (normalizedKey === 'smokedetectormissing' && typeof scalar === 'boolean') {
    return scalar ? 'Recorded as not installed' : 'Recorded as installed';
  }
  if (normalizedKey.endsWith('overdue') && typeof scalar === 'boolean') {
    return scalar ? 'Due for attention' : 'Up to date';
  }
  return safeScalar(value) ?? 'Current property signal';
}

function profileAnswerDetail(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return safeScalar(value) ?? 'Explicit answer recorded';
  }
  const answer = value as Record<string, unknown>;
  if (typeof answer.hasPet === 'boolean') {
    return answer.hasPet
      ? `Yes · ${typeof answer.petType === 'string' ? humanize(answer.petType) : 'Pet'}`
      : 'No';
  }
  if (typeof answer.hasChildren === 'boolean' && typeof answer.hasSeniors === 'boolean') {
    const selected = [
      answer.hasChildren ? 'Children' : null,
      answer.hasSeniors ? 'Seniors' : null,
    ].filter(Boolean);
    return selected.length > 0 ? selected.join(' · ') : 'Neither';
  }
  if (typeof answer.value === 'boolean') return answer.value ? 'Yes' : 'No';
  const scalarValue = safeScalar(answer.value);
  if (scalarValue) return scalarValue;
  return 'Explicit answer recorded';
}

function addRelatedNode(
  nodes: ContextMapNode[],
  edges: ContextMapEdge[],
  node: ContextMapNode,
  edgeType: Exclude<ContextMapEdgeType, 'OCCUPIES'>,
  edgeSource: string,
) {
  nodes.push(node);
  edges.push({
    from: edgeType === 'HAS_EXPLICIT_FACT' ? 'household' : 'property',
    to: node.id,
    type: edgeType,
    source: edgeSource,
    validFrom: node.validFrom,
    validTo: node.validTo,
  });
}

export async function getHouseholdContextMap(
  propertyId: string,
  ownerUserId: string,
  now = new Date(),
): Promise<HouseholdContextMap> {
  const materialization = await materializeRecommendationsForProperty(propertyId, 'CONTEXT_MAP_READ', ownerUserId);
  const data = await loadHouseholdContextMapData(propertyId, ownerUserId);
  const paused = materialization.paused === true;
  const emptySummary: HouseholdContextMap['summary'] = {
    PROPERTY: 0,
    HOUSEHOLD: 0,
    PROFILE_FACT: 0,
    DERIVED_TRAIT: 0,
    RECOMMENDATION: 0,
  };
  const occupancy = data.properties[0];
  const nodes: ContextMapNode[] = [
    {
      id: 'property',
      type: 'PROPERTY',
      label: 'This home',
      detail: occupancy ? humanize(occupancy.occupancyType) : undefined,
      source: 'PROPERTY_RECORD',
      validFrom: toIso(occupancy?.effectiveFrom),
      validTo: toIso(occupancy?.effectiveTo),
    },
  ];
  const edges: ContextMapEdge[] = [];

  if (data.consentVersion) {
    nodes.unshift({
      id: 'household',
      type: 'HOUSEHOLD',
      label: 'Your optional household profile',
      detail: 'Explicitly enabled',
      source: data.source ?? 'USER_CREATED',
      validFrom: toIso(data.consentedAt),
      validTo: null,
    });
    edges.push({
      from: 'household',
      to: 'property',
      type: 'OCCUPIES',
      source: 'HOUSEHOLD_PROPERTY',
      validFrom: toIso(occupancy?.effectiveFrom),
      validTo: toIso(occupancy?.effectiveTo),
    });
  }

  data.profileAnswers.forEach((row, index) => addRelatedNode(nodes, edges, {
    id: `profile:${row.question.code.toLowerCase()}:${index}`,
    type: 'PROFILE_FACT',
    label: row.question.prompt,
    detail: profileAnswerDetail(row.answerJson),
    source: 'USER_INPUT',
    validFrom: toIso(row.createdAt),
    validTo: null,
  }, 'HAS_EXPLICIT_FACT', 'PROFILE_ANSWER'));

  data.derivedTraits.forEach((row) => addRelatedNode(nodes, edges, {
    id: `trait:${row.traitKey.toLowerCase()}`,
    type: 'DERIVED_TRAIT',
    label: DERIVED_TRAIT_LABELS[row.traitKey.replace(/[_-]+/g, '').toLowerCase()] ?? humanize(row.traitKey),
    detail: derivedTraitDetail(row.traitKey, row.valueJson),
    source: row.source,
    validFrom: toIso(row.computedAt),
    validTo: null,
  }, 'HAS_DERIVED_TRAIT', 'TRAIT_COMPUTATION'));

  if (!paused) data.recommendations.forEach((row) => addRelatedNode(nodes, edges, {
    id: `recommendation:${row.definition.code.toLowerCase()}`,
    type: 'RECOMMENDATION',
    label: humanize(row.definition.code),
    detail: humanize(row.status),
    source: 'RECOMMENDATION_ENGINE',
    validFrom: toIso(row.firstEligibleAt),
    validTo: toIso(row.expiresAt),
  }, 'HAS_RECOMMENDATION', 'REVIEWED_RULE'));

  const summary = nodes.reduce<HouseholdContextMap['summary']>(
    (counts, node) => ({ ...counts, [node.type]: counts[node.type] + 1 }),
    emptySummary,
  );
  return {
    version: 'context-map-v0',
    generatedAt: now.toISOString(),
    configured: true,
    consent: data.consentVersion
      ? { version: data.consentVersion, consentedAt: toIso(data.consentedAt) }
      : null,
    summary,
    nodes,
    edges,
    limitations: LIMITATIONS,
  };
}
