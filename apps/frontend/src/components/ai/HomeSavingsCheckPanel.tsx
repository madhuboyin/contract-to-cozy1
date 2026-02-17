'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, PiggyBank, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getHomeSavingsCategory,
  getHomeSavingsSummary,
  HomeSavingsAccountUpsertPayload,
  HomeSavingsBillingCadence,
  HomeSavingsCategoryDetailDTO,
  HomeSavingsCategoryKey,
  HomeSavingsOpportunityStatus,
  HomeSavingsSummaryCategoryDTO,
  HomeSavingsSummaryDTO,
  runHomeSavings,
  setHomeSavingsOpportunityStatus,
  upsertHomeSavingsAccount,
} from '@/lib/api/homeSavingsApi';

type HomeSavingsCheckPanelProps = {
  propertyId: string;
};

type FormState = {
  providerName: string;
  planName: string;
  billingCadence: HomeSavingsBillingCadence;
  amount: string;
  renewalDate: string;
  contractEndDate: string;
  speedTier: string;
  rateType: string;
  usageKwh: string;
};

const EMPTY_FORM: FormState = {
  providerName: '',
  planName: '',
  billingCadence: 'MONTHLY',
  amount: '',
  renewalDate: '',
  contractEndDate: '',
  speedTier: '',
  rateType: '',
  usageKwh: '',
};

function money(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
}

function toInputDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function parseAmount(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return numeric;
}

function statusTone(status: HomeSavingsSummaryCategoryDTO['status']): string {
  if (status === 'FOUND_SAVINGS') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'CONNECTED') return 'bg-sky-100 text-sky-700 border-sky-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function opportunityStatusTone(status: HomeSavingsOpportunityStatus): string {
  if (status === 'APPLIED' || status === 'SWITCHED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'DISMISSED') return 'bg-gray-100 text-gray-600';
  if (status === 'SAVED') return 'bg-sky-100 text-sky-700';
  return 'bg-amber-100 text-amber-700';
}

function confidenceTone(confidence: 'HIGH' | 'MEDIUM' | 'LOW') {
  if (confidence === 'HIGH') return 'text-emerald-700';
  if (confidence === 'MEDIUM') return 'text-amber-700';
  return 'text-gray-600';
}

function buildPayload(categoryKey: HomeSavingsCategoryKey, form: FormState): HomeSavingsAccountUpsertPayload {
  const amount = parseAmount(form.amount);
  const payload: HomeSavingsAccountUpsertPayload = {
    providerName: form.providerName.trim() || undefined,
    planName: form.planName.trim() || undefined,
    billingCadence: form.billingCadence,
    amount,
    renewalDate: form.renewalDate ? new Date(form.renewalDate).toISOString() : undefined,
    contractEndDate: form.contractEndDate
      ? new Date(form.contractEndDate).toISOString()
      : undefined,
  };

  if (categoryKey === 'INTERNET') {
    payload.usageJson = {
      speedTier: form.speedTier.trim() || undefined,
    };
  }

  if (categoryKey === 'ELECTRICITY_GAS') {
    payload.planDetailsJson = {
      rateType: form.rateType || undefined,
    };

    const usageKwh = parseAmount(form.usageKwh);
    payload.usageJson = {
      kwhMonthly: usageKwh,
    };
  }

  return payload;
}

function makeFormFromDetail(detail: HomeSavingsCategoryDetailDTO): FormState {
  const account = detail.account;
  if (!account) {
    return EMPTY_FORM;
  }

  const usage = account.usageJson ?? {};
  const planDetails = account.planDetailsJson ?? {};

  return {
    providerName: account.providerName ?? '',
    planName: account.planName ?? '',
    billingCadence: account.billingCadence,
    amount: account.amount !== null && account.amount !== undefined ? String(account.amount) : '',
    renewalDate: toInputDate(account.renewalDate),
    contractEndDate: toInputDate(account.contractEndDate),
    speedTier:
      typeof usage.speedTier === 'string' && usage.speedTier.length > 0
        ? usage.speedTier
        : '',
    rateType:
      typeof planDetails.rateType === 'string' && planDetails.rateType.length > 0
        ? planDetails.rateType
        : 'FIXED',
    usageKwh:
      typeof usage.kwhMonthly === 'number' || typeof usage.kwhMonthly === 'string'
        ? String(usage.kwhMonthly)
        : '',
  };
}

function categoryFormDescription(categoryKey: HomeSavingsCategoryKey): string {
  switch (categoryKey) {
    case 'HOME_INSURANCE':
      return 'Add your current premium and renewal date to compare potential insurance savings.';
    case 'HOME_WARRANTY':
      return 'Track your warranty spend and renewal timing to check if a cheaper plan exists.';
    case 'INTERNET':
      return 'Capture your current provider, bill amount, and speed tier to compare internet options.';
    case 'ELECTRICITY_GAS':
      return 'Add your utility bill amount and rate type so we can estimate possible savings.';
    default:
      return 'Add your current plan details to compare options.';
  }
}

export default function HomeSavingsCheckPanel({ propertyId }: HomeSavingsCheckPanelProps) {
  const [summary, setSummary] = useState<HomeSavingsSummaryDTO | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<HomeSavingsCategoryKey | null>(null);
  const [detail, setDetail] = useState<HomeSavingsCategoryDetailDTO | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [runningCategory, setRunningCategory] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [updatingOpportunityId, setUpdatingOpportunityId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!propertyId) return;
    setLoadingSummary(true);
    setError(null);

    try {
      const nextSummary = await getHomeSavingsSummary(propertyId);
      setSummary(nextSummary);
      if (!selectedCategory && nextSummary.categories.length > 0) {
        setSelectedCategory(nextSummary.categories[0].category.key);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load Home Savings Check.');
      setSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  }, [propertyId, selectedCategory]);

  const loadDetail = useCallback(
    async (categoryKey: HomeSavingsCategoryKey) => {
      if (!propertyId) return;
      setLoadingDetail(true);
      setError(null);
      try {
        const nextDetail = await getHomeSavingsCategory(propertyId, categoryKey);
        setDetail(nextDetail);
        setForm(makeFormFromDetail(nextDetail));
      } catch (err: any) {
        setError(err?.message || 'Failed to load selected category details.');
        setDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [propertyId]
  );

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (selectedCategory) {
      loadDetail(selectedCategory);
    }
  }, [loadDetail, selectedCategory]);

  const selectedCategorySummary = useMemo(() => {
    if (!summary || !selectedCategory) return null;
    return summary.categories.find((entry) => entry.category.key === selectedCategory) ?? null;
  }, [summary, selectedCategory]);

  const saveCurrentPlan = async () => {
    if (!selectedCategory) return;

    setSavingAccount(true);
    setError(null);
    try {
      const payload = buildPayload(selectedCategory, form);
      await upsertHomeSavingsAccount(propertyId, selectedCategory, payload);
      await loadDetail(selectedCategory);
      await loadSummary();
    } catch (err: any) {
      setError(err?.message || 'Failed to save current plan details.');
    } finally {
      setSavingAccount(false);
    }
  };

  const runCategoryComparison = async () => {
    if (!selectedCategory) return;

    setRunningCategory(true);
    setError(null);
    try {
      await runHomeSavings(propertyId, selectedCategory);
      await loadSummary();
      await loadDetail(selectedCategory);
    } catch (err: any) {
      setError(err?.message || 'Failed to run category comparison.');
    } finally {
      setRunningCategory(false);
    }
  };

  const runAllComparisons = async () => {
    setRunningAll(true);
    setError(null);
    try {
      await runHomeSavings(propertyId);
      await loadSummary();
      if (selectedCategory) {
        await loadDetail(selectedCategory);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to run Home Savings Check.');
    } finally {
      setRunningAll(false);
    }
  };

  const updateOpportunityStatus = async (opportunityId: string, status: HomeSavingsOpportunityStatus) => {
    if (!selectedCategory) return;

    setUpdatingOpportunityId(opportunityId);
    setError(null);
    try {
      await setHomeSavingsOpportunityStatus(opportunityId, status);
      await loadSummary();
      await loadDetail(selectedCategory);
    } catch (err: any) {
      setError(err?.message || 'Failed to update opportunity status.');
    } finally {
      setUpdatingOpportunityId(null);
    }
  };

  if (loadingSummary) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-8 flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
        <span className="text-sm text-gray-600">Loading Home Savings Check…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
        You may be paying more than necessary. Home Savings Check uses your current plan details to estimate simple savings opportunities.
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-2xl border border-black/10 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">You could save up to {money(summary?.potentialMonthlySavings)}/month</h3>
            <p className="text-sm text-gray-600 mt-1">
              That is about {money(summary?.potentialAnnualSavings)}/year across active categories.
            </p>
          </div>
          <Button variant="outline" onClick={runAllComparisons} disabled={runningAll}>
            {runningAll ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" /> Run all checks
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {summary?.categories.map((entry) => {
            const selected = selectedCategory === entry.category.key;
            return (
              <button
                key={entry.category.key}
                type="button"
                onClick={() => setSelectedCategory(entry.category.key)}
                className={`rounded-xl border p-3 text-left transition ${
                  selected ? 'border-teal-500 bg-teal-50' : 'border-black/10 bg-white hover:border-teal-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">{entry.category.label}</div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(entry.status)}`}>
                    {entry.status === 'NOT_SET_UP'
                      ? 'Not set up'
                      : entry.status === 'FOUND_SAVINGS'
                      ? 'Found savings'
                      : 'Connected'}
                  </span>
                </div>

                <div className="mt-2 text-xs text-gray-600 space-y-1">
                  <div className="truncate">
                    {entry.account?.providerName
                      ? `${entry.account.providerName} · ${money(entry.account.monthlyAmount)}/mo`
                      : 'Current plan not added'}
                  </div>
                  <div className="line-clamp-2 text-gray-700">
                    {entry.topOpportunity?.headline || 'No major savings flag right now'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {selectedCategory && (
        <section className="rounded-2xl border border-black/10 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h4 className="text-base font-semibold text-gray-900">
                {selectedCategorySummary?.category.label || 'Category details'}
              </h4>
              <p className="text-sm text-gray-600 mt-1">
                {selectedCategorySummary
                  ? categoryFormDescription(selectedCategorySummary.category.key)
                  : 'Update your current plan and compare options.'}
              </p>
            </div>

            <Button onClick={runCategoryComparison} disabled={runningCategory}>
              {runningCategory ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running…
                </>
              ) : (
                'Check savings'
              )}
            </Button>
          </div>

          {loadingDetail ? (
            <div className="flex items-center gap-2 text-sm text-gray-600 py-6">
              <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
              Loading category details…
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl border border-black/10 p-4 space-y-3">
                <h5 className="text-sm font-semibold text-gray-900">Current plan</h5>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-xs text-gray-600">
                    Provider
                    <input
                      value={form.providerName}
                      onChange={(event) => setForm((prev) => ({ ...prev, providerName: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Provider name"
                    />
                  </label>

                  <label className="text-xs text-gray-600">
                    Plan name
                    <input
                      value={form.planName}
                      onChange={(event) => setForm((prev) => ({ ...prev, planName: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Plan name"
                    />
                  </label>

                  <label className="text-xs text-gray-600">
                    Billing cadence
                    <select
                      value={form.billingCadence}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          billingCadence: event.target.value as HomeSavingsBillingCadence,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                    >
                      <option value="MONTHLY">Monthly</option>
                      <option value="QUARTERLY">Quarterly</option>
                      <option value="ANNUAL">Annual</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>

                  <label className="text-xs text-gray-600">
                    Amount (USD)
                    <input
                      type="number"
                      min={0}
                      value={form.amount}
                      onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="0"
                    />
                  </label>

                  {(selectedCategory === 'HOME_INSURANCE' || selectedCategory === 'HOME_WARRANTY') && (
                    <label className="text-xs text-gray-600">
                      Renewal date
                      <input
                        type="date"
                        value={form.renewalDate}
                        onChange={(event) => setForm((prev) => ({ ...prev, renewalDate: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>
                  )}

                  {(selectedCategory === 'HOME_WARRANTY' || selectedCategory === 'INTERNET') && (
                    <label className="text-xs text-gray-600">
                      Contract end date
                      <input
                        type="date"
                        value={form.contractEndDate}
                        onChange={(event) => setForm((prev) => ({ ...prev, contractEndDate: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>
                  )}

                  {selectedCategory === 'INTERNET' && (
                    <label className="text-xs text-gray-600 md:col-span-2">
                      Speed tier
                      <input
                        value={form.speedTier}
                        onChange={(event) => setForm((prev) => ({ ...prev, speedTier: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="e.g. 500 Mbps"
                      />
                    </label>
                  )}

                  {selectedCategory === 'ELECTRICITY_GAS' && (
                    <>
                      <label className="text-xs text-gray-600">
                        Rate type
                        <select
                          value={form.rateType}
                          onChange={(event) => setForm((prev) => ({ ...prev, rateType: event.target.value }))}
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                        >
                          <option value="FIXED">Fixed</option>
                          <option value="VARIABLE">Variable</option>
                        </select>
                      </label>

                      <label className="text-xs text-gray-600">
                        Monthly usage (kWh)
                        <input
                          type="number"
                          min={0}
                          value={form.usageKwh}
                          onChange={(event) => setForm((prev) => ({ ...prev, usageKwh: event.target.value }))}
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="Optional"
                        />
                      </label>
                    </>
                  )}
                </div>

                <div className="pt-1">
                  <Button onClick={saveCurrentPlan} disabled={savingAccount}>
                    {savingAccount ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                      </>
                    ) : (
                      'Save current plan'
                    )}
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-black/10 p-4 space-y-3">
                <h5 className="text-sm font-semibold text-gray-900">Potential savings opportunities</h5>

                {!detail || detail.opportunities.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600">
                    No opportunities yet. Save your plan and run “Check savings” to generate suggestions.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detail.opportunities.map((opportunity) => {
                      const isUpdating = updatingOpportunityId === opportunity.id;
                      return (
                        <div key={opportunity.id} className="rounded-lg border border-black/10 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="font-medium text-gray-900">{opportunity.headline}</div>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${opportunityStatusTone(opportunity.status)}`}>
                              {opportunity.status}
                            </span>
                          </div>
                          {opportunity.detail && (
                            <p className="mt-1 text-sm text-gray-600">{opportunity.detail}</p>
                          )}

                          <div className="mt-2 text-xs text-gray-600 space-y-1">
                            <div>
                              Potential savings:{' '}
                              <span className="font-medium text-gray-800">
                                {money(opportunity.estimatedMonthlySavings)}/mo · {money(opportunity.estimatedAnnualSavings)}/yr
                              </span>
                            </div>
                            <div className={confidenceTone(opportunity.confidence)}>
                              Confidence: {opportunity.confidence}
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isUpdating}
                              onClick={() => updateOpportunityStatus(opportunity.id, 'APPLIED')}
                            >
                              {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                              Mark as done
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isUpdating}
                              onClick={() => updateOpportunityStatus(opportunity.id, 'SAVED')}
                            >
                              Remind me later
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isUpdating}
                              onClick={() => updateOpportunityStatus(opportunity.id, 'DISMISSED')}
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {!summary && !loadingSummary && (
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center text-gray-600">
          <PiggyBank className="h-8 w-8 mx-auto mb-2 text-teal-700" />
          Home Savings Check could not be loaded yet. Try refreshing.
          <div className="mt-3">
            <Button variant="outline" onClick={loadSummary}>Refresh</Button>
          </div>
        </div>
      )}
    </div>
  );
}
