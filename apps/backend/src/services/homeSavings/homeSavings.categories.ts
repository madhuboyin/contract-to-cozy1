import { CategoryModule, HomeSavingsCategoryKey } from './types';
import { electricityGasCategory } from './categories/electricityGas';
import { insuranceHomeCategory } from './categories/insuranceHome';
import { internetCategory } from './categories/internet';
import { warrantyHomeCategory } from './categories/warrantyHome';

const CATEGORY_MODULES: CategoryModule[] = [
  insuranceHomeCategory,
  warrantyHomeCategory,
  internetCategory,
  electricityGasCategory,
];

const CATEGORY_MODULE_MAP = new Map<HomeSavingsCategoryKey, CategoryModule>(
  CATEGORY_MODULES.map((module) => [module.categoryKey, module])
);

export function getCategoryModule(categoryKey: HomeSavingsCategoryKey): CategoryModule {
  const module = CATEGORY_MODULE_MAP.get(categoryKey);
  if (!module) {
    throw new Error(`Unsupported Home Savings category: ${categoryKey}`);
  }

  return module;
}

export const ALL_HOME_SAVINGS_CATEGORY_MODULES = CATEGORY_MODULES;
