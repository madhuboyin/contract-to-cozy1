// apps/frontend/src/components/features/financing/FinancingUtils.ts
import type { FinancingOptionType, MortgageType } from '@/types';

export function usd(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function pct(bps: number | null | undefined, decimals = 2): string {
  if (bps == null) return '—';
  return `${(bps / 100).toFixed(decimals)}%`;
}

export function rateLabel(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function daysSince(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}

export const OPTION_LABELS: Record<FinancingOptionType, string> = {
  HELOC: 'HELOC',
  HOME_EQUITY_LOAN: 'Home Equity Loan',
  PERSONAL_LOAN: 'Personal Loan',
  CONTRACTOR_FINANCING: 'Contractor Financing',
  PAY_CASH: 'Pay Cash',
};

export const MORTGAGE_TYPE_LABELS: Record<MortgageType, string> = {
  FIXED_30: '30-Year Fixed',
  FIXED_15: '15-Year Fixed',
  FIXED_20: '20-Year Fixed',
  ARM_5: '5/1 ARM',
  ARM_7: '7/1 ARM',
  OTHER: 'Other',
};
