'use client';
// apps/frontend/src/components/features/financing/MortgageProfileForm.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PropertyFinancingProfile, FinancingProfilePayload, MortgageType } from '@/types';
import { MORTGAGE_TYPE_LABELS } from './FinancingUtils';

interface MortgageProfileFormProps {
  initial?: PropertyFinancingProfile | null;
  onSave: (payload: FinancingProfilePayload) => Promise<void>;
  saving?: boolean;
}

function dollarsToCents(str: string): number | undefined {
  const n = parseFloat(str.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? undefined : Math.round(n * 100);
}

function centsToString(cents: number | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(0);
}

function rateBpsToString(bps: number | undefined): string {
  if (bps == null) return '';
  return (bps / 100).toFixed(3);
}

export default function MortgageProfileForm({ initial, onSave, saving }: MortgageProfileFormProps) {
  const [purchasePrice, setPurchasePrice] = useState(centsToString(initial?.purchasePriceCents));
  const [purchaseDate, setPurchaseDate] = useState(
    initial?.purchaseDate ? initial.purchaseDate.slice(0, 10) : '',
  );
  const [mortgageType, setMortgageType] = useState<MortgageType | ''>(
    initial?.mortgageType ?? '',
  );
  const [originalBalance, setOriginalBalance] = useState(
    centsToString(initial?.originalMortgageBalanceCents),
  );
  const [currentBalance, setCurrentBalance] = useState(
    centsToString(initial?.currentMortgageBalanceCents),
  );
  const [balanceAsOf, setBalanceAsOf] = useState(
    initial?.mortgageBalanceAsOfDate ? initial.mortgageBalanceAsOfDate.slice(0, 10) : '',
  );
  const [interestRate, setInterestRate] = useState(rateBpsToString(initial?.interestRateBps));
  const [monthlyPayment, setMonthlyPayment] = useState(
    centsToString(initial?.monthlyPaymentCents),
  );
  const [hasSecondMortgage, setHasSecondMortgage] = useState(
    initial?.hasSecondMortgage ?? false,
  );
  const [secondBalance, setSecondBalance] = useState(
    centsToString(initial?.secondMortgageBalanceCents),
  );
  const [hasPMI, setHasPMI] = useState(initial?.hasPMI ?? false);
  const [error, setError] = useState<string | null>(null);

  const origCents = dollarsToCents(originalBalance);
  const currCents = dollarsToCents(currentBalance);
  const currentExceedsOriginal =
    origCents != null && currCents != null && currCents > origCents;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (currentExceedsOriginal) {
      setError('Current balance cannot exceed original balance');
      return;
    }
    if (purchaseDate && new Date(purchaseDate) > new Date()) {
      setError('Purchase date must be in the past');
      return;
    }
    const ratePct = parseFloat(interestRate);
    const payload: FinancingProfilePayload = {
      ...(purchasePrice && { purchasePriceCents: dollarsToCents(purchasePrice) }),
      ...(purchaseDate && { purchaseDate: new Date(purchaseDate).toISOString() }),
      ...(mortgageType && { mortgageType }),
      ...(originalBalance && { originalMortgageBalanceCents: dollarsToCents(originalBalance) }),
      ...(currentBalance && { currentMortgageBalanceCents: dollarsToCents(currentBalance) }),
      ...(balanceAsOf && { mortgageBalanceAsOfDate: new Date(balanceAsOf).toISOString() }),
      ...(!isNaN(ratePct) && ratePct > 0 && { interestRateBps: Math.round(ratePct * 100) }),
      ...(monthlyPayment && { monthlyPaymentCents: dollarsToCents(monthlyPayment) }),
      hasSecondMortgage,
      ...(hasSecondMortgage && secondBalance && {
        secondMortgageBalanceCents: dollarsToCents(secondBalance),
      }),
      hasPMI,
    };
    await onSave(payload);
  }

  const fieldClass =
    'h-10 rounded-xl border border-slate-200 bg-white/80 px-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/60';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Purchase */}
      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Purchase</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Purchase price</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
              <Input
                className={`${fieldClass} pl-6`}
                placeholder="450,000"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Purchase date</Label>
            <Input
              type="date"
              className={fieldClass}
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
        </div>
      </section>

      {/* Mortgage */}
      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mortgage</p>
        <div className="space-y-1">
          <Label className="text-xs">Loan type</Label>
          <Select
            value={mortgageType}
            onValueChange={(v) => setMortgageType(v as MortgageType)}
          >
            <SelectTrigger className={fieldClass}>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MORTGAGE_TYPE_LABELS) as MortgageType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {MORTGAGE_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Original balance</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
              <Input
                className={`${fieldClass} pl-6`}
                placeholder="400,000"
                value={originalBalance}
                onChange={(e) => setOriginalBalance(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Current balance</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
              <Input
                className={`${fieldClass} pl-6 ${currentExceedsOriginal ? 'border-red-400' : ''}`}
                placeholder="385,000"
                value={currentBalance}
                onChange={(e) => setCurrentBalance(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Balance as of</Label>
            <Input
              type="date"
              className={fieldClass}
              value={balanceAsOf}
              onChange={(e) => setBalanceAsOf(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Interest rate (%)</Label>
            <Input
              className={fieldClass}
              placeholder="6.875"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Monthly payment (P+I or PITI)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <Input
              className={`${fieldClass} pl-6`}
              placeholder="2,400"
              value={monthlyPayment}
              onChange={(e) => setMonthlyPayment(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Toggles */}
      <section className="space-y-3">
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
            I have a second mortgage / HELOC
          </span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-600"
            checked={hasSecondMortgage}
            onChange={(e) => setHasSecondMortgage(e.target.checked)}
          />
        </label>
        {hasSecondMortgage && (
          <div className="space-y-1 pl-1">
            <Label className="text-xs">Second mortgage / HELOC balance</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
              <Input
                className={`${fieldClass} pl-6`}
                placeholder="25,000"
                value={secondBalance}
                onChange={(e) => setSecondBalance(e.target.value)}
              />
            </div>
          </div>
        )}
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
            I pay PMI (private mortgage insurance)
          </span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-600"
            checked={hasPMI}
            onChange={(e) => setHasPMI(e.target.checked)}
          />
        </label>
      </section>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? 'Saving…' : 'Save mortgage details'}
      </Button>
    </form>
  );
}
