import { ServiceCategory } from '@prisma/client';

/**
 * Maps inventory categories to service marketplace categories.
 * Default fallback routes physical assets to HANDYMAN.
 */
export function mapInventoryToServiceCategory(inventoryCategory: string): ServiceCategory {
  const normalized = String(inventoryCategory || '').trim().toUpperCase();

  if (normalized === 'HVAC') return ServiceCategory.HVAC;

  if (normalized === 'PLUMBING' || normalized === 'WATER_HEATER') {
    return ServiceCategory.PLUMBING;
  }

  if (normalized === 'ELECTRICAL') return ServiceCategory.ELECTRICAL;

  return ServiceCategory.HANDYMAN;
}
