import { InventoryItemCategory } from '@prisma/client';

type PermitDisclosureRisk = 'LOW' | 'MEDIUM' | 'HIGH';
type PermitWorkType =
  | 'HVAC_NEW' | 'HVAC_REPLACEMENT' | 'ELECTRICAL_PANEL' | 'ELECTRICAL_WIRING'
  | 'PLUMBING_NEW' | 'PLUMBING_REPAIR' | 'ROOF_REPLACEMENT' | 'ROOF_REPAIR'
  | 'ROOM_ADDITION' | 'GARAGE_CONVERSION' | 'ADU' | 'BASEMENT_FINISH' | 'DECK_PATIO'
  | 'FENCE' | 'SWIMMING_POOL' | 'SOLAR' | 'WINDOWS_DOORS' | 'FIREPLACE'
  | 'SEWER_WATER_LINE' | 'STRUCTURAL_REPAIR' | 'INTERIOR_REMODEL' | 'EXTERIOR_REMODEL'
  | 'DEMOLITION' | 'GRADING_DRAINAGE' | 'OTHER';
type PermitUnpermittedFlagTrigger =
  | 'ASSET_CROSS_REFERENCE' | 'INVENTORY_CROSS_REFERENCE'
  | 'INSPECTION_REPORT_FINDING' | 'MANUAL';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const WINDOW_YEARS = 2;

const ASSET_TYPE_TO_WORK_TYPE: Record<string, PermitWorkType> = {
  HVAC_FURNACE: 'HVAC_REPLACEMENT',
  HVAC: 'HVAC_REPLACEMENT',
  FURNACE: 'HVAC_REPLACEMENT',
  HEAT_PUMP: 'HVAC_REPLACEMENT',
  HVAC_NEW: 'HVAC_NEW',
  AIR_CONDITIONER: 'HVAC_REPLACEMENT',
  WATER_HEATER: 'PLUMBING_REPAIR',
  ELECTRICAL_PANEL: 'ELECTRICAL_PANEL',
  ROOF: 'ROOF_REPLACEMENT',
  SOLAR: 'SOLAR',
  ADDITION: 'ROOM_ADDITION',
};

const INVENTORY_CATEGORY_TO_WORK_TYPE: Partial<Record<InventoryItemCategory, PermitWorkType>> = {
  HVAC: 'HVAC_REPLACEMENT',
  ELECTRICAL: 'ELECTRICAL_PANEL',
  PLUMBING: 'PLUMBING_NEW',
};

const DISCLOSURE_RISK: Record<PermitWorkType, PermitDisclosureRisk> = {
  ELECTRICAL_PANEL: 'HIGH',
  STRUCTURAL_REPAIR: 'HIGH',
  ADU: 'HIGH',
  ROOM_ADDITION: 'HIGH',
  HVAC_NEW: 'MEDIUM',
  HVAC_REPLACEMENT: 'MEDIUM',
  PLUMBING_NEW: 'MEDIUM',
  BASEMENT_FINISH: 'MEDIUM',
  GARAGE_CONVERSION: 'MEDIUM',
  ROOF_REPAIR: 'LOW',
  DECK_PATIO: 'LOW',
  FENCE: 'LOW',
  WINDOWS_DOORS: 'LOW',
  ELECTRICAL_WIRING: 'MEDIUM',
  PLUMBING_REPAIR: 'LOW',
  ROOF_REPLACEMENT: 'MEDIUM',
  SWIMMING_POOL: 'LOW',
  SOLAR: 'LOW',
  FIREPLACE: 'LOW',
  SEWER_WATER_LINE: 'MEDIUM',
  INTERIOR_REMODEL: 'LOW',
  EXTERIOR_REMODEL: 'LOW',
  DEMOLITION: 'MEDIUM',
  GRADING_DRAINAGE: 'LOW',
  OTHER: 'LOW',
};

interface WorkCandidate {
  workType: PermitWorkType;
  installYear: number;
  triggerType: PermitUnpermittedFlagTrigger;
  flagReason: string;
  homeAssetId?: string;
  inventoryItemId?: string;
}

export class PermitDetectionService {
  async detectUnpermittedWork(propertyId: string): Promise<number> {
    const [assets, inventoryItems, permits] = await Promise.all([
      prisma.homeAsset.findMany({
        where: { propertyId },
        select: { id: true, assetType: true, installationYear: true },
      }),
      prisma.inventoryItem.findMany({
        where: {
          propertyId,
          installedOn: { not: null },
          category: { in: ['HVAC', 'ELECTRICAL', 'PLUMBING'] },
        },
        select: { id: true, category: true, installedOn: true, name: true },
      }),
      prisma.propertyPermitRecord.findMany({
        where: { propertyId, isActive: true },
        select: { workTypes: true, issueDate: true },
      }),
    ]);

    // Build coverage map: workType → Set of covered years
    const coverage = new Map<PermitWorkType, Set<number>>();
    for (const permit of permits) {
      if (!permit.issueDate) continue;
      const year = new Date(permit.issueDate).getFullYear();
      for (const wt of permit.workTypes as PermitWorkType[]) {
        if (!coverage.has(wt)) coverage.set(wt, new Set());
        coverage.get(wt)!.add(year);
      }
    }

    const candidates: WorkCandidate[] = [];

    // Step 1 — HomeAsset cross-reference
    for (const asset of assets) {
      if (!asset.installationYear) continue;
      const workType = ASSET_TYPE_TO_WORK_TYPE[asset.assetType.toUpperCase()];
      if (!workType) continue;

      candidates.push({
        workType,
        installYear: asset.installationYear,
        triggerType: 'ASSET_CROSS_REFERENCE',
        flagReason: `${asset.assetType} installed ~${asset.installationYear} per inventory; no matching permit found within ±${WINDOW_YEARS} years`,
        homeAssetId: asset.id,
      });
    }

    // Step 2 — InventoryItem cross-reference
    for (const item of inventoryItems) {
      if (!item.installedOn) continue;
      const installYear = new Date(item.installedOn).getFullYear();
      const workType = INVENTORY_CATEGORY_TO_WORK_TYPE[item.category as InventoryItemCategory];
      if (!workType) continue;

      candidates.push({
        workType,
        installYear,
        triggerType: 'INVENTORY_CROSS_REFERENCE',
        flagReason: `${item.name} (${item.category}) installed ~${installYear} per inventory; no matching permit found within ±${WINDOW_YEARS} years`,
        inventoryItemId: item.id,
      });
    }

    // Step 3 — filter candidates that have no permit coverage
    const flagsToCreate = candidates.filter((c) => {
      const covered = coverage.get(c.workType);
      if (!covered) return true;
      for (let y = c.installYear - WINDOW_YEARS; y <= c.installYear + WINDOW_YEARS; y++) {
        if (covered.has(y)) return false;
      }
      return true;
    });

    // Step 4 — create flags, skip duplicates
    let created = 0;
    for (const candidate of flagsToCreate) {
      const triggerSource = candidate.homeAssetId
        ? `asset:${candidate.homeAssetId}`
        : `inventory:${candidate.inventoryItemId}`;
      const dedupeKey = `${propertyId}:${candidate.workType}:${triggerSource}`;

      try {
        await prisma.permitUnpermittedFlag.upsert({
          where: { dedupeKey },
          create: {
            propertyId,
            workType: candidate.workType,
            triggerType: candidate.triggerType,
            flagReason: candidate.flagReason,
            status: 'FLAGGED',
            disclosureRisk: DISCLOSURE_RISK[candidate.workType] ?? 'LOW',
            homeAssetId: candidate.homeAssetId,
            inventoryItemId: candidate.inventoryItemId,
            dedupeKey,
          },
          update: {},
        });
        created++;
      } catch (err) {
        logger.warn({ err, dedupeKey }, '[PermitDetectionService] flag upsert skipped');
      }
    }

    // Emit high-risk HomeEvent if any HIGH flags were created
    if (created > 0) {
      const highFlags = await prisma.permitUnpermittedFlag.count({
        where: { propertyId, disclosureRisk: 'HIGH', status: { in: ['FLAGGED', 'INVESTIGATING'] } },
      });
      if (highFlags > 0) {
        await prisma.homeEvent.create({
          data: {
            propertyId,
            title: 'Potential unpermitted work detected',
            summary: `${highFlags} high-risk item(s) flagged — review your permit tracker`,
            type: 'NOTE',
            importance: 'HIGH',
            visibility: 'PRIVATE',
            occurredAt: new Date(),
          },
        }).catch((err) => logger.warn({ err }, '[PermitDetectionService] homeEvent create failed'));
      }
    }

    return created;
  }

  async getFlagSummary(propertyId: string) {
    const counts = await prisma.permitUnpermittedFlag.groupBy({
      by: ['disclosureRisk'],
      where: { propertyId, status: { in: ['FLAGGED', 'INVESTIGATING'] } },
      _count: { id: true },
    });

    const summary = { total: 0, high: 0, medium: 0, low: 0 };
    for (const row of counts) {
      const n = row._count.id;
      summary.total += n;
      if (row.disclosureRisk === 'HIGH') summary.high += n;
      else if (row.disclosureRisk === 'MEDIUM') summary.medium += n;
      else summary.low += n;
    }
    return summary;
  }
}

export const permitDetectionService = new PermitDetectionService();
