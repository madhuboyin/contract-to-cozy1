import { prisma } from '../lib/prisma';
import { RISK_ASSET_CONFIG } from '../config/risk-constants';
import { APIError } from '../middleware/error.middleware';
import { HomeItemCondition, HomeItemRecommendation, Prisma } from '@prisma/client';
import { ListBoardQuery, PatchItemStatusBody } from '../validators/homeStatusBoard.validators';

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

async function ensureHomeAssetsFromRiskReport(propertyId: string): Promise<void> {
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
    if (!systemType || systemType.startsWith('MAJOR_APPLIANCE_')) continue;

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
  const existing = await prisma.homeAsset.findMany({
    where: {
      propertyId,
      assetType: { in: systemTypes },
    },
    select: { assetType: true },
  });
  const existingTypes = new Set(existing.map((row) => row.assetType));
  const missingTypes = systemTypes.filter((type) => !existingTypes.has(type));
  if (missingTypes.length === 0) return;

  const currentYear = new Date().getFullYear();
  await prisma.homeAsset.createMany({
    data: missingTypes.map((assetType) => {
      const ageYears = candidates.get(assetType) ?? null;
      let installationYear: number | null = null;
      if (ageYears != null) {
        const inferredYear = currentYear - Math.round(ageYears);
        if (inferredYear >= 1900 && inferredYear <= currentYear) {
          installationYear = inferredYear;
        }
      }
      return { propertyId, assetType, installationYear };
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
  item: { id: string; inventoryItemId: string | null; homeAssetId: string | null; roomId: string | null },
  propertyId: string
) {
  const base = `/dashboard/properties/${propertyId}`;
  const links: Record<string, string> = {};

  if (item.inventoryItemId) {
    const itemParams = new URLSearchParams({
      openItemId: item.inventoryItemId,
      scrollToItemId: item.inventoryItemId,
      from: 'status-board',
    });
    links.viewItem = `${base}/inventory?${itemParams.toString()}`;
    links.replaceRepair = `${base}/inventory/items/${item.inventoryItemId}/replace-repair`;
  }
  if (item.homeAssetId) {
    links.viewAsset = `${base}/systems/${item.homeAssetId}`;
  }
  if (item.roomId) {
    links.viewRoom = `${base}/rooms/${item.roomId}?from=status-board`;
  }
  links.riskAssessment = `${base}/risk`;
  links.maintenance = `/dashboard/maintenance?propertyId=${propertyId}&from=status-board`;
  links.warranty = `/dashboard/warranties?propertyId=${propertyId}&from=status-board`;

  return links;
}

const CONDITION_SEVERITY: Record<string, number> = {
  ACTION_NEEDED: 0,
  MONITOR: 1,
  GOOD: 2,
};

// ---------------------------------------------------------------------------
// ensureHomeItems
// ---------------------------------------------------------------------------

export async function ensureHomeItems(propertyId: string): Promise<void> {
  // Risk report can contain SYSTEMS/SAFETY/STRUCTURE assets not yet persisted as home assets.
  // Sync these first so status board can include them.
  await ensureHomeAssetsFromRiskReport(propertyId);

  // Fetch inventory items and home assets
  const [inventoryItems, homeAssets, existingHomeItems] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { propertyId },
      select: { id: true, name: true, category: true, roomId: true, homeAssetId: true },
    }),
    prisma.homeAsset.findMany({
      where: { propertyId },
      select: { id: true, assetType: true },
    }),
    prisma.homeItem.findMany({
      where: { propertyId },
      select: { id: true, inventoryItemId: true, homeAssetId: true, categoryKey: true, roomId: true },
    }),
  ]);

  const inventoryById = new Map(inventoryItems.map((ii) => [ii.id, ii]));
  const homeAssetById = new Map(homeAssets.map((ha) => [ha.id, ha]));

  const existingInvIds = new Set(existingHomeItems.map((h) => h.inventoryItemId).filter(Boolean));
  const existingAssetIds = new Set(existingHomeItems.map((h) => h.homeAssetId).filter(Boolean));

  const creates: any[] = [];

  // Upsert for each inventory item not yet tracked
  for (const ii of inventoryItems) {
    if (existingInvIds.has(ii.id)) continue;
    creates.push(
      prisma.homeItem.create({
        data: {
          propertyId,
          kind: 'INVENTORY_ITEM',
          inventoryItemId: ii.id,
          roomId: ii.roomId,
          categoryKey: deriveStatusBoardCategory(homeAssetById.get(ii.homeAssetId ?? '')?.assetType, ii.category),
          status: {
            create: {},
          },
        },
      })
    );
  }

  // Upsert for each home asset not yet tracked.
  // Keep HOME_ASSET rows even when an inventory item links to the same asset so
  // SYSTEMS / SAFETY / STRUCTURE entries are visible in Status Board.
  for (const ha of homeAssets) {
    if (existingAssetIds.has(ha.id)) continue;
    creates.push(
      prisma.homeItem.create({
        data: {
          propertyId,
          kind: 'HOME_ASSET',
          homeAssetId: ha.id,
          categoryKey: deriveStatusBoardCategory(ha.assetType, null),
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
      const desiredCategory = deriveStatusBoardCategory(homeAssetById.get(ii.homeAssetId ?? '')?.assetType, ii.category);
      const desiredRoomId = ii.roomId ?? null;
      if (existing.categoryKey !== desiredCategory || (existing.roomId ?? null) !== desiredRoomId) {
        updates.push(
          prisma.homeItem.update({
            where: { id: existing.id },
            data: { categoryKey: desiredCategory, roomId: desiredRoomId },
          })
        );
      }
      continue;
    }

    if (existing.homeAssetId) {
      const ha = homeAssetById.get(existing.homeAssetId);
      if (!ha) continue;
      const desiredCategory = deriveStatusBoardCategory(ha.assetType, null);
      if (existing.categoryKey !== desiredCategory) {
        updates.push(
          prisma.homeItem.update({
            where: { id: existing.id },
            data: { categoryKey: desiredCategory },
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
          homeAsset: {
            include: {
              warranties: { select: { expiryDate: true } },
              maintenanceTasks: {
                where: { status: { not: 'COMPLETED' } },
                select: { id: true, priority: true, nextDueDate: true },
              },
            },
          },
        },
      },
      homeAsset: {
        include: {
          warranties: { select: { expiryDate: true } },
          maintenanceTasks: {
            where: { status: { not: 'COMPLETED' } },
            select: { id: true, priority: true, nextDueDate: true },
          },
        },
      },
    },
  });

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
      // Check linked home asset
      if (item.inventoryItem.homeAsset) {
        assetType = item.inventoryItem.homeAsset.assetType;
        allWarranties.push(...(item.inventoryItem.homeAsset.warranties || []));
        maintenanceTasks = item.inventoryItem.homeAsset.maintenanceTasks || [];
        if (!installDate && item.inventoryItem.homeAsset.installationYear) {
          installDate = new Date(item.inventoryItem.homeAsset.installationYear, 0, 1);
        }
      }
    } else if (item.homeAsset) {
      assetType = item.homeAsset.assetType;
      allWarranties = item.homeAsset.warranties || [];
      maintenanceTasks = item.homeAsset.maintenanceTasks || [];
      if (item.homeAsset.installationYear) {
        installDate = new Date(item.homeAsset.installationYear, 0, 1);
      }
    }

    // Use override dates if present
    if (item.status.overrideInstalledAt) installDate = item.status.overrideInstalledAt;

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

    // Only update if values changed
    const changed =
      item.status.computedCondition !== condition ||
      item.status.computedRecommendation !== recommendation ||
      JSON.stringify(item.status.computedReasonJson) !== JSON.stringify(reasons);

    if (changed) {
      updates.push(
        prisma.homeItemStatus.update({
          where: { id: item.status.id },
          data: {
            computedCondition: condition,
            computedRecommendation: recommendation,
            computedReasonJson: reasons,
            computedAt: now,
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

export async function listBoard(propertyId: string, query: ListBoardQuery) {
  // Keep board registry and category mappings synced on every load.
  await ensureHomeItems(propertyId);

  // Backfill check: if no computedAt in last 24h, recompute
  const recentStatus = await prisma.homeItemStatus.findFirst({
    where: {
      homeItem: { propertyId },
      computedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
  });

  if (!recentStatus) {
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
      { homeAsset: { assetType: { contains: q, mode: 'insensitive' } } },
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
        homeAsset: {
          select: {
            id: true,
            assetType: true,
            installationYear: true,
            warranties: { select: { id: true, expiryDate: true } },
          },
        },
        room: { select: { id: true, name: true } },
      },
    },
    homeAsset: {
      include: {
        warranties: { select: { id: true, expiryDate: true, providerName: true } },
        maintenanceTasks: {
          where: { status: { not: 'COMPLETED' as const } },
          select: { id: true },
        },
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
  const items = homeItems.map((item) => {
    const s = item.status;
    const effectiveCondition = s?.overrideCondition ?? s?.computedCondition ?? 'GOOD';
    const effectiveRecommendation = s?.overrideRecommendation ?? s?.computedRecommendation ?? 'OK';

    // Display name
    let displayName = item.displayName || '';
    if (!displayName && item.inventoryItem) displayName = item.inventoryItem.name;
    if (!displayName && item.homeAsset) displayName = item.homeAsset.assetType.replace(/_/g, ' ');

    // Category
    const category = item.categoryKey || 'OTHER';

    // Age
    let installDate: Date | null = s?.overrideInstalledAt ?? null;
    if (!installDate && item.inventoryItem) {
      installDate = item.inventoryItem.installedOn ?? item.inventoryItem.purchasedOn ?? null;
      if (!installDate && item.inventoryItem.homeAsset?.installationYear) {
        installDate = new Date(item.inventoryItem.homeAsset.installationYear, 0, 1);
      }
    }
    if (!installDate && item.homeAsset?.installationYear) {
      installDate = new Date(item.homeAsset.installationYear, 0, 1);
    }

    const ageYears = installDate
      ? Math.round((Date.now() - installDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000) * 10) / 10
      : null;

    // Warranty
    const allWarranties: { expiryDate?: Date | null }[] = [];
    if (item.inventoryItem?.warranty) allWarranties.push(item.inventoryItem.warranty);
    if (item.inventoryItem?.linkedWarranties) allWarranties.push(...item.inventoryItem.linkedWarranties);
    if (item.inventoryItem?.homeAsset?.warranties) allWarranties.push(...item.inventoryItem.homeAsset.warranties);
    if (item.homeAsset?.warranties) allWarranties.push(...item.homeAsset.warranties);

    const warrantyInfo = getWarrantyStatus(allWarranties);

    // Pending maintenance count
    const pendingMaintenance = item.homeAsset?.maintenanceTasks?.length ?? 0;

    // Room
    const room = item.inventoryItem?.room ?? null;

    const needsInstallDateForPrediction =
      !installDate && effectiveCondition === 'GOOD' && effectiveRecommendation === 'OK';

    return {
      id: item.id,
      kind: item.kind,
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
      deepLinks: buildDeepLinks(item, propertyId),
      inventoryItemId: item.inventoryItemId,
      homeAssetId: item.homeAssetId,
    };
  });

  // Sort: pinned first, then by condition severity, then alphabetical
  items.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const sa = CONDITION_SEVERITY[a.condition] ?? 2;
    const sb = CONDITION_SEVERITY[b.condition] ?? 2;
    if (sa !== sb) return sa - sb;
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
