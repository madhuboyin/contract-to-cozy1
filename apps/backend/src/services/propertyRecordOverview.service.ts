import { prisma } from '../lib/prisma';
import { getContextCompleteness } from '../modules/propertyContext/application/getContextCompleteness';
import { getPropertyContext } from '../modules/propertyContext/application/getPropertyContext';
import type { PropertyContextScope } from '../modules/propertyContext/domain/contracts';
import { canonicalCapabilityRegistry } from '../productFramework/capabilities/canonicalCapabilityRegistry';
import { resolvePropertyAccess, type PropertyAccess } from './propertyAccess.service';
import { getToolDiscoveryAvailability } from './toolDiscoveryAvailability.service';
import type { SkillConsumer } from './skills/skill.contract';
import { invokeReadSkillOperationForConsumer } from './skills/skillConsumerRuntime';

export const PROPERTY_RECORD_CONTEXT_SCOPES: PropertyContextScope[] = [
  'CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY',
  'SYSTEMS', 'SAFETY', 'ROOMS', 'INVENTORY', 'OPTIONAL_HOUSEHOLD',
];

const MAJOR_SYSTEM_CATEGORIES = new Set([
  'HVAC', 'PLUMBING', 'ELECTRICAL', 'ROOF_EXTERIOR', 'STRUCTURAL', 'SAFETY',
]);

const PROPERTY_TOOL_IDS = [
  'capital-timeline', 'home-digital-will', 'plant-advisor',
  'property-brief', 'home-timeline', 'status-board',
] as const;

type LoadState<T> = { status: 'AVAILABLE'; data: T } | { status: 'UNAVAILABLE'; data: null };

function available<T>(data: T): LoadState<T> {
  return { status: 'AVAILABLE', data };
}

function unavailable<T = never>(): LoadState<T> {
  return { status: 'UNAVAILABLE', data: null };
}

async function settled<T>(work: Promise<T>): Promise<LoadState<T>> {
  try {
    return available(await work);
  } catch {
    return unavailable();
  }
}

async function loadPropertyRecordOverview(propertyId: string, userId: string, access: PropertyAccess) {
  const [context, rooms, inventory, documents, household, warranties, capitalTimeline, continuityPlan, plantState, latestBrief, confirmedEvents] = await Promise.all([
    settled(getPropertyContext(propertyId, { userId }, { scopes: PROPERTY_RECORD_CONTEXT_SCOPES })),
    settled(prisma.inventoryRoom.findMany({
      where: { propertyId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      // floorLevel and the two counts feed Ask's room map (FRD v1.79): recorded items, and maintenance tasks that are
      // still open (pending or in progress, as Maintenance counts them). Additive for the property page.
      select: {
        id: true, name: true, type: true, updatedAt: true, floorLevel: true,
        _count: { select: { items: true, maintenanceTasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } } },
      },
    })),
    settled(prisma.inventoryItem.findMany({
      where: { propertyId },
      select: {
        id: true, name: true, category: true, condition: true, isVerified: true, updatedAt: true,
        documents: { where: { deletedAt: null }, select: { id: true } },
      },
    })),
    settled(prisma.document.findMany({
      where: {
        deletedAt: null,
        OR: [{ propertyId }, { inventoryItem: { propertyId } }],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, type: true, verificationStatus: true, propertyId: true, inventoryItemId: true, createdAt: true },
    })),
    settled(prisma.householdMember.findMany({
      where: { propertyId },
      orderBy: [{ isPrimaryOwner: 'desc' }, { joinedAt: 'asc' }],
      select: {
        id: true, userId: true, role: true, isPrimaryOwner: true, joinedAt: true, displayName: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    })),
    settled(prisma.warranty.findMany({
      where: { propertyId },
      orderBy: { expiryDate: 'asc' },
      select: { id: true, providerName: true, category: true, expiryDate: true, startDate: true },
    })),
    settled(prisma.homeCapitalTimelineAnalysis.findFirst({
      where: { propertyId }, orderBy: { computedAt: 'desc' },
      select: { id: true, status: true, confidence: true, computedAt: true, _count: { select: { items: true } } },
    })),
    access.role === 'VIEWER'
      ? Promise.resolve(unavailable())
      : settled(prisma.homeDigitalWill.findUnique({
        where: { propertyId },
        select: { id: true, status: true, readiness: true, completionPercent: true, updatedAt: true },
      })),
    settled(Promise.all([
      prisma.roomPlantProfile.count({ where: { propertyId } }),
      prisma.roomPlantRecommendation.count({ where: { propertyId, status: 'SAVED' } }),
    ])),
    settled(prisma.propertyBrief.findFirst({
      where: { propertyId, createdByUserId: userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, asOf: true, createdAt: true },
    })),
    settled(Promise.all([
      prisma.homeEvent.count({ where: {
        propertyId, isCurrent: true, deletedAt: null,
        verificationStatus: { in: ['HOMEOWNER_CONFIRMED', 'EVIDENCE_VERIFIED'] },
        OR: [{ visibility: { not: 'PRIVATE' } }, { createdById: userId }],
      } }),
      prisma.homeEvent.findMany({
        where: {
          propertyId, isCurrent: true, deletedAt: null,
          verificationStatus: { in: ['HOMEOWNER_CONFIRMED', 'EVIDENCE_VERIFIED'] },
          OR: [{ visibility: { not: 'PRIVATE' } }, { createdById: userId }],
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: 8,
        select: {
          id: true, title: true, occurredAt: true, updatedAt: true, sourceBadge: true,
          verificationStatus: true, sourceAsOf: true, type: true,
        },
      }),
    ])),
  ]);

  const roomRows = rooms.data ?? [];
  const itemRows = inventory.data ?? [];
  const documentRows = documents.data ?? [];
  const householdRows = household.data ?? [];
  const warrantyRows = warranties.data ?? [];
  const majorSystems = itemRows.filter((item) => MAJOR_SYSTEM_CATEGORIES.has(item.category));
  const inventoryUpdatedAt = itemRows
    .map((item) => item.updatedAt)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const verifiedDocuments = documentRows.filter((document) => document.verificationStatus === 'VERIFIED').length;
  const linkedDocuments = documentRows.filter((document) => Boolean(document.propertyId || document.inventoryItemId)).length;
  const latestDocument = documentRows[0] ?? null;
  const knownFactCount = context.data
    ? Object.values(context.data.facts).filter((fact) => fact.state === 'KNOWN').length
    : 0;
  const discoveryAvailability = getToolDiscoveryAvailability(userId);

  const toolDefinitions = PROPERTY_TOOL_IDS.map((id) => canonicalCapabilityRegistry.getById(id)).filter(Boolean);
  const toolEligibility = Object.fromEntries(toolDefinitions.map((definition) => {
    const reasons: string[] = [];
    if (definition!.destination.workflowOnly) reasons.push('WORKFLOW_ONLY');
    if (!discoveryAvailability.enabled) reasons.push('DISCOVERY_DISABLED');
    if (discoveryAvailability.disabledToolIds.includes(definition!.id)) reasons.push('TOOL_DISABLED');
    if (discoveryAvailability.brokenRouteToolIds.includes(definition!.id)) reasons.push('ROUTE_UNAVAILABLE');
    if (discoveryAvailability.releaseGateBlockedToolIds.includes(definition!.id)) reasons.push('RELEASE_GATE_BLOCKED');
    if (discoveryAvailability.rollouts[definition!.governance.rolloutKey]?.enabled === false) reasons.push('ROLLOUT_DISABLED');
    if (definition!.recommendation.readinessRequirements.some((requirement) => requirement.kind === 'PROPERTY') && !propertyId) reasons.push('PROPERTY_REQUIRED');
    if (definition!.id === 'capital-timeline' && majorSystems.length === 0) reasons.push('TRACKED_SYSTEM_REQUIRED');
    if (definition!.id === 'plant-advisor' && roomRows.length === 0) reasons.push('ROOM_REQUIRED');
    if (definition!.id === 'home-digital-will' && access.role === 'VIEWER') reasons.push('CONTRIBUTOR_ROLE_REQUIRED');
    return [definition!.id, {
      state: reasons.length === 0 ? 'ELIGIBLE' : 'NEEDS_CONTEXT',
      reasons,
      releaseStage: definition!.governance.releaseStage,
      rolloutKey: definition!.governance.rolloutKey,
    }];
  }));

  const newestSourceAt = [
    latestDocument?.createdAt,
    ...itemRows.map((item) => item.updatedAt),
    ...roomRows.map((room) => room.updatedAt),
  ].filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const brief = latestBrief.data;

  return {
    contractVersion: 'property-record-overview-v1' as const,
    registryVersion: canonicalCapabilityRegistry.version,
    accessRole: access.role,
    context: context.data ? {
      status: 'AVAILABLE' as const,
      snapshot: context.data,
      completeness: getContextCompleteness(context.data),
      knownFactCount,
    } : { status: 'UNAVAILABLE' as const, snapshot: null, completeness: null, knownFactCount: 0 },
    sections: {
      rooms: rooms.status === 'AVAILABLE' ? available({ count: roomRows.length, items: roomRows }) : unavailable(),
      inventory: inventory.status === 'AVAILABLE' ? available({
        totalCount: itemRows.length,
        majorSystemCount: majorSystems.length,
        verifiedCount: itemRows.filter((item) => item.isVerified).length,
        withDocumentCount: itemRows.filter((item) => item.documents.length > 0).length,
        items: itemRows,
      }) : unavailable(),
      documents: documents.status === 'AVAILABLE' ? available({
        totalCount: documentRows.length,
        verifiedCount: verifiedDocuments,
        needsReviewCount: documentRows.length - verifiedDocuments,
        linkedCount: linkedDocuments,
        items: documentRows,
        byType: Object.entries(documentRows.reduce<Record<string, number>>((acc, document) => {
          acc[document.type] = (acc[document.type] ?? 0) + 1;
          return acc;
        }, {})).map(([type, count]) => ({ type, count })),
        latest: latestDocument,
      }) : unavailable(),
      household: household.status === 'AVAILABLE' ? available({
        totalCount: householdRows.length,
        roles: Object.entries(householdRows.reduce<Record<string, number>>((acc, member) => {
          acc[member.role] = (acc[member.role] ?? 0) + 1;
          return acc;
        }, {})).map(([role, count]) => ({ role, count })),
        items: householdRows,
      }) : unavailable(),
      warranties: warranties.status === 'AVAILABLE' ? available({
        totalCount: warrantyRows.length,
        activeCount: warrantyRows.filter((warranty) => warranty.expiryDate > new Date()).length,
        items: warrantyRows,
      }) : unavailable(),
    },
    tools: {
      eligibility: toolEligibility,
      capitalTimeline: capitalTimeline.status === 'AVAILABLE' ? available(capitalTimeline.data ? {
        id: capitalTimeline.data.id,
        itemCount: capitalTimeline.data._count.items,
        status: capitalTimeline.data.status,
        confidence: capitalTimeline.data.confidence,
        computedAt: capitalTimeline.data.computedAt,
      } : null) : unavailable(),
      continuityPlan,
      plantAdvisor: plantState.status === 'AVAILABLE' ? available({ profileCount: plantState.data[0], savedCount: plantState.data[1] }) : unavailable(),
      propertyBrief: latestBrief.status === 'AVAILABLE' ? available(brief ? {
        ...brief,
        isStale: Boolean(newestSourceAt && brief.asOf < newestSourceAt),
      } : null) : unavailable(),
      homeTimeline: confirmedEvents.status === 'AVAILABLE' ? available({
        confirmedCount: confirmedEvents.data[0],
        recent: confirmedEvents.data[1],
      }) : unavailable(),
      statusBoard: inventory.status === 'AVAILABLE' ? available({
        representedSystemCount: majorSystems.length,
        updatedAt: inventoryUpdatedAt,
      }) : unavailable(),
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function getPropertyRecordOverview(
  propertyId: string,
  userId: string,
  consumer: Extract<SkillConsumer, 'ASK' | 'CONCIERGE_HOME'>,
) {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access) throw new Error('PROPERTY_NOT_FOUND');
  return invokeReadSkillOperationForConsumer({
    consumer,
    operationId: 'PROPERTY_SUMMARY',
    role: access.role,
    execute: () => loadPropertyRecordOverview(propertyId, userId, access),
  });
}
