'use client';

import { useState } from 'react';
import { FileSpreadsheet, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  compareRefinanceLoanEstimates,
  type LoanEstimateMetric,
  type RefinanceLoanEstimateComparison,
  type RefinanceLoanEstimateInput,
} from './mortgageRefinanceRadarApi';

type OfferDraft = {
  id: string;
  lenderName: string;
  loanTermYears: string;
  loanType: RefinanceLoanEstimateInput['loanType'];
  noteRatePct: string;
  aprPct: string;
  monthlyPrincipalAndInterestUsd: string;
  loanCostsUsd: string;
  lenderCreditsUsd: string;
  cashToCloseUsd: string;
  fiveYearTotalPaidUsd: string;
  fiveYearPrincipalPaidUsd: string;
};

const METRIC_LABELS: Record<LoanEstimateMetric, string> = {
  APR: 'Lowest APR',
  MONTHLY_PRINCIPAL_AND_INTEREST: 'Lowest P&I',
  NET_LOAN_COSTS: 'Lowest net costs',
  CASH_TO_CLOSE: 'Lowest cash to close',
  FIVE_YEAR_BORROWING_COST: 'Lowest 5-year cost',
};

let nextOfferNumber = 3;

function blankOffer(number: number): OfferDraft {
  return {
    id: `offer-${number}`,
    lenderName: '',
    loanTermYears: '30',
    loanType: 'FIXED',
    noteRatePct: '',
    aprPct: '',
    monthlyPrincipalAndInterestUsd: '',
    loanCostsUsd: '',
    lenderCreditsUsd: '0',
    cashToCloseUsd: '',
    fiveYearTotalPaidUsd: '',
    fiveYearPrincipalPaidUsd: '',
  };
}

function currency(value: number | null): string {
  if (value == null) return 'Add page 3 values';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function numberValue(value: string, label: string): number {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed)) {
    throw new Error(`${label} is required for every offer.`);
  }
  return parsed;
}

function toInput(offer: OfferDraft): RefinanceLoanEstimateInput {
  const fiveYearTotal = offer.fiveYearTotalPaidUsd.trim();
  const fiveYearPrincipal = offer.fiveYearPrincipalPaidUsd.trim();
  if (Boolean(fiveYearTotal) !== Boolean(fiveYearPrincipal)) {
    throw new Error(
      `Enter both page 3 five-year values for ${offer.lenderName || 'each lender'}, or leave both blank.`,
    );
  }
  return {
    id: offer.id,
    lenderName: offer.lenderName.trim() || 'Unnamed lender',
    loanTermYears: numberValue(offer.loanTermYears, 'Loan term'),
    loanType: offer.loanType,
    noteRatePct: numberValue(offer.noteRatePct, 'Note rate'),
    aprPct: numberValue(offer.aprPct, 'APR'),
    monthlyPrincipalAndInterestUsd: numberValue(
      offer.monthlyPrincipalAndInterestUsd,
      'Monthly principal and interest',
    ),
    loanCostsUsd: numberValue(offer.loanCostsUsd, 'Loan costs'),
    lenderCreditsUsd: numberValue(offer.lenderCreditsUsd, 'Lender credits'),
    cashToCloseUsd: numberValue(offer.cashToCloseUsd, 'Cash to close'),
    ...(fiveYearTotal
      ? {
          fiveYearTotalPaidUsd: Number(fiveYearTotal),
          fiveYearPrincipalPaidUsd: Number(fiveYearPrincipal),
        }
      : {}),
  };
}

function OfferFields({
  offer,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  offer: OfferDraft;
  index: number;
  canRemove: boolean;
  onChange: (next: OfferDraft) => void;
  onRemove: () => void;
}) {
  const set = (field: keyof OfferDraft, value: string) =>
    onChange({ ...offer, [field]: value });
  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
  return (
    <fieldset className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-700/80">
      <legend className="px-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
        Offer {index + 1}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-slate-600 dark:text-slate-300">
          Lender label
          <input
            value={offer.lenderName}
            onChange={(event) => set('lenderName', event.target.value)}
            placeholder="e.g. Local credit union"
            className={inputClass}
          />
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-300">
          Loan type
          <select
            value={offer.loanType}
            onChange={(event) => set('loanType', event.target.value)}
            className={inputClass}
          >
            <option value="FIXED">Fixed</option>
            <option value="ARM">ARM</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-300">
          Term (years)
          <input
            type="number"
            min="5"
            max="50"
            value={offer.loanTermYears}
            onChange={(event) => set('loanTermYears', event.target.value)}
            className={inputClass}
          />
        </label>
        {[
          ['noteRatePct', 'Note rate (%)'],
          ['aprPct', 'APR (%)'],
          ['monthlyPrincipalAndInterestUsd', 'Monthly P&I ($)'],
          ['loanCostsUsd', 'Loan costs ($)'],
          ['lenderCreditsUsd', 'Lender credits ($)'],
          ['cashToCloseUsd', 'Cash to close ($)'],
          ['fiveYearTotalPaidUsd', 'In 5 years — total paid ($)'],
          ['fiveYearPrincipalPaidUsd', 'In 5 years — principal paid ($)'],
        ].map(([field, label]) => (
          <label
            key={field}
            className="text-xs text-slate-600 dark:text-slate-300"
          >
            {label}
            <input
              type="number"
              min="0"
              step={field.includes('Pct') ? '0.001' : '1'}
              value={offer[field as keyof OfferDraft]}
              onChange={(event) =>
                set(field as keyof OfferDraft, event.target.value)
              }
              className={inputClass}
            />
          </label>
        ))}
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Remove offer
        </button>
      )}
    </fieldset>
  );
}

export function LoanEstimateComparisonCard({
  propertyId,
}: {
  propertyId: string;
}) {
  const [offers, setOffers] = useState<OfferDraft[]>([
    blankOffer(1),
    blankOffer(2),
  ]);
  const [comparison, setComparison] =
    useState<RefinanceLoanEstimateComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function compare() {
    setRunning(true);
    setError(null);
    try {
      setComparison(
        await compareRefinanceLoanEstimates(propertyId, offers.map(toInput)),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Loan Estimates could not be compared.',
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/70 bg-white/75 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/60">
      <div className="space-y-4 p-5 sm:p-6">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <FileSpreadsheet
              className="h-4 w-4 text-blue-600"
              aria-hidden="true"
            />
            Compare official Loan Estimates
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Copy the same fields from each lender&apos;s standardized form. Values
            stay in this comparison and are not saved.
          </p>
        </div>

        {offers.map((offer, index) => (
          <OfferFields
            key={offer.id}
            offer={offer}
            index={index}
            canRemove={offers.length > 2}
            onChange={(next) =>
              setOffers((current) =>
                current.map((item) => (item.id === offer.id ? next : item)),
              )
            }
            onRemove={() =>
              setOffers((current) =>
                current.filter((item) => item.id !== offer.id),
              )
            }
          />
        ))}

        <div className="flex flex-wrap gap-2">
          {offers.length < 4 && (
            <button
              type="button"
              onClick={() =>
                setOffers((current) => [
                  ...current,
                  blankOffer(nextOfferNumber++),
                ])
              }
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add offer
            </button>
          )}
          <button
            type="button"
            onClick={compare}
            disabled={running}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {running && (
              <RefreshCw
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            )}
            Compare offers
          </button>
        </div>

        {error && (
          <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}

        {comparison && (
          <div className="space-y-3 border-t border-slate-200/70 pt-4 dark:border-slate-700/70">
            <div className="overflow-x-auto">
              <table
                className="min-w-[820px] w-full text-left text-xs"
                aria-label="Official Loan Estimate comparison"
              >
                <thead className="text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="pb-2">Lender</th>
                    <th className="pb-2">Rate / APR</th>
                    <th className="pb-2">Monthly P&I</th>
                    <th className="pb-2">Net loan costs</th>
                    <th className="pb-2">Cash to close</th>
                    <th className="pb-2">5-year cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/70">
                  {comparison.offers.map((offer) => (
                    <tr key={offer.id}>
                      <th className="py-3 pr-3 font-semibold">
                        {offer.lenderName}
                        <span className="block font-normal text-slate-500">
                          {offer.loanTermYears}-year {offer.loanType.toLowerCase()}
                        </span>
                      </th>
                      <td className="py-3 pr-3">
                        {offer.noteRatePct.toFixed(3)}% / {offer.aprPct.toFixed(3)}%
                      </td>
                      <td className="py-3 pr-3">
                        {currency(offer.monthlyPrincipalAndInterestUsd)}
                      </td>
                      <td className="py-3 pr-3">
                        {currency(offer.netLoanCostsUsd)}
                      </td>
                      <td className="py-3 pr-3">
                        {currency(offer.cashToCloseUsd)}
                      </td>
                      <td className="py-3">
                        {currency(offer.fiveYearBorrowingCostUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {comparison.offers.flatMap((offer) =>
                offer.bestMetrics.map((metric) => (
                  <span
                    key={`${offer.id}-${metric}`}
                    className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  >
                    {offer.lenderName}: {METRIC_LABELS[metric]}
                  </span>
                )),
              )}
            </div>
            <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
              {comparison.summary.map((line) => (
                <li key={line}>• {line}</li>
              ))}
              {comparison.offers.flatMap((offer) =>
                offer.cautions.map((caution) => (
                  <li
                    key={`${offer.id}-${caution}`}
                    className="text-amber-700 dark:text-amber-300"
                  >
                    • {offer.lenderName}: {caution}
                  </li>
                )),
              )}
            </ul>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {comparison.disclaimer}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
