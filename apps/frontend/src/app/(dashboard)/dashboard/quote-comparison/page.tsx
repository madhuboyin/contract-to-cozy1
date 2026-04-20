'use client';

import React, { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  DollarSign,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { ConfidenceBadge } from '@/components/trust';
import {
  createServicePriceRadarCheck,
  ServicePriceRadarCheckDetail,
  SERVICE_PRICE_RADAR_CATEGORY_OPTIONS,
  type ServiceRadarCategory,
} from '@/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/servicePriceRadarApi';
import { cn } from '@/lib/utils';
import { formatEnumLabel } from '@/lib/utils/formatters';

interface QuoteEntry {
  id: string;
  vendorName: string;
  amount: string;
}

interface QuoteResult extends QuoteEntry {
  result: ServicePriceRadarCheckDetail | null;
  error: boolean;
  loading: boolean;
}

function verdictTone(verdict: string | null | undefined): 'good' | 'elevated' | 'needsAction' | 'info' {
  if (verdict === 'FAIR' || verdict === 'UNDERPRICED') return 'good';
  if (verdict === 'HIGH') return 'elevated';
  if (verdict === 'VERY_HIGH') return 'needsAction';
  return 'info';
}

function verdictLabel(verdict: string | null | undefined) {
  if (verdict === 'FAIR') return 'Fair price';
  if (verdict === 'UNDERPRICED') return 'Below market';
  if (verdict === 'HIGH') return 'Above market';
  if (verdict === 'VERY_HIGH') return 'Well above market';
  if (verdict === 'INSUFFICIENT_DATA') return 'Limited data';
  return 'Pending';
}

function VerdictIcon({ verdict }: { verdict: string | null | undefined }) {
  if (verdict === 'FAIR' || verdict === 'UNDERPRICED') {
    return <ShieldCheck className="h-5 w-5 text-emerald-600" />;
  }
  if (verdict === 'HIGH' || verdict === 'VERY_HIGH') {
    return <TrendingUp className="h-5 w-5 text-amber-500" />;
  }
  return <TrendingDown className="h-5 w-5 text-slate-400" />;
}

export default function QuoteComparisonPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();

  const propertyId = searchParams.get('propertyId') || selectedPropertyId || '';
  const rawCategory = searchParams.get('category') || '';
  const serviceLabel = searchParams.get('serviceLabel') || '';

  const categoryOption = SERVICE_PRICE_RADAR_CATEGORY_OPTIONS.find(
    (o) => o.value === rawCategory
  );
  const category = (categoryOption?.value ?? 'GENERAL_HANDYMAN') as ServiceRadarCategory;
  const categoryDisplay = categoryOption?.label ?? formatEnumLabel(rawCategory) ?? 'Service';

  const [quotes, setQuotes] = useState<QuoteEntry[]>([
    { id: crypto.randomUUID(), vendorName: '', amount: '' },
    { id: crypto.randomUUID(), vendorName: '', amount: '' },
  ]);
  const [results, setResults] = useState<QuoteResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const addQuote = () => {
    if (quotes.length >= 5) return;
    setQuotes((prev) => [...prev, { id: crypto.randomUUID(), vendorName: '', amount: '' }]);
  };

  const removeQuote = (id: string) => {
    setQuotes((prev) => prev.filter((q) => q.id !== id));
  };

  const updateQuote = (id: string, field: keyof QuoteEntry, value: string) => {
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
  };

  const validQuotes = quotes.filter((q) => q.amount && Number(q.amount) > 0);

  const handleCompare = async () => {
    if (!propertyId || validQuotes.length < 1) return;

    setIsChecking(true);
    setHasRun(true);

    const pending: QuoteResult[] = validQuotes.map((q) => ({
      ...q,
      result: null,
      error: false,
      loading: true,
    }));
    setResults(pending);

    const settled = await Promise.all(
      validQuotes.map(async (q) => {
        try {
          const result = await createServicePriceRadarCheck(propertyId, {
            serviceCategory: category,
            serviceLabelRaw: serviceLabel || categoryDisplay,
            quoteAmount: Number(q.amount),
            quoteVendorName: q.vendorName || undefined,
          });
          return { ...q, result, error: false, loading: false };
        } catch {
          return { ...q, result: null, error: true, loading: false };
        }
      })
    );

    // Sort: fair/underpriced first, then by amount ascending
    const sorted = [...settled].sort((a, b) => {
      const aGood = a.result?.verdict === 'FAIR' || a.result?.verdict === 'UNDERPRICED';
      const bGood = b.result?.verdict === 'FAIR' || b.result?.verdict === 'UNDERPRICED';
      if (aGood && !bGood) return -1;
      if (!aGood && bGood) return 1;
      return Number(a.amount) - Number(b.amount);
    });

    setResults(sorted);
    setIsChecking(false);
  };

  const handleBookProvider = (q: QuoteResult) => {
    const params = new URLSearchParams({ propertyId, category });
    if (q.vendorName) params.set('vendorName', q.vendorName);
    if (serviceLabel) params.set('serviceLabel', serviceLabel);
    params.set('from', 'quote-comparison');
    router.push(`/dashboard/providers?${params.toString()}`);
  };

  const bestPick = results.find(
    (r) => r.result?.verdict === 'FAIR' || r.result?.verdict === 'UNDERPRICED'
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="px-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      <MobilePageIntro
        eyebrow="Fix · Quote Comparison"
        title={serviceLabel || `${categoryDisplay} Quotes`}
        subtitle="Enter quotes from multiple vendors to find the best fair-priced option."
      />

      {/* Quote entry form */}
      <MobileSection>
        <MobileSectionHeader
          title="Add Vendor Quotes"
          subtitle={`Up to 5 quotes — at least 1 required to compare. (${quotes.length}/5)`}
        />

        <div className="space-y-4">
          {quotes.map((q, idx) => (
            <MobileCard key={q.id} variant="compact" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  Quote {idx + 1}
                </p>
                {quotes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeQuote(q.id)}
                    className="rounded-lg p-1 text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Vendor Name (optional)
                  </Label>
                  <Input
                    value={q.vendorName}
                    onChange={(e) => updateQuote(q.id, 'vendorName', e.target.value)}
                    placeholder="e.g. Acme Plumbing"
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Quote Amount ($)
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      type="number"
                      value={q.amount}
                      onChange={(e) => updateQuote(q.id, 'amount', e.target.value)}
                      placeholder="0.00"
                      className="h-11 rounded-xl pl-8 font-bold"
                    />
                  </div>
                </div>
              </div>
            </MobileCard>
          ))}

          {quotes.length < 5 && (
            <button
              type="button"
              onClick={addQuote}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add another quote
            </button>
          )}
        </div>
      </MobileSection>

      <Button
        onClick={handleCompare}
        disabled={validQuotes.length < 1 || !propertyId || isChecking}
        className="w-full h-12 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg shadow-brand-100"
      >
        {isChecking ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Checking {validQuotes.length} quote{validQuotes.length > 1 ? 's' : ''}…
          </>
        ) : (
          <>
            <Users className="mr-2 h-5 w-5" />
            Compare {validQuotes.length} Quote{validQuotes.length > 1 ? 's' : ''}
          </>
        )}
      </Button>

      {/* Results */}
      {hasRun && (
        <MobileSection>
          <MobileSectionHeader
            title="Comparison Results"
            subtitle="Ranked by price fairness, then by amount."
          />

          {results.length === 0 ? (
            <EmptyStateCard
              title="No results yet"
              description="Enter at least one quote amount and tap Compare."
            />
          ) : (
            <div className="space-y-3">
              {bestPick && (
                <MobileCard
                  variant="compact"
                  className="border-emerald-200 bg-emerald-50 space-y-1"
                >
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
                    Best Pick
                  </p>
                  <p className="text-sm font-semibold text-emerald-900">
                    {bestPick.vendorName || 'Unnamed vendor'} at $
                    {Number(bestPick.amount).toLocaleString()} is fairly priced.
                  </p>
                </MobileCard>
              )}

              {results.map((r, idx) => (
                <MobileCard
                  key={r.id}
                  variant="compact"
                  className={cn(
                    'space-y-3',
                    r === bestPick && 'border-emerald-200 ring-1 ring-emerald-200'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-slate-400">#{idx + 1}</span>
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {r.vendorName || 'Unnamed vendor'}
                        </p>
                      </div>
                      <p className="text-xl font-bold text-slate-900">
                        ${Number(r.amount).toLocaleString()}
                      </p>
                    </div>

                    {r.loading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-slate-400 mt-1 shrink-0" />
                    ) : r.error ? (
                      <StatusChip tone="needsAction">Check failed</StatusChip>
                    ) : (
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <VerdictIcon verdict={r.result?.verdict} />
                          <StatusChip tone={verdictTone(r.result?.verdict)}>
                            {verdictLabel(r.result?.verdict)}
                          </StatusChip>
                        </div>
                        {r.result?.expectedMedian && (
                          <p className="text-[10px] text-slate-500">
                            Market median: ${r.result.expectedMedian.toLocaleString()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {!r.loading && !r.error && r.result?.explanationShort && (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {r.result.explanationShort}
                    </p>
                  )}

                  {!r.loading && !r.error && r.result?.confidenceScore && (
                    <div className="flex items-center gap-2">
                      <ConfidenceBadge
                        level="high"
                        score={Math.round(r.result.confidenceScore * 100)}
                      />
                    </div>
                  )}

                  {!r.loading && propertyId && (
                    <Button
                      variant={r === bestPick ? 'default' : 'outline'}
                      size="sm"
                      className="w-full h-10 rounded-xl font-semibold"
                      onClick={() => handleBookProvider(r)}
                    >
                      {r === bestPick ? 'Book this provider' : 'Find similar providers'}
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  )}
                </MobileCard>
              ))}
            </div>
          )}
        </MobileSection>
      )}

      <BottomSafeAreaReserve size="chatAware" />
    </div>
  );
}
