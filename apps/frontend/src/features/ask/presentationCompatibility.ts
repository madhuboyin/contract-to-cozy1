import { formatCurrencyFromCents } from '@/lib/utils/format';
import humanizeActionType from '@/lib/utils/humanize';
import { formatMaintenanceTaskDescription, formatMaintenanceTaskTitle } from '@/lib/utils/maintenanceDisplay';

const STORED_IDENTIFIER_GLOBAL = /\b[A-Z0-9]+(?:_[A-Z0-9]+)+\b/g;
const LEGACY_CENT_AMOUNT = /\b(\d{1,15}) cents\b/g;

/** Keeps saved pre-fix Ask responses readable after a rolling deployment. */
export function formatLegacyAskCurrency(value: string | undefined): string | undefined {
  return value?.replace(LEGACY_CENT_AMOUNT, (_match, cents: string) => formatCurrencyFromCents(Number(cents)));
}

export function formatLegacyAskMaintenanceItem<T extends {
  title: string;
  description?: string | null;
  meta: string[];
}>(item: T): T {
  return {
    ...item,
    title: formatMaintenanceTaskTitle(item.title),
    description: formatMaintenanceTaskDescription({ title: item.title, description: item.description ?? null }),
    meta: item.meta.map((value) => value.replace(STORED_IDENTIFIER_GLOBAL, (identifier) => humanizeActionType(identifier))),
  };
}
