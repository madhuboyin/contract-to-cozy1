export const inventoryItemIconMapping = {
  refrigerator: 'Refrigerator',
  washer_dryer: 'WashingMachine',
  water_softener: 'Droplets',
  oven_range: 'Flame',
  microwave_hood: 'Wind',
  dishwasher: 'Utensils',
  tv: 'Tv',
  desk: 'Monitor',
  mirror: 'Square',
  bed: 'BedDouble',
  computer_desk: 'Monitor',
  sofa: 'Sofa',
  hood: 'Wind',
} as const;

export type InventoryItemIconKey = keyof typeof inventoryItemIconMapping;
export type InventoryItemIconName = (typeof inventoryItemIconMapping)[InventoryItemIconKey];
