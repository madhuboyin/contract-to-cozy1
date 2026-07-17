import { prisma } from '../../lib/prisma';
import { knownContextValue } from '../propertyContextDecision';
import { getPlanningContextDecisions } from './context';

export interface ReportWorkerContextResult {
  allowed: boolean;
  contextVersion: string | null;
  userId: string | null;
  reasonCodes: string[];
}

/**
 * Workers act on behalf of the property owner: report generation is blocked
 * when the owner cannot be resolved or report applicability is NOT_APPLICABLE.
 */
export async function checkReportWorkerContext(propertyId: string): Promise<ReportWorkerContextResult> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { homeownerProfile: { select: { userId: true } } },
  });
  const userId = property?.homeownerProfile?.userId ?? null;
  if (!userId) {
    return {
      allowed: false,
      contextVersion: null,
      userId: null,
      reasonCodes: ['PROPERTY_OWNER_CONTEXT_UNAVAILABLE'],
    };
  }
  const result = await getPlanningContextDecisions(propertyId, userId, 'REPORTS');
  const decision = result.decisions.reportGeneration;
  return {
    allowed: decision.status !== 'NOT_APPLICABLE',
    contextVersion: result.contextVersion,
    userId,
    reasonCodes: decision.status === 'NOT_APPLICABLE'
      ? decision.reasonCodes
      : ['REPORT_WORKER_CONTEXT_ALLOWED'],
  };
}

/**
 * Single authoritative report snapshot builder used by the backend service and
 * the report-export worker. The property block is sourced from Property
 * Context (canonical dwelling classification, never the legacy enums); the
 * detail blocks read their canonical domain models directly.
 */
export async function buildAuthoritativeReportSnapshot(args: {
  userId: string;
  propertyId: string;
  sections?: unknown;
}) {
  const { userId, propertyId } = args;

  const planning = await getPlanningContextDecisions(propertyId, userId, 'REPORTS');
  const { context } = planning;

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      inventoryRooms: true,
      inventoryItems: { include: { room: true, documents: true } },
      insurancePolicies: { include: { documents: true } },
      warranties: { include: { documents: true } },
      maintenanceTasks: true,
    },
  });

  if (!property) throw new Error('Property not found');

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      propertyId,
      templateVersion: 3,
      dataVersion: 2,
      contextVersion: planning.contextVersion,
      reportDecision: {
        status: planning.decisions.reportGeneration.status,
        reasonCodes: planning.decisions.reportGeneration.reasonCodes,
        missingFactKeys: planning.decisions.reportGeneration.missingFactKeys,
      },
    },
    property: {
      id: property.id,
      nickname: (property as { nickname?: string | null }).nickname ?? null,
      addressLine1: property.address ?? null,
      city: knownContextValue<string>(context, 'location.city') ?? property.city ?? null,
      state: knownContextValue<string>(context, 'location.state') ?? property.state ?? null,
      zipCode: knownContextValue<string>(context, 'location.zipCode') ?? property.zipCode ?? null,
      dwellingType: knownContextValue<string>(context, 'core.dwellingType') ?? null,
      propertyUse: knownContextValue<string>(context, 'core.propertyUse') ?? null,
      yearBuilt: knownContextValue<number>(context, 'core.yearBuilt') ?? property.yearBuilt ?? null,
      livingAreaSqft:
        knownContextValue<number>(context, 'core.propertySizeSqFt') ?? property.propertySize ?? null,
    },
    inventory: {
      rooms: property.inventoryRooms.map((room) => ({ id: room.id, name: room.name })),
      items: property.inventoryItems.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        condition: item.condition,
        brand: item.brand ?? null,
        modelNumber: item.modelNumber ?? null,
        serialNumber: item.serialNumber ?? null,
        purchasedOn: item.purchasedOn ?? null,
        purchaseCostCents: item.purchaseCostCents ?? null,
        replacementCostCents: item.replacementCostCents ?? null,
        room: item.room ? { id: item.room.id, name: item.room.name } : null,
        documents: item.documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
          fileUrl: doc.fileUrl,
        })),
      })),
    },
    maintenance: {
      tasks: property.maintenanceTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        riskLevel: task.riskLevel ?? null,
        frequency: task.frequency ?? null,
        nextDueDate: task.nextDueDate ?? null,
        lastCompletedDate: task.lastCompletedDate ?? null,
        estimatedCost: task.estimatedCost ?? null,
        actualCost: task.actualCost ?? null,
        assetType: task.assetType ?? null,
        source: task.source,
      })),
    },
    coverage: {
      insurancePolicies: property.insurancePolicies.map((policy) => ({
        id: policy.id,
        providerName: policy.carrierName,
        policyNumber: policy.policyNumber,
        startDate: policy.startDate,
        expiryDate: policy.expiryDate,
        premium: policy.premiumAmount != null ? Number(policy.premiumAmount) : null,
        coverageAmount:
          policy.personalPropertyLimitCents != null ? policy.personalPropertyLimitCents / 100 : null,
        documents: policy.documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
          fileUrl: doc.fileUrl,
        })),
      })),
      warranties: property.warranties.map((warranty) => ({
        id: warranty.id,
        providerName: warranty.providerName,
        policyNumber: warranty.policyNumber,
        startDate: warranty.startDate,
        expiryDate: warranty.expiryDate,
        coverageDetails: warranty.coverageDetails ?? null,
        documents: warranty.documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
          fileUrl: doc.fileUrl,
        })),
      })),
    },
  };
}
