// Leaf module (no handler imports) so every handler can offer inventory next steps that stay inside Ask instead of
// linking out to the desktop inventory page.

// Must equal INVENTORY_ADD_MESSAGE in askFocusedGuidance.ts (pinned by test): the create handler recognises the
// declared launch by this message plus operationId INVENTORY_ITEM_CREATE.
export const INVENTORY_ADD_MESSAGE = 'Add an item to my home inventory.';

export const inventoryAddItemAction = () => ({ id: 'add-inventory-item', label: 'Add an item', interactionType: 'START_WORKFLOW' as const, message: INVENTORY_ADD_MESSAGE, operationId: 'INVENTORY_ITEM_CREATE', style: 'PRIMARY' as const });

// Opens one item's record inline. The lookup resolves the item by exact name, the same way the other item actions do.
export const inventoryViewItemAction = (name: string, style: 'PRIMARY' | 'SECONDARY' = 'PRIMARY') => ({
  id: 'view-inventory-item', label: 'View this item', interactionType: 'START_WORKFLOW' as const,
  message: `Show inventory item "${name}"`, operationId: 'INVENTORY_LOOKUP', style,
});

export const inventoryShowAllAction = (style: 'PRIMARY' | 'SECONDARY' = 'PRIMARY') => ({
  id: 'show-inventory', label: 'Show my home inventory', interactionType: 'START_WORKFLOW' as const,
  message: 'Show my home inventory', operationId: 'INVENTORY_LOOKUP', style,
});
