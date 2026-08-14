import { getHomeAssetDisplayLabel } from '../../productFramework/homeAssetDisplay';

const STORED_IDENTIFIER = /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/;
const STORED_IDENTIFIER_GLOBAL = /\b[A-Z0-9]+(?:_[A-Z0-9]+)+\b/g;

function displayIdentifier(value: string): string {
  return getHomeAssetDisplayLabel({ assetType: value });
}

/** Keeps free-form instructions intact while removing internal risk/system identifiers. */
export function formatAskMaintenanceTitle(value: string | null | undefined): string {
  const title = value?.trim();
  if (!title) return 'Maintenance task';
  const legacyRiskTitle = title.match(/^(?:LOW|MEDIUM|HIGH|CRITICAL)\s+Risk:\s*(.+)$/i);
  if (legacyRiskTitle?.[1]) return displayIdentifier(legacyRiskTitle[1]);
  return STORED_IDENTIFIER.test(title) ? displayIdentifier(title) : title;
}

export function formatAskMaintenanceDescription(input: {
  title: string | null | undefined;
  description: string | null | undefined;
}): string | null {
  const description = input.description?.trim();
  if (!description) return null;
  if (/^add home warranty$/i.test(description)) {
    return `Review coverage options for ${formatAskMaintenanceTitle(input.title)}.`;
  }
  return description.replace(STORED_IDENTIFIER_GLOBAL, displayIdentifier);
}

export function formatAskMaintenanceScope(input: {
  inventoryItemName?: string | null;
  roomName?: string | null;
  category?: string | null;
  assetType?: string | null;
}): string {
  if (input.inventoryItemName?.trim()) {
    return getHomeAssetDisplayLabel({ name: input.inventoryItemName, assetType: input.assetType, category: input.category });
  }
  if (input.roomName?.trim()) return input.roomName.trim();
  return getHomeAssetDisplayLabel({ assetType: input.assetType, category: input.category });
}
