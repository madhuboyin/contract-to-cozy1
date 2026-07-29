import { prisma } from '../lib/prisma';
import { RISK_ASSET_CONFIG } from '../config/risk-constants';
import { APIError } from '../middleware/error.middleware';
import { HomeItemCondition, HomeItemRecommendation, Prisma } from '@prisma/client';
import { ListBoardQuery, PatchItemStatusBody } from '../validators/homeStatusBoard.validators';
import { SharedSignalKey, signalService } from './signal.service';
import { logSharedDataEvent } from './sharedDataObservability.service';
import { findActiveWorkItemsForSubject } from '../modules/homeOperations/infrastructure/workItemRepository';
import {
  isRiskReportInventoryAssetType,
  visibleInventoryItemWhere,
} from './riskAssetApplicability';
import { getHomeAssetDisplayLabel } from '../productFramework/homeAssetDisplay';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExpectedLife(assetType: string | null, inventoryCategory: string | null): number {
  if (assetType) {
    const cfg = RISK_ASSET_CONFIG.find((c) => c.systemType === assetType);
    if (cfg) return cfg.expectedLife;
  }
  if (inventoryCategory) {
    const mapped = mapCategoryToAssetType(inventoryCategory);
    if (mapped) {
      const cfg = RISK_ASSET_CONFIG.find((c) => c.systemType === mapped);
      if (cfg) return cfg.expectedLife;
    }
  }
  return 15; // sensible default
}

function mapCategoryToAssetType(category: string): string | null {
  const map: Record<string, string> = {
    HVAC: 'HVAC_FURNACE',
    WATER_HEATER: 'WATER_HEATER_TANK',
    ELECTRICAL: 'ELECTRICAL_PANEL_MODERN',
    ROOF: 'ROOF_SHINGLE',
    APPLIANCE: 'MAJOR_APPLIANCE_FRIDGE',
    KITCHEN: 'MAJOR_APPLIANCE_DISHWASHER',
    SAFETY: 'SAFETY_SMOKE_CO_DETECTORS',
  };
  return map[category] ?? null;
}

function mapAssetTypeToCategory(assetType: string): string {
  const cfg = RISK_ASSET_CONFIG.find((c) => c.systemType === assetType);
  if (cfg && cfg.category !== 'FINANCIAL_GAP') return cfg.category;
  if (assetType.startsWith('SAFETY')) return 'SAFETY';
  if (assetType.startsWith('FOUNDATION') || assetType.startsWith('ROOF')) return 'STRUCTURE';
  return 'SYSTEMS';
}

function inventoryCategoryForAssetType(assetType: string): 'HVAC' | 'PLUMBING' | 'ELECTRICAL' | 'ROOF_EXTERIOR' | 'SAFETY' | 'STRUCTURAL' | 'OTHER' {
  if (assetType.startsWith('HVAC_')) return 'HVAC';
  if (assetType.startsWith('WATER_HEATER_')) return 'PLUMBING';
  if (assetType.startsWith('ELECTRICAL_')) return 'ELECTRICAL';
  if (assetType.startsWith('ROOF_')) return 'ROOF_EXTERIOR';
  if (assetType.startsWith('SAFETY_')) return 'SAFETY';
  if (assetType.startsWith('FOUNDATION_')) return 'STRUCTURAL';
  return 'OTHER';
}

function isRiskAssessmentCategory(category: string | null | undefined): boolean {
  return category === 'SYSTEMS' || category === 'SAFETY' || category === 'STRUCTURE';
}

function mapInventoryCategoryToStatusBoardCategory(category: string | null | undefined): string {
  if (!category) return 'OTHER';
  // Keep explicit risk buckets where they naturally apply.
  if (category === 'SAFETY') return 'SAFETY';
  if (category === 'ROOF_EXTERIOR') return 'STRUCTURE';
  // Preserve existing inventory categories (APPLIANCE, ELECTRONICS, FURNITURE, etc.).
  return category;
}

function deriveStatusBoardCategory(
  assetType: string | null | undefined,
  inventoryCategory: string | null | undefined
): string {
  // For inventory-backed items, prioritize inventory category to avoid collapsing
  // APPLIANCE/FURNITURE/ELECTRONICS into SYSTEMS.
  if (inventoryCategory) return mapInventoryCategoryToStatusBoardCategory(inventoryCategory);
  if (assetType) return mapAssetTypeToCategory(assetType);
  return 'OTHER';
}

function parseNumericAge(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function ensureInventoryItemsFromRiskReport(propertyId: string): Promise<void> {
  const report = await prisma.riskAssessmentReport.findUnique({
    where: { propertyId },
    select: { details: true },
  });

  if (!report?.details || !Array.isArray(report.details)) return;

  // Build a unique list of non-appliance system types from risk report details.
  const candidates = new Map<string, number | null>();
  for (const rawEntry of report.details) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) continue;
    const entry = rawEntry as Record<string, unknown>;
    const systemType = typeof entry.systemType === 'string' ? entry.systemType.trim() : '';
    if (!systemType || !isRiskReportInventoryAssetType(systemType)) continue;

    const category = mapAssetTypeToCategory(systemType);
    if (category !== 'SYSTEMS' && category !== 'SAFETY' && category !== 'STRUCTURE') continue;

    const nextAge = parseNumericAge(entry.age);
    const prevAge = candidates.get(systemType);
    if (!candidates.has(systemType) || (prevAge == null && nextAge != null)) {
      candidates.set(systemType, nextAge);
    }
  }

  if (candidates.size === 0) return;

  const systemTypes = Array.from(candidates.keys());
  const existing = await prisma.inventoryItem.findMany({
    where: {
      propertyId,
      assetType: { in: systemTypes },
    },
    select: {
      id: true,
      assetType: true,
      name: true,
      category: true,
      roomId: true,
      sourceType: true,
      isVerified: true,
      verificationSource: true,
      sourceHash: true,
      tags: true,
      brand: true,
      model: true,
      serialNo: true,
    },
  });
  const existingTypes = new Set(existing.map((row) => row.assetType));

  // Correct legacy rows created by this materializer before provenance and
  // homeowner-facing categories were available. The narrow shape check avoids
  // relabeling user-maintained inventory records.
  const legacyUpdates = existing.filter((item) => {
    if (!item.assetType || item.sourceHash || item.verificationSource || item.isVerified || item.roomId) return false;
    if (item.sourceType !== 'MANUAL' || item.category !== 'OTHER' || item.brand || item.model || item.serialNo) return false;
    const legacyName = item.assetType.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return item.name === legacyName;
  });
  if (legacyUpdates.length) {
    await prisma.$transaction(legacyUpdates.map((item) => prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        name: getHomeAssetDisplayLabel({ assetType: item.assetType }),
        category: inventoryCategoryForAssetType(item.assetType!),
        sourceType: 'INTEGRATION',
        verificationSource: 'PROPERTY_DETAILS',
        sourceHash: `RISK_REPORT_SYSTEM:${item.assetType}`,
        tags: { set: [...new Set([...item.tags, 'RISK_REPORT_INFERRED', 'PROPERTY_LEVEL_SYSTEM'])] },
      },
    })));
  }
  const missingTypes = systemTypes.filter((type) => !existingTypes.has(type));
  if (missingTypes.length === 0) return;

  const currentYear = new Date().getFullYear();
  await prisma.inventoryItem.createMany({
    data: missingTypes.map((assetType) => {
      const ageYears = candidates.get(assetType) ?? null;
      let installedOn: Date | null = null;
      if (ageYears != null) {
        const inferredYear = currentYear - Math.round(ageYears);
        if (inferredYear >= 1900 && inferredYear <= currentYear) {
          installedOn = new Date(inferredYear, 0, 1);
        }
      }
      return {
        propertyId,
        assetType,
        name: getHomeAssetDisplayLabel({ assetType }),
        category: inventoryCategoryForAssetType(assetType),
        installedOn,
        sourceType: 'INTEGRATION' as const,
        verificationSource: 'PROPERTY_DETAILS',
        sourceHash: `RISK_REPORT_SYSTEM:${assetType}`,
        tags: ['RISK_REPORT_INFERRED', 'PROPERTY_LEVEL_SYSTEM'],
      };
    }),
    skipDuplicates: true,
  });
}

interface WarrantyInfo {
  status: 'active' | 'expiring_soon' | 'expired' | 'none';
  expiryDate: Date | null;
}

function getWarrantyStatus(warranties: { expiryDate?: Date | null }[]): WarrantyInfo {
  if (!warranties || warranties.length === 0) return { status: 'none', expiryDate: null };

  const now = new Date();
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
  let latestActive: Date | null = null;

  for (const w of warranties) {
    if (!w.expiryDate) continue;
    const exp = new Date(w.expiryDate);
    if (exp > now) {
      if (!latestActive || exp > latestActive) latestActive = exp;
    }
  }

  if (latestActive) {
    const diff = latestActive.getTime() - now.getTime();
    if (diff <= sixtyDaysMs) return { status: 'expiring_soon', expiryDate: latestActive };
    return { status: 'active', expiryDate: latestActive };
  }

  // All expired — find the most recent expiry
  let latest: Date | null = null;
  for (const w of warranties) {
    if (!w.expiryDate) continue;
    const exp = new Date(w.expiryDate);
    if (!latest || exp > latest) latest = exp;
  }
  return { status: 'expired', expiryDate: latest };
}

function buildDeepLinks(
  item: {
    id: string;
    inventoryItemId: string;
    roomId: string | null;
    categoryKey: string | null;
  },
  propertyId: string
) {
  const base = `/dashboard/properties/${propertyId}`;
  const links: Record<string, string> = {};
  const showRiskLink = isRiskAssessmentCategory(item.categoryKey);

  if (item.inventoryItemId) {
    const itemParams = new URLSearchParams({
      openItemId: item.inventoryItemId,
      scrollToItemId: item.inventoryItemId,
      from: 'status-board',
    });
    links.viewItem = `${base}/inventory?${itemParams.toString()}`;
    links.replaceRepair = `${base}/inventory/items/${item.inventoryItemId}/replace-repair`;
  }
  if (item.roomId) {
    links.viewRoom = `${base}/rooms/${item.roomId}?from=status-board`;
  }
  if (showRiskLink) {
    links.riskAssessment = `${base}/risk-assessment`;
  }
  links.maintenance = `/dashboard/maintenance?propertyId=${propertyId}&from=status-board`;
  links.warranty = `/dashboard/warranties?propertyId=${propertyId}&from=status-board`;

  return links;
}

const CONDITION_SEVERITY: Record<string, number> = {
  ACTION_NEEDED: 0,
  MONITOR: 1,
  GOOD: 2,
};

// Phase-3: Category-weighted priority (lower number = higher priority in sort)
const CATEGORY_PRIORITY_WEIGHT: Record<string, number> = {
  SAFETY: 0,
  STRUCTURE: 1,
  SYSTEMS: 2,
  HVAC: 2,
  APPLIANCE: 3,
  KITCHEN: 3,
  ELECTRONICS: 4,
  FURNITURE: 5,
  OTHER: 6,
};

function getCategoryPriorityWeight(category: string): number {
  return CATEGORY_PRIORITY_WEIGHT[category] ?? 6;
}

// Phase-3: Estimate repair and replacement costs per item from RISK_ASSET_CONFIG
// Repair is modeled as ~30% of replacement cost (common industry rule of thumb)
const REPAIR_COST_RATIO = 0.30;

function getCostEstimates(
  assetType: string | null | undefined,
  inventoryCategory: string | null | undefined
): { estimatedReplaceCostUsd: number | null; estimatedRepairCostUsd: number | null } {
  if (assetType) {
    const cfg = RISK_ASSET_CONFIG.find((c) => c.systemType === assetType);
    if (cfg) {
      return {
        estimatedReplaceCostUsd: cfg.replacementCost,
        estimatedRepairCostUsd: Math.round(cfg.replacementCost * REPAIR_COST_RATIO),
      };
    }
  }
  if (inventoryCategory) {
    const mapped = mapCategoryToAssetType(inventoryCategory);
    if (mapped) {
      const cfg = RISK_ASSET_CONFIG.find((c) => c.systemType === mapped);
      if (cfg) {
        return {
          estimatedReplaceCostUsd: cfg.replacementCost,
          estimatedRepairCostUsd: Math.round(cfg.replacementCost * REPAIR_COST_RATIO),
        };
      }
    }
  }
  return { estimatedReplaceCostUsd: null, estimatedRepairCostUsd: null };
}

// ---------------------------------------------------------------------------
// ensureHomeItems
// ---------------------------------------------------------------------------

export async function ensureHomeItems(propertyId: string): Promise<void> {
  // Materialize risk-report systems as canonical inventory items before projecting status rows.
  await ensureInventoryItemsFromRiskReport(propertyId);

  const [inventoryItems, existingHomeItems] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { propertyId, ...visibleInventoryItemWhere() },
      select: { id: true, name: true, category: true, roomId: true, assetType: true },
    }),
    prisma.homeItem.findMany({
      where: { propertyId },
      select: { id: true, inventoryItemId: true, categoryKey: true, roomId: true },
    }),
  ]);

  const inventoryById = new Map(inventoryItems.map((ii) => [ii.id, ii]));
  const existingInvIds = new Set(existingHomeItems.map((h) => h.inventoryItemId));

  const creates: any[] = [];

  // Upsert for each inventory item not yet tracked
  for (const ii of inventoryItems) {
    if (existingInvIds.has(ii.id)) continue;
    creates.push(
      prisma.homeItem.create({
        data: {
          propertyId,
          inventoryItemId: ii.id,
          roomId: ii.roomId,
          categoryKey: deriveStatusBoardCategory(ii.assetType, ii.category),
          status: {
            create: {},
          },
        },
      })
    );
  }

  if (creates.length > 0) {
    await prisma.$transaction(creates);
  }

  // Backfill category/room for existing rows so board consistently includes SYSTEMS/SAFETY/STRUCTURE.
  const updates: Prisma.PrismaPromise<any>[] = [];
  for (const existing of existingHomeItems) {
    if (existing.inventoryItemId) {
      const ii = inventoryById.get(existing.inventoryItemId);
      if (!ii) continue;
      const desiredCategory = deriveStatusBoardCategory(ii.assetType, ii.category);
      const desiredRoomId = ii.roomId ?? null;
      if (existing.categoryKey !== desiredCategory || (existing.roomId ?? null) !== desiredRoomId) {
        updates.push(
          prisma.homeItem.update({
            where: { id: existing.id },
            data: { categoryKey: desiredCategory, roomId: desiredRoomId },
          })
        );
      }
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}

// ---------------------------------------------------------------------------
// Home Digital Twin evidence
// ---------------------------------------------------------------------------

type TwinInstallEvidence = {
  installYear: number | null;
  isReported: boolean; // REPORTED/VERIFIED — safe to use as a fallback install date
  hasConflict: boolean;
  componentLabel: string;
};

/**
 * Loads install-year evidence the Home Digital Twin already resolved for
 * this property's inventory-backed components, keyed by inventoryItemId.
 * Status Board's own condition/EOL math is untouched — this only fills a
 * gap (missing install date) or surfaces a conflict Status Board has no
 * way to detect on its own (it never looks at the property profile).
 */
async function loadTwinInstallEvidence(
  propertyId: string,
): Promise<Map<string, TwinInstallEvidence>> {
  const evidence = new Map<string, TwinInstallEvidence>();

  const twin = await prisma.homeDigitalTwin.findUnique({
    where: { propertyId },
    select: { id: true },
  });
  if (!twin) return evidence;

  const components = await prisma.homeTwinComponent.findMany({
    where: {
      digitalTwinId: twin.id,
      lifecycleState: 'ACTIVE',
      sourceType: 'INVENTORY',
      sourceReferenceId: { not: null },
    },
    select: {
      label: true,
      componentType: true,
      sourceReferenceId: true,
      projectedFacts: {
        where: { fieldName: 'installYear' },
        select: { valueNumeric: true, factState: true },
      },
    },
  });

  for (const component of components) {
    const inventoryItemId = component.sourceReferenceId;
    if (!inventoryItemId) continue;
    const fact = component.projectedFacts[0];
    if (!fact) continue;

    evidence.set(inventoryItemId, {
      installYear: fact.valueNumeric,
      isReported: fact.factState === 'REPORTED' || fact.factState === 'VERIFIED' || fact.factState === 'DOCUMENT_DERIVED',
      hasConflict: fact.factState === 'CONFLICTED',
      componentLabel: component.label ?? component.componentType,
    });
  }

  return evidence;
}

/**
 * Home Operations Slice 7: "distinguish unknown data, monitored condition,
 * and actionable work" — needsInstallDateForPrediction was previously the
 * only signal for "unknown," bolted onto the GOOD value; this makes the
 * three states explicit for API consumers without changing the underlying
 * HomeItemCondition enum.
 */
export function computeDataStatus(
  needsInstallDateForPrediction: boolean,
  effectiveCondition: HomeItemCondition,
): 'UNKNOWN' | 'MONITORED' | 'ACTIONABLE' | null {
  if (needsInstallDateForPrediction) return 'UNKNOWN';
  if (effectiveCondition === 'MONITOR') return 'MONITORED';
  if (effectiveCondition === 'ACTION_NEEDED') return 'ACTIONABLE';
  return null;
}

/**
 * Home Operations Slice 7: "condition refresh after verified outcomes" —
 * called best-effort from the Maintenance/Guidance/Project completion hooks
 * that already write InventoryItem.condition on verified outcomes. Resets
 * computedAt to null rather than recomputing inline (computeStatuses works
 * over the whole property at once, not a single item) — listBoard's
 * existing staleness gate then forces a fresh computeStatuses on the next
 * read instead of waiting up to 24h. Safe to call for an inventory item
 * with no Status Board row yet (updateMany matches zero rows, no throw).
 */
export async function invalidateStatusForInventoryItem(propertyId: string, inventoryItemId: string): Promise<void> {
  try {
    const homeItem = await prisma.homeItem.findUnique({
      where: { inventoryItemId },
      select: { id: true, propertyId: true },
    });
    if (!homeItem || homeItem.propertyId !== propertyId) return;
    await prisma.homeItemStatus.updateMany({
      where: { homeItemId: homeItem.id },
      data: { computedAt: null },
    });
  } catch (err) {
    logSharedDataEvent({
      event: 'status_board.condition_invalidation_failed',
      level: 'WARN',
      propertyId,
      toolKey: 'STATUS_BOARD',
      fallbackPath: 'stale-until-next-24h-window',
      error: err,
    });
  }
}

// ---------------------------------------------------------------------------
// computeStatuses
// ---------------------------------------------------------------------------

export async function computeStatuses(propertyId: string): Promise<void> {
  const homeItems = await prisma.homeItem.findMany({
    where: { propertyId },
    include: {
      status: true,
      inventoryItem: {
        include: {
          warranty: { select: { expiryDate: true } },
          linkedWarranties: { select: { expiryDate: true } },
          maintenanceTasks: {
            where: { status: { not: 'COMPLETED' } },
            select: { id: true, priority: true, nextDueDate: true },
          },
        },
      },
    },
  });

  // Home Digital Twin evidence, keyed by the inventory item it was derived
  // from. Status Board owns "what needs attention now" — this only feeds it
  // evidence the twin already resolved (a reported install date; a
  // conflict between two sources), it never recomputes condition itself.
  const twinByInventoryItemId = await loadTwinInstallEvidence(propertyId);

  const now = new Date();
  const updates: any[] = [];

  for (const item of homeItems) {
    if (!item.status) continue;

    // Determine installation date & asset type
    let installDate: Date | null = null;
    let assetType: string | null = null;
    let inventoryCategory: string | null = null;
    let allWarranties: { expiryDate?: Date | null }[] = [];
    let maintenanceTasks: { id: string; priority: string | null; nextDueDate: Date | null }[] = [];

    if (item.inventoryItem) {
      installDate = item.inventoryItem.installedOn ?? item.inventoryItem.purchasedOn ?? null;
      inventoryCategory = item.inventoryItem.category;
      // Collect warranties
      if (item.inventoryItem.warranty) allWarranties.push(item.inventoryItem.warranty);
      allWarranties.push(...(item.inventoryItem.linkedWarranties || []));
      assetType = item.inventoryItem.assetType;
      maintenanceTasks = item.inventoryItem.maintenanceTasks || [];
    }

    // Use override dates if present
    if (item.status.overrideInstalledAt) installDate = item.status.overrideInstalledAt;

    // Home Digital Twin evidence for this inventory item, if any.
    const twinEvidence = twinByInventoryItemId.get(item.inventoryItemId);
    let installDateFromTwin = false;
    if (!installDate && twinEvidence?.isReported && twinEvidence.installYear) {
      installDate = new Date(`${twinEvidence.installYear}-01-01`);
      installDateFromTwin = true;
    }

    const expectedLife = getExpectedLife(assetType, inventoryCategory);
    const hasInstallDate = Boolean(installDate);
    const ageYears = installDate
      ? (now.getTime() - installDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      : 0;
    const eolRatio = expectedLife > 0 ? ageYears / expectedLife : 0;

    const warrantyInfo = getWarrantyStatus(allWarranties);

    // Check for overdue urgent maintenance
    const hasOverdueUrgent = maintenanceTasks.some(
      (t) => t.nextDueDate && new Date(t.nextDueDate) < now && (t.priority === 'HIGH' || t.priority === 'URGENT')
    );

    // Compute condition
    const reasons: { code: string; detail: string }[] = [];
    let condition: HomeItemCondition = 'GOOD';

    if (!hasInstallDate) {
      reasons.push({ code: 'MISSING_INSTALL_DATE', detail: 'Install date is empty' });
    } else if (installDateFromTwin) {
      reasons.push({
        code: 'INSTALL_DATE_FROM_HOME_RECORD',
        detail: 'Install year filled in from your Home Record (property profile), not this inventory entry',
      });
    }

    if (twinEvidence?.hasConflict) {
      condition = condition === 'GOOD' ? 'MONITOR' : condition;
      reasons.push({
        code: 'HOME_RECORD_CONFLICT',
        detail: `Your Home Record has two different install dates on file for ${twinEvidence.componentLabel} — confirm which is right`,
      });
    }

    if (hasOverdueUrgent) {
      condition = 'ACTION_NEEDED';
      reasons.push({ code: 'OVERDUE_MAINTENANCE', detail: 'Overdue urgent maintenance task' });
    }

    if (hasInstallDate && warrantyInfo.status === 'expired' && eolRatio >= 0.8) {
      condition = 'ACTION_NEEDED';
      reasons.push({ code: 'WARRANTY_EXPIRED_EOL', detail: 'Warranty expired and nearing end of life' });
    }

    if (hasInstallDate && eolRatio >= 1.0 && condition !== 'ACTION_NEEDED') {
      condition = 'ACTION_NEEDED';
      reasons.push({ code: 'PAST_EOL', detail: `Past expected life (${expectedLife}yr)` });
    } else if (hasInstallDate && eolRatio >= 0.8 && condition === 'GOOD') {
      condition = 'MONITOR';
      reasons.push({ code: 'NEARING_EOL', detail: `${Math.round(eolRatio * 100)}% of expected life` });
    }

    if (warrantyInfo.status === 'expiring_soon' && condition === 'GOOD') {
      condition = 'MONITOR';
      reasons.push({ code: 'WARRANTY_EXPIRING', detail: 'Warranty expiring within 60 days' });
    }

    if (condition === 'GOOD' && hasInstallDate) {
      reasons.push({ code: 'ALL_CLEAR', detail: 'No issues detected' });
    }

    // Compute recommendation
    let recommendation: HomeItemRecommendation = 'OK';
    if (condition === 'ACTION_NEEDED' && eolRatio >= 0.8) {
      recommendation = 'REPLACE_SOON';
    } else if (condition === 'ACTION_NEEDED') {
      recommendation = 'REPAIR';
    } else if (condition === 'MONITOR' && eolRatio >= 0.8) {
      recommendation = 'REPLACE_SOON';
    }

    // Home Digital Twin evidence quality, when available. Conflicting
    // records lower confidence regardless of anything else computed above;
    // a twin-reported/verified date raises it. No twin signal leaves the
    // field at its existing value rather than resetting to MEDIUM.
    const derivedConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | null = twinEvidence
      ? twinEvidence.hasConflict
        ? 'LOW'
        : twinEvidence.isReported
          ? 'HIGH'
          : 'MEDIUM'
      : null;

    // Only update if values changed
    const changed =
      item.status.computedCondition !== condition ||
      item.status.computedRecommendation !== recommendation ||
      JSON.stringify(item.status.computedReasonJson) !== JSON.stringify(reasons) ||
      (derivedConfidence !== null && item.status.confidence !== derivedConfidence);

    if (changed) {
      updates.push(
        prisma.homeItemStatus.update({
          where: { id: item.status.id },
          data: {
            computedCondition: condition,
            computedRecommendation: recommendation,
            computedReasonJson: reasons,
            computedAt: now,
            ...(derivedConfidence ? { confidence: derivedConfidence } : {}),
          },
        })
      );
      updates.push(
        prisma.homeItemStatusEvent.create({
          data: {
            homeItemId: item.id,
            eventType: 'COMPUTED_UPDATE',
            payloadJson: { condition, recommendation, reasons },
          },
        })
      );
    } else {
      // Still update computedAt to mark freshness
      updates.push(
        prisma.homeItemStatus.update({
          where: { id: item.status.id },
          data: { computedAt: now },
        })
      );
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}

// ---------------------------------------------------------------------------
// listBoard
// ---------------------------------------------------------------------------

export async function listBoard(propertyId: string, query: ListBoardQuery, userId?: string | null) {
  // Keep board registry and category mappings synced on every load.
  await ensureHomeItems(propertyId);

  // Recompute if board is stale OR if there are newly created/uncomputed rows.
  const [recentStatus, hasUncomputedStatus] = await Promise.all([
    prisma.homeItemStatus.findFirst({
      where: {
        homeItem: { propertyId },
        computedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    }),
    prisma.homeItemStatus.findFirst({
      where: {
        homeItem: { propertyId },
        OR: [
          { computedAt: null },
          { computedCondition: null },
          { computedRecommendation: null },
        ],
      },
      select: { id: true },
    }),
  ]);

  if (!recentStatus || hasUncomputedStatus) {
    await computeStatuses(propertyId);
  }

  const { q, groupBy, condition, categoryKey, pinnedOnly, includeHidden, page, limit } = query;

  // Build where clause
  const where: Prisma.HomeItemWhereInput = { propertyId };

  if (categoryKey) where.categoryKey = categoryKey;

  const statusFilter: Prisma.HomeItemStatusWhereInput = {};
  if (pinnedOnly) statusFilter.isPinned = true;
  if (!includeHidden) statusFilter.isHidden = false;

  if (q) {
    where.OR = [
      { inventoryItem: { name: { contains: q, mode: 'insensitive' } } },
      { inventoryItem: { assetType: { contains: q, mode: 'insensitive' } } },
      { displayName: { contains: q, mode: 'insensitive' } },
      { categoryKey: { contains: q, mode: 'insensitive' } },
    ];
  }

  // Condition filter — check both override and computed
  if (condition) {
    statusFilter.OR = [
      { overrideCondition: condition },
      { overrideCondition: null, computedCondition: condition },
    ];
  }

  if (Object.keys(statusFilter).length > 0) {
    where.status = statusFilter;
  }

  const includeClause = {
    status: true as const,
    inventoryItem: {
      include: {
        warranty: { select: { id: true, expiryDate: true, providerName: true } },
        linkedWarranties: { select: { id: true, expiryDate: true, providerName: true } },
        maintenanceTasks: {
          where: { status: { not: 'COMPLETED' as const } },
          select: { id: true },
        },
        room: { select: { id: true, name: true } },
      },
    },
  };

  const [total, homeItems] = await Promise.all([
    prisma.homeItem.count({ where }),
    prisma.homeItem.findMany({
      where,
      include: includeClause,
      orderBy: [
        { status: { isPinned: 'desc' as const } },
        { status: { computedCondition: 'asc' as const } },
      ],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // Map to DTOs
  // Home Operations Slice 7: read-only work-item lookup, one per item's
  // inventory item — Status Board links to whatever already tracks this
  // item's condition, it never proposes or creates a competing one.
  const workItemByInventoryItemId = new Map<string, Awaited<ReturnType<typeof findActiveWorkItemsForSubject>>[number]>();
  await Promise.all(homeItems.map(async (item) => {
    if (!item.inventoryItemId) return;
    try {
      const [workItem] = await findActiveWorkItemsForSubject('INVENTORY_ITEM', item.inventoryItemId);
      if (workItem) workItemByInventoryItemId.set(item.inventoryItemId, workItem);
    } catch (err) {
      logSharedDataEvent({
        event: 'status_board.work_item_lookup_failed',
        level: 'WARN',
        propertyId,
        toolKey: 'STATUS_BOARD',
        fallbackPath: 'no-work-item-link',
        error: err,
      });
    }
  }));

  const items = homeItems.map((item) => {
    const s = item.status;
    const effectiveCondition = s?.overrideCondition ?? s?.computedCondition ?? 'GOOD';
    const effectiveRecommendation = s?.overrideRecommendation ?? s?.computedRecommendation ?? 'OK';

    // Display name
    let displayName = item.displayName || '';
    if (!displayName && item.inventoryItem) displayName = item.inventoryItem.name;

    // Category
    const category = item.categoryKey || 'OTHER';

    // Age
    let installDate: Date | null = s?.overrideInstalledAt ?? null;
    if (!installDate && item.inventoryItem) {
      installDate = item.inventoryItem.installedOn ?? item.inventoryItem.purchasedOn ?? null;
    }

    const ageYears = installDate
      ? Math.round((Date.now() - installDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000) * 10) / 10
      : null;

    // Warranty
    const allWarranties: { expiryDate?: Date | null }[] = [];
    if (item.inventoryItem?.warranty) allWarranties.push(item.inventoryItem.warranty);
    if (item.inventoryItem?.linkedWarranties) allWarranties.push(...item.inventoryItem.linkedWarranties);

    const warrantyInfo = getWarrantyStatus(allWarranties);

    // Pending maintenance count
    const pendingMaintenance = item.inventoryItem?.maintenanceTasks?.length ?? 0;

    // Room
    const room = item.inventoryItem?.room ?? null;

    const needsInstallDateForPrediction =
      !installDate && effectiveCondition === 'GOOD' && effectiveRecommendation === 'OK';

    // Phase-3: cost context per item
    const assetTypeForCost = item.inventoryItem?.assetType ?? null;
    const invCategoryForCost = item.inventoryItem?.category ?? null;
    const { estimatedReplaceCostUsd, estimatedRepairCostUsd } = getCostEstimates(assetTypeForCost, invCategoryForCost);
    const categoryPriorityWeight = getCategoryPriorityWeight(category);

    // Home Operations Slice 7: an already-resolved work item for this item's
    // inventory item, if one exists — read-only, never created here.
    const workItem = item.inventoryItemId ? workItemByInventoryItemId.get(item.inventoryItemId) ?? null : null;

    const dataStatus = computeDataStatus(needsInstallDateForPrediction, effectiveCondition);

    const deepLinks = buildDeepLinks(
      {
        id: item.id,
        inventoryItemId: item.inventoryItemId,
        roomId: item.roomId,
        categoryKey: item.categoryKey,
      },
      propertyId
    );
    if (workItem) {
      deepLinks.workItem = `/dashboard/properties/${propertyId}/home-operations?workItemId=${encodeURIComponent(workItem.id)}`;
    }

    return {
      id: item.id,
      kind: 'INVENTORY_ITEM' as const,
      displayName,
      category,
      ageYears,
      installDate: installDate?.toISOString() ?? null,
      condition: effectiveCondition,
      recommendation: effectiveRecommendation,
      computedCondition: s?.computedCondition ?? null,
      computedRecommendation: s?.computedRecommendation ?? null,
      computedReasons: (s?.computedReasonJson as any[]) ?? [],
      computedAt: s?.computedAt?.toISOString() ?? null,
      overrideCondition: s?.overrideCondition ?? null,
      overrideRecommendation: s?.overrideRecommendation ?? null,
      overrideNotes: s?.overrideNotes ?? null,
      overridePurchaseDate: s?.overridePurchaseDate?.toISOString() ?? null,
      overrideInstalledAt: s?.overrideInstalledAt?.toISOString() ?? null,
      isPinned: s?.isPinned ?? false,
      isHidden: s?.isHidden ?? false,
      warrantyStatus: warrantyInfo.status,
      warrantyExpiry: warrantyInfo.expiryDate?.toISOString() ?? null,
      pendingMaintenance,
      room: room ? { id: room.id, name: room.name } : null,
      needsInstallDateForPrediction,
      // Phase-3: cost context
      estimatedRepairCostUsd,
      estimatedReplaceCostUsd,
      categoryPriorityWeight,
      deepLinks,
      inventoryItemId: item.inventoryItemId,
      dataStatus,
      workItem: workItem ? { id: workItem.id, state: workItem.state, obligationType: workItem.obligationType } : null,
    };
  });

  // Sort: pinned first, then by condition severity, then by category priority weight, then alphabetical
  items.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const sa = CONDITION_SEVERITY[a.condition] ?? 2;
    const sb = CONDITION_SEVERITY[b.condition] ?? 2;
    if (sa !== sb) return sa - sb;
    // Phase-3: within same condition, SAFETY > STRUCTURE > SYSTEMS > APPLIANCE > ...
    const ca = a.categoryPriorityWeight;
    const cb = b.categoryPriorityWeight;
    if (ca !== cb) return ca - cb;
    return a.displayName.localeCompare(b.displayName);
  });

  // Summary counts
  const summary = {
    total: total,
    good: items.filter((i) => i.condition === 'GOOD' && !i.needsInstallDateForPrediction).length,
    monitor: items.filter((i) => i.condition === 'MONITOR').length,
    actionNeeded: items.filter((i) => i.condition === 'ACTION_NEEDED').length,
  };

  const result: any = {
    items,
    summary,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };

  // Grouped structure
  if (groupBy) {
    const groups: Record<string, typeof items> = {};
    for (const item of items) {
      let key: string;
      if (groupBy === 'condition') key = item.condition;
      else if (groupBy === 'category') key = item.category;
      else key = item.room?.name ?? 'No Room';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    result.groups = groups;
  }

  const signalKeys: SharedSignalKey[] = [
    'RISK_SPIKE',
    'COST_ANOMALY',
    'MAINT_ADHERENCE',
    'RISK_ACCUMULATION',
    'COST_PRESSURE_PATTERN',
    'FINANCIAL_DISCIPLINE',
  ];
  const signalLookup = await signalService.getLatestSignalsByKeyWithFreshFallback(propertyId, signalKeys, {
    freshOnly: true,
    refreshIfStale: true,
    refreshReason: 'home-status-board',
  });
  const latestSignals = signalLookup.signals;
  if (signalLookup.fallbackUsed) {
    logSharedDataEvent({
      event: 'status_board.signal_fallback_used',
      level: 'INFO',
      propertyId,
      toolKey: 'STATUS_BOARD',
      fallbackPath: 'signal-refresh',
      metadata: {
        refreshedSignals: signalLookup.refreshSummary?.refreshedSignals ?? [],
        skippedSignals: signalLookup.refreshSummary?.skippedSignals ?? [],
      },
    });
  }
  const interactionContext = await signalService
    .getSignalInteractionContext(propertyId, { freshOnly: true })
    .catch((error) => {
      logSharedDataEvent({
        event: 'status_board.signal_interaction_context_fallback',
        level: 'WARN',
        propertyId,
        toolKey: 'STATUS_BOARD',
        fallbackPath: 'empty-signal-interaction-context',
        error,
      });
      return {
        signals: {},
        interactions: [],
        staleSignals: [],
      };
    });
  const riskSpike = toFiniteNumber(latestSignals.RISK_SPIKE?.valueNumber);
  const costAnomaly = toFiniteNumber(latestSignals.COST_ANOMALY?.valueNumber);
  const maintenanceAdherence = toFiniteNumber(latestSignals.MAINT_ADHERENCE?.valueNumber);
  const riskAccumulation = toFiniteNumber(latestSignals.RISK_ACCUMULATION?.valueNumber);
  const costPressurePattern = toFiniteNumber(latestSignals.COST_PRESSURE_PATTERN?.valueNumber);
  const financialDiscipline = toFiniteNumber(latestSignals.FINANCIAL_DISCIPLINE?.valueNumber);

  const fallbackRiskLevel = summary.actionNeeded > 0 ? 'ACTION_NEEDED' : summary.monitor > 0 ? 'MONITOR' : 'GOOD';
  const fallbackCostPressure = summary.actionNeeded >= Math.max(1, Math.round(summary.total * 0.25)) ? 'HIGH' : 'NORMAL';
  const fallbackMaintenance = summary.actionNeeded > summary.good ? 'NEEDS_ATTENTION' : 'ON_TRACK';

  result.signalSummary = {
    riskLevel: riskSpike === null
      ? fallbackRiskLevel
      : Math.max(riskSpike, riskAccumulation ?? 0) >= 0.8 ? 'HIGH'
        : Math.max(riskSpike, riskAccumulation ?? 0) >= 0.55 ? 'MODERATE'
          : 'LOW',
    costPressure: costAnomaly === null
      ? fallbackCostPressure
      : Math.max(costAnomaly, costPressurePattern ?? 0) >= 0.8 ? 'HIGH'
        : Math.max(costAnomaly, costPressurePattern ?? 0) >= 0.55 ? 'ELEVATED'
          : 'LOW',
    maintenanceStatus: maintenanceAdherence === null
      ? fallbackMaintenance
      : maintenanceAdherence >= 0.8 ? 'ON_TRACK'
        : maintenanceAdherence >= 0.55 ? 'WATCH'
          : 'NEEDS_ATTENTION',
    stabilityMomentum:
      financialDiscipline === null
        ? 'UNKNOWN'
        : financialDiscipline >= 0.75
          ? 'STRONG'
          : financialDiscipline >= 0.55
            ? 'EMERGING'
            : 'LOW',
    signalBacked: {
      riskLevel: riskSpike !== null,
      costPressure: costAnomaly !== null,
      maintenanceStatus: maintenanceAdherence !== null,
    },
    interactions: interactionContext.interactions,
  };

  // Home Operations Slice 7: Status Board no longer runs its own local
  // "what's most important" computation (previously buildStatusBoardDecision
  // Candidates + runDecisionEngine, producing a decisionSummary the frontend
  // never even read — confirmed dead code, removed outright). Priority is
  // Home's decision now; Status Board only reports condition.

  return result;
}

// ---------------------------------------------------------------------------
// patchItemStatus
// ---------------------------------------------------------------------------

export async function patchItemStatus(
  homeItemId: string,
  propertyId: string,
  userId: string,
  payload: PatchItemStatusBody
) {
  // Verify ownership
  const homeItem = await prisma.homeItem.findFirst({
    where: { id: homeItemId, propertyId },
    include: { status: true },
  });

  if (!homeItem) {
    throw new APIError('Home item not found', 404, 'NOT_FOUND');
  }

  if (!homeItem.status) {
    throw new APIError('Home item status not found', 404, 'NOT_FOUND');
  }

  const statusUpdate: any = {};
  const events: any[] = [];

  if (payload.overrideCondition !== undefined) {
    statusUpdate.overrideCondition = payload.overrideCondition;
    events.push({
      homeItemId,
      actorUserId: userId,
      eventType: 'USER_OVERRIDE',
      payloadJson: { field: 'condition', value: payload.overrideCondition },
    });
  }

  if (payload.overrideRecommendation !== undefined) {
    statusUpdate.overrideRecommendation = payload.overrideRecommendation;
    events.push({
      homeItemId,
      actorUserId: userId,
      eventType: 'USER_OVERRIDE',
      payloadJson: { field: 'recommendation', value: payload.overrideRecommendation },
    });
  }

  if (payload.overridePurchaseDate !== undefined) {
    statusUpdate.overridePurchaseDate = payload.overridePurchaseDate
      ? new Date(payload.overridePurchaseDate)
      : null;
  }

  if (payload.overrideInstalledAt !== undefined) {
    statusUpdate.overrideInstalledAt = payload.overrideInstalledAt
      ? new Date(payload.overrideInstalledAt)
      : null;
  }

  if (payload.overrideNotes !== undefined) {
    statusUpdate.overrideNotes = payload.overrideNotes;
  }

  if (payload.isPinned !== undefined) {
    statusUpdate.isPinned = payload.isPinned;
    events.push({
      homeItemId,
      actorUserId: userId,
      eventType: payload.isPinned ? 'PIN' : 'UNPIN',
      payloadJson: {},
    });
  }

  if (payload.isHidden !== undefined) {
    statusUpdate.isHidden = payload.isHidden;
    events.push({
      homeItemId,
      actorUserId: userId,
      eventType: payload.isHidden ? 'HIDE' : 'UNHIDE',
      payloadJson: {},
    });
  }

  const ops: any[] = [];

  if (Object.keys(statusUpdate).length > 0) {
    ops.push(
      prisma.homeItemStatus.update({
        where: { id: homeItem.status.id },
        data: statusUpdate,
      })
    );
  }

  for (const evt of events) {
    ops.push(prisma.homeItemStatusEvent.create({ data: evt }));
  }

  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }

  // Return updated status
  const updated = await prisma.homeItemStatus.findUnique({
    where: { id: homeItem.status.id },
  });

  return updated;
}
