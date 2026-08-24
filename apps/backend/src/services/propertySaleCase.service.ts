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
  SaleReadinessItem,
  SaleReadinessItemStatus,
  SaleReadinessRequirementClass,
  SaleReadinessSourceType,
  SalePrepBudgetRange,
  SaleTransitionRetentionDecision,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { auditLog } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import { listWorkItems } from '../modules/homeOperations/application/listWorkItems.usecase';
import { reconcileSaleReadinessItemDecision, reconcileSaleReadinessItemResolved } from './saleReadinessWorkReconciliation.service';
import { homeRecordsService } from './homeRecords.service';
import { revokePropertyBriefShare } from '../propertyBrief/propertyBrief.service';
import { listPropertyApplianceInventory } from './propertyApplianceInventory.service';
import {
  SALE_PREP_VALUE_CATALOG,
  findSalePrepValueCatalogEntry,
  estimateSalePrepCostAndValueAdd,
  type SalePrepValueCategoryKey,
  type SalePrepPropertySizeContext,
} from '../data/salePrepValueCatalog';

type ProjectedItem = {
  sourceEntityType: SaleReadinessSourceType;
  sourceEntityId: string;
  category: SaleReadinessCategory;
  requirementClass: SaleReadinessRequirementClass;
  title: string;
  detail?: string | null;
  dueAt?: Date | null;
  canonicalWorkItemId?: string | null;
  // "Value-aware checklist" plan (2026-08-07, §10 Stage 1) — real, sourced,
  // property-size-personalized dollar ranges. Only ever populated for the
  // 3 cosmetic Tier 2 projectors (self-report/generic-fallback/upgrade-
  // evidence); every other projector leaves these undefined rather than
  // inventing a number for categories with no sourced cost/ROI data.
  estimatedCostMinCents?: number | null;
  estimatedCostMaxCents?: number | null;
  estimatedValueAddMinCents?: number | null;
  estimatedValueAddMaxCents?: number | null;
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

// Sale Readiness Value-Maximization Checklist plan §4.2 item 1: MINOR/
// MONITOR/INFORMATIONAL findings used to be dropped entirely (or, for MINOR/
// MONITOR, folded into SYSTEMS_MAINTENANCE) — they're exactly the kind of
// cosmetic-adjacent signal relevant to maximizing sale price even though
// they're not blockers, so they now surface under PRESENTATION instead.
async function projectInspectionFindings(propertyId: string): Promise<ProjectedItem[]> {
  const findings = await prisma.inspectionFinding.findMany({
    where: { propertyId, status: 'OPEN' },
    select: { id: true, severity: true, homeSystem: true, subsystem: true, inspectorDescription: true },
  });
  return findings.map((finding) => {
    const isSafety = finding.severity === 'SAFETY';
    const isMajor = finding.severity === 'MAJOR';
    return {
      sourceEntityType: 'INSPECTION_FINDING' as const,
      sourceEntityId: finding.id,
      category: isSafety || isMajor ? 'SAFETY_STRUCTURAL' : 'PRESENTATION',
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

// Sale Readiness Value-Maximization Checklist plan §4.8/§10 Phase 4: a
// SALE_PREP_TASK work item was itself promoted FROM a SaleReadinessItem
// (loadSalePrepActions in homeActionSourcePromotion.service.ts) — surfacing
// it back here would duplicate the very row that spawned it under a second
// sourceEntityType ('HOME_ACTION' vs. the original 'SALE_PREP_SELF_REPORT'/
// 'SALE_PREP_GENERIC').
function isSalePrepTask(item: Awaited<ReturnType<typeof listWorkItems>>[number]): boolean {
  return item.obligationType === 'SALE_PREP_TASK';
}

async function projectHomeActions(propertyId: string): Promise<ProjectedItem[]> {
  const items = await listWorkItems({ propertyId });
  return items
    .filter((item) => !CLOSED_HOME_ACTION_STATES.has(item.state) && item.acceptanceState !== 'DECLINED')
    .filter((item) => !isWeatherAdvisoryOnly(item))
    .filter((item) => !isSalePrepTask(item))
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

// Sale Readiness Value-Maximization Checklist plan §4.2 item 2: flags
// verified InventoryItems nearing or past a typical expected service life.
// Deliberately does not call maintenancePrediction.service.ts — that service
// solves a different problem (recurring maintenance due-dates with
// gamification streak side-effects), not "is this near end of life" (see
// plan §6/Phase 0.3). Lifespan figures below are standard, widely-cited
// industry rules of thumb (the same kind of general knowledge
// maintenancePrediction.service.ts itself leans on for its own age-based
// priority bump), not sourced financial claims — unlike the Tier 2 ROI
// content in §4.3, which does require citation.
const WATER_HEATER_NAME_HINTS = ['water heater', 'hot water', 'tankless'];
const AGING_SYSTEM_EXPECTED_LIFESPAN_YEARS: Partial<Record<string, number>> = {
  HVAC: 18,
  ROOF_EXTERIOR: 22,
  APPLIANCE: 13,
};
const WATER_HEATER_EXPECTED_LIFESPAN_YEARS = 11;
// Flag once an item has used most of its expected life, not only once
// fully "expired" — a buyer's inspector will ask about a 16-year-old HVAC
// unit before it's technically past average, so waiting for 100% would
// surface this too late to act on before listing.
const AGING_SYSTEM_NEAR_END_RATIO = 0.85;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function resolveExpectedLifespanYears(category: string, name: string): number | null {
  const isWaterHeater = (category === 'PLUMBING' || category === 'APPLIANCE')
    && WATER_HEATER_NAME_HINTS.some((hint) => name.toLowerCase().includes(hint));
  if (isWaterHeater) return WATER_HEATER_EXPECTED_LIFESPAN_YEARS;
  return AGING_SYSTEM_EXPECTED_LIFESPAN_YEARS[category] ?? null;
}

interface AgingInventoryItem {
  id: string;
  name: string;
  warrantyId: string | null;
  ageYears: number;
  expectedLifespanYears: number;
  pastExpectedLife: boolean;
}

// Shared by projectAgingSystems and the warranty-suggestion projector below
// — both need the exact same "is this near/past end of life" determination,
// so it's computed once rather than defined twice with a risk of drifting.
async function findAgingInventoryItems(propertyId: string): Promise<AgingInventoryItem[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { propertyId, isVerified: true },
    select: { id: true, name: true, category: true, installedOn: true, purchasedOn: true, warrantyId: true },
  });
  const now = Date.now();
  const results: AgingInventoryItem[] = [];
  for (const item of items) {
    const baseDate = item.installedOn ?? item.purchasedOn;
    if (!baseDate) continue;
    const expectedLifespanYears = resolveExpectedLifespanYears(item.category, item.name);
    if (!expectedLifespanYears) continue;
    const ageYears = (now - baseDate.getTime()) / MS_PER_YEAR;
    if (ageYears < expectedLifespanYears * AGING_SYSTEM_NEAR_END_RATIO) continue;
    results.push({
      id: item.id,
      name: item.name,
      warrantyId: item.warrantyId,
      ageYears,
      expectedLifespanYears,
      pastExpectedLife: ageYears >= expectedLifespanYears,
    });
  }
  return results;
}

function projectAgingSystems(agingItems: AgingInventoryItem[]): ProjectedItem[] {
  return agingItems.map((item) => ({
    sourceEntityType: 'INVENTORY_ITEM' as const,
    sourceEntityId: item.id,
    category: 'SYSTEMS_MAINTENANCE' as const,
    requirementClass: item.pastExpectedLife ? 'VERIFICATION_NEEDED' as const : 'OPTIONAL_IMPROVEMENT' as const,
    title: `${item.name}: ${item.pastExpectedLife ? 'past' : 'nearing'} typical replacement age`,
    detail: `About ${item.ageYears.toFixed(0)} years old — typical expected life for this type is around ${item.expectedLifespanYears} years. Buyers and inspectors often ask about aging systems like this before closing.`,
  }));
}

// Sale Readiness Value-Maximization Checklist plan §11 proposed enhancement,
// now built: a homeowner-entered install/purchase year fed projectAgingSystems
// above, but nothing ever acted on the *inverse* signal — an aging item with
// no warranty on file. Positive-signal framing (a real action still
// available, not a defect), same pattern as projectTransferableWarranties.
// Reuses findAgingInventoryItems's exact aging determination rather than a
// separate "aging" definition, and deliberately covers every aging category
// findAgingInventoryItems already tracks (HVAC/roof/appliance/water heater),
// not appliances only — the warranty-add flow itself isn't appliance-
// specific, and an aging roof or HVAC system with no coverage is at least as
// relevant to a buyer as an aging appliance. sourceEntityId is prefixed
// (`warranty-suggestion:`) to stay distinct from the same InventoryItem's
// own aging-system row above — same convention projectConfirmedUpgrades
// already uses for its `highlight:` prefix.
function projectWarrantySuggestions(agingItems: AgingInventoryItem[]): ProjectedItem[] {
  return agingItems
    .filter((item) => !item.warrantyId)
    .map((item) => ({
      sourceEntityType: 'INVENTORY_ITEM' as const,
      sourceEntityId: `warranty-suggestion:${item.id}`,
      category: 'PRESENTATION' as const,
      requirementClass: 'OPTIONAL_IMPROVEMENT' as const,
      title: `${item.name}: consider adding a warranty before listing`,
      detail: `About ${item.ageYears.toFixed(0)} years old with no warranty on file. A transferable home warranty can reassure buyers about an aging system like this and is worth highlighting if you add one before listing.`,
    }));
}

// Sale Readiness Value-Maximization Checklist plan §4.2 item 3: deferred
// homeowner-tracked maintenance, overdue by a meaningful margin (not merely
// due today/yesterday). A lapsed task may already also surface via
// projectHomeActions (PropertyMaintenanceTask records sync to a real
// OperationalWorkItem) — some overlap with that projector is possible and
// accepted, the same way this codebase already tolerates comparable overlap
// elsewhere (e.g. a project and its originating inspection finding).
const LAPSED_MAINTENANCE_GRACE_DAYS = 60;
const LAPSED_MAINTENANCE_OPEN_STATUSES = new Set(['PENDING', 'IN_PROGRESS', 'NEEDS_REVIEW']);

async function projectLapsedMaintenance(propertyId: string): Promise<ProjectedItem[]> {
  const graceBoundary = new Date(Date.now() - LAPSED_MAINTENANCE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const tasks = await prisma.propertyMaintenanceTask.findMany({
    where: {
      propertyId,
      status: { in: Array.from(LAPSED_MAINTENANCE_OPEN_STATUSES) as any },
      nextDueDate: { lt: graceBoundary },
    },
    select: { id: true, title: true, nextDueDate: true },
  });
  return tasks.map((task) => ({
    sourceEntityType: 'MAINTENANCE_TASK' as const,
    sourceEntityId: task.id,
    category: 'SYSTEMS_MAINTENANCE' as const,
    requirementClass: 'OPTIONAL_IMPROVEMENT' as const,
    title: `${task.title}: overdue maintenance`,
    detail: task.nextDueDate
      ? `Was due ${task.nextDueDate.toISOString().slice(0, 10)} — catching up before listing avoids a buyer's inspection flagging it.`
      : null,
    dueAt: task.nextDueDate,
  }));
}

// Sale Readiness Value-Maximization Checklist plan §4.2 item 4: positive-
// signal framing, not a gap — an active warranty transferring to a buyer is
// a real selling point worth highlighting, distinct from every other
// projector in this file, which surfaces something to fix or verify.
const WARRANTY_MIN_REMAINING_DAYS = 30;

async function projectTransferableWarranties(propertyId: string): Promise<ProjectedItem[]> {
  const minRemainingBoundary = new Date(Date.now() + WARRANTY_MIN_REMAINING_DAYS * 24 * 60 * 60 * 1000);
  const warranties = await prisma.warranty.findMany({
    where: { propertyId, expiryDate: { gte: minRemainingBoundary } },
    select: { id: true, providerName: true, category: true, expiryDate: true },
  });
  return warranties.map((warranty) => ({
    sourceEntityType: 'WARRANTY' as const,
    sourceEntityId: warranty.id,
    category: 'PRESENTATION' as const,
    requirementClass: 'OPTIONAL_IMPROVEMENT' as const,
    title: `${warranty.providerName} ${warranty.category.toLowerCase().replace(/_/g, ' ')} warranty: transferable to buyer`,
    detail: `Active through ${warranty.expiryDate.toISOString().slice(0, 10)} — worth highlighting in your listing and agent package.`,
  }));
}

// Sale Readiness Value-Maximization Checklist plan §4.4a: for the structural
// systems a buyer's inspection most commonly focuses on, check whether a
// homeowner-logged maintenance task or completed project still contains a
// real, substantive assessment before concluding there's genuinely no data.
// "Sufficient detail" means a real notes/description field, not a bare
// status flag — the same weak-proxy rule §3.6 already applies elsewhere.
// Only runs for keywords not already covered by findings/permits/home
// actions (computed by the caller) — never duplicates or overrides a real
// Tier 1 signal that already exists.
const STRUCTURAL_SYSTEM_KEYWORDS: Record<string, SaleReadinessCategory> = {
  roof: 'SAFETY_STRUCTURAL',
  foundation: 'SAFETY_STRUCTURAL',
  electrical: 'SAFETY_STRUCTURAL',
  plumbing: 'SAFETY_STRUCTURAL',
};
const STRUCTURAL_EVIDENCE_MIN_DETAIL_LENGTH = 40;

function keywordsCoveredBy(items: ProjectedItem[], keywords: string[]): Set<string> {
  const covered = new Set<string>();
  const haystack = items.map((item) => `${item.title} ${item.detail ?? ''}`.toLowerCase());
  for (const keyword of keywords) {
    if (haystack.some((text) => text.includes(keyword))) covered.add(keyword);
  }
  return covered;
}

// Same idea as keywordsCoveredBy, but returns the catalog CATEGORY keys
// (e.g. 'curbAppeal') rather than the raw matched keyword strings (e.g.
// 'curb appeal') — the two differ for several categories, so this can't
// reuse keywordsCoveredBy's return value directly.
function coveredSalePrepCategories(items: ProjectedItem[]): Set<SalePrepValueCategoryKey> {
  const haystack = items.map((item) => `${item.title} ${item.detail ?? ''}`.toLowerCase());
  const covered = new Set<SalePrepValueCategoryKey>();
  for (const entry of SALE_PREP_VALUE_CATALOG) {
    if (haystack.some((text) => text.includes(entry.keyword))) covered.add(entry.category);
  }
  return covered;
}

async function projectStructuralSystemEvidence(
  propertyId: string,
  alreadyCoveredKeywords: Set<string>,
): Promise<ProjectedItem[]> {
  const remainingKeywords = Object.keys(STRUCTURAL_SYSTEM_KEYWORDS).filter((k) => !alreadyCoveredKeywords.has(k));
  if (remainingKeywords.length === 0) return [];

  const [tasks, projects] = await Promise.all([
    prisma.propertyMaintenanceTask.findMany({
      where: { propertyId, status: 'COMPLETED' },
      select: { id: true, title: true, description: true, category: true },
    }),
    prisma.projectRecord.findMany({
      where: { propertyId, status: 'COMPLETED' },
      select: { id: true, name: true, description: true },
    }),
  ]);

  const results: ProjectedItem[] = [];
  for (const keyword of remainingKeywords) {
    const task = tasks.find((t) =>
      (t.description?.length ?? 0) >= STRUCTURAL_EVIDENCE_MIN_DETAIL_LENGTH
      && `${t.title} ${t.category ?? ''}`.toLowerCase().includes(keyword));
    if (task) {
      results.push({
        sourceEntityType: 'MAINTENANCE_TASK' as const,
        sourceEntityId: task.id,
        category: STRUCTURAL_SYSTEM_KEYWORDS[keyword],
        requirementClass: 'VERIFICATION_NEEDED' as const,
        title: `${task.title}: reviewed via maintenance record`,
        detail: truncate(task.description ?? '', 500),
      });
      continue;
    }
    const project = projects.find((p) =>
      (p.description?.length ?? 0) >= STRUCTURAL_EVIDENCE_MIN_DETAIL_LENGTH
      && p.name.toLowerCase().includes(keyword));
    if (project) {
      results.push({
        sourceEntityType: 'PROJECT' as const,
        sourceEntityId: project.id,
        category: STRUCTURAL_SYSTEM_KEYWORDS[keyword],
        requirementClass: 'VERIFICATION_NEEDED' as const,
        title: `${project.name}: reviewed via completed project record`,
        detail: truncate(project.description ?? '', 500),
      });
    }
  }
  return results;
}

// Sale Readiness Value-Maximization Checklist plan §4.3/§4.4/§10 Phase 3:
// the Tier 2 gating cascade for the 6 curated cosmetic categories (§4.5).
// Evaluated in priority order by syncReadinessItems: (1) a Tier 1 item
// already covers the category → nothing more to do; (2) a completed
// project/finalized material spec exists (this function) → a "confirm
// current state" item, framed distinctly from a flat claim since a 2019
// record doesn't guarantee 2026 condition (§3.6); (3) the homeowner has
// answered the corresponding question → a personalized item, or nothing if
// they reported it's already in good shape; (4) nothing at all → the
// generic labeled catalog fallback (projectGenericFallbacks).

// Paint/curb-appeal/staging have no comparable record type — §4.4's table
// lists "prior answer only" for those, so only kitchen/bathroom/flooring
// are checked here.
const COSMETIC_UPGRADE_EVIDENCE_CATEGORIES: SalePrepValueCategoryKey[] = ['kitchen', 'bathroom', 'flooring'];
const COSMETIC_EVIDENCE_MIN_DETAIL_LENGTH = 20;

async function projectCosmeticUpgradeEvidence(
  propertyId: string,
  alreadyCoveredCategories: Set<SalePrepValueCategoryKey>,
  sizeContext: SalePrepPropertySizeContext,
): Promise<{ items: ProjectedItem[]; coveredCategories: Set<SalePrepValueCategoryKey> }> {
  const remaining = COSMETIC_UPGRADE_EVIDENCE_CATEGORIES.filter((c) => !alreadyCoveredCategories.has(c));
  if (remaining.length === 0) return { items: [], coveredCategories: new Set() };

  const [projects, materialSpecs] = await Promise.all([
    prisma.projectRecord.findMany({
      where: { propertyId, status: 'COMPLETED' },
      select: { id: true, name: true, description: true },
    }),
    prisma.materialSpec.findMany({
      where: { propertyId, isActive: true, lifecycleStatus: 'AS_BUILT' },
      select: { id: true, label: true, category: true },
    }),
  ]);

  const items: ProjectedItem[] = [];
  const coveredCategories = new Set<SalePrepValueCategoryKey>();
  for (const categoryKey of remaining) {
    const entry = findSalePrepValueCatalogEntry(categoryKey);
    const estimate = estimateSalePrepCostAndValueAdd(categoryKey, sizeContext);
    const project = projects.find((p) =>
      (p.description?.length ?? 0) >= COSMETIC_EVIDENCE_MIN_DETAIL_LENGTH
      && p.name.toLowerCase().includes(entry.keyword));
    if (project) {
      items.push({
        sourceEntityType: 'PROJECT' as const,
        sourceEntityId: project.id,
        category: 'PRESENTATION' as const,
        requirementClass: 'OPTIONAL_IMPROVEMENT' as const,
        title: `${project.name}: confirm current condition`,
        detail: `A completed project on file — still holding up well, or worth a touch-up before listing? ${truncate(project.description ?? '', 300)}`,
        estimatedCostMinCents: estimate.costRangeCents?.minCents ?? null,
        estimatedCostMaxCents: estimate.costRangeCents?.maxCents ?? null,
        estimatedValueAddMinCents: estimate.valueAddRangeCents?.minCents ?? null,
        estimatedValueAddMaxCents: estimate.valueAddRangeCents?.maxCents ?? null,
      });
      coveredCategories.add(categoryKey);
      continue;
    }
    const spec = materialSpecs.find((m) =>
      m.label.toLowerCase().includes(entry.keyword) || String(m.category ?? '').toLowerCase().includes(entry.keyword));
    if (spec) {
      items.push({
        sourceEntityType: 'MATERIAL_SPEC' as const,
        sourceEntityId: spec.id,
        category: 'PRESENTATION' as const,
        requirementClass: 'OPTIONAL_IMPROVEMENT' as const,
        title: `${spec.label}: confirm current condition`,
        detail: 'On file as an as-built material — still holding up well, or worth a touch-up before listing?',
        estimatedCostMinCents: estimate.costRangeCents?.minCents ?? null,
        estimatedCostMaxCents: estimate.costRangeCents?.maxCents ?? null,
        estimatedValueAddMinCents: estimate.valueAddRangeCents?.minCents ?? null,
        estimatedValueAddMaxCents: estimate.valueAddRangeCents?.maxCents ?? null,
      });
      coveredCategories.add(categoryKey);
    }
  }
  return { items, coveredCategories };
}

const SELF_REPORT_CONDITION_LABELS: Record<string, string> = {
  FRESH: 'Fresh', SOME_WEAR: 'Some wear', NEEDS_REFRESH: 'Needs a refresh',
  RECENTLY_UPDATED: 'Recently updated', DATED_BUT_FUNCTIONAL: 'Dated but functional', NEEDS_WORK: 'Needs work',
  READY_TO_SHOW: 'Ready to show', NEEDS_SOME_WORK: 'Needs some work', NEEDS_SIGNIFICANT_WORK: 'Needs significant work',
};
// Only the "worth acting on" answers produce a checklist item — a
// homeowner reporting their kitchen is already "Recently updated" isn't a
// task, it's a satisfied category with nothing to show.
const SELF_REPORT_NEEDS_ATTENTION = new Set(['NEEDS_REFRESH', 'NEEDS_WORK', 'NEEDS_SOME_WORK', 'NEEDS_SIGNIFICANT_WORK']);
const SELF_REPORT_FIELD_TITLES: Record<SalePrepValueCategoryKey, string> = {
  paint: 'Interior paint', curbAppeal: 'Curb appeal & landscaping', flooring: 'Flooring',
  kitchen: 'Kitchen', bathroom: 'Bathrooms', staging: 'Decluttering & staging',
};

// Sale Readiness Value-Maximization Checklist plan §11 proposed enhancement,
// now built: the "needs attention" value only ever decided *whether* an
// item appeared — the rendered detail was identical catalog copy no matter
// which value was picked. Of the 6 self-report fields, only
// `stagingReadiness` actually has two distinct "needs attention" values
// today (NEEDS_SOME_WORK vs NEEDS_SIGNIFICANT_WORK) — every other field's
// milder "some wear"-equivalent value doesn't produce an item at all (see
// SELF_REPORT_NEEDS_ATTENTION above), so it has nothing to differentiate
// yet. Framed by a generic severity tier rather than one string per exact
// enum value, so this is already correct for staging today and needs no
// further change if any other field gains a second "needs attention" value
// later. Deliberately text-only — it does NOT scale the cost/value-add
// estimate by severity, since the sourced catalog data isn't stratified by
// self-reported severity and this app doesn't invent unsourced numbers.
type SelfReportSeverityTier = 'MODERATE' | 'SIGNIFICANT';
const SELF_REPORT_SEVERITY_TIER: Record<string, SelfReportSeverityTier> = {
  NEEDS_REFRESH: 'MODERATE',
  NEEDS_WORK: 'MODERATE',
  NEEDS_SOME_WORK: 'MODERATE',
  NEEDS_SIGNIFICANT_WORK: 'SIGNIFICANT',
};
function selfReportSeverityFraming(tier: SelfReportSeverityTier): string {
  return tier === 'SIGNIFICANT'
    ? "You reported this needs significant work — worth tackling before listing photos and showings, since it's likely to stand out to buyers."
    : 'You reported this needs some attention — even a lighter touch-up before listing can help first impressions.';
}

// Returns both the rendered items AND every category the homeowner has
// answered at all (regardless of value) — a category reported as already
// in good shape produces no item, but must still suppress the generic
// fallback below, since it genuinely isn't unanswered.
async function projectSelfReportedConditions(
  propertyId: string,
  alreadyCoveredCategories: Set<SalePrepValueCategoryKey>,
  sizeContext: SalePrepPropertySizeContext,
): Promise<{ items: ProjectedItem[]; answeredCategories: Set<SalePrepValueCategoryKey> }> {
  const profile = await prisma.propertySalePrepProfile.findUnique({ where: { propertyId } });
  if (!profile) return { items: [], answeredCategories: new Set() };

  const answered: Array<{ category: SalePrepValueCategoryKey; value: string | null }> = [
    { category: 'paint', value: profile.paintCondition },
    { category: 'curbAppeal', value: profile.curbAppealCondition },
    { category: 'flooring', value: profile.flooringCondition },
    { category: 'kitchen', value: profile.kitchenStatus },
    { category: 'bathroom', value: profile.bathroomStatus },
    { category: 'staging', value: profile.stagingReadiness },
  ];

  const items: ProjectedItem[] = [];
  const answeredCategories = new Set<SalePrepValueCategoryKey>();
  for (const { category, value } of answered) {
    if (!value) continue;
    answeredCategories.add(category);
    if (alreadyCoveredCategories.has(category) || !SELF_REPORT_NEEDS_ATTENTION.has(value)) continue;
    const entry = findSalePrepValueCatalogEntry(category);
    const estimate = estimateSalePrepCostAndValueAdd(category, sizeContext);
    const severityTier = SELF_REPORT_SEVERITY_TIER[value] ?? 'MODERATE';
    items.push({
      sourceEntityType: 'SALE_PREP_SELF_REPORT' as const,
      sourceEntityId: category,
      category: 'PRESENTATION' as const,
      requirementClass: 'OPTIONAL_IMPROVEMENT' as const,
      title: `${SELF_REPORT_FIELD_TITLES[category]}: ${SELF_REPORT_CONDITION_LABELS[value] ?? value}`,
      detail: `${selfReportSeverityFraming(severityTier)} ${entry.detail} (${entry.source})`,
      estimatedCostMinCents: estimate.costRangeCents?.minCents ?? null,
      estimatedCostMaxCents: estimate.costRangeCents?.maxCents ?? null,
      estimatedValueAddMinCents: estimate.valueAddRangeCents?.minCents ?? null,
      estimatedValueAddMaxCents: estimate.valueAddRangeCents?.maxCents ?? null,
    });
  }
  return { items, answeredCategories };
}

// The last-resort fallback: nothing derived, nothing self-reported. Clearly
// labeled as unverified — never presented as if the system knows this
// property's actual condition (§3.6, §4.1).
function projectGenericFallbacks(
  alreadyCoveredCategories: Set<SalePrepValueCategoryKey>,
  sizeContext: SalePrepPropertySizeContext,
): ProjectedItem[] {
  return SALE_PREP_VALUE_CATALOG
    .filter((entry) => !alreadyCoveredCategories.has(entry.category))
    .map((entry) => {
      const estimate = estimateSalePrepCostAndValueAdd(entry.category, sizeContext);
      return {
        sourceEntityType: 'SALE_PREP_GENERIC' as const,
        sourceEntityId: entry.category,
        category: 'PRESENTATION' as const,
        requirementClass: 'OPTIONAL_IMPROVEMENT' as const,
        title: entry.title,
        detail: `${entry.detail} (${entry.source}) — general guidance, not verified against your records.`,
        estimatedCostMinCents: estimate.costRangeCents?.minCents ?? null,
        estimatedCostMaxCents: estimate.costRangeCents?.maxCents ?? null,
        estimatedValueAddMinCents: estimate.valueAddRangeCents?.minCents ?? null,
        estimatedValueAddMaxCents: estimate.valueAddRangeCents?.maxCents ?? null,
      };
    });
}

// Plan §4.7/§10: the homeowner's stated pre-sale budget was captured but
// never actually read anywhere — found via direct product feedback. Applied
// only to self-reported/generic-fallback items (both keyed directly by
// SalePrepValueCategoryKey via sourceEntityId) — not the evidence-backed
// "confirm current condition" items, which aren't a "should I spend money
// on this" prompt the same way; they're a record already on file.
const BUDGET_RANK: Record<SalePrepBudgetRange, number> = {
  UNDER_5K: 0,
  FIVE_TO_15K: 1,
  FIFTEEN_TO_30K: 2,
  OVER_30K: 3,
};

function applyBudgetContext(items: ProjectedItem[], budgetRange: SalePrepBudgetRange | null): ProjectedItem[] {
  if (!budgetRange) return items;
  const budgetRank = BUDGET_RANK[budgetRange];
  return items.map((item) => {
    const categoryKey = item.sourceEntityId as SalePrepValueCategoryKey;
    const entry = SALE_PREP_VALUE_CATALOG.find((candidate) => candidate.category === categoryKey);
    if (!entry || BUDGET_RANK[entry.costBucket] <= budgetRank) return item;
    return {
      ...item,
      detail: `${item.detail ?? ''} This project type typically costs more than your stated pre-sale budget — you may want to deprioritize it or plan for a smaller-scope version.`.trim(),
    };
  });
}

// Value-aware checklist plan (2026-08-07, §12 Stage 3): the "top N within
// budget" recommendation. Uses each stated budget's upper bound as a
// generous ceiling (e.g. "$5k-15k" → up to $15,000) — OVER_30K has no real
// ceiling, so it's unbounded (the item-count cap below still limits it).
const BUDGET_CEILING_CENTS: Record<SalePrepBudgetRange, number> = {
  UNDER_5K: 500_000,
  FIVE_TO_15K: 1_500_000,
  FIFTEEN_TO_30K: 3_000_000,
  OVER_30K: Number.POSITIVE_INFINITY,
};
const BUDGET_RECOMMENDATION_MAX_ITEMS = 4;

// Computed fresh on every read (getCase), never persisted — matches this
// service's existing pattern for other derived state (e.g.
// readyForChecklist). Only ranks OPEN items with both cost AND value-add
// data on file (the cosmetic categories from Stage 1) — non-cosmetic items
// never compete in this ranking (§4.1: unsafe to generalize a dollar value
// for those), and items already WAIVED/PURSUING/RESOLVED don't need to be
// recommended again. Greedy value-add-per-dollar selection, not an optimal
// knapsack solve — transparent and good enough for "which few things
// should I prioritize," not a promise of the mathematically best subset.
function computeBudgetRecommendation(
  items: Array<Pick<SaleReadinessItem, 'id' | 'status' | 'estimatedCostMinCents' | 'estimatedCostMaxCents' | 'estimatedValueAddMinCents' | 'estimatedValueAddMaxCents'>>,
  budgetRange: SalePrepBudgetRange | null,
): Set<string> {
  if (!budgetRange) return new Set();
  const ceilingCents = BUDGET_CEILING_CENTS[budgetRange];

  const candidates = items
    .filter((item) =>
      item.status === 'OPEN'
      && item.estimatedCostMinCents != null && item.estimatedCostMaxCents != null
      && item.estimatedValueAddMinCents != null && item.estimatedValueAddMaxCents != null)
    .map((item) => {
      const costMidCents = (item.estimatedCostMinCents! + item.estimatedCostMaxCents!) / 2;
      const valueAddMidCents = (item.estimatedValueAddMinCents! + item.estimatedValueAddMaxCents!) / 2;
      return { id: item.id, costMidCents, roiPerDollar: costMidCents > 0 ? valueAddMidCents / costMidCents : 0 };
    })
    .sort((a, b) => b.roiPerDollar - a.roiPerDollar);

  const recommended = new Set<string>();
  let cumulativeCostCents = 0;
  for (const candidate of candidates) {
    if (recommended.size >= BUDGET_RECOMMENDATION_MAX_ITEMS) break;
    // Skip (don't stop) an item that doesn't fit — a cheaper, still-good
    // item later in ROI order may still fit the remaining budget.
    if (cumulativeCostCents + candidate.costMidCents > ceilingCents) continue;
    recommended.add(candidate.id);
    cumulativeCostCents += candidate.costMidCents;
  }
  return recommended;
}

// Sale Readiness Value-Maximization Checklist plan §4.5 question 8: once a
// homeowner confirms a candidate upgrade, it becomes a real, positive-signal
// item (same framing as projectTransferableWarranties) worth highlighting
// to a buyer, not a gap to fix.
async function projectConfirmedUpgrades(propertyId: string): Promise<ProjectedItem[]> {
  const profile = await prisma.propertySalePrepProfile.findUnique({
    where: { propertyId },
    select: { confirmedUpgradeKeys: true },
  });
  if (!profile || profile.confirmedUpgradeKeys.length === 0) return [];

  const results: ProjectedItem[] = [];
  for (const key of profile.confirmedUpgradeKeys) {
    const [sourceType, sourceId] = key.split(':');
    if (!sourceType || !sourceId) continue;
    if (sourceType === 'PROJECT') {
      const project = await prisma.projectRecord.findFirst({ where: { id: sourceId, propertyId }, select: { id: true, name: true } });
      if (project) {
        results.push({
          sourceEntityType: 'PROJECT' as const,
          sourceEntityId: `highlight:${project.id}`,
          category: 'PRESENTATION' as const,
          requirementClass: 'OPTIONAL_IMPROVEMENT' as const,
          title: `${project.name}: confirmed as a listing highlight`,
          detail: 'Worth featuring in your listing and agent package.',
        });
      }
    } else if (sourceType === 'MATERIAL_SPEC') {
      const spec = await prisma.materialSpec.findFirst({ where: { id: sourceId, propertyId }, select: { id: true, label: true } });
      if (spec) {
        results.push({
          sourceEntityType: 'MATERIAL_SPEC' as const,
          sourceEntityId: `highlight:${spec.id}`,
          category: 'PRESENTATION' as const,
          requirementClass: 'OPTIONAL_IMPROVEMENT' as const,
          title: `${spec.label}: confirmed as a listing highlight`,
          detail: 'Worth featuring in your listing and agent package.',
        });
      }
    } else if (sourceType === 'TIMELINE_EVENT') {
      const event = await prisma.homeEvent.findFirst({ where: { id: sourceId, propertyId }, select: { id: true, title: true } });
      if (event) {
        results.push({
          sourceEntityType: 'TIMELINE_EVENT' as const,
          sourceEntityId: `highlight:${event.id}`,
          category: 'PRESENTATION' as const,
          requirementClass: 'OPTIONAL_IMPROVEMENT' as const,
          title: `${event.title}: confirmed as a listing highlight`,
          detail: 'Worth featuring in your listing and agent package.',
        });
      }
    }
  }
  return results;
}

// Sale Readiness Value-Maximization Checklist plan §4.4b/§10 Phase 3: the
// Seller Prep entry-flow gate, evaluated separately from readiness items
// (this isn't a checklist item — it decides whether the checklist can even
// be built meaningfully yet). Split by data shape, not a count threshold —
// the 4 scalar Property fields are always inline-collectible regardless of
// how many are missing.
//
// Reworked per direct product feedback (2026-08-06): the original design
// gated on "at least one InventoryItem, any type" and treated a missing
// warranty as an equal, checklist-blocking gap — both resolved by routing
// the homeowner away to a separate page. Two problems: (1) "any one item"
// isn't a meaningful bar — a home with only a garden hose logged would
// pass; (2) a warranty is a nice-to-have for the sale-prep checklist, not
// something every home has or needs to produce a checklist. Reworked to:
// require each of a small, fixed set of appliances every home actually
// has (matching `propertyApplianceInventory.service.ts`'s existing
// canonical appliance-type taxonomy, reused rather than inventing a new
// one) with a captured install/purchase year, captured inline on Seller
// Prep itself — no more routing away. Warranty coverage is still reported
// but no longer gates `readyForChecklist`; it's optional context, not a
// mandatory fact.
export type MandatoryScalarField = 'roofReplacementYear' | 'hvacInstallYear' | 'waterHeaterInstallYear' | 'electricalPanelAge';

// Subset of propertyApplianceInventory.service.ts's canonical appliance
// types — every home has these; MICROWAVE_HOOD/WATER_SOFTENER are real
// canonical types too but not universal, so they stay out of the
// mandatory set.
export type MandatoryApplianceType = 'REFRIGERATOR' | 'DISHWASHER' | 'OVEN_RANGE' | 'WASHER_DRYER';
export const MANDATORY_APPLIANCE_TYPES: MandatoryApplianceType[] = ['REFRIGERATOR', 'DISHWASHER', 'OVEN_RANGE', 'WASHER_DRYER'];

export interface MandatoryFactCoverage {
  scalarMissing: MandatoryScalarField[];
  applianceMissing: MandatoryApplianceType[];
  warrantyMissing: boolean;
  readyForChecklist: boolean;
}

async function checkMandatoryFactCoverage(propertyId: string): Promise<MandatoryFactCoverage> {
  const [property, majorAppliances, warranty] = await Promise.all([
    prisma.property.findUnique({
      where: { id: propertyId },
      select: { roofReplacementYear: true, hvacInstallYear: true, waterHeaterInstallYear: true, electricalPanelAge: true },
    }),
    listPropertyApplianceInventory(propertyId),
    prisma.warranty.findFirst({ where: { propertyId }, select: { id: true } }),
  ]);

  const scalarMissing: MandatoryScalarField[] = [];
  if (!property?.roofReplacementYear) scalarMissing.push('roofReplacementYear');
  if (!property?.hvacInstallYear) scalarMissing.push('hvacInstallYear');
  if (!property?.waterHeaterInstallYear) scalarMissing.push('waterHeaterInstallYear');
  if (!property?.electricalPanelAge) scalarMissing.push('electricalPanelAge');

  // A type only counts as "captured" once it has a real install/purchase
  // year on file — matches the old bar's rigor (name alone wasn't
  // enough), just against the appliance-specific model instead of a
  // generic InventoryItem's condition+date fields.
  const capturedTypes = new Set(
    majorAppliances.filter((appliance) => appliance.installationYear != null).map((appliance) => appliance.assetType),
  );
  const applianceMissing = MANDATORY_APPLIANCE_TYPES.filter((type) => !capturedTypes.has(type));

  const warrantyMissing = !warranty;

  return {
    scalarMissing,
    applianceMissing,
    warrantyMissing,
    readyForChecklist: scalarMissing.length === 0 && applianceMissing.length === 0,
  };
}

/**
 * Home Intelligence FRD §15 Phase 2 work item 4 — a property-scoped
 * recompute handler has no userId (background trigger, not a per-request
 * read), so it can't call getCase's requireAccess-gated path. PropertySaleCase
 * .propertyId is a unique key — a property has zero or one sale case, never
 * multiple — so "no case" or a closed/cancelled one is a real, expected
 * no-op, not an error. 'OWNER' is used as the sync role deliberately: it is
 * the strict superset view (projectRecords' visibleWhere only restricts for
 * non-OWNER roles), the objectively correct choice for a full background
 * refresh rather than an arbitrary guess.
 */
export async function refreshSaleReadinessForRecompute(propertyId: string): Promise<void> {
  const saleCase = await prisma.propertySaleCase.findUnique({
    where: { propertyId },
    select: { id: true, status: true },
  });
  if (!saleCase || saleCase.status === 'CLOSED' || saleCase.status === 'CANCELLED') return;
  await syncReadinessItems(saleCase.id, propertyId, 'OWNER');
}

async function syncReadinessItems(saleCaseId: string, propertyId: string, role: HouseholdRole): Promise<void> {
  const [findings, projects, permits, homeActions, records, materialSpecs, timelineEvents, agingInventoryItems, lapsedMaintenance, transferableWarranties, sizeContextProperty] = await Promise.all([
    projectInspectionFindings(propertyId),
    projectProjects(propertyId),
    projectPermits(propertyId),
    projectHomeActions(propertyId),
    projectRecords(propertyId, role),
    projectMaterialSpecs(propertyId),
    projectTimelineEvents(propertyId),
    findAgingInventoryItems(propertyId),
    projectLapsedMaintenance(propertyId),
    projectTransferableWarranties(propertyId),
    // Value-aware checklist plan (2026-08-07, §10 Stage 1): the property
    // attributes the Tier 2 cosmetic projectors use to personalize cost/
    // value-add estimates by actual home size, not a flat national figure.
    prisma.property.findUnique({ where: { id: propertyId }, select: { propertySize: true, bedrooms: true, bathrooms: true } }),
  ]);
  const agingSystems = projectAgingSystems(agingInventoryItems);
  const warrantySuggestions = projectWarrantySuggestions(agingInventoryItems);
  const sizeContext: SalePrepPropertySizeContext = {
    propertySizeSqFt: sizeContextProperty?.propertySize ?? null,
    bedrooms: sizeContextProperty?.bedrooms ?? null,
    bathrooms: sizeContextProperty?.bathrooms ?? null,
  };
  // Structural evidence search (§4.4a) runs after the above so it can skip
  // any structural system already covered by a real finding/permit/home
  // action — never duplicates or overrides an existing Tier 1 signal.
  const structuralEvidence = await projectStructuralSystemEvidence(
    propertyId,
    keywordsCoveredBy([...findings, ...permits, ...homeActions], Object.keys(STRUCTURAL_SYSTEM_KEYWORDS)),
  );

  // Tier 2 gating cascade (§4.3/§4.4) for the 6 cosmetic categories — each
  // stage only fills in categories the previous stage didn't already cover.
  const tier1CoveredCategories = coveredSalePrepCategories([...findings, ...homeActions, ...materialSpecs]);
  const { items: upgradeEvidenceItems, coveredCategories: upgradeCoveredCategories } =
    await projectCosmeticUpgradeEvidence(propertyId, tier1CoveredCategories, sizeContext);
  const evidenceCoveredCategories = new Set([...tier1CoveredCategories, ...upgradeCoveredCategories]);
  const { items: selfReportedItems, answeredCategories } = await projectSelfReportedConditions(propertyId, evidenceCoveredCategories, sizeContext);
  const fullyCoveredCategories = new Set([...evidenceCoveredCategories, ...answeredCategories]);
  const genericFallbacks = projectGenericFallbacks(fullyCoveredCategories, sizeContext);
  const confirmedUpgrades = await projectConfirmedUpgrades(propertyId);

  const saleCaseForBudget = await prisma.propertySaleCase.findUnique({ where: { id: saleCaseId }, select: { budgetRange: true } });
  const budgetedSelfReportedItems = applyBudgetContext(selfReportedItems, saleCaseForBudget?.budgetRange ?? null);
  const budgetedGenericFallbacks = applyBudgetContext(genericFallbacks, saleCaseForBudget?.budgetRange ?? null);

  const projected = [
    ...findings, ...projects, ...permits, ...homeActions, ...records, ...materialSpecs, ...timelineEvents,
    ...agingSystems, ...warrantySuggestions, ...lapsedMaintenance, ...transferableWarranties, ...structuralEvidence,
    ...upgradeEvidenceItems, ...budgetedSelfReportedItems, ...budgetedGenericFallbacks, ...confirmedUpgrades,
  ];
  const projectedKeys = new Set(projected.map((p) => `${p.sourceEntityType}:${p.sourceEntityId}`));

  const existing = await prisma.saleReadinessItem.findMany({ where: { saleCaseId } });
  const existingByKey = new Map(existing.map((item) => [`${item.sourceEntityType}:${item.sourceEntityId}`, item]));

  const itemsToResolve = existing.filter(
    (item) => !projectedKeys.has(`${item.sourceEntityType}:${item.sourceEntityId}`) && item.status === 'OPEN',
  );
  await prisma.$transaction([
    ...projected.map((item) => {
      const key = `${item.sourceEntityType}:${item.sourceEntityId}`;
      const current = existingByKey.get(key);
      // A WAIVED item stays waived even while its source condition
      // persists — that's the point of a waive (explicit disclose-and-
      // accept decision). PURSUING is the same kind of durable homeowner
      // decision (§12 Stage 3) — a homeowner who's committed to an item
      // shouldn't have that silently reset just because the checklist
      // re-synced. Only RESOLVED items get revived to OPEN.
      const status: SaleReadinessItemStatus =
        current?.status === 'WAIVED' ? 'WAIVED'
        : current?.status === 'PURSUING' ? 'PURSUING'
        : 'OPEN';
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
          estimatedCostMinCents: item.estimatedCostMinCents ?? null,
          estimatedCostMaxCents: item.estimatedCostMaxCents ?? null,
          estimatedValueAddMinCents: item.estimatedValueAddMinCents ?? null,
          estimatedValueAddMaxCents: item.estimatedValueAddMaxCents ?? null,
          status,
        },
        update: {
          category: item.category,
          requirementClass: item.requirementClass,
          title: item.title,
          detail: item.detail ?? null,
          dueAt: item.dueAt ?? null,
          canonicalWorkItemId: item.canonicalWorkItemId ?? null,
          estimatedCostMinCents: item.estimatedCostMinCents ?? null,
          estimatedCostMaxCents: item.estimatedCostMaxCents ?? null,
          estimatedValueAddMinCents: item.estimatedValueAddMinCents ?? null,
          estimatedValueAddMaxCents: item.estimatedValueAddMaxCents ?? null,
          status,
          resolvedAt: null,
        },
      });
    }),
    // Sources that no longer appear (fixed, closed, resolved) — auto-resolve
    // unless the homeowner had already waived it, which is a durable decision.
    ...itemsToResolve
      .map((item) => prisma.saleReadinessItem.update({
        where: { id: item.id },
        data: { status: 'RESOLVED' as SaleReadinessItemStatus, resolvedAt: new Date() },
      })),
  ]);
  await Promise.all(itemsToResolve.map((item) => reconcileSaleReadinessItemResolved({ propertyId, itemId: item.id })));
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
    const [readinessItemRows, transitions] = await Promise.all([
      prisma.saleReadinessItem.findMany({
        where: { saleCaseId: saleCase.id },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.propertyTransition.findMany({
        where: { saleCaseId: saleCase.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // §12 Stage 3: computed fresh on every read, not persisted — see
    // computeBudgetRecommendation's own comment for why.
    const recommendedIds = computeBudgetRecommendation(readinessItemRows, saleCase.budgetRange);
    const readinessItems = readinessItemRows.map((item) => ({
      ...item,
      recommendedForBudget: recommendedIds.has(item.id),
    }));

    return {
      propertyId,
      saleIntentConfirmed: true,
      canCreate: false,
      saleCase,
      readinessItems,
      transitions,
    };
  }

  // Sale Readiness Value-Maximization Checklist plan §4.4b/§10 Phase 3: the
  // Seller Prep entry-flow gate — evaluated separately from getCase since
  // it decides whether the checklist can be built meaningfully yet, not a
  // checklist item itself.
  static async getEntryFlowStatus(userId: string, propertyId: string) {
    await requireAccess(userId, propertyId);
    return checkMandatoryFactCoverage(propertyId);
  }

  // Plan §4.5: current answers for the grouped question card. Question
  // wording/copy lives in the frontend (§4.10) — this just reports which of
  // the 6 condition facts + budget are still null so the card knows what's
  // still unanswered.
  static async getSalePrepQuestionStatus(userId: string, propertyId: string) {
    await requireAccess(userId, propertyId);
    const [profile, saleCase] = await Promise.all([
      prisma.propertySalePrepProfile.findUnique({ where: { propertyId } }),
      prisma.propertySaleCase.findUnique({ where: { propertyId }, select: { budgetRange: true } }),
    ]);
    return {
      paintCondition: profile?.paintCondition ?? null,
      curbAppealCondition: profile?.curbAppealCondition ?? null,
      flooringCondition: profile?.flooringCondition ?? null,
      kitchenStatus: profile?.kitchenStatus ?? null,
      bathroomStatus: profile?.bathroomStatus ?? null,
      stagingReadiness: profile?.stagingReadiness ?? null,
      budgetRange: saleCase?.budgetRange ?? null,
    };
  }

  static async updateBudgetRange(userId: string, propertyId: string, budgetRange: SalePrepBudgetRange | null) {
    await requireAccess(userId, propertyId, 'CONTRIBUTOR');
    const saleCase = await prisma.propertySaleCase.findUnique({ where: { propertyId } });
    if (!saleCase) throw new APIError('Sale case not found', 404, 'SALE_CASE_NOT_FOUND');
    return prisma.propertySaleCase.update({ where: { id: saleCase.id }, data: { budgetRange } });
  }

  // Plan §4.5 question 8: pre-populated pick-list from real project/
  // material/event history — the record itself is direct evidence an
  // upgrade happened (§3.6), unlike the condition questions above.
  static async getNotableUpgradeCandidates(userId: string, propertyId: string) {
    await requireAccess(userId, propertyId);
    const profile = await prisma.propertySalePrepProfile.findUnique({
      where: { propertyId },
      select: { confirmedUpgradeKeys: true },
    });
    const confirmed = new Set(profile?.confirmedUpgradeKeys ?? []);

    const [projects, materialSpecs, events] = await Promise.all([
      prisma.projectRecord.findMany({
        where: { propertyId, status: 'COMPLETED' },
        select: { id: true, name: true, description: true },
        take: 20,
      }),
      prisma.materialSpec.findMany({
        where: { propertyId, isActive: true, lifecycleStatus: 'AS_BUILT' },
        select: { id: true, label: true },
        take: 20,
      }),
      prisma.homeEvent.findMany({
        where: { propertyId, isCurrent: true, importance: { in: ['HIGH', 'HIGHLIGHT'] }, type: { in: ['IMPROVEMENT', 'MILESTONE'] } },
        select: { id: true, title: true, summary: true },
        take: 20,
      }),
    ]);

    return {
      candidates: [
        ...projects.map((p) => ({
          sourceEntityType: 'PROJECT' as const, sourceEntityId: p.id, title: p.name,
          detail: p.description ?? null, confirmed: confirmed.has(`PROJECT:${p.id}`),
        })),
        ...materialSpecs.map((m) => ({
          sourceEntityType: 'MATERIAL_SPEC' as const, sourceEntityId: m.id, title: m.label,
          detail: null, confirmed: confirmed.has(`MATERIAL_SPEC:${m.id}`),
        })),
        ...events.map((e) => ({
          sourceEntityType: 'TIMELINE_EVENT' as const, sourceEntityId: e.id, title: e.title,
          detail: e.summary ?? null, confirmed: confirmed.has(`TIMELINE_EVENT:${e.id}`),
        })),
      ],
    };
  }

  static async confirmNotableUpgrades(userId: string, propertyId: string, keys: string[]) {
    const access = await requireAccess(userId, propertyId, 'CONTRIBUTOR');
    // Validate every key actually references a real record on this
    // property — never trust client-supplied composite keys blindly.
    const validated: string[] = [];
    for (const key of keys) {
      const [sourceType, sourceId] = key.split(':');
      if (!sourceType || !sourceId) continue;
      if (sourceType === 'PROJECT') {
        if (await prisma.projectRecord.findFirst({ where: { id: sourceId, propertyId }, select: { id: true } })) validated.push(key);
      } else if (sourceType === 'MATERIAL_SPEC') {
        if (await prisma.materialSpec.findFirst({ where: { id: sourceId, propertyId }, select: { id: true } })) validated.push(key);
      } else if (sourceType === 'TIMELINE_EVENT') {
        if (await prisma.homeEvent.findFirst({ where: { id: sourceId, propertyId }, select: { id: true } })) validated.push(key);
      }
    }

    await prisma.propertySalePrepProfile.upsert({
      where: { propertyId },
      create: { propertyId, confirmedUpgradeKeys: validated },
      update: { confirmedUpgradeKeys: validated },
    });

    // Resync so confirmed upgrades appear as real readiness items right away.
    const saleCase = await prisma.propertySaleCase.findUnique({ where: { propertyId } });
    if (saleCase) await syncReadinessItems(saleCase.id, propertyId, access.role);

    return { confirmedUpgradeKeys: validated };
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
    action: 'WAIVE' | 'REOPEN' | 'PURSUE' | 'UNPURSUE',
    reason?: string,
  ) {
    await requireAccess(userId, propertyId, 'CONTRIBUTOR');
    const item = await prisma.saleReadinessItem.findFirst({
      where: { id: itemId, saleCase: { propertyId } },
    });
    if (!item) throw new APIError('Readiness item not found', 404, 'SALE_READINESS_ITEM_NOT_FOUND');

    if (action === 'WAIVE') {
      const updated = await prisma.saleReadinessItem.update({
        where: { id: itemId },
        data: {
          status: 'WAIVED', waivedAt: new Date(), waivedByUserId: userId, waivedReason: reason ?? null,
          // WAIVE and PURSUE are mutually exclusive decisions on the same
          // item — clear the other one if switching between them.
          pursuedAt: null, pursuedByUserId: null,
        },
      });
      // Home Intelligence Functional Completeness FRD Phase 4 review
      // finding 3 gap fix: reconcile any linked OperationalWorkItem.
      await reconcileSaleReadinessItemDecision({ propertyId, itemId, userId, action });
      return updated;
    }
    // Value-aware checklist plan (2026-08-07, §12 Stage 3): a homeowner
    // explicitly committing to an item, typically one surfaced by the
    // budget-based recommendation — a durable decision, same pattern as
    // WAIVE, not something that resets on the next checklist sync.
    if (action === 'PURSUE') {
      const updated = await prisma.saleReadinessItem.update({
        where: { id: itemId },
        data: {
          status: 'PURSUING', pursuedAt: new Date(), pursuedByUserId: userId,
          waivedAt: null, waivedByUserId: null, waivedReason: null,
        },
      });
      await reconcileSaleReadinessItemDecision({ propertyId, itemId, userId, action });
      return updated;
    }
    // REOPEN and UNPURSUE both mean the same thing operationally — clear
    // whichever durable decision was on file and return to undecided.
    // Kept as two action names so the frontend can call the one that
    // matches what the homeowner actually did (reopen a waived item vs.
    // un-pursue a committed one), rather than one generically-named action.
    const reopened = await prisma.saleReadinessItem.update({
      where: { id: itemId },
      data: { status: 'OPEN', waivedAt: null, waivedByUserId: null, waivedReason: null, pursuedAt: null, pursuedByUserId: null },
    });
    await reconcileSaleReadinessItemDecision({ propertyId, itemId, userId, action });
    return reopened;
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
