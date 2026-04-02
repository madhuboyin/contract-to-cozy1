export const inventoryItemIconMapping = {
  refrigerator: 'Refrigerator',
  washer_dryer: 'WashingMachine',
  water_softener: 'Droplets',
  water_heater: 'Thermometer',
  oven_range: 'Flame',
  furnace: 'Flame',
  microwave_hood: 'Thermometer',
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
