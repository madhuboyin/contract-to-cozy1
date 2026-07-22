import type { Prisma } from '@prisma/client';
import { RISK_ASSET_CONFIG } from '../config/risk-constants';

export const NON_INVENTORY_RISK_ASSET_TYPES = ['BASEMENT_FLOOD_RISK'] as const;

const configuredInventoryAssetTypes = new Set(
  RISK_ASSET_CONFIG.map((config) => config.systemType)
);

export function hasConfirmedBasement(
  foundationType: string | null | undefined
): boolean {
  return foundationType === 'BASEMENT';
}

export function isRiskReportInventoryAssetType(systemType: string): boolean {
  return configuredInventoryAssetTypes.has(systemType) &&
    !systemType.startsWith('MAJOR_APPLIANCE_');
}

export function visibleInventoryItemWhere(): Prisma.InventoryItemWhereInput {
  return {
    AND: [
      {
        OR: [
          { assetType: null },
          { assetType: { notIn: [...NON_INVENTORY_RISK_ASSET_TYPES] } },
        ],
      },
      { NOT: { tags: { has: 'INFERRED_NOT_PRESENT' } } },
    ],
  };
}
