// apps/backend/src/services/homeCapitalTimeline.service.ts
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  HomeCapitalTimelineCategory,
  HomeCapitalTimelineEventType,
  HomeCapitalTimelineConfidence,
  HomeCapitalTimelinePriority,
  HomeCapitalTimelineStatus,
  HomeCapitalTimelineOverrideType,
  InventoryItemCategory,
  InventoryItemCondition,
} from '@prisma/client';

// ─── Category defaults ─────────────────────────────────────────────
type CategoryDefault = {
  lifespanYears: number;
  costMinCents: number;
  costMaxCents: number;
  eventType: HomeCapitalTimelineEventType;
};

const CATEGORY_DEFAULTS: Record<HomeCapitalTimelineCategory, CategoryDefault> = {
  ROOF:         { lifespanYears: 25, costMinCents: 800000,  costMaxCents: 1500000, eventType: 'REPLACE' },
  HVAC:         { lifespanYears: 15, costMinCents: 500000,  costMaxCents: 1200000, eventType: 'REPLACE' },
  WATER_HEATER: { lifespanYears: 12, costMinCents: 100000,  costMaxCents: 300000,  eventType: 'REPLACE' },
  APPLIANCE:    { lifespanYears: 12, costMinCents: 80000,   costMaxCents: 250000,  eventType: 'REPLACE' },
  PLUMBING:     { lifespanYears: 30, costMinCents: 300000,  costMaxCents: 800000,  eventType: 'MAJOR_REPAIR' },
  ELECTRICAL:   { lifespanYears: 30, costMinCents: 200000,  costMaxCents: 600000,  eventType: 'MAJOR_REPAIR' },
  EXTERIOR:     { lifespanYears: 20, costMinCents: 300000,  costMaxCents: 1000000, eventType: 'MAJOR_REPAIR' },
  FOUNDATION:   { lifespanYears: 50, costMinCents: 500000,  costMaxCents: 2000000, eventType: 'MAJOR_REPAIR' },
  OTHER:        { lifespanYears: 15, costMinCents: 100000,  costMaxCents: 500000,  eventType: 'REPLACE' },
};

// ─── Helpers ────────────────────────────────────────────────────────
function mapInventoryCategory(cat: InventoryItemCategory): HomeCapitalTimelineCategory {
  switch (cat) {
    case 'HVAC':          return 'HVAC';
    case 'PLUMBING':      return 'PLUMBING';
    case 'ELECTRICAL':    return 'ELECTRICAL';
    case 'ROOF_EXTERIOR': return 'EXTERIOR';
    case 'APPLIANCE':     return 'APPLIANCE';
    case 'SAFETY':        return 'ELECTRICAL';
    case 'SMART_HOME':    return 'ELECTRICAL';
    default:              return 'OTHER';
  }
}

function conditionMultiplier(cond: InventoryItemCondition): number {
  switch (cond) {
    case 'NEW':     return 1.10;
    case 'GOOD':    return 1.00;
    case 'FAIR':    return 0.85;
    case 'POOR':    return 0.70;
    case 'UNKNOWN': return 1.00;
    default:        return 1.00;
  }
}

function ageInYears(date: Date | null | undefined, fallback: number): number {
  if (!date) return fallback;
  const ms = Date.now() - new Date(date).getTime();
  return Math.max(0, ms / (365.25 * 24 * 60 * 60 * 1000));
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + Math.floor(years));
  d.setMonth(d.getMonth() + Math.round((years % 1) * 12));
  return d;
}

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function scoreConfidence(
  hasInstallDate: boolean,
  hasCondition: boolean,
  hasReplacementCost: boolean,
): HomeCapitalTimelineConfidence {
  const score = (hasInstallDate ? 1 : 0) + (hasCondition ? 1 : 0) + (hasReplacementCost ? 1 : 0);
  if (score >= 3) return 'HIGH';
  if (score >= 1) return 'MEDIUM';
  return 'LOW';
}

function scorePriority(yearsUntil: number): HomeCapitalTimelinePriority {
  if (yearsUntil <= 2) return 'HIGH';
  if (yearsUntil <= 5) return 'MEDIUM';
  return 'LOW';
}

function overallConfidence(confidences: HomeCapitalTimelineConfidence[]): HomeCapitalTimelineConfidence {
  if (confidences.length === 0) return 'MEDIUM';
  if (confidences.includes('LOW')) return 'LOW';
  if (confidences.includes('MEDIUM')) return 'MEDIUM';
  return 'HIGH';
}

// ─── Service ────────────────────────────────────────────────────────
export class HomeCapitalTimelineService {

  // ── Get latest READY analysis ─────────────────────────────────────
  async getLatestTimeline(propertyId: string) {
    const analysis = await prisma.homeCapitalTimelineAnalysis.findFirst({
      where: { propertyId },
      orderBy: { computedAt: 'desc' },
      include: {
        items: {
          orderBy: { windowStart: 'asc' },
          include: {
            inventoryItem: { select: { name: true, brand: true, model: true } },
          },
        },
      },
    });
    return analysis;
  }

  // ── Run timeline computation ──────────────────────────────────────
  async runTimeline(propertyId: string, homeownerProfileId: string, horizonYears: number) {
    // 1. Fetch inputs
    const [inventoryItems, homeEvents, overrides] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { propertyId },
        select: {
          id: true, name: true, category: true, condition: true,
          installedOn: true, purchasedOn: true, lastServicedOn: true,
          replacementCostCents: true, brand: true, model: true,
        },
      }),
      prisma.homeEvent.findMany({
        where: {
          propertyId,
          type: { in: ['REPAIR', 'MAINTENANCE', 'INSPECTION'] as any },
        },
        select: { id: true, inventoryItemId: true, type: true, occurredAt: true },
      }),
      prisma.homeCapitalTimelineOverride.findMany({
        where: { propertyId },
      }),
    ]);

    // Index overrides by inventoryItemId
    const overridesByItem = new Map<string | null, typeof overrides>();
    for (const o of overrides) {
      const key = o.inventoryItemId;
      if (!overridesByItem.has(key)) overridesByItem.set(key, []);
      overridesByItem.get(key)!.push(o);
    }

    // Index events by inventoryItemId
    const eventsByItem = new Map<string, typeof homeEvents>();
    for (const e of homeEvents) {
      if (!e.inventoryItemId) continue;
      if (!eventsByItem.has(e.inventoryItemId)) eventsByItem.set(e.inventoryItemId, []);
      eventsByItem.get(e.inventoryItemId)!.push(e);
    }

    const now = new Date();
    const horizonEnd = addYears(now, horizonYears);
    const itemsToCreate: Array<{
      propertyId: string;
      inventoryItemId: string | null;
      category: HomeCapitalTimelineCategory;
      eventType: HomeCapitalTimelineEventType;
      windowStart: Date;
      windowEnd: Date;
      estimatedCostMinCents: number | null;
      estimatedCostMaxCents: number | null;
      currency: string;
      confidence: HomeCapitalTimelineConfidence;
      priority: HomeCapitalTimelinePriority;
      why: string;
    }> = [];

    // 2. Process each inventory item
    for (const item of inventoryItems) {
      const timelineCat = mapInventoryCategory(item.category);
      const defaults = CATEGORY_DEFAULTS[timelineCat];

      // Check DISABLE_ITEM override
      const itemOverrides = [
        ...(overridesByItem.get(item.id) || []),
        ...(overridesByItem.get(null) || []).filter(o => o.type === 'DISABLE_ITEM'),
      ];
      if (itemOverrides.some(o => o.type === 'DISABLE_ITEM')) continue;

      // Age calculation
      const age = ageInYears(item.installedOn || item.purchasedOn, 5);

      // Adjusted lifespan
      let adjustedLifespan = defaults.lifespanYears * conditionMultiplier(item.condition);

      // Repair frequency adjustment
      const repairEvents = eventsByItem.get(item.id) || [];
      const repairCount = repairEvents.filter(e => String(e.type) === 'REPAIR').length;
      if (repairCount >= 3) adjustedLifespan *= 0.80;
      else if (repairCount >= 1) adjustedLifespan *= 0.90;

      // ADJUST_REMAINING_LIFE override
      const remainingLifeOverride = itemOverrides.find(o => o.type === 'ADJUST_REMAINING_LIFE');
      let remainingLife: number;
      if (remainingLifeOverride) {
        const payload = remainingLifeOverride.payload as any;
        remainingLife = Number(payload?.remainingYears ?? (adjustedLifespan - age));
      } else {
        remainingLife = adjustedLifespan - age;
      }

      // Window calculation
      let windowStart: Date;
      let windowEnd: Date;

      const plannedDateOverride = itemOverrides.find(o => o.type === 'PLANNED_DATE');
      const plannedWindowOverride = itemOverrides.find(o => o.type === 'PLANNED_WINDOW');

      if (plannedDateOverride) {
        const payload = plannedDateOverride.payload as any;
        const d = new Date(payload?.date);
        windowStart = addYears(d, -0.5);
        windowEnd = addYears(d, 0.5);
      } else if (plannedWindowOverride) {
        const payload = plannedWindowOverride.payload as any;
        windowStart = new Date(payload?.start);
        windowEnd = new Date(payload?.end);
      } else {
        windowStart = addYears(now, Math.max(0, remainingLife - 1));
        windowEnd = addYears(now, Math.max(0.5, remainingLife + 1));
      }

      // Skip if past horizon
      if (windowStart > horizonEnd) continue;
      // If window already passed, clamp start to now
      if (windowEnd < now) continue;

      // Cost calculation
      let costMin = defaults.costMinCents;
      let costMax = defaults.costMaxCents;

      const costOverride = itemOverrides.find(o => o.type === 'COST_OVERRIDE');
      if (costOverride) {
        const payload = costOverride.payload as any;
        if (payload?.minCents != null) costMin = Number(payload.minCents);
        if (payload?.maxCents != null) costMax = Number(payload.maxCents);
      } else if (item.replacementCostCents) {
        // Use item's known cost as midpoint, ±20%
        costMin = Math.round(item.replacementCostCents * 0.8);
        costMax = Math.round(item.replacementCostCents * 1.2);
      }

      // Confidence & priority
      const hasInstallDate = !!(item.installedOn || item.purchasedOn);
      const hasCondition = item.condition !== 'UNKNOWN';
      const hasReplacementCost = !!(item.replacementCostCents || costOverride);
      const confidence = scoreConfidence(hasInstallDate, hasCondition, hasReplacementCost);

      const yearsUntil = Math.max(0, remainingLife);
      const priority = scorePriority(yearsUntil);

      // Generate "why" explanation
      const whyParts: string[] = [];
      const itemLabel = item.name || timelineCat;
      whyParts.push(`${itemLabel} is estimated at ~${age.toFixed(1)} years old.`);
      whyParts.push(`Typical ${timelineCat.toLowerCase()} lifespan is ${defaults.lifespanYears} years.`);
      if (item.condition !== 'UNKNOWN') {
        whyParts.push(`Condition is ${item.condition.toLowerCase()}, adjusting expected lifespan.`);
      }
      if (repairCount > 0) {
        whyParts.push(`${repairCount} repair event(s) on record suggest increased wear.`);
      }
      if (remainingLifeOverride) {
        whyParts.push(`Remaining life manually set to ${(remainingLifeOverride.payload as any)?.remainingYears} years.`);
      }
      whyParts.push(`Estimated cost range: ${centsToUsd(costMin)} – ${centsToUsd(costMax)}.`);

      itemsToCreate.push({
        propertyId,
        inventoryItemId: item.id,
        category: timelineCat,
        eventType: defaults.eventType,
        windowStart,
        windowEnd,
        estimatedCostMinCents: costMin,
        estimatedCostMaxCents: costMax,
        currency: 'USD',
        confidence,
        priority,
        why: whyParts.join(' '),
      });
    }

    // 3. Sort by windowStart
    itemsToCreate.sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime());

    // 4. Overall confidence & summary
    const confidences = itemsToCreate.map(i => i.confidence);
    const totalConfidence = overallConfidence(confidences);

    const totalMin = itemsToCreate.reduce((s, i) => s + (i.estimatedCostMinCents ?? 0), 0);
    const totalMax = itemsToCreate.reduce((s, i) => s + (i.estimatedCostMaxCents ?? 0), 0);
    const summary = itemsToCreate.length > 0
      ? `${itemsToCreate.length} major expense(s) totaling ${centsToUsd(totalMin)} – ${centsToUsd(totalMax)} expected over the next ${horizonYears} years.`
      : `No major capital expenses predicted within the next ${horizonYears} years.`;

    // 5. Persist (delete prior, create new)
    await prisma.$transaction(async (tx) => {
      // Delete old analyses for this property
      await tx.homeCapitalTimelineItem.deleteMany({
        where: { analysis: { propertyId } },
      });
      await tx.homeCapitalTimelineAnalysis.deleteMany({
        where: { propertyId },
      });
    });

    const analysis = await prisma.homeCapitalTimelineAnalysis.create({
      data: {
        homeownerProfileId,
        propertyId,
        status: 'READY',
        confidence: totalConfidence,
        horizonYears,
        summary,
        inputsSnapshot: {
          inventoryItemCount: inventoryItems.length,
          overrideCount: overrides.length,
          horizonYears,
        },
        timelineJson: itemsToCreate,
        items: {
          create: itemsToCreate,
        },
      },
      include: {
        items: {
          orderBy: { windowStart: 'asc' },
          include: {
            inventoryItem: { select: { name: true, brand: true, model: true } },
          },
        },
      },
    });

    return analysis;
  }

  // ── Overrides CRUD ────────────────────────────────────────────────
  async listOverrides(propertyId: string, filters?: { inventoryItemId?: string }) {
    const where: any = { propertyId };
    if (filters?.inventoryItemId) where.inventoryItemId = filters.inventoryItemId;
    return prisma.homeCapitalTimelineOverride.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOverride(propertyId: string, body: {
    inventoryItemId?: string | null;
    type: HomeCapitalTimelineOverrideType;
    payload: any;
    note?: string | null;
  }) {
    const override = await prisma.homeCapitalTimelineOverride.create({
      data: {
        propertyId,
        inventoryItemId: body.inventoryItemId ?? null,
        type: body.type,
        payload: body.payload,
        note: body.note ?? null,
      },
    });
    await this.markLatestStale(propertyId);
    return override;
  }

  async updateOverride(propertyId: string, overrideId: string, body: any) {
    const existing = await prisma.homeCapitalTimelineOverride.findFirst({
      where: { id: overrideId, propertyId },
    });
    if (!existing) throw new APIError('Override not found', 404, 'OVERRIDE_NOT_FOUND');

    const updated = await prisma.homeCapitalTimelineOverride.update({
      where: { id: overrideId },
      data: body,
    });
    await this.markLatestStale(propertyId);
    return updated;
  }

  async deleteOverride(propertyId: string, overrideId: string) {
    const existing = await prisma.homeCapitalTimelineOverride.findFirst({
      where: { id: overrideId, propertyId },
    });
    if (!existing) throw new APIError('Override not found', 404, 'OVERRIDE_NOT_FOUND');

    await prisma.homeCapitalTimelineOverride.delete({ where: { id: overrideId } });
    await this.markLatestStale(propertyId);
  }

  // ── Mark latest analysis as STALE ─────────────────────────────────
  private async markLatestStale(propertyId: string) {
    const latest = await prisma.homeCapitalTimelineAnalysis.findFirst({
      where: { propertyId, status: 'READY' },
      orderBy: { computedAt: 'desc' },
      select: { id: true },
    });
    if (latest) {
      await prisma.homeCapitalTimelineAnalysis.update({
        where: { id: latest.id },
        data: { status: 'STALE' },
      });
    }
  }
}
