import {
  loadHouseholdContextMapData,
  type HouseholdContextMapData,
} from '../infrastructure/contextMapRepository';

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
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
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

function typedLifestyleValue(row: HouseholdContextMapData['lifestyleAttributes'][number]): string | undefined {
  if (row.valueBoolean !== null) return safeScalar(row.valueBoolean);
  if (row.valueNumber !== null) return safeScalar(row.valueNumber);
  if (row.valueCode !== null) return humanize(row.valueCode);
  if (row.valueText !== null) return safeScalar(row.valueText);
  if (row.valueDate !== null) return toIso(row.valueDate) ?? undefined;
  return safeScalar(row.valueJson);
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
  now = new Date(),
): Promise<HouseholdContextMap> {
  const data = await loadHouseholdContextMapData(propertyId);
  const emptySummary: HouseholdContextMap['summary'] = {
    PROPERTY: 0,
    HOUSEHOLD: 0,
    PROFILE_FACT: 0,
    DERIVED_TRAIT: 0,
    RECOMMENDATION: 0,
  };
  if (!data?.consentVersion) {
    return {
      version: 'context-map-v0',
      generatedAt: now.toISOString(),
      configured: false,
      consent: null,
      summary: emptySummary,
      nodes: [],
      edges: [],
      limitations: LIMITATIONS,
    };
  }

  const occupancy = data.properties[0];
  const nodes: ContextMapNode[] = [
    {
      id: 'household',
      type: 'HOUSEHOLD',
      label: 'Your household profile',
      detail: 'Explicitly opted in',
      source: data.source,
      validFrom: toIso(data.consentedAt),
      validTo: null,
    },
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
  const edges: ContextMapEdge[] = [{
    from: 'household',
    to: 'property',
    type: 'OCCUPIES',
    source: 'HOUSEHOLD_PROPERTY',
    validFrom: toIso(occupancy?.effectiveFrom),
    validTo: toIso(occupancy?.effectiveTo),
  }];

  data.members.forEach((row, index) => addRelatedNode(nodes, edges, {
    id: `profile:member:${row.type.toLowerCase()}:${index}`,
    type: 'PROFILE_FACT',
    label: humanize(row.type),
    detail: [String(row.count), row.lifeStage ? humanize(row.lifeStage) : null].filter(Boolean).join(' · '),
    source: row.source,
    validFrom: toIso(row.createdAt),
    validTo: null,
  }, 'HAS_EXPLICIT_FACT', 'PROFILE_ANSWER'));

  data.pets.forEach((row, index) => addRelatedNode(nodes, edges, {
    id: `profile:pet:${row.petType.toLowerCase()}:${index}`,
    type: 'PROFILE_FACT',
    label: humanize(row.petType),
    detail: [String(row.count), row.sizeBand && humanize(row.sizeBand), row.indoorOutdoor && humanize(row.indoorOutdoor)].filter(Boolean).join(' · '),
    source: 'USER_INPUT',
    validFrom: toIso(row.createdAt),
    validTo: null,
  }, 'HAS_EXPLICIT_FACT', 'PROFILE_ANSWER'));

  data.goals.forEach((row, index) => addRelatedNode(nodes, edges, {
    id: `profile:goal:${row.goalCode.toLowerCase()}:${index}`,
    type: 'PROFILE_FACT',
    label: humanize(row.goalCode),
    detail: row.horizon ? humanize(row.horizon) : 'Household goal',
    source: row.source,
    validFrom: toIso(row.createdAt),
    validTo: null,
  }, 'HAS_EXPLICIT_FACT', 'PROFILE_ANSWER'));

  data.preferences.forEach((row, index) => addRelatedNode(nodes, edges, {
    id: `profile:preference:${row.key.toLowerCase()}:${index}`,
    type: 'PROFILE_FACT',
    label: humanize(row.key),
    detail: safeScalar(row.valueJson) ?? 'Explicit preference recorded',
    source: 'USER_INPUT',
    validFrom: toIso(row.createdAt),
    validTo: null,
  }, 'HAS_EXPLICIT_FACT', 'PROFILE_ANSWER'));

  data.lifestyleAttributes.forEach((row, index) => addRelatedNode(nodes, edges, {
    id: `profile:lifestyle:${row.key.toLowerCase()}:${index}`,
    type: 'PROFILE_FACT',
    label: humanize(row.key),
    detail: typedLifestyleValue(row) ?? 'Explicit attribute recorded',
    source: row.source,
    confidence: row.confidence,
    validFrom: toIso(row.createdAt),
    validTo: null,
  }, 'HAS_EXPLICIT_FACT', 'PROFILE_ANSWER'));

  data.derivedTraits.forEach((row) => addRelatedNode(nodes, edges, {
    id: `trait:${row.traitKey.toLowerCase()}`,
    type: 'DERIVED_TRAIT',
    label: humanize(row.traitKey),
    detail: safeScalar(row.valueJson) ?? 'Current property signal',
    source: row.source,
    confidence: row.confidence,
    validFrom: toIso(row.computedAt),
    validTo: toIso(row.validUntil),
  }, 'HAS_DERIVED_TRAIT', 'TRAIT_COMPUTATION'));

  data.recommendations.forEach((row) => addRelatedNode(nodes, edges, {
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
    consent: { version: data.consentVersion, consentedAt: toIso(data.consentedAt) },
    summary,
    nodes,
    edges,
    limitations: LIMITATIONS,
  };
}
