import type { InventoryItem, InventoryRoom } from '@/types';
import { centsToDollars } from '@/lib/utils/format';

// The Coverage tab's numbers, kept apart from the component so they can be tested. A waived item ("This item doesn't
// need coverage") is left out of the covered percentage on both sides and shown as its own grey group instead.

export type CoverageStatus = 'missing' | 'incomplete' | 'confirmed' | 'excluded';

// Items at or above this value ask for a confirmation before coverage is waived (matches the item drawer).
export const HIGH_VALUE_WAIVE_THRESHOLD = 500;

export function getCoverageStatus(item: InventoryItem): CoverageStatus {
  if (item.coverageState === 'NOT_REQUIRED' || item.coverageState === 'MANAGED_ELSEWHERE') return 'excluded';
  if (item.coverageState === 'CONFIRMED') return 'confirmed';
  if (item.coverageState === 'MISSING') return 'missing';
  if (item.coverageState === 'INCOMPLETE') return 'incomplete';
  if (item.coverageNotRequired) return 'excluded';

  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);
  if (!hasWarranty && !hasInsurance) return 'incomplete';
  return 'confirmed';
}

// Waived means the homeowner said coverage is not needed; "managed elsewhere" is excluded too but is not a waiver.
export const isCoverageWaived = (item: InventoryItem) => Boolean(item.coverageNotRequired) || item.coverageState === 'NOT_REQUIRED';

export const itemValueUsd = (item: InventoryItem) => Number(centsToDollars(item.effectiveReplacementCostCents ?? item.replacementCostCents) || 0);

export type CoverageBreakdown = { confirmedValue: number; incompleteValue: number; missingValue: number; waivedValue: number; total: number; coveredPercent: number };

export function computeCoverageBreakdown(items: InventoryItem[]): CoverageBreakdown {
  let confirmedValue = 0;
  let incompleteValue = 0;
  let missingValue = 0;
  let waivedValue = 0;
  for (const item of items) {
    const value = itemValueUsd(item);
    if (value <= 0) continue;
    if (isCoverageWaived(item)) { waivedValue += value; continue; }
    const status = getCoverageStatus(item);
    if (status === 'confirmed') confirmedValue += value;
    else if (status === 'incomplete') incompleteValue += value;
    else if (status === 'missing') missingValue += value;
  }
  const assessableTotal = confirmedValue + missingValue;
  return {
    confirmedValue, incompleteValue, missingValue, waivedValue,
    total: confirmedValue + incompleteValue + missingValue + waivedValue,
    coveredPercent: assessableTotal > 0 ? (confirmedValue / assessableTotal) * 100 : 0,
  };
}

const GREEN = '#10b981';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const GREY = '#9ca3af';

// The donut's conic gradient: covered, incomplete, missing, then waived (grey).
export function donutGradient(breakdown: CoverageBreakdown): string {
  const total = Math.max(1, breakdown.total);
  const full = (breakdown.confirmedValue / total) * 100;
  const partial = (breakdown.incompleteValue / total) * 100;
  const uncovered = (breakdown.missingValue / total) * 100;
  const waived = (breakdown.waivedValue / total) * 100;
  const a = full;
  const b = a + partial;
  const c = b + uncovered;
  const d = c + waived;
  return `conic-gradient(${GREEN} 0% ${a}%, ${AMBER} ${a}% ${b}%, ${RED} ${b}% ${c}%, ${GREY} ${c}% ${d}%)`;
}

export type RoomCoverage = { id: string; name: string; coverageRate: number | null; allWaived: boolean; itemCount: number };

// Coverage by room. A room whose recorded items are all waived is marked so it can show "—" instead of 0%, which would
// read as uncovered.
export function computeRoomCoverage(items: InventoryItem[], rooms: InventoryRoom[]): RoomCoverage[] {
  const locations = [
    ...rooms.map((room) => ({ id: room.id, name: room.name, match: (item: InventoryItem) => item.roomId === room.id })),
    { id: 'whole-home', name: 'Whole home', match: (item: InventoryItem) => !item.roomId && item.recordGroup === 'SYSTEMS_STRUCTURE' },
  ];
  return locations.map((location) => {
    const inLocation = items.filter((item) => location.match(item) && itemValueUsd(item) > 0);
    const waived = inLocation.filter(isCoverageWaived);
    const assessed = inLocation.filter((item) => !isCoverageWaived(item) && ['confirmed', 'missing'].includes(getCoverageStatus(item)));
    const totalValue = assessed.reduce((sum, item) => sum + itemValueUsd(item), 0);
    const coveredValue = assessed.filter((item) => getCoverageStatus(item) === 'confirmed').reduce((sum, item) => sum + itemValueUsd(item), 0);
    const counted = inLocation.filter((item) => isCoverageWaived(item) || getCoverageStatus(item) !== 'excluded');
    return {
      id: location.id,
      name: location.name,
      coverageRate: totalValue > 0 ? Math.round((coveredValue / totalValue) * 100) : null,
      allWaived: counted.length > 0 && waived.length === counted.length,
      itemCount: counted.length,
    };
  }).filter((location) => location.itemCount > 0);
}

// Bulk "mark as not needed" for the filtered coverage items. Only items still open (missing or incomplete coverage,
// not already waived) are candidates, and an item worth the high-value threshold or more is held back so it is only
// ever waived one at a time, with the question the item drawer and the Coverage tab ask.
export type BulkWaivePlan = { eligible: InventoryItem[]; heldBack: InventoryItem[]; eligibleValue: number };

export function planBulkWaive(items: InventoryItem[]): BulkWaivePlan {
  const open = items.filter((item) => !isCoverageWaived(item) && (item.coverageState === 'MISSING' || item.coverageState === 'INCOMPLETE'));
  const eligible = open.filter((item) => itemValueUsd(item) < HIGH_VALUE_WAIVE_THRESHOLD);
  const heldBack = open.filter((item) => itemValueUsd(item) >= HIGH_VALUE_WAIVE_THRESHOLD);
  return { eligible, heldBack, eligibleValue: eligible.reduce((sum, item) => sum + itemValueUsd(item), 0) };
}
