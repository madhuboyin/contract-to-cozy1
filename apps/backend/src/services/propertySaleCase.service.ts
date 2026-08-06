// apps/backend/src/services/propertySaleCase.service.ts
//
// Slice 8 of HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_
// PLAN.md — one property-shared PropertySaleCase replacing the per-user
// SellerPrepPlan static checklist. Readiness items are projected (synced)
// from canonical sources on every read rather than self-reported, per the
// plan's exit gate: "Seller readiness reflects real property work and
// records, not generic tasks or self-reported completion percentages."
import type {
  HouseholdRole,
  SaleCaseStatus,
  SaleReadinessCategory,
  SaleReadinessItemStatus,
  SaleReadinessRequirementClass,
  SaleReadinessSourceType,
  SaleTransitionRetentionDecision,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { auditLog } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import { listWorkItems } from '../modules/homeOperations/application/listWorkItems.usecase';
import { homeRecordsService } from './homeRecords.service';
import { revokePropertyBriefShare } from '../propertyBrief/propertyBrief.service';

type ProjectedItem = {
  sourceEntityType: SaleReadinessSourceType;
  sourceEntityId: string;
  category: SaleReadinessCategory;
  requirementClass: SaleReadinessRequirementClass;
  title: string;
  detail?: string | null;
  dueAt?: Date | null;
  canonicalWorkItemId?: string | null;
};

const RECORD_TYPES_RELEVANT_TO_SALE = new Set([
  'DEED', 'TAX_DOCUMENT', 'DISCLOSURE', 'SURVEY', 'PERMIT',
  'INSURANCE_POLICY', 'WARRANTY', 'CLOSING_DOCUMENT',
]);

const UNRESOLVED_UNPERMITTED_FLAG_STATUSES = new Set([
  'FLAGGED', 'INVESTIGATING', 'CONFIRMED_UNPERMITTED', 'WILL_REMEDIATE',
]);

const OPEN_PROJECT_STATUSES = new Set(['PLANNING', 'IN_PROGRESS', 'PAUSED', 'DISPUTED']);

const HOME_ACTION_TIER_MAP: Record<
  string,
  { category: SaleReadinessCategory; requirementClass: SaleReadinessRequirementClass }
> = {
  SAFETY_EMERGENCY: { category: 'SAFETY_STRUCTURAL', requirementClass: 'MATERIAL_BLOCKER' },
  REGULATED_COVERAGE: { category: 'PERMITS_DISCLOSURE', requirementClass: 'VERIFICATION_NEEDED' },
  MATERIAL_FINANCIAL: { category: 'FINANCIAL_DECISION', requirementClass: 'PROFESSIONAL_DECISION' },
  LOW_CONSEQUENCE: { category: 'SYSTEMS_MAINTENANCE', requirementClass: 'OPTIONAL_IMPROVEMENT' },
};

const CLOSED_HOME_ACTION_STATES = new Set(['CLOSED', 'VERIFIED']);

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function projectInspectionFindings(propertyId: string): Promise<ProjectedItem[]> {
  const findings = await prisma.inspectionFinding.findMany({
    where: { propertyId, status: 'OPEN', severity: { not: 'INFORMATIONAL' } },
    select: { id: true, severity: true, homeSystem: true, subsystem: true, inspectorDescription: true },
  });
  return findings.map((finding) => {
    const isSafety = finding.severity === 'SAFETY';
    const isMajor = finding.severity === 'MAJOR';
    return {
      sourceEntityType: 'INSPECTION_FINDING' as const,
      sourceEntityId: finding.id,
      category: isSafety || isMajor ? 'SAFETY_STRUCTURAL' : 'SYSTEMS_MAINTENANCE',
      requirementClass: isSafety
        ? 'MATERIAL_BLOCKER'
        : isMajor
          ? 'VERIFICATION_NEEDED'
          : 'OPTIONAL_IMPROVEMENT',
      title: `${finding.homeSystem}${finding.subsystem ? ` — ${finding.subsystem}` : ''}: unresolved inspection finding`,
      detail: truncate(finding.inspectorDescription, 500),
    };
  });
}

async function projectProjects(propertyId: string): Promise<ProjectedItem[]> {
  const projects = await prisma.projectRecord.findMany({
    where: { propertyId, status: { in: Array.from(OPEN_PROJECT_STATUSES) as any } },
    select: { id: true, name: true, status: true },
  });
  return projects.map((project) => ({
    sourceEntityType: 'PROJECT' as const,
    sourceEntityId: project.id,
    category: 'SYSTEMS_MAINTENANCE' as const,
    requirementClass: project.status === 'PLANNING' ? 'PROFESSIONAL_DECISION' as const : 'MATERIAL_BLOCKER' as const,
    title: `Unfinished project: ${project.name}`,
    detail: `Status: ${project.status}`,
  }));
}

async function projectPermits(propertyId: string): Promise<ProjectedItem[]> {
  const [unverified, unpermitted] = await Promise.all([
    prisma.propertyPermitRecord.findMany({
      where: { propertyId, isActive: true, isVerified: false },
      select: { id: true, category: true, description: true },
    }),
    prisma.permitUnpermittedFlag.findMany({
      where: { propertyId, status: { in: Array.from(UNRESOLVED_UNPERMITTED_FLAG_STATUSES) as any } },
      select: { id: true, workType: true, flagReason: true, disclosureRisk: true },
    }),
  ]);

  const fromRecords: ProjectedItem[] = unverified.map((permit) => ({
    sourceEntityType: 'PERMIT' as const,
    sourceEntityId: permit.id,
    category: 'PERMITS_DISCLOSURE' as const,
    requirementClass: 'VERIFICATION_NEEDED' as const,
    title: `Unverified permit: ${permit.category}`,
    detail: permit.description ?? null,
  }));

  const fromFlags: ProjectedItem[] = unpermitted.map((flag) => ({
    // Distinct source type from PropertyPermitRecord's 'PERMIT' above —
    // these are two different Prisma models (PropertyPermitRecord vs.
    // PermitUnpermittedFlag), so collapsing them onto one sourceEntityType
    // made an id alone ambiguous to resolve. Split so each type maps to
    // exactly one model and one real deep-link.
    sourceEntityType: 'PERMIT_UNPERMITTED_FLAG' as const,
    sourceEntityId: flag.id,
    category: 'PERMITS_DISCLOSURE' as const,
    requirementClass: 'PROFESSIONAL_DECISION' as const,
    title: `Possible unpermitted work: ${flag.workType}`,
    detail: `${flag.flagReason} (disclosure risk: ${flag.disclosureRisk})`,
  }));

  return [...fromRecords, ...fromFlags];
}

// Forecast-driven advisories (e.g. "Multi-day heat risk ahead") are
// proposed straight from environment insights with no PropertyMaintenanceTask
// behind them (no EXECUTION-role source — see listWorkItems.usecase.ts's
// hasExecutionBackedSource) and always land at LOW_CONSEQUENCE. They're
// forward-looking weather prep, not something a buyer's inspection would
// flag or that blocks a sale, so they shouldn't inflate the readiness count.
function isWeatherAdvisoryOnly(item: Awaited<ReturnType<typeof listWorkItems>>[number]): boolean {
  return item.obligationType === 'MAINTENANCE_TASK'
    && item.safetyTier === 'LOW_CONSEQUENCE'
    && !item.hasExecutionBackedSource;
}

async function projectHomeActions(propertyId: string): Promise<ProjectedItem[]> {
  const items = await listWorkItems({ propertyId });
  return items
    .filter((item) => !CLOSED_HOME_ACTION_STATES.has(item.state) && item.acceptanceState !== 'DECLINED')
    .filter((item) => !isWeatherAdvisoryOnly(item))
    .map((item) => {
      const tier = HOME_ACTION_TIER_MAP[item.safetyTier] ?? HOME_ACTION_TIER_MAP.LOW_CONSEQUENCE;
      return {
        sourceEntityType: 'HOME_ACTION' as const,
        sourceEntityId: item.id,
        category: tier.category,
        requirementClass: tier.requirementClass,
        title: item.title,
        detail: item.homeownerReason ?? null,
        dueAt: item.dueAt,
        canonicalWorkItemId: item.id,
      };
    });
}

async function projectRecords(propertyId: string, role: HouseholdRole): Promise<ProjectedItem[]> {
  const records = await homeRecordsService.list(propertyId, role, { lifecycleStatus: 'ACTIVE' });
  return records
    .filter((record: any) =>
      RECORD_TYPES_RELEVANT_TO_SALE.has(record.recordType) &&
      (record.needsReview || record.expiryStatus === 'EXPIRED' || record.expiryStatus === 'EXPIRING_SOON'))
    .map((record: any) => ({
      sourceEntityType: 'PROPERTY_RECORD' as const,
      sourceEntityId: record.id,
      category: 'DOCUMENTATION_RECORDS' as const,
      requirementClass: 'VERIFICATION_NEEDED' as const,
      title: `${record.title}: needs review before listing`,
      detail: record.expiryStatus === 'EXPIRED'
        ? 'Expired'
        : record.expiryStatus === 'EXPIRING_SOON'
          ? 'Expiring soon'
          : 'Pending extraction review',
    }));
}

// A material spec can trigger more than one gap at once (e.g. never
// finalized *and* its supplier went dark) — only the single most material
// one is surfaced per spec, since the unique key is one row per source
// entity. Ordered most-severe-first.
async function projectMaterialSpecs(propertyId: string): Promise<ProjectedItem[]> {
  const specs = await prisma.materialSpec.findMany({
    where: { propertyId, isActive: true },
    select: {
      id: true, label: true, category: true, lifecycleStatus: true,
      verificationConfidence: true, supplierDiscontinued: true, successorProductUrl: true,
    },
  });
  const items: ProjectedItem[] = [];
  for (const spec of specs) {
    if (spec.lifecycleStatus !== 'AS_BUILT') {
      items.push({
        sourceEntityType: 'MATERIAL_SPEC',
        sourceEntityId: spec.id,
        category: 'SYSTEMS_MAINTENANCE',
        requirementClass: 'VERIFICATION_NEEDED',
        title: `${spec.label}: not yet finalized as-built`,
        detail: `Status: ${spec.lifecycleStatus}`,
      });
    } else if (spec.verificationConfidence === 'REPORTED') {
      items.push({
        sourceEntityType: 'MATERIAL_SPEC',
        sourceEntityId: spec.id,
        category: 'DOCUMENTATION_RECORDS',
        requirementClass: 'VERIFICATION_NEEDED',
        title: `${spec.label}: as-built detail never verified`,
        detail: 'Reported only — no supporting documentation or on-site verification on file.',
      });
    } else if (spec.supplierDiscontinued && !spec.successorProductUrl) {
      items.push({
        sourceEntityType: 'MATERIAL_SPEC',
        sourceEntityId: spec.id,
        category: 'PRESENTATION',
        requirementClass: 'OPTIONAL_IMPROVEMENT',
        title: `${spec.label}: supplier discontinued, no successor product on file`,
        detail: 'Worth noting for a buyer who wants to match or repair this material later.',
      });
    }
  }
  return items;
}

const SIGNIFICANT_TIMELINE_EVENT_TYPES = new Set([
  'IMPROVEMENT', 'REPAIR', 'CLAIM', 'INSPECTION', 'MILESTONE',
]);
const UNVERIFIED_TIMELINE_STATUSES = new Set(['UNVERIFIED', 'PENDING_CONFIRMATION']);

async function projectTimelineEvents(propertyId: string): Promise<ProjectedItem[]> {
  const events = await prisma.homeEvent.findMany({
    where: {
      propertyId,
      isCurrent: true,
      importance: { in: ['HIGH', 'HIGHLIGHT'] },
      verificationStatus: { in: Array.from(UNVERIFIED_TIMELINE_STATUSES) as any },
      type: { in: Array.from(SIGNIFICANT_TIMELINE_EVENT_TYPES) as any },
    },
    select: { id: true, title: true, type: true, verificationStatus: true },
  });
  return events.map((event) => ({
    sourceEntityType: 'TIMELINE_EVENT' as const,
    sourceEntityId: event.id,
    category: 'DOCUMENTATION_RECORDS' as const,
    requirementClass: 'VERIFICATION_NEEDED' as const,
    title: `${event.title}: significant history event unverified`,
    detail: `${event.type} — ${event.verificationStatus}`,
  }));
}

async function syncReadinessItems(saleCaseId: string, propertyId: string, role: HouseholdRole): Promise<void> {
  const [findings, projects, permits, homeActions, records, materialSpecs, timelineEvents] = await Promise.all([
    projectInspectionFindings(propertyId),
    projectProjects(propertyId),
    projectPermits(propertyId),
    projectHomeActions(propertyId),
    projectRecords(propertyId, role),
    projectMaterialSpecs(propertyId),
    projectTimelineEvents(propertyId),
  ]);
  const projected = [...findings, ...projects, ...permits, ...homeActions, ...records, ...materialSpecs, ...timelineEvents];
  const projectedKeys = new Set(projected.map((p) => `${p.sourceEntityType}:${p.sourceEntityId}`));

  const existing = await prisma.saleReadinessItem.findMany({ where: { saleCaseId } });
  const existingByKey = new Map(existing.map((item) => [`${item.sourceEntityType}:${item.sourceEntityId}`, item]));

  await prisma.$transaction([
    ...projected.map((item) => {
      const key = `${item.sourceEntityType}:${item.sourceEntityId}`;
      const current = existingByKey.get(key);
      // A WAIVED item stays waived even while its source condition
      // persists — that's the point of a waive (explicit disclose-and-
      // accept decision). Only RESOLVED items get revived to OPEN.
      const status: SaleReadinessItemStatus = current?.status === 'WAIVED' ? 'WAIVED' : 'OPEN';
      return prisma.saleReadinessItem.upsert({
        where: { saleCaseId_sourceEntityType_sourceEntityId: { saleCaseId, sourceEntityType: item.sourceEntityType, sourceEntityId: item.sourceEntityId } },
        create: {
          saleCaseId,
          sourceEntityType: item.sourceEntityType,
          sourceEntityId: item.sourceEntityId,
          category: item.category,
          requirementClass: item.requirementClass,
          title: item.title,
          detail: item.detail ?? null,
          dueAt: item.dueAt ?? null,
          canonicalWorkItemId: item.canonicalWorkItemId ?? null,
          status,
        },
        update: {
          category: item.category,
          requirementClass: item.requirementClass,
          title: item.title,
          detail: item.detail ?? null,
          dueAt: item.dueAt ?? null,
          canonicalWorkItemId: item.canonicalWorkItemId ?? null,
          status,
          resolvedAt: null,
        },
      });
    }),
    // Sources that no longer appear (fixed, closed, resolved) — auto-resolve
    // unless the homeowner had already waived it, which is a durable decision.
    ...existing
      .filter((item) => !projectedKeys.has(`${item.sourceEntityType}:${item.sourceEntityId}`) && item.status === 'OPEN')
      .map((item) => prisma.saleReadinessItem.update({
        where: { id: item.id },
        data: { status: 'RESOLVED' as SaleReadinessItemStatus, resolvedAt: new Date() },
      })),
  ]);
}

async function requireAccess(userId: string, propertyId: string, minimumRole?: 'CONTRIBUTOR' | 'OWNER') {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access) throw new APIError('Property not found or unauthorized', 404, 'PROPERTY_NOT_FOUND');
  if (minimumRole && ROLE_RANK[access.role] < ROLE_RANK[minimumRole]) {
    throw new APIError('Insufficient household role', 403, 'SALE_CASE_ROLE_INSUFFICIENT');
  }
  return access;
}

export class PropertySaleCaseService {
  static async getCase(userId: string, propertyId: string) {
    const access = await requireAccess(userId, propertyId);
    const saleCase = await prisma.propertySaleCase.findUnique({ where: { propertyId } });
    if (!saleCase) {
      const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { propertyUse: true } });
      const hasContributorAccess = ROLE_RANK[access.role] >= ROLE_RANK.CONTRIBUTOR;
      return {
        propertyId,
        saleIntentConfirmed: property?.propertyUse === 'FOR_SALE',
        canCreate: property?.propertyUse === 'FOR_SALE' && hasContributorAccess,
        canConfirmSaleIntent: hasContributorAccess,
        currentPropertyUse: property?.propertyUse ?? null,
        saleCase: null,
        readinessItems: [],
        transitions: [],
      };
    }

    await syncReadinessItems(saleCase.id, propertyId, access.role);
    const [readinessItems, transitions] = await Promise.all([
      prisma.saleReadinessItem.findMany({
        where: { saleCaseId: saleCase.id },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.propertyTransition.findMany({
        where: { saleCaseId: saleCase.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      propertyId,
      saleIntentConfirmed: true,
      canCreate: false,
      saleCase,
      readinessItems,
      transitions,
    };
  }

  static async createCase(userId: string, propertyId: string) {
    const access = await requireAccess(userId, propertyId, 'CONTRIBUTOR');
    const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { propertyUse: true } });
    if (property?.propertyUse !== 'FOR_SALE') {
      throw new APIError(
        'Confirm the property is for sale before starting a sale case.',
        409,
        'SALE_CASE_INTENT_NOT_CONFIRMED',
      );
    }

    const existing = await prisma.propertySaleCase.findUnique({ where: { propertyId } });
    if (existing) return existing;

    const saleCase = await prisma.propertySaleCase.create({
      data: { propertyId, createdByUserId: userId, status: 'PREPARING' },
    });
    auditLog('SALE_CASE_CREATED', userId, { propertyId, saleCaseId: saleCase.id });
    await syncReadinessItems(saleCase.id, propertyId, access.role);
    return saleCase;
  }

  static async updateTargetDates(
    userId: string,
    propertyId: string,
    updates: { targetListDate?: Date | null; targetCloseDate?: Date | null },
  ) {
    await requireAccess(userId, propertyId, 'CONTRIBUTOR');
    const saleCase = await prisma.propertySaleCase.findUnique({ where: { propertyId } });
    if (!saleCase) throw new APIError('Sale case not found', 404, 'SALE_CASE_NOT_FOUND');
    return prisma.propertySaleCase.update({ where: { id: saleCase.id }, data: updates });
  }

  static async transitionStatus(userId: string, propertyId: string, nextStatus: SaleCaseStatus) {
    await requireAccess(userId, propertyId, 'CONTRIBUTOR');
    const saleCase = await prisma.propertySaleCase.findUnique({ where: { propertyId } });
    if (!saleCase) throw new APIError('Sale case not found', 404, 'SALE_CASE_NOT_FOUND');

    const FORWARD_ORDER: SaleCaseStatus[] = ['PREPARING', 'LISTED', 'UNDER_CONTRACT', 'CLOSED'];
    const currentIndex = FORWARD_ORDER.indexOf(saleCase.status);
    const nextIndex = FORWARD_ORDER.indexOf(nextStatus);
    const isForwardStep = currentIndex >= 0 && nextIndex === currentIndex + 1;
    const isCancellation = nextStatus === 'CANCELLED' && saleCase.status !== 'CLOSED' && saleCase.status !== 'CANCELLED';
    if (!isForwardStep && !isCancellation) {
      throw new APIError(
        `Cannot move sale case from ${saleCase.status} to ${nextStatus}`,
        409,
        'SALE_CASE_TRANSITION_INVALID',
      );
    }

    const timestampField = nextStatus === 'LISTED'
      ? 'listedAt'
      : nextStatus === 'UNDER_CONTRACT'
        ? 'underContractAt'
        : nextStatus === 'CLOSED'
          ? 'closedAt'
          : null;

    const updated = await prisma.propertySaleCase.update({
      where: { id: saleCase.id },
      data: { status: nextStatus, ...(timestampField ? { [timestampField]: new Date() } : {}) },
    });
    auditLog('SALE_CASE_STATUS_CHANGED', userId, { propertyId, saleCaseId: saleCase.id, from: saleCase.status, to: nextStatus });
    return updated;
  }

  static async setItemDecision(
    userId: string,
    propertyId: string,
    itemId: string,
    action: 'WAIVE' | 'REOPEN',
    reason?: string,
  ) {
    await requireAccess(userId, propertyId, 'CONTRIBUTOR');
    const item = await prisma.saleReadinessItem.findFirst({
      where: { id: itemId, saleCase: { propertyId } },
    });
    if (!item) throw new APIError('Readiness item not found', 404, 'SALE_READINESS_ITEM_NOT_FOUND');

    if (action === 'WAIVE') {
      return prisma.saleReadinessItem.update({
        where: { id: itemId },
        data: { status: 'WAIVED', waivedAt: new Date(), waivedByUserId: userId, waivedReason: reason ?? null },
      });
    }
    return prisma.saleReadinessItem.update({
      where: { id: itemId },
      data: { status: 'OPEN', waivedAt: null, waivedByUserId: null, waivedReason: null },
    });
  }

  // Resolves & validates a candidate buyerPackageId against the real
  // PropertyBriefShare/PropertyBrief tables (never trusted as an opaque
  // string) — must belong to this property, be a PROSPECTIVE_BUYER-purpose
  // brief (Slice 10's buyer-safe section set), and still be ACTIVE.
  private static async resolveBuyerPackageShare(propertyId: string, buyerPackageId: string) {
    const share = await prisma.propertyBriefShare.findFirst({
      where: { id: buyerPackageId, propertyId, status: 'ACTIVE' },
      include: { brief: { select: { purpose: true } } },
    });
    if (!share || share.brief.purpose !== 'PROSPECTIVE_BUYER') {
      throw new APIError(
        'buyerPackageId must reference an active PROSPECTIVE_BUYER Property Brief share on this property.',
        422,
        'SALE_TRANSITION_BUYER_PACKAGE_INVALID',
      );
    }
    return share;
  }

  static async recordTransition(
    userId: string,
    propertyId: string,
    input: {
      effectiveAt?: Date | null;
      sellerRetentionDecision?: SaleTransitionRetentionDecision | null;
      sellerRetentionNotes?: string | null;
      buyerPackageId?: string | null;
    },
  ) {
    await requireAccess(userId, propertyId, 'CONTRIBUTOR');
    const saleCase = await prisma.propertySaleCase.findUnique({ where: { propertyId } });
    if (!saleCase) throw new APIError('Sale case not found', 404, 'SALE_CASE_NOT_FOUND');

    const share = input.buyerPackageId
      ? await this.resolveBuyerPackageShare(propertyId, input.buyerPackageId)
      : null;

    return prisma.propertyTransition.create({
      data: {
        saleCaseId: saleCase.id,
        effectiveAt: input.effectiveAt ?? null,
        sellerRetentionDecision: input.sellerRetentionDecision ?? null,
        sellerRetentionNotes: input.sellerRetentionNotes ?? null,
        buyerPackageId: input.buyerPackageId ?? null,
        // Mirrored from the real share, never client-supplied — a milestone
        // only becomes "accepted" once the actual recipient opened it.
        acceptedAt: share?.acceptedAt ?? null,
      },
    });
  }

  static async updateTransition(
    userId: string,
    propertyId: string,
    transitionId: string,
    updates: {
      effectiveAt?: Date | null;
      sellerRetentionDecision?: SaleTransitionRetentionDecision | null;
      sellerRetentionNotes?: string | null;
      buyerPackageId?: string | null;
    },
  ) {
    await requireAccess(userId, propertyId, 'CONTRIBUTOR');
    const transition = await prisma.propertyTransition.findFirst({
      where: { id: transitionId, saleCase: { propertyId } },
    });
    if (!transition) throw new APIError('Transition not found', 404, 'SALE_TRANSITION_NOT_FOUND');
    if (transition.completedAt) {
      throw new APIError('A completed transition cannot be edited.', 409, 'SALE_TRANSITION_ALREADY_COMPLETE');
    }

    const share = updates.buyerPackageId
      ? await this.resolveBuyerPackageShare(propertyId, updates.buyerPackageId)
      : updates.buyerPackageId === null
        ? null
        : undefined;

    return prisma.propertyTransition.update({
      where: { id: transitionId },
      data: {
        ...(updates.effectiveAt !== undefined ? { effectiveAt: updates.effectiveAt } : {}),
        ...(updates.sellerRetentionDecision !== undefined ? { sellerRetentionDecision: updates.sellerRetentionDecision } : {}),
        ...(updates.sellerRetentionNotes !== undefined ? { sellerRetentionNotes: updates.sellerRetentionNotes } : {}),
        ...(updates.buyerPackageId !== undefined ? {
          buyerPackageId: updates.buyerPackageId,
          acceptedAt: share?.acceptedAt ?? null,
        } : {}),
      },
    });
  }

  // Plan §10 exit gate: "verify closing before property transition" +
  // "create verified transition milestones". Nothing here is self-reported —
  // the case must actually be CLOSED, the linked buyer package must have a
  // real recorded acceptance, and a retention decision must be on file
  // before completedAt can be set. Optionally revokes now-unneeded
  // professional/agent Property Brief shares as part of the same action
  // (best-effort per share, still reported individually in revokeResults —
  // Property Brief access is now household-role-scoped rather than
  // creator-scoped, so any CONTRIBUTOR+ on this property can revoke a share
  // a co-owner created; a failure here means the share/brief genuinely
  // doesn't belong to this property, not an ownership mismatch).
  static async completeTransition(
    userId: string,
    propertyId: string,
    transitionId: string,
    options?: { revokeShareIds?: string[] },
  ) {
    await requireAccess(userId, propertyId, 'CONTRIBUTOR');
    const saleCase = await prisma.propertySaleCase.findUnique({ where: { propertyId } });
    if (!saleCase) throw new APIError('Sale case not found', 404, 'SALE_CASE_NOT_FOUND');
    if (saleCase.status !== 'CLOSED') {
      throw new APIError(
        'The sale case must be CLOSED before its transition can be completed.',
        409,
        'SALE_TRANSITION_CASE_NOT_CLOSED',
      );
    }

    const transition = await prisma.propertyTransition.findFirst({
      where: { id: transitionId, saleCaseId: saleCase.id },
    });
    if (!transition) throw new APIError('Transition not found', 404, 'SALE_TRANSITION_NOT_FOUND');
    if (transition.completedAt) return { transition, revokeResults: [] };
    if (!transition.sellerRetentionDecision) {
      throw new APIError('A seller retention decision is required before completing the transition.', 409, 'SALE_TRANSITION_RETENTION_DECISION_MISSING');
    }

    let acceptedAt = transition.acceptedAt;
    if (transition.buyerPackageId) {
      const share = await this.resolveBuyerPackageShare(propertyId, transition.buyerPackageId);
      if (!share.acceptedAt) {
        throw new APIError(
          'The buyer package share has not been accepted yet — the recipient must open it before the transition can be completed.',
          409,
          'SALE_TRANSITION_BUYER_PACKAGE_NOT_ACCEPTED',
        );
      }
      acceptedAt = share.acceptedAt;
    }

    const revokeResults: Array<{ shareId: string; revoked: boolean; error?: string }> = [];
    for (const shareId of options?.revokeShareIds ?? []) {
      try {
        const share = await prisma.propertyBriefShare.findFirst({ where: { id: shareId, propertyId } });
        if (!share) throw new Error('Share not found on this property.');
        await revokePropertyBriefShare({ propertyId, userId, briefId: share.briefId, shareId });
        revokeResults.push({ shareId, revoked: true });
      } catch (error: any) {
        revokeResults.push({ shareId, revoked: false, error: error?.message ?? 'Revoke failed' });
      }
    }

    const updated = await prisma.propertyTransition.update({
      where: { id: transitionId },
      data: { completedAt: new Date(), acceptedAt },
    });
    auditLog('SALE_CASE_STATUS_CHANGED', userId, {
      propertyId, saleCaseId: saleCase.id, transitionId, event: 'TRANSITION_COMPLETED',
    });
    return { transition: updated, revokeResults };
  }
}
