export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '$0';
  if (value % 1 === 0) {
    return `$${value.toLocaleString()}`;
  }
  return `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function centsToDollars(cents: number | null | undefined): number | null {
  if (cents === null || cents === undefined) return null;
  return cents / 100;
}

export function formatCurrencyFromCents(cents: number | null | undefined): string {
  return formatCurrency(centsToDollars(cents));
}
