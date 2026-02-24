import type { InventoryRoom } from '@/types';
import { titleCase } from '@/lib/utils/string';

export const MANAGE_ROOM_TYPE_VALUES = [
  'KITCHEN',
  'BEDROOM',
  'BATHROOM',
  'LIVING_ROOM',
  'LAUNDRY',
  'OFFICE',
  'GARAGE',
  'DINING',
  'BASEMENT',
  'OTHER',
] as const;

export type ManageRoomType = (typeof MANAGE_ROOM_TYPE_VALUES)[number];

export type ManageRoom = InventoryRoom & {
  type?: string | null;
  itemCount: number;
};

const ROOM_TYPE_LABEL_OVERRIDES: Record<string, string> = {
  DINING: 'Dining Room',
};

export function getRoomTypeLabel(type: string): string {
  const normalized = String(type || '').toUpperCase();
  return ROOM_TYPE_LABEL_OVERRIDES[normalized] ?? titleCase(normalized);
}
