'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  ActionPriorityRow,
  CompactEntityRow,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { formatEnumLabel } from '@/lib/utils/formatters';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import {
  listServicePriceRadarChecks,
  type ServicePriceRadarCheckSummary,
  type ServiceRadarVerdict,
} from '../service-price-radar/servicePriceRadarApi';
import HomeToolsRail from '../../components/HomeToolsRail';
import CompareTemplate from '../../components/route-templates/CompareTemplate';
import { pricingLoopTrust } from '@/lib/trust/trustPresets';

type SearchParamSource = { get(name: string): string | null };

type QuoteCandidate = {
  id: string;
  vendorName: string;
  quoteAmount: number;
  currency: string;
  serviceCategory: string | null;
  verdict: ServiceRadarVerdict | null;
  confidenceScore: number | null;
  expectedLow: number | null;
  expectedHigh: number | null;
  sourceLabel: string;
  serviceRadarCheckId: string | null;
  createdAt: string | null;
};

const CONTEXT_KEYS = [
  'guidanceJourneyId',
  'guidanceStepKey',
  'guidanceSignalIntentFamily',
  'itemId',
  'homeAssetId',
  'serviceCategory',
  'vendorName',
  'quoteAmount',
  'quoteComparisonWorkspaceId',
  'serviceRadarCheckId',
  'negotiationShieldCaseId',
] as const;

function toNumberOrNull(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildContextQuery(searchParams: SearchParamSource): string {
  const query = new URLSearchParams();
  for (const key of CONTEXT_KEYS) {
    const value = searchParams.get(key);
    if (value) {
      query.set(key, value);
    }
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

function buildForwardQuery(
  searchParams: SearchParamSource,
  overrides?: Partial<{
    vendorName: string;
    quoteAmount: string;
    serviceCategory: string;
    serviceRadarCheckId: string;
  }>
): string {
  const query = new URLSearchParams();
  for (const key of CONTEXT_KEYS) {
    const value = searchParams.get(key);
    if (value) {
      query.set(key, value);
    }
  }

  if (overrides?.vendorName) query.set('vendorName', overrides.vendorName);
  if (overrides?.quoteAmount) query.set('quoteAmount', overrides.quoteAmount);
  if (overrides?.serviceCategory) query.set('serviceCategory', overrides.serviceCategory);
  if (overrides?.serviceRadarCheckId) query.set('serviceRadarCheckId', overrides.serviceRadarCheckId);

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

function mapRadarCheckToQuote(check: ServicePriceRadarCheckSummary): QuoteCandidate {
  return {
    id: check.id,
    vendorName: check.quoteVendorName || 'Vendor not specified',
    quoteAmount: check.quoteAmount,
    currency: check.quoteCurrency || 'USD',
    serviceCategory: check.serviceCategory || null,
    verdict: check.verdict,
    confidenceScore: check.confidenceScore,
    expectedLow: check.expectedLow,
    expectedHigh: check.expectedHigh,
    sourceLabel: 'Service Price Radar',
    serviceRadarCheckId: check.id,
    createdAt: check.createdAt,
  };
}

function sortCandidates(quotes: QuoteCandidate[], preferredCategory?: string | null) {
  return [...quotes].sort((a, b) => {
    const aCategoryBoost = preferredCategory && a.serviceCategory === preferredCategory ? 1 : 0;
    const bCategoryBoost = preferredCategory && b.serviceCategory === preferredCategory ? 1 : 0;
    if (aCategoryBoost !== bCategoryBoost) return bCategoryBoost - aCategoryBoost;

    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aDate !== bDate) return bDate - aDate;

    return a.quoteAmount - b.quoteAmount;
  });
}

function verdictTone(verdict: ServiceRadarVerdict | null): 'good' | 'info' | 'elevated' | 'danger' {
  if (verdict === 'UNDERPRICED' || verdict === 'FAIR') return 'good';
  if (verdict === 'HIGH') return 'elevated';
  if (verdict === 'VERY_HIGH') return 'danger';
  return 'info';
}

function chooseRecommendedQuote(
  quotes: QuoteCandidate[],
  preferredCategory?: string | null
): QuoteCandidate | null {
  if (quotes.length === 0) return null;

  const scoped =
    preferredCategory
      ? quotes.filter((quote) => quote.serviceCategory === preferredCategory)
      : quotes;
  const source = scoped.length > 0 ? scoped : quotes;

  const fairCandidates = source.filter(
    (quote) => quote.verdict === 'UNDERPRICED' || quote.verdict === 'FAIR'
  );
  if (fairCandidates.length > 0) {
    return [...fairCandidates].sort((a, b) => {
      if (a.quoteAmount !== b.quoteAmount) return a.quoteAmount - b.quoteAmount;
      return (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
    })[0];
  }

  const nonHighCandidates = source.filter((quote) => quote.verdict !== 'VERY_HIGH');
  if (nonHighCandidates.length > 0) {
    return [...nonHighCandidates].sort((a, b) => a.quoteAmount - b.quoteAmount)[0];
  }

  return [...source].sort((a, b) => a.quoteAmount - b.quoteAmount)[0];
}

function formatExpectedRange(quote: QuoteCandidate): string {
  if (typeof quote.expectedLow === 'number' && typeof quote.expectedHigh === 'number') {
    return `${formatMoney(quote.expectedLow, quote.currency)} - ${formatMoney(quote.expectedHigh, quote.currency)} expected`;
  }
  return 'No expected range yet';
}

export default function QuoteComparisonWorkspaceClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const defaultCategory = searchParams.get('serviceCategory');
  const defaultVendorName = searchParams.get('vendorName');
  const defaultQuoteAmount = searchParams.get('quoteAmount');
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily');
  const contextQuery = buildContextQuery(searchParams);
  const isGuidanceContext = Boolean(guidanceJourneyId);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [quotes, setQuotes] = React.useState<QuoteCandidate[]>([]);
  const [selectedQuoteIds, setSelectedQuoteIds] = React.useState<string[]>([]);
  const [manualVendorName, setManualVendorName] = React.useState('');
  const [manualQuoteAmount, setManualQuoteAmount] = React.useState('');
  const [manualInputError, setManualInputError] = React.useState<string | null>(null);

  const prefilledQuote = React.useMemo<QuoteCandidate | null>(() => {
    const parsedAmount = toNumberOrNull(defaultQuoteAmount);
    if (!parsedAmount) return null;
    return {
      id: 'guidance-prefill',
      vendorName: defaultVendorName?.trim() || 'Current quote',
      quoteAmount: parsedAmount,
      currency: 'USD',
      serviceCategory: defaultCategory || null,
      verdict: null,
      confidenceScore: null,
      expectedLow: null,
      expectedHigh: null,
      sourceLabel: 'Guidance context',
      serviceRadarCheckId: null,
      createdAt: null,
    };
  }, [defaultCategory, defaultQuoteAmount, defaultVendorName]);

  const loadQuotes = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const checks = await listServicePriceRadarChecks(propertyId, 24);

      const mappedChecks = checks.map(mapRadarCheckToQuote);
      const merged = prefilledQuote ? [prefilledQuote, ...mappedChecks] : mappedChecks;

      // Deduplicate by id, then sort by category relevance and recency.
      const dedupedMap = new Map<string, QuoteCandidate>();
      for (const quote of merged) {
        dedupedMap.set(quote.id, quote);
      }
      const nextQuotes = sortCandidates(Array.from(dedupedMap.values()), defaultCategory);
      setQuotes(nextQuotes);
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load quote candidates.');
      setQuotes(prefilledQuote ? [prefilledQuote] : []);
    } finally {
      setLoading(false);
    }
  }, [defaultCategory, prefilledQuote, propertyId]);

  React.useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  React.useEffect(() => {
    if (quotes.length === 0) {
      setSelectedQuoteIds([]);
      return;
    }

    setSelectedQuoteIds((previous) => {
      const existing = previous.filter((id) => quotes.some((quote) => quote.id === id));
      if (existing.length > 0) return existing.slice(0, 3);

      const recommended = chooseRecommendedQuote(quotes, defaultCategory);
      const fallbackIds = quotes
        .filter((quote) => quote.id !== recommended?.id)
        .slice(0, 1)
        .map((quote) => quote.id);
      return [recommended?.id, ...fallbackIds].filter((value): value is string => Boolean(value));
    });
  }, [defaultCategory, quotes]);

  const selectedQuotes = React.useMemo(
    () => quotes.filter((quote) => selectedQuoteIds.includes(quote.id)),
    [quotes, selectedQuoteIds]
  );

  const recommendationPool = selectedQuotes.length > 0 ? selectedQuotes : quotes;
  const recommendedQuote = React.useMemo(
    () => chooseRecommendedQuote(recommendationPool, defaultCategory),
    [defaultCategory, recommendationPool]
  );

  const comparisonSpread = React.useMemo(() => {
    if (selectedQuotes.length < 2) return null;
    const amounts = selectedQuotes.map((quote) => quote.quoteAmount);
    const low = Math.min(...amounts);
    const high = Math.max(...amounts);
    return {
      low,
      high,
      spread: high - low,
    };
  }, [selectedQuotes]);

  const priceFinalizationQuery = React.useMemo(
    () =>
      buildForwardQuery(searchParams, {
        vendorName: recommendedQuote?.vendorName ?? '',
        quoteAmount:
          typeof recommendedQuote?.quoteAmount === 'number'
            ? recommendedQuote.quoteAmount.toFixed(2)
            : '',
        serviceCategory: recommendedQuote?.serviceCategory ?? '',
        serviceRadarCheckId: recommendedQuote?.serviceRadarCheckId ?? '',
      }),
    [recommendedQuote, searchParams]
  );

  const toggleSelection = (quoteId: string) => {
    setSelectedQuoteIds((previous) => {
      if (previous.includes(quoteId)) {
        return previous.filter((id) => id !== quoteId);
      }
      if (previous.length >= 3) {
        return previous;
      }
      return [...previous, quoteId];
    });
  };

  const addManualQuote = () => {
    const parsedAmount = toNumberOrNull(manualQuoteAmount);
    if (!manualVendorName.trim()) {
      setManualInputError('Vendor name is required.');
      return;
    }
    if (!parsedAmount) {
      setManualInputError('Enter a valid quote amount greater than 0.');
      return;
    }

    const manualQuote: QuoteCandidate = {
      id: `manual-${Date.now()}`,
      vendorName: manualVendorName.trim(),
      quoteAmount: parsedAmount,
      currency: 'USD',
      serviceCategory: defaultCategory || null,
      verdict: null,
      confidenceScore: null,
      expectedLow: null,
      expectedHigh: null,
      sourceLabel: 'Manual entry',
      serviceRadarCheckId: null,
      createdAt: new Date().toISOString(),
    };

    setQuotes((previous) => sortCandidates([manualQuote, ...previous], defaultCategory));
    setSelectedQuoteIds((previous) => [manualQuote.id, ...previous].slice(0, 3));
    setManualVendorName('');
    setManualQuoteAmount('');
    setManualInputError(null);
  };

  const backHref = isGuidanceContext
    ? `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${guidanceJourneyId}`
    : `/dashboard/properties/${propertyId}`;
  const trust = pricingLoopTrust({
    confidenceLabel:
      selectedQuotes.length >= 2
        ? 'High with multiple side-by-side quotes in the same decision flow'
        : 'Medium until at least two comparable quotes are selected',
    freshnessLabel: 'Updates as new Service Price Radar checks are created',
    sourceLabel: 'Service Price Radar check history + guidance prefill + manual quote entries',
  });

  return (
    <CompareTemplate
      backHref={backHref}
      backLabel={isGuidanceContext ? 'Back to guidance' : 'Back to property'}
      title="Quote Comparison Workspace"
      subtitle="Compare live quote checks side by side and choose the best quote to finalize."
      rail={<HomeToolsRail propertyId={propertyId} context="quote-comparison" currentToolId="quote-comparison" />}
      trust={trust}
      priorityAction={
        recommendedQuote
          ? {
              title: `Recommended quote: ${recommendedQuote.vendorName} at ${formatMoney(recommendedQuote.quoteAmount, recommendedQuote.currency)}`,
              description:
                'Use the recommended quote to prefill Price Finalization, then lock accepted terms before booking.',
              impactLabel: comparisonSpread
                ? `${formatMoney(comparisonSpread.spread)} spread across selected quotes`
                : 'Decision handoff ready',
              confidenceLabel:
                recommendedQuote.confidenceScore != null
                  ? `${Math.round(recommendedQuote.confidenceScore * 100)}% quote confidence`
                  : 'Confidence improves with benchmarked quote checks',
              primaryAction: (
                <Link
                  href={`/dashboard/properties/${propertyId}/tools/price-finalization${priceFinalizationQuery}`}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-black bg-black px-3 text-sm font-semibold text-white hover:bg-black/90"
                >
                  Continue to Price Finalization
                </Link>
              ),
              supportingAction: (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Link
                    href={`/dashboard/properties/${propertyId}/tools/service-price-radar${contextQuery}`}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
                  >
                    Check another quote
                  </Link>
                  <Link
                    href={`/dashboard/properties/${propertyId}/tools/negotiation-shield${contextQuery}`}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
                  >
                    Open Negotiation Shield
                  </Link>
                </div>
              ),
            }
          : undefined
      }
      summary={
        <ResultHeroCard
          eyebrow="Compare"
          title="Quote Decision Snapshot"
          value={selectedQuotes.length}
          status={
            <StatusChip tone={recommendedQuote ? verdictTone(recommendedQuote.verdict) : 'info'}>
              {recommendedQuote?.verdict ? formatEnumLabel(recommendedQuote.verdict) : 'Select quotes'}
            </StatusChip>
          }
          summary={
            comparisonSpread
              ? `Lowest: ${formatMoney(comparisonSpread.low)} · Highest: ${formatMoney(comparisonSpread.high)}`
              : 'Select at least two quotes to see spread and recommendation strength.'
          }
        />
      }
      compareContent={
        <div className="space-y-4">
          <ScenarioInputCard
            title="Candidate Quotes"
            subtitle="Select up to 3 quotes to compare. Higher confidence and fair-range quotes are prioritized."
            badge={<StatusChip tone="info">{quotes.length} quotes</StatusChip>}
          >
            {loading ? (
              <p className="mb-0 text-sm text-slate-600">Loading quote candidates...</p>
            ) : quotes.length === 0 ? (
              <div className="space-y-2">
                <p className="mb-0 text-sm text-slate-600">
                  No quotes found yet. Run Service Price Radar first, then compare here.
                </p>
                <ActionPriorityRow
                  primaryAction={
                    <Link
                      href={`/dashboard/properties/${propertyId}/tools/service-price-radar${contextQuery}`}
                      className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-black bg-black px-3 text-sm text-white hover:bg-black/90"
                    >
                      Run Service Price Radar
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="space-y-2.5">
                {quotes.map((quote) => {
                  const isSelected = selectedQuoteIds.includes(quote.id);
                  const disableSelection = !isSelected && selectedQuoteIds.length >= 3;
                  return (
                    <div key={quote.id} className="rounded-xl border border-black/10 p-2.5">
                      <CompactEntityRow
                        title={quote.vendorName}
                        subtitle={`${formatMoney(quote.quoteAmount, quote.currency)} · ${quote.sourceLabel}`}
                        meta={formatExpectedRange(quote)}
                        status={
                          <StatusChip tone={verdictTone(quote.verdict)}>
                            {quote.verdict ? formatEnumLabel(quote.verdict) : 'No verdict'}
                          </StatusChip>
                        }
                        trailing={
                          <Button
                            type="button"
                            variant={isSelected ? 'default' : 'outline'}
                            className="min-h-[36px] px-3 text-xs"
                            onClick={() => toggleSelection(quote.id)}
                            disabled={disableSelection}
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </Button>
                        }
                      />
                    </div>
                  );
                })}
                {selectedQuoteIds.length >= 3 ? (
                  <p className="mb-0 text-xs text-slate-500">
                    Max 3 quotes selected. Deselect one to add another.
                  </p>
                ) : null}
              </div>
            )}
          </ScenarioInputCard>

          <ScenarioInputCard
            title="Add Quote Manually"
            subtitle="Add a quote that is not yet in Service Price Radar."
            actions={
              <ActionPriorityRow
                primaryAction={
                  <Button type="button" onClick={addManualQuote}>
                    Add manual quote
                  </Button>
                }
              />
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Vendor name</span>
                <input
                  value={manualVendorName}
                  onChange={(event) => setManualVendorName(event.target.value)}
                  placeholder="Example HVAC Co."
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Quote amount (USD)</span>
                <input
                  value={manualQuoteAmount}
                  onChange={(event) => setManualQuoteAmount(event.target.value)}
                  placeholder="2450.00"
                  inputMode="decimal"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
            </div>
            {manualInputError ? (
              <p className="mb-0 text-xs text-rose-600">{manualInputError}</p>
            ) : null}
          </ScenarioInputCard>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <ActionPriorityRow
            secondaryActions={
              <div className="flex w-full flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={loadQuotes}>
                  Refresh quotes
                </Button>
                <Link
                  href={`/dashboard/properties/${propertyId}/tools/price-finalization${priceFinalizationQuery}`}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
                >
                  Open Price Finalization
                </Link>
              </div>
            }
          />
        </div>
      }
      footer={
        <GuidanceStepCompletionCard
          propertyId={propertyId}
          guidanceStepKey={guidanceStepKey}
          guidanceJourneyId={guidanceJourneyId}
          actionLabel="Mark quote comparison complete"
          producedData={{
            workspaceId: searchParams.get('quoteComparisonWorkspaceId') || null,
            quoteCount: quotes.length,
            selectedVendorName: recommendedQuote?.vendorName ?? null,
            selectedQuoteAmount: recommendedQuote?.quoteAmount ?? null,
            currency: recommendedQuote?.currency ?? 'USD',
            comparedQuoteIds: selectedQuoteIds,
            signalIntentFamily: guidanceSignalIntentFamily ?? null,
          }}
        />
      }
    />
  );
}
