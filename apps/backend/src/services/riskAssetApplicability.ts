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

export function visibleInventoryItemWhere() {
  return {
    AND: [{
      OR: [
        { assetType: null },
        { assetType: { notIn: [...NON_INVENTORY_RISK_ASSET_TYPES] } },
      ],
    }],
  };
}
