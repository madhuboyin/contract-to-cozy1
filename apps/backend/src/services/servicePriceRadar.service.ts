import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { ServicePriceRadarEngine } from './servicePriceRadar.engine';
import {
  BenchmarkMatch,
  LinkedEntityContext,
  PropertyContext,
  ServiceBenchmarkRegionTypeValue,
  ServiceCategoryValue,
  ServicePriceBenchmarkRecord,
  ServiceRadarCreateInput,
  ServiceRadarCreateLinkedEntityInput,
  ServiceRadarCreateResponseDTO,
  ServiceRadarDetailDTO,
  ServiceRadarDetailResponseDTO,
  ServicePriceRadarEventInput,
  ServiceRadarLinkedEntitySummaryDTO,
  ServiceRadarListQuery,
  ServiceRadarListResponseDTO,
  ServiceRadarQuoteSourceValue,
  ServiceRadarStatusValue,
  ServiceRadarSummaryDTO,
  ServiceRadarVerdictValue,
} from './servicePriceRadar.types';

const prismaAny = prisma as any;
const engine = new ServicePriceRadarEngine();

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'object' && value && 'toNumber' in (value as Record<string, unknown>)) {
    const converted = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(converted) ? converted : null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function textOrNull(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function normalizeLooseToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  NEW_HAMPSHIRE: 'NH',
  NEW_JERSEY: 'NJ',
  NEW_MEXICO: 'NM',
  NEW_YORK: 'NY',
  NORTH_CAROLINA: 'NC',
  NORTH_DAKOTA: 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  RHODE_ISLAND: 'RI',
  SOUTH_CAROLINA: 'SC',
  SOUTH_DAKOTA: 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  WEST_VIRGINIA: 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
  DISTRICT_OF_COLUMBIA: 'DC',
  WASHINGTON_DC: 'DC',
};

const STATE_CODE_TO_NAME_TOKEN: Record<string, string> = Object.entries(STATE_NAME_TO_CODE).reduce(
  (acc, [nameToken, code]) => {
    if (!acc[code]) {
      acc[code] = nameToken;
    }
    return acc;
  },
  {} as Record<string, string>
);

function normalizeSubcategory(value?: string | null): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

function computeSizeBand(propertySize: number | null): string | null {
  if (!propertySize || propertySize <= 0) return null;
  if (propertySize < 1400) return 'SMALL';
  if (propertySize < 2600) return 'MEDIUM';
  if (propertySize < 3800) return 'LARGE';
  return 'XLARGE';
}

function normalizeRegionKey(value?: string | null): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return normalizeLooseToken(trimmed);
}

function normalizeStateCode(value?: string | null): string | null {
  const token = normalizeRegionKey(value);
  if (!token) return null;
  if (token.length === 2) return token;
  return STATE_NAME_TO_CODE[token] ?? null;
}

function formatCurrencyRangeValue(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 100) / 100;
}

function toIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return date.toISOString();
}

function buildPropertyContext(property: any): PropertyContext {
  const propertySize = typeof property.propertySize === 'number' ? property.propertySize : null;
  const propertyType = textOrNull(property.propertyType);

  return {
    propertyId: property.id,
    homeownerProfileId: property.homeownerProfileId,
    propertyType,
    propertySize,
    sizeBand: computeSizeBand(propertySize),
    yearBuilt: typeof property.yearBuilt === 'number' ? property.yearBuilt : null,
    city: textOrNull(property.city),
    state: textOrNull(property.state),
    zipCode: textOrNull(property.zipCode),
    homeType: propertyType,
    systems: {
      heatingType: textOrNull(property.heatingType),
      coolingType: textOrNull(property.coolingType),
      waterHeaterType: textOrNull(property.waterHeaterType),
      roofType: textOrNull(property.roofType),
      foundationType: textOrNull(property.foundationType),
      sidingType: textOrNull(property.sidingType),
      hasDrainageIssues: typeof property.hasDrainageIssues === 'boolean' ? property.hasDrainageIssues : null,
    },
  };
}

async function assertPropertyForUser(propertyId: string, userId: string): Promise<PropertyContext> {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfile: { userId },
    },
    select: {
      id: true,
      homeownerProfileId: true,
      propertyType: true,
      propertySize: true,
      yearBuilt: true,
      city: true,
      state: true,
      zipCode: true,
      heatingType: true,
      coolingType: true,
      waterHeaterType: true,
      roofType: true,
      foundationType: true,
      sidingType: true,
      hasDrainageIssues: true,
    },
  });

  if (!property?.homeownerProfileId) {
    throw new APIError('Property not found or access denied.', 404, 'PROPERTY_ACCESS_DENIED');
  }

  return buildPropertyContext(property);
}

function serializeLinkedEntitySummary(entity: LinkedEntityContext): ServiceRadarLinkedEntitySummaryDTO {
  return {
    linkedEntityType: entity.linkedEntityType,
    linkedEntityId: entity.linkedEntityId,
    relevanceScore: entity.relevanceScore,
    label: entity.label,
    summary: entity.summary,
  };
}

function mapSummary(row: any): ServiceRadarSummaryDTO {
  return {
    id: String(row.id),
    propertyId: String(row.propertyId),
    createdAt: toIso(row.createdAt),
    status: String(row.status) as ServiceRadarStatusValue,
    serviceCategory: String(row.serviceCategory) as ServiceCategoryValue,
    serviceSubcategory: textOrNull(row.serviceSubcategory),
    serviceLabelRaw: textOrNull(row.serviceLabelRaw),
    quoteAmount: formatCurrencyRangeValue(asNumber(row.quoteAmount)) ?? 0,
    quoteCurrency: String(row.quoteCurrency ?? 'USD'),
    quoteVendorName: textOrNull(row.quoteVendorName),
    quoteSource: String(row.quoteSource ?? 'MANUAL') as ServiceRadarQuoteSourceValue,
    expectedLow: formatCurrencyRangeValue(asNumber(row.expectedLow)),
    expectedHigh: formatCurrencyRangeValue(asNumber(row.expectedHigh)),
    expectedMedian: formatCurrencyRangeValue(asNumber(row.expectedMedian)),
    verdict: row.verdict ? (String(row.verdict) as ServiceRadarVerdictValue) : null,
    confidenceScore: asNumber(row.confidenceScore),
    explanationShort: textOrNull(row.explanationShort),
  };
}

function mapDetail(row: any, linkedEntities: LinkedEntityContext[]): ServiceRadarDetailDTO {
  return {
    ...mapSummary(row),
    explanationJson: (row.explanationJson ?? null) as Prisma.JsonValue | null,
    propertySnapshotJson: (row.propertySnapshotJson ?? null) as Prisma.JsonValue | null,
    pricingFactorsJson: (row.pricingFactorsJson ?? null) as Prisma.JsonValue | null,
    engineVersion: textOrNull(row.engineVersion),
    linkedEntities: linkedEntities.map(serializeLinkedEntitySummary),
  };
}

async function loadSystemContext(propertyId: string, linkedEntityId: string, relevanceScore: number | null): Promise<LinkedEntityContext> {
  const asset = await prisma.homeAsset.findFirst({
    where: {
      id: linkedEntityId,
      propertyId,
    },
    select: {
      id: true,
      assetType: true,
      installationYear: true,
      modelNumber: true,
      serialNumber: true,
      efficiencyRating: true,
      lastServiced: true,
    },
  });

  if (asset) {
    return {
      linkedEntityType: 'SYSTEM',
      linkedEntityId: asset.id,
      relevanceScore,
      label: asset.assetType,
      summary: [textOrNull(asset.modelNumber), textOrNull(asset.efficiencyRating)].filter(Boolean).join(' • ') || null,
      facts: {
        installedYear: asset.installationYear ?? null,
        modelNumber: textOrNull(asset.modelNumber),
        serialNumber: textOrNull(asset.serialNumber),
        efficiencyRating: textOrNull(asset.efficiencyRating),
        lastServiced: asset.lastServiced ? asset.lastServiced.toISOString() : null,
        isVerified: true,
      },
    };
  }

  const item = await prisma.inventoryItem.findFirst({
    where: {
      id: linkedEntityId,
      propertyId,
    },
    select: {
      id: true,
      name: true,
      category: true,
      brand: true,
      model: true,
      manufacturer: true,
      installedOn: true,
      purchasedOn: true,
      isVerified: true,
    },
  });

  if (!item) {
    throw new APIError('Linked system was not found for this property.', 400, 'INVALID_LINKED_ENTITY');
  }

  const installedYear =
    item.installedOn instanceof Date
      ? item.installedOn.getUTCFullYear()
      : item.purchasedOn instanceof Date
        ? item.purchasedOn.getUTCFullYear()
        : null;

  return {
    linkedEntityType: 'SYSTEM',
    linkedEntityId: item.id,
    relevanceScore,
    label: item.name,
    summary: [textOrNull(item.brand), textOrNull(item.model), textOrNull(item.category)].filter(Boolean).join(' • ') || null,
    facts: {
      installedYear,
      category: textOrNull(item.category),
      manufacturer: textOrNull(item.manufacturer),
      isVerified: item.isVerified,
    },
  };
}

async function loadApplianceContext(propertyId: string, linkedEntityId: string, relevanceScore: number | null): Promise<LinkedEntityContext> {
  const item = await prisma.inventoryItem.findFirst({
    where: {
      id: linkedEntityId,
      propertyId,
    },
    select: {
      id: true,
      name: true,
      category: true,
      brand: true,
      model: true,
      manufacturer: true,
      room: {
        select: {
          name: true,
        },
      },
      installedOn: true,
      purchasedOn: true,
      isVerified: true,
    },
  });

  if (!item) {
    throw new APIError('Linked appliance was not found for this property.', 400, 'INVALID_LINKED_ENTITY');
  }

  const installedYear =
    item.installedOn instanceof Date
      ? item.installedOn.getUTCFullYear()
      : item.purchasedOn instanceof Date
        ? item.purchasedOn.getUTCFullYear()
        : null;

  return {
    linkedEntityType: 'APPLIANCE',
    linkedEntityId: item.id,
    relevanceScore,
    label: item.name,
    summary: [textOrNull(item.brand), textOrNull(item.model), textOrNull(item.room?.name)].filter(Boolean).join(' • ') || null,
    facts: {
      installedYear,
      category: textOrNull(item.category),
      manufacturer: textOrNull(item.manufacturer),
      roomName: textOrNull(item.room?.name),
      isVerified: item.isVerified,
    },
  };
}

async function loadDocumentContext(propertyId: string, linkedEntityId: string, relevanceScore: number | null): Promise<LinkedEntityContext> {
  const document = await prisma.document.findFirst({
    where: {
      id: linkedEntityId,
      OR: [
        { propertyId },
        { inventoryItem: { propertyId } },
      ],
    },
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
    },
  });

  if (!document) {
    throw new APIError('Linked document was not found for this property.', 400, 'INVALID_LINKED_ENTITY');
  }

  return {
    linkedEntityType: 'DOCUMENT',
    linkedEntityId: document.id,
    relevanceScore,
    label: document.name,
    summary: [textOrNull(document.type), textOrNull(document.description)].filter(Boolean).join(' • ') || null,
    facts: {
      type: textOrNull(document.type),
    },
  };
}

async function loadIncidentContext(propertyId: string, linkedEntityId: string, relevanceScore: number | null): Promise<LinkedEntityContext> {
  const incident = await prisma.incident.findFirst({
    where: {
      id: linkedEntityId,
      propertyId,
    },
    select: {
      id: true,
      title: true,
      typeKey: true,
      severity: true,
      status: true,
      room: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!incident) {
    throw new APIError('Linked incident was not found for this property.', 400, 'INVALID_LINKED_ENTITY');
  }

  return {
    linkedEntityType: 'INCIDENT',
    linkedEntityId: incident.id,
    relevanceScore,
    label: incident.title,
    summary: [textOrNull(incident.severity), textOrNull(incident.status), textOrNull(incident.room?.name)].filter(Boolean).join(' • ') || null,
    facts: {
      severity: textOrNull(incident.severity),
      status: textOrNull(incident.status),
      typeKey: textOrNull(incident.typeKey),
      roomName: textOrNull(incident.room?.name),
    },
  };
}

async function loadRoomContext(propertyId: string, linkedEntityId: string, relevanceScore: number | null): Promise<LinkedEntityContext> {
  const room = await prisma.inventoryRoom.findFirst({
    where: {
      id: linkedEntityId,
      propertyId,
    },
    select: {
      id: true,
      name: true,
      type: true,
      floorLevel: true,
    },
  });

  if (!room) {
    throw new APIError('Linked room was not found for this property.', 400, 'INVALID_LINKED_ENTITY');
  }

  return {
    linkedEntityType: 'ROOM',
    linkedEntityId: room.id,
    relevanceScore,
    label: room.name,
    summary: [textOrNull(room.type), room.floorLevel != null ? `Floor ${room.floorLevel}` : null].filter(Boolean).join(' • ') || null,
    facts: {
      roomType: textOrNull(room.type),
      floorLevel: room.floorLevel ?? null,
    },
  };
}

async function loadLinkedEntityContext(propertyId: string, input: ServiceRadarCreateLinkedEntityInput): Promise<LinkedEntityContext> {
  const relevanceScore = typeof input.relevanceScore === 'number' ? input.relevanceScore : null;

  if (input.linkedEntityType === 'SYSTEM') {
    return loadSystemContext(propertyId, input.linkedEntityId, relevanceScore);
  }

  if (input.linkedEntityType === 'APPLIANCE') {
    return loadApplianceContext(propertyId, input.linkedEntityId, relevanceScore);
  }

  if (input.linkedEntityType === 'DOCUMENT') {
    return loadDocumentContext(propertyId, input.linkedEntityId, relevanceScore);
  }

  if (input.linkedEntityType === 'INCIDENT') {
    return loadIncidentContext(propertyId, input.linkedEntityId, relevanceScore);
  }

  if (input.linkedEntityType === 'ROOM') {
    return loadRoomContext(propertyId, input.linkedEntityId, relevanceScore);
  }

  return {
    linkedEntityType: 'OTHER',
    linkedEntityId: input.linkedEntityId,
    relevanceScore,
    label: 'Other linked context',
    summary: null,
    facts: {},
  };
}

async function resolveLinkedEntityContexts(propertyId: string, inputs: ServiceRadarCreateLinkedEntityInput[]): Promise<LinkedEntityContext[]> {
  const deduped = new Map<string, ServiceRadarCreateLinkedEntityInput>();
  for (const input of inputs) {
    deduped.set(`${input.linkedEntityType}:${input.linkedEntityId}`, input);
  }

  const contexts: LinkedEntityContext[] = [];
  for (const input of deduped.values()) {
    contexts.push(await loadLinkedEntityContext(propertyId, input));
  }

  return contexts;
}

function normalizeBenchmarkRegionCandidates(property: PropertyContext): Record<ServiceBenchmarkRegionTypeValue, Set<string>> {
  const map: Record<ServiceBenchmarkRegionTypeValue, Set<string>> = {
    COUNTRY: new Set(['US', 'USA', 'UNITED_STATES']),
    STATE: new Set<string>(),
    METRO: new Set<string>(),
    ZIP_PREFIX: new Set<string>(),
    COUNTY: new Set<string>(),
  };

  const stateToken = normalizeRegionKey(property.state);
  const stateCode = normalizeStateCode(property.state);
  if (stateToken) {
    map.STATE.add(stateToken);
  }
  if (stateCode) {
    map.STATE.add(stateCode);
    if (STATE_CODE_TO_NAME_TOKEN[stateCode]) {
      map.STATE.add(STATE_CODE_TO_NAME_TOKEN[stateCode]);
    }
  }

  const city = normalizeRegionKey(property.city);
  if (city) {
    if (stateCode) {
      map.METRO.add(`${city}_${stateCode}`);
      map.METRO.add(`${city}${stateCode}`);
    }
    if (stateToken) {
      map.METRO.add(`${city}_${stateToken}`);
      map.METRO.add(`${city}${stateToken}`);
    }
  }

  if (property.zipCode) {
    const digits = String(property.zipCode).replace(/\D/g, '');
    if (digits.length >= 3) {
      map.ZIP_PREFIX.add(digits.slice(0, 3));
    }
  }

  return map;
}

function benchmarkRegionWeight(regionType: ServiceBenchmarkRegionTypeValue): number {
  if (regionType === 'ZIP_PREFIX') return 50;
  if (regionType === 'METRO') return 40;
  if (regionType === 'COUNTY') return 35;
  if (regionType === 'STATE') return 25;
  return 10;
}

function scoreBenchmark(
  benchmark: ServicePriceBenchmarkRecord,
  property: PropertyContext,
  normalizedSubcategory: string | null
): number {
  const candidates = normalizeBenchmarkRegionCandidates(property);
  const normalizedRegionKey = normalizeRegionKey(benchmark.regionKey) ?? '';
  let score = 0;

  if (benchmark.regionType === 'COUNTRY') {
    if (!candidates.COUNTRY.has(normalizedRegionKey)) return Number.NEGATIVE_INFINITY;
  } else {
    const regionCandidates = candidates[benchmark.regionType];
    if (!regionCandidates || !regionCandidates.has(normalizedRegionKey)) {
      return Number.NEGATIVE_INFINITY;
    }
  }

  score += benchmarkRegionWeight(benchmark.regionType);

  const benchmarkSubcategory = normalizeSubcategory(benchmark.serviceSubcategory);
  if (normalizedSubcategory && benchmarkSubcategory === normalizedSubcategory) {
    score += 40;
  } else if (!benchmarkSubcategory) {
    score += 12;
  } else if (normalizedSubcategory) {
    score -= 18;
  }

  const benchmarkHomeType = normalizeRegionKey(benchmark.homeType);
  const propertyHomeType = normalizeRegionKey(property.homeType);
  if (benchmarkHomeType && propertyHomeType && benchmarkHomeType === propertyHomeType) {
    score += 14;
  } else if (!benchmarkHomeType) {
    score += 4;
  } else {
    score -= 6;
  }

  if (benchmark.sizeBand && property.sizeBand && normalizeLooseToken(benchmark.sizeBand) === property.sizeBand) {
    score += 10;
  } else if (!benchmark.sizeBand) {
    score += 4;
  } else {
    score -= 4;
  }

  return score;
}

async function findBestBenchmark(
  property: PropertyContext,
  serviceCategory: ServiceCategoryValue,
  serviceSubcategory: string | null
): Promise<BenchmarkMatch> {
  try {
    const rows = await prismaAny.servicePriceBenchmark.findMany({
      where: {
        serviceCategory,
        isActive: true,
        effectiveFrom: { lte: new Date() },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      select: {
        id: true,
        serviceCategory: true,
        serviceSubcategory: true,
        regionType: true,
        regionKey: true,
        homeType: true,
        sizeBand: true,
        baseLow: true,
        baseHigh: true,
        baseMedian: true,
        laborFactor: true,
        materialFactor: true,
        complexityFactorJson: true,
        sourceLabel: true,
      },
    });

    let best: ServicePriceBenchmarkRecord | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const row of rows as any[]) {
      const candidate: ServicePriceBenchmarkRecord = {
        id: String(row.id),
        serviceCategory: String(row.serviceCategory) as ServiceCategoryValue,
        serviceSubcategory: textOrNull(row.serviceSubcategory),
        regionType: String(row.regionType) as ServiceBenchmarkRegionTypeValue,
        regionKey: String(row.regionKey),
        homeType: textOrNull(row.homeType),
        sizeBand: textOrNull(row.sizeBand),
        baseLow: asNumber(row.baseLow) ?? 0,
        baseHigh: asNumber(row.baseHigh) ?? 0,
        baseMedian: asNumber(row.baseMedian),
        laborFactor: asNumber(row.laborFactor),
        materialFactor: asNumber(row.materialFactor),
        complexityFactorJson: (row.complexityFactorJson ?? null) as Prisma.JsonValue | null,
        sourceLabel: textOrNull(row.sourceLabel),
      };

      const score = scoreBenchmark(candidate, property, serviceSubcategory);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    if (!best || bestScore === Number.NEGATIVE_INFINITY) {
      return { matched: false, benchmark: null };
    }

    return { matched: true, benchmark: best };
  } catch (error) {
    console.warn('Service Price Radar benchmark lookup skipped:', error);
    return { matched: false, benchmark: null };
  }
}

async function hydrateStoredLinkedEntities(propertyId: string, rows: any[]): Promise<LinkedEntityContext[]> {
  const hydrated: LinkedEntityContext[] = [];

  for (const row of rows) {
    const input: ServiceRadarCreateLinkedEntityInput = {
      linkedEntityType: String(row.linkedEntityType) as ServiceRadarCreateLinkedEntityInput['linkedEntityType'],
      linkedEntityId: String(row.linkedEntityId),
      relevanceScore: asNumber(row.relevanceScore) ?? undefined,
    };

    try {
      hydrated.push(await loadLinkedEntityContext(propertyId, input));
    } catch {
      hydrated.push({
        linkedEntityType: input.linkedEntityType,
        linkedEntityId: input.linkedEntityId,
        relevanceScore: input.relevanceScore ?? null,
        label: `${input.linkedEntityType} link`,
        summary: null,
        facts: {},
      });
    }
  }

  return hydrated;
}

export class ServicePriceRadarService {
  async createCheck(propertyId: string, userId: string, input: ServiceRadarCreateInput): Promise<ServiceRadarCreateResponseDTO> {
    const property = await assertPropertyForUser(propertyId, userId);
    const normalizedInput: ServiceRadarCreateInput = {
      ...input,
      quoteCurrency: (input.quoteCurrency ?? 'USD').toUpperCase(),
      serviceSubcategory: normalizeSubcategory(input.serviceSubcategory) ?? undefined,
      serviceLabelRaw: textOrNull(input.serviceLabelRaw) ?? undefined,
      quoteVendorName: textOrNull(input.quoteVendorName) ?? undefined,
      quoteSource: input.quoteSource ?? 'MANUAL',
      linkedEntities: input.linkedEntities ?? [],
    };

    const linkedEntities = await resolveLinkedEntityContexts(propertyId, normalizedInput.linkedEntities ?? []);
    const benchmarkMatch = await findBestBenchmark(property, normalizedInput.serviceCategory, normalizedInput.serviceSubcategory ?? null);
    const evaluation = engine.evaluate(property, normalizedInput, linkedEntities, benchmarkMatch);

    const created = await prisma.$transaction(async (tx) => {
      const txAny = tx as any;
      const row = await txAny.serviceRadarCheck.create({
        data: {
          propertyId,
          serviceCategory: normalizedInput.serviceCategory,
          serviceSubcategory: evaluation.normalizedSubcategory,
          serviceLabelRaw: normalizedInput.serviceLabelRaw ?? null,
          quoteAmount: normalizedInput.quoteAmount,
          quoteCurrency: normalizedInput.quoteCurrency,
          quoteVendorName: normalizedInput.quoteVendorName ?? null,
          quoteSource: normalizedInput.quoteSource,
          status: evaluation.status,
          verdict: evaluation.verdict,
          expectedLow: evaluation.expectedLow,
          expectedHigh: evaluation.expectedHigh,
          expectedMedian: evaluation.expectedMedian,
          confidenceScore: evaluation.confidenceScore,
          explanationShort: evaluation.explanationShort,
          explanationJson: evaluation.explanationJson,
          propertySnapshotJson: evaluation.propertySnapshotJson,
          pricingFactorsJson: evaluation.pricingFactorsJson,
          engineVersion: evaluation.engineVersion,
        },
      });

      if (linkedEntities.length) {
        await txAny.serviceRadarCheckSystemLink.createMany({
          data: linkedEntities.map((entity) => ({
            serviceRadarCheckId: row.id,
            linkedEntityType: entity.linkedEntityType,
            linkedEntityId: entity.linkedEntityId,
            relevanceScore: entity.relevanceScore,
          })),
        });
      }

      return row;
    });

    return {
      check: mapDetail(created, linkedEntities),
    };
  }

  async listChecks(propertyId: string, userId: string, query: ServiceRadarListQuery): Promise<ServiceRadarListResponseDTO> {
    await assertPropertyForUser(propertyId, userId);

    const rows = await prismaAny.serviceRadarCheck.findMany({
      where: { propertyId },
      orderBy: [{ createdAt: 'desc' }],
      take: query.limit,
      select: {
        id: true,
        propertyId: true,
        createdAt: true,
        status: true,
        serviceCategory: true,
        serviceSubcategory: true,
        serviceLabelRaw: true,
        quoteAmount: true,
        quoteCurrency: true,
        quoteVendorName: true,
        quoteSource: true,
        expectedLow: true,
        expectedHigh: true,
        expectedMedian: true,
        verdict: true,
        confidenceScore: true,
        explanationShort: true,
      },
    });

    return {
      items: (rows as any[]).map(mapSummary),
    };
  }

  async getCheckDetail(propertyId: string, checkId: string, userId: string): Promise<ServiceRadarDetailResponseDTO> {
    await assertPropertyForUser(propertyId, userId);

    const row = await prismaAny.serviceRadarCheck.findFirst({
      where: {
        id: checkId,
        propertyId,
      },
      include: {
        systemLinks: {
          orderBy: [{ createdAt: 'asc' }],
        },
      },
    });

    if (!row) {
      throw new APIError('Service Price Radar check not found.', 404, 'SERVICE_RADAR_CHECK_NOT_FOUND');
    }

    const linkedEntities = await hydrateStoredLinkedEntities(propertyId, Array.isArray(row.systemLinks) ? row.systemLinks : []);

    return {
      check: mapDetail(row, linkedEntities),
    };
  }

  async trackEvent(propertyId: string, userId: string, input: ServicePriceRadarEventInput) {
    await assertPropertyForUser(propertyId, userId);

    const eventName = String(input.event || 'UNKNOWN')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .slice(0, 80);
    const section = input.section ? String(input.section).slice(0, 80) : null;

    await prisma.auditLog.create({
      data: {
        userId,
        action: `SERVICE_PRICE_RADAR_${eventName || 'UNKNOWN'}`,
        entityType: 'PROPERTY',
        entityId: propertyId,
        newValues: {
          section,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        } as Prisma.InputJsonValue,
      },
    });

    return { ok: true };
  }
}
