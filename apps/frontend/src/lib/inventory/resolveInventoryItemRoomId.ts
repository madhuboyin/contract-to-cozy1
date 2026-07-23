export function resolveInventoryItemRoomId(
  itemRoomId?: string | null,
  initialRoomId?: string | null,
): string {
  return itemRoomId || initialRoomId || '';
}
