'use client';
// apps/frontend/src/components/features/financing/OptionComparisonTable.tsx
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { FinancingResultSet, FinancingOptionType } from '@/types';
import { usd, rateLabel } from './FinancingUtils';

interface OptionComparisonTableProps {
  results: FinancingResultSet;
  selectedOption?: FinancingOptionType;
  onSelect?: (option: FinancingOptionType) => void;
}

function Row({
  option,
  label,
  monthly,
  total,
  notes,
  warning,
  selected,
  onSelect,
  disabled,
}: {
  option: FinancingOptionType;
  label: string;
  monthly: React.ReactNode;
  total: React.ReactNode;
  notes?: React.ReactNode;
  warning?: string;
  selected?: boolean;
  onSelect?: (o: FinancingOptionType) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        selected
          ? 'border-emerald-400 bg-emerald-50/80 shadow-sm dark:border-emerald-600 dark:bg-emerald-950/30'
          : disabled
            ? 'border-slate-200/60 bg-slate-50/40 opacity-60 dark:border-slate-700/40'
            : 'border-slate-200/80 bg-white/70 dark:border-slate-700/60 dark:bg-slate-900/40'
      } ${onSelect && !disabled ? 'cursor-pointer hover:border-emerald-300' : ''}`}
      onClick={() => !disabled && onSelect?.(option)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
          {notes && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{notes}</p>
          )}
          {warning && (
            <div className="mt-2 flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                {warning}
              </p>
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{monthly}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Total: {total}</p>
        </div>
      </div>
    </div>
  );
}

export default function OptionComparisonTable({
  results,
  selectedOption,
  onSelect,
}: OptionComparisonTableProps) {
  const { heloc, homeEquityLoan, personalLoan, contractorFinancing, payCash } = results;

  const minRateScenarios = personalLoan.scenarios.filter(
    (s) => s.rateBps === Math.min(...personalLoan.scenarios.map((x) => x.rateBps)),
  );
  const pl3yr = minRateScenarios.find((s) => s.termYears === 3);
  const pl5yr = minRateScenarios.find((s) => s.termYears === 5);

  return (
    <div className="space-y-2">
      {/* HELOC */}
      <Row
        option="HELOC"
        label="HELOC"
        monthly={
          <span>
            {usd(heloc.drawMonthlyPaymentCents)}/mo{' '}
            <span className="font-normal text-slate-500">draw</span>
          </span>
        }
        total={usd(heloc.totalCostCents)}
        notes={`${rateLabel(heloc.rateBps)} rate · Draw 10yr (interest-only), Repay ${usd(heloc.repaymentMonthlyPaymentCents)}/mo`}
        selected={selectedOption === 'HELOC'}
        onSelect={onSelect}
        disabled={!results.helocEligible}
      />

      {/* Home Equity Loan */}
      <Row
        option="HOME_EQUITY_LOAN"
        label="Home Equity Loan"
        monthly={<span>{usd(homeEquityLoan.monthlyPaymentCents)}/mo</span>}
        total={usd(homeEquityLoan.monthlyPaymentCents * 120)}
        notes={`${rateLabel(homeEquityLoan.rateBps)} fixed · ${homeEquityLoan.termYears}-year term`}
        selected={selectedOption === 'HOME_EQUITY_LOAN'}
        onSelect={onSelect}
        disabled={!results.helocEligible}
      />

      {/* Personal Loan */}
      <Row
        option="PERSONAL_LOAN"
        label="Personal Loan"
        monthly={
          pl3yr ? (
            <span>
              {usd(pl3yr.monthlyPaymentCents)}/mo <span className="font-normal text-slate-500">(3yr)</span>
            </span>
          ) : '—'
        }
        total={
          pl3yr && pl5yr
            ? `${usd(pl3yr.monthlyPaymentCents * 36)} – ${usd(pl5yr.monthlyPaymentCents * 60)}`
            : '—'
        }
        notes={
          pl3yr && pl5yr
            ? `${rateLabel(pl3yr.rateBps)} – ${rateLabel(Math.max(...personalLoan.scenarios.map((s) => s.rateBps)))} · ${usd(pl5yr.monthlyPaymentCents)}/mo (5yr)`
            : undefined
        }
        selected={selectedOption === 'PERSONAL_LOAN'}
        onSelect={onSelect}
      />

      {/* Contractor Financing */}
      <Row
        option="CONTRACTOR_FINANCING"
        label="Contractor Financing"
        monthly={
          <span>
            $0 <span className="font-normal text-slate-500">({contractorFinancing.promoMonths}mo promo)</span>
          </span>
        }
        total="$0 if paid in full"
        notes={`${usd(contractorFinancing.promoMonthlyIfPaidInFullCents)}/mo to pay in full by deadline`}
        warning={contractorFinancing.warningText}
        selected={selectedOption === 'CONTRACTOR_FINANCING'}
        onSelect={onSelect}
      />

      {/* Pay Cash */}
      <Row
        option="PAY_CASH"
        label="Pay Cash"
        monthly={<span className="text-slate-500">No payments</span>}
        total="$0 in interest"
        notes={`Opportunity cost: ~${usd(payCash.opportunityCostFiveYearCents)} over 5yr at ${rateLabel(payCash.opportunityCostRateBps)}`}
        selected={selectedOption === 'PAY_CASH'}
        onSelect={onSelect}
      />

      {!results.helocEligible && (
        <p className="text-center text-[11px] text-slate-400">
          HELOC and Home Equity Loan require ≥ 20% equity and LTV ≤ 85%
        </p>
      )}
    </div>
  );
}
