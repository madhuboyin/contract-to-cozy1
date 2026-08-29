// apps/backend/src/services/agents/hvacSpecialistContextIntake.ts
//
// PR 11 wiring for the SUBMIT_CONTEXT intake seam declared in
// agentRuntime.service.ts. The Specialist never writes canonical records
// itself — it validates the homeowner's structured answers and delegates the
// persistence to the existing InventoryService.updateItem path, which already
// owns HVAC decision-thread staleness marking. Document asks
// (hvac.technicianAssessment) are NOT accepted here — they are surfaced as an
// `outstanding` item with a correction path and handled by the upload flow.

import { z } from 'zod';
import { InventoryService } from '../inventory.service';

const inventory = new InventoryService();

const CONDITION_VALUES = ['NEW', 'GOOD', 'FAIR', 'POOR', 'UNKNOWN'] as const;

const intakeSchema = z.object({
  'hvac.installDate': z.union([
    z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/),
    z.number().int().gte(1900).lte(2100),
  ]).optional(),
  'hvac.condition': z.enum(CONDITION_VALUES).optional(),
  'hvac.replacementCost': z.number().nonnegative().max(1_000_000).optional(),
}).strict();

function toInstalledOn(value: string | number): string {
  if (typeof value === 'number') return `${value}-01-01`;
  if (/^\d{4}$/.test(value)) return `${value}-01-01`;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  return value;
}

export async function applyHvacSpecialistContextIntake(input: {
  propertyId: string;
  principalUserId: string;
  inventoryItemId: string;
  intake: Readonly<Record<string, unknown>>;
}): Promise<void> {
  const parsed = intakeSchema.parse(input.intake);
  const patch: Record<string, unknown> = {};
  if (parsed['hvac.installDate'] !== undefined) patch.installedOn = toInstalledOn(parsed['hvac.installDate']);
  if (parsed['hvac.condition'] !== undefined) patch.condition = parsed['hvac.condition'];
  if (parsed['hvac.replacementCost'] !== undefined) patch.replacementCostCents = Math.round(parsed['hvac.replacementCost'] * 100);
  if (Object.keys(patch).length === 0) return;

  // updateItem authorizes by (propertyId, itemId) and marks dependent HVAC
  // decision threads stale on a fact correction — which is exactly what the
  // Specialist's resume then recomputes.
  await inventory.updateItem(input.propertyId, input.inventoryItemId, patch);
}
