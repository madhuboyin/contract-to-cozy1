import { z } from 'zod';

export const PROPERTY_COMPONENT_KIND_REGISTRY = Object.freeze({
  ROOF: { label: 'Roof' },
  FOUNDATION: { label: 'Foundation' },
  EXTERIOR: { label: 'Exterior' },
  INTERIOR: { label: 'Interior' },
  SITE: { label: 'Site' },
} as const);

export const ASSET_KIND_REGISTRY = Object.freeze({
  HVAC_FURNACE: { category: 'HVAC' },
  HVAC_HEAT_PUMP: { category: 'HVAC' },
  WATER_HEATER_TANK: { category: 'PLUMBING' },
  WATER_HEATER_TANKLESS: { category: 'PLUMBING' },
  ELECTRICAL_PANEL_MODERN: { category: 'ELECTRICAL' },
  ELECTRICAL_PANEL_OLD: { category: 'ELECTRICAL' },
  ROOF_SHINGLE: { category: 'ROOF_EXTERIOR' },
  ROOF_TILE_METAL: { category: 'ROOF_EXTERIOR' },
  FOUNDATION_CONCRETE_SLAB: { category: 'STRUCTURAL' },
  MAJOR_APPLIANCE_FRIDGE: { category: 'APPLIANCE' },
  MAJOR_APPLIANCE_DISHWASHER: { category: 'APPLIANCE' },
  SAFETY_SMOKE_CO_DETECTORS: { category: 'SAFETY' },
} as const);

export const INVENTORY_ITEM_CATEGORIES = [
  'APPLIANCE',
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'ROOF_EXTERIOR',
  'SAFETY',
  'SMART_HOME',
  'FURNITURE',
  'ELECTRONICS',
  'OTHER',
  'INTERIOR',
  'STRUCTURAL',
  'EXTERIOR',
  'SITE',
] as const;

export const PropertyComponentKindSchema = z.enum(
  Object.keys(PROPERTY_COMPONENT_KIND_REGISTRY) as [PropertyComponentKind, ...PropertyComponentKind[]],
);
export const AssetKindSchema = z.enum(
  Object.keys(ASSET_KIND_REGISTRY) as [AssetKind, ...AssetKind[]],
);
export const InventoryItemCategorySchema = z.enum(INVENTORY_ITEM_CATEGORIES);

export type PropertyComponentKind = keyof typeof PROPERTY_COMPONENT_KIND_REGISTRY;
export type AssetKind = keyof typeof ASSET_KIND_REGISTRY;
export type InventoryItemCategory = typeof INVENTORY_ITEM_CATEGORIES[number];

export const EnvelopeEntityRefSchema = z.discriminatedUnion('entityType', [
  z.object({
    entityType: z.literal('PROPERTY'),
    entityId: z.string().trim().min(1),
    componentKind: PropertyComponentKindSchema.optional(),
  }).strict(),
  z.object({
    entityType: z.literal('INVENTORY_ITEM'),
    entityId: z.string().trim().min(1),
    assetCategory: InventoryItemCategorySchema,
    assetKind: AssetKindSchema.optional(),
  }).strict(),
  z.object({
    entityType: z.enum(['DOCUMENT', 'INCIDENT', 'SERVICE', 'DECISION_THREAD']),
    entityId: z.string().trim().min(1),
  }).strict(),
]).superRefine((value, ctx) => {
  if (
    value.entityType === 'INVENTORY_ITEM'
    && value.assetKind
    && ASSET_KIND_REGISTRY[value.assetKind].category !== value.assetCategory
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['assetKind'],
      message: `${value.assetKind} is not registered beneath ${value.assetCategory}`,
    });
  }
});

export type EnvelopeEntityRef = z.infer<typeof EnvelopeEntityRefSchema>;
export type EntityRefKey = string;

export function entityRefKey(entityRef: EnvelopeEntityRef): EntityRefKey {
  const qualifier = entityRef.entityType === 'PROPERTY'
    ? entityRef.componentKind
    : entityRef.entityType === 'INVENTORY_ITEM'
      ? entityRef.assetKind ?? entityRef.assetCategory
      : undefined;
  return [entityRef.entityType, entityRef.entityId, qualifier].filter(Boolean).join(':');
}
